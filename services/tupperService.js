import { PermissionFlagsBits as P, EmbedBuilder, ChannelType } from 'discord.js';
import { getDB } from '../utils/db.js';
import { getTuppers, getGroups, channelScopes, resolveSettings, serverAllows, parseProxyMessage, displayTupperName } from '../utils/tupperModel.js';
import { parseRollInput, rollExpression, formatRollResult } from '../utils/diceRoller.js';
import { rollAdvancedTupperDice } from '../utils/tupperDice.js';
import { TupperError, tupperErrorText } from '../utils/tupperErrors.js';

const webhookLocks = new Map();
const messageQueues = new Map();
const recognizedMessages = new WeakSet();
const noMentions = { parse: [], repliedUser: false };
const error = message => { throw new TupperError(message); };
export const getServerConfig = guild => getDB().collection('tupper_servers').findOne({ _id: guild });

export function proxyPermissionError(channel, member, bot, { source = true, files = false, embeds = false } = {}) {
  if (!member || !bot || member.communicationDisabledUntilTimestamp > Date.now()) return 'У автора нет доступа к отправке сообщений или действует тайм-аут.';
  if (channel.archived || channel.locked) return 'Ветка закрыта. Сначала откройте её.';
  const authorPermissions = channel.permissionsFor(member);
  const botPermissions = channel.permissionsFor(bot);
  const send = channel.isThread?.() ? P.SendMessagesInThreads : P.SendMessages;
  if (!authorPermissions?.has([P.ViewChannel, send])) return 'У автора нет права писать в этот канал.';
  if (files && !authorPermissions.has(P.AttachFiles)) return 'У автора нет права прикреплять файлы в этот канал.';
  if (embeds && !authorPermissions.has(P.EmbedLinks)) return 'У автора нет права отправлять вставки в этот канал.';
  if (!botPermissions?.has([P.ViewChannel, send, ...(source ? [P.ManageMessages, P.ReadMessageHistory] : [])])) return 'Боту нужны права «Просматривать канал», «Читать историю сообщений», «Отправлять сообщения» и «Управлять сообщениями».';
  if (files && !botPermissions.has(P.AttachFiles)) return 'Боту нужно право «Прикреплять файлы» в этом канале.';
  if (embeds && !botPermissions.has(P.EmbedLinks)) return 'Боту нужно право «Встраивать ссылки» в этом канале.';
  if (!channel.isThread?.() && !botPermissions.has(P.ManageWebhooks)) return 'Боту нужно право «Управлять вебхуками».';
  if (channel.isThread?.() && !channel.parent?.permissionsFor(bot)?.has(P.ManageWebhooks)) return 'Боту нужно право «Управлять вебхуками» в родительском канале ветки.';
  return null;
}

export async function assertPrivateThreadAccess(channel, member) {
  if (channel.type !== ChannelType.PrivateThread || channel.permissionsFor(member)?.has(P.ManageThreads)) return;
  const membership = await channel.members.fetch({ member: member.id, force: true }).catch(() => null);
  if (!membership) error('У автора нет доступа к приватной ветке.');
}

export async function getProxyWebhook(channel, client) {
  const parent = channel.isThread?.() ? channel.parent : channel;
  if (!parent?.createWebhook || !parent?.fetchWebhooks) error('В этом канале нельзя использовать вебхуки.');
  // Only cache in-flight provisioning. Every later send reloads authoritative ownership/token.
  if (webhookLocks.has(parent.id)) return webhookLocks.get(parent.id);
  const provision = (async () => {
    const hooks = await parent.fetchWebhooks();
    let hook = hooks.find(h => h.owner?.id === client.user.id && h.name === 'Verge RP' && h.token);
    if (!hook) hook = await parent.createWebhook({ name: 'Verge RP', reason: 'Сообщения от профилей для отыгрыша' });
    if (!hook.token || hook.owner?.id !== client.user.id) error('Не удалось получить вебхук бота.');
    return hook;
  })();
  webhookLocks.set(parent.id, provision);
  try { return await provision; } finally { webhookLocks.delete(parent.id); }
}

// Download only original Discord attachment URLs. No redirects or arbitrary URLs.
export async function downloadDiscordAttachment(attachment, limit = 25 * 1024 * 1024) {
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.username || url.password) error('Вложение должно находиться на CDN Discord.');
  if (attachment.size > limit) error('Размер файла превышает 25 МиБ. Исходное сообщение сохранено.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || Number(response.headers.get('content-length')) > limit) error('Не удалось загрузить вложение. Отправьте его ещё раз.');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) error('Размер файла превышает допустимый лимит.');
    chunks.push(chunk);
  }
  return { attachment: Buffer.concat(chunks), name: `${attachment.spoiler ? 'SPOILER_' : ''}${String(attachment.name || 'file').replace(/^SPOILER_/, '')}`,
    ...(attachment.description ? { description: attachment.description } : {}) };
}

export function splitProxyContent(value, limit = 2000) {
  const chunks = [];
  let remaining = value;
  while (remaining.length > limit) {
    let end = remaining.lastIndexOf('\n', limit);
    if (end < limit / 2) end = limit;
    if (end === limit && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function expandProxyBlocks(content) {
  const embeds = [];
  let redirect = null;
  let blocks = 0;
  // JSON embeds can contain nested braces. Scan balanced objects instead of truncating at the first }}.
  let output = '';
  for (let i = 0; i < content.length;) {
    if (!content.startsWith('{{', i)) { output += content[i++]; continue; }
    if (++blocks > 10) error('В сообщении можно использовать до 10 блоков {{…}}.');
    let end;
    const json = content.slice(i + 2).trimStart().startsWith('"');
    if (json) {
      let depth = 1, quoted = false, escaped = false;
      for (let j = i + 2; j < content.length; j++) {
        const c = content[j];
        if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
        else if (c === '"') quoted = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0 && content[j + 1] === '}') { end = j; break; }
      }
    } else end = content.indexOf('}}', i + 2);
    if (end === -1 || end === undefined) { output += content[i++]; continue; }
    const raw = content.slice(i + 2, end).trim();
    if (json) {
      let obj;
      try { obj = JSON.parse(`{${raw}}`); } catch { error('Блок вставки содержит неверный JSON.'); }
      const list = obj.embeds || (obj.embed ? [obj.embed] : null);
      if (!Array.isArray(list) || embeds.length + list.length > 10) error('В блоке нужны embed или embeds, не больше 10 вставок.');
      for (const e of list) {
        // Builder validates lengths and URL formats. External media are fetched by Discord, never by this process.
        const built = new EmbedBuilder(e).toJSON();
        if (built.type && built.type !== 'rich') error('Поддерживаются только rich-вставки.');
        embeds.push(built);
      }
    } else if (/^#/.test(raw)) {
      if (redirect) error('Укажите один канал перенаправления.');
      redirect = raw.slice(1).replace(/^<|>$/g, '').replace(/^#/, '');
    } else {
      const parsed = parseRollInput(raw);
      if (parsed.ok) output += formatRollResult(parsed.specs.map(spec => rollExpression(spec)));
      else if (/\d|d[f%]|d\d/i.test(raw)) output += await rollAdvancedTupperDice(raw);
      else output += content.slice(i, end + 2);
    }
    i = end + 2;
  }
  if (embeds.reduce((sum, e) => sum + (e.title?.length || 0) + (e.description?.length || 0) + (e.footer?.text?.length || 0) + (e.author?.name?.length || 0)
    + (e.fields || []).reduce((s, f) => s + f.name.length + f.value.length, 0), 0) > 6000) error('Текст вставок должен занимать до 6000 символов.');
  return { content: output.trim(), embeds, redirect };
}

async function replyPrefix(message, destination) {
  if (!message.reference?.messageId) return '';
  // Keep a jump link, never copy text from a possibly more private channel.
  if (destination.id !== message.channelId) return '';
  return `↪ https://discord.com/channels/${message.guildId}/${message.reference.channelId || message.channelId}/${message.reference.messageId}\n`;
}

async function proxyLog(client, config, record, action) {
  if (!config?.log_channel_id) return;
  const log = await client.channels.fetch(config.log_channel_id).catch(() => null);
  if (!log?.isTextBased?.() || log.guildId !== record.guild_id) return;
  // Log attribution and jump links only. Private scene text is not copied to a broader channel.
  await log.send({ content: `${action}: <@${record.owner_id}> → **${record.profile_name.replace(/[*_`~|<>@]/g, '')}**\nhttps://discord.com/channels/${record.guild_id}/${record.channel_id}/${record._id}`,
    allowedMentions: noMentions }).catch(() => {});
}

async function processProxyMessage(message, { download = downloadDiscordAttachment, webhookFor = getProxyWebhook } = {}) {
  if (!message.guild || message.author.bot || message.webhookId || message.system || !message.channel?.isTextBased?.()) return false;
  const owner = message.author.id;
  const originalContent = message.content || '';
  const originalAttachments = new Map(message.attachments);
  const db = getDB();
  const [profiles, settingsDoc, config] = await Promise.all([getTuppers(owner), db.collection('tupper_settings').findOne({ _id: owner }), getServerConfig(message.guildId)]);
  if (!profiles.length) return false;
  const scopes = channelScopes(message.channel);
  const settings = resolveSettings(settingsDoc, scopes);
  if (!settings.proxy) return false;
  const stickyKey = `${owner}_${message.channelId}`;
  const sticky = settings.auto === 'sticky' ? await db.collection('tupper_sticky').findOne({ _id: stickyKey }) : null;
  const parsed = parseProxyMessage(originalContent, profiles, { ...settings, sticky_id: sticky?.profile_id });
  if (parsed.reset) {
    await db.collection('tupper_sticky').deleteOne({ _id: stickyKey });
    if (settings.auto === 'fixed') await db.collection('tupper_settings').updateOne({ _id: owner }, { $set: { [`scopes.${scopes.at(-1)}.auto`]: 'off' } }, { upsert: true });
  }
  if (!parsed.parts.length) return false;
  recognizedMessages.add(message);
  const member = await message.guild.members.fetch({ user: owner, force: true });
  const bot = await message.guild.members.fetchMe({ force: true });
  await assertPrivateThreadAccess(message.channel, member);
  if (!serverAllows(config, 'proxies', member, message.channel)) return false;
  const sourceError = proxyPermissionError(message.channel, member, bot, { files: originalAttachments.size > 0 });
  if (sourceError) error(sourceError);
  if (originalAttachments.size > 10 || message.stickers?.size) error('Поддерживаются до 10 вложений. Сообщение со стикерами отправьте от своего имени.');
  if ([...originalAttachments.values()].reduce((sum, a) => sum + (a.size || 0), 0) > 25 * 1024 * 1024) error('Общий размер вложений превышает 25 МиБ. Разделите их на несколько сообщений.');
  const [groups, files] = await Promise.all([getGroups(owner), Promise.all([...originalAttachments.values()].map(a => download(a)))]);
  const jobs = [];
  for (let i = 0; i < parsed.parts.length; i++) {
    const part = parsed.parts[i];
    const expanded = await expandProxyBlocks(part.content);
    let destination = message.channel;
    if (expanded.redirect) {
      if (/^\d{1,20}$/.test(expanded.redirect)) destination = await message.guild.channels.fetch(expanded.redirect);
      else {
        const matches = message.guild.channels.cache.filter(c => c.name === expanded.redirect && c.isTextBased?.());
        if (matches.size !== 1) error('Канал перенаправления не найден или имя неоднозначно. Укажите {{#ID_канала}}.');
        destination = matches.first();
      }
      if (!destination?.isTextBased?.() || destination.guildId !== message.guildId) error('Перенаправление доступно только в текстовые каналы этого сервера.');
    }
    if (!serverAllows(config, 'proxies', member, destination)) error('Отыгрыш в канале назначения запрещён администрацией.');
    await assertPrivateThreadAccess(destination, member);
    const problem = proxyPermissionError(destination, member, bot, { source: false, files: i === 0 && files.length > 0, embeds: expanded.embeds.length > 0 });
    if (problem) error(problem);
    const chunks = splitProxyContent(await replyPrefix(message, destination) + expanded.content);
    if (!chunks.length) chunks.push('');
    if (!chunks[0] && !expanded.embeds.length && !(i === 0 && files.length)) error('После удаления маркеров сообщение пустое. Добавьте текст или вложение.');
    const hook = await webhookFor(destination, message.client);
    const username = displayTupperName(part.profile, groups.find(g => g._id === part.profile.group_id));
    if (/clyde|discord/i.test(username)) error('Имя с тегами содержит «clyde» или «discord». Измените имя или тег профиля.');
    for (let j = 0; j < chunks.length; j++) jobs.push({ part, destination, hook, payload: {
      content: chunks[j] || undefined,
      username,
      avatarURL: part.profile.avatar_url || message.client.user.displayAvatarURL(),
      allowedMentions: noMentions,
      ...(destination.isThread?.() ? { threadId: destination.id } : {}),
      ...(j === 0 ? { embeds: expanded.embeds, ...(i === 0 ? { files } : {}) } : {}),
    } });
  }
  if (jobs.length > 30) error('Сообщение после разбиения превышает 30 частей. Сократите текст.');
  if (message.channel.messages?.fetch) {
    let latest;
    try { latest = await message.channel.messages.fetch({ message: message.id, force: true }); }
    catch (e) { if (e.code === 10008) return true; throw e; }
    // A user can cancel a slow image download/dice evaluation by deleting or
    // changing the source. Never proxy an obsolete draft over their edited text.
    if (latest.content !== originalContent || latest.author.id !== owner
      || latest.attachments.size !== originalAttachments.size
      || [...latest.attachments.keys()].some(id => !originalAttachments.has(id))) return true;
  }
  // Reserve once, never retry an ambiguous external send after a crash/network timeout.
  try {
    await db.collection('tupper_sources').insertOne({ _id: message.id, owner_id: owner, status: 'sending', created_at: new Date() });
  } catch (e) { if (e.code === 11000) return true; throw e; }
  let completed = 0;
  try {
    for (const { part, destination, hook, payload } of jobs) {
      const sent = await hook.send(payload); // discord.js requests wait=true and returns the created message.
      if (!sent?.id) error('Discord не подтвердил отправку.');
      const record = { _id: sent.id, source_id: message.id, owner_id: owner, profile_id: part.profile._id, profile_name: payload.username,
        guild_id: message.guildId, channel_id: destination.id, webhook_id: hook.id, thread_id: destination.isThread?.() ? destination.id : null,
        content: payload.content || '', created_at: new Date(), revision: 1, deleted: false };
      record.has_media = Boolean(payload.files?.length || payload.embeds?.length);
      await db.collection('tupper_messages').insertOne(record);
      completed++;
      await proxyLog(message.client, config, record, 'Отыгрыш');
    }
    await db.collection('tupper_sources').updateOne({ _id: message.id }, { $set: { status: 'sent', completed } });
    // Only a fully confirmed proxy can replace the original user message.
    try { await message.delete(); } catch (e) { if (e.code !== 10008) throw e; }
    await db.collection('tupper_sources').updateOne({ _id: message.id }, { $set: { status: 'complete' } });
    for (const part of parsed.parts) await db.collection('tuppers').updateOne({ _id: part.profile._id, owner_id: owner }, { $inc: { posts: 1 }, $set: { last_used: new Date() } });
    if (settings.auto === 'sticky' && parsed.last_id) await db.collection('tupper_sticky').updateOne({ _id: stickyKey }, { $set: { owner_id: owner, profile_id: parsed.last_id } }, { upsert: true });
    return true;
  } catch (e) {
    await db.collection('tupper_sources').updateOne({ _id: message.id }, { $set: { status: 'uncertain', completed } }).catch(() => {});
    error('Отправка завершилась с ошибкой. Перед повтором проверьте исходное сообщение и уже отправленные части.');
  }
}

export async function proxyMessage(message, options) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return false;
  const key = `${message.author.id}_${message.channelId}`;
  const previous = messageQueues.get(key) || Promise.resolve();
  // Gateway handlers run concurrently. Preserve user order so a following plain
  // message sees the sticky profile selected by the preceding bracketed message.
  const current = previous.catch(() => {}).then(() => processProxyMessage(message, options));
  messageQueues.set(key, current);
  try { return await current; }
  finally { if (messageQueues.get(key) === current) messageQueues.delete(key); }
}

export async function loadProxyForUser(client, user, id, { edit = false, remove = false, guildId = null, channelId = null } = {}) {
  const record = await getDB().collection('tupper_messages').findOne({ _id: id, deleted: false });
  if (!record || (guildId && record.guild_id !== guildId) || (channelId && record.channel_id !== channelId)) error('Сообщение отыгрыша не найдено.');
  const channel = await client.channels.fetch(record.channel_id);
  if (!channel || channel.guildId !== record.guild_id) error('Канал больше недоступен.');
  const member = await channel.guild.members.fetch({ user: user.id, force: true });
  await assertPrivateThreadAccess(channel, member);
  const perms = channel.permissionsFor(member);
  if (!perms?.has([P.ViewChannel, P.ReadMessageHistory])) error('У вас нет доступа к этому сообщению.');
  const config = await getServerConfig(record.guild_id);
  if (!serverAllows(config, 'queries', member, channel) && !(edit || remove)) error('Просмотр автора запрещён администрацией.');
  if (edit && record.owner_id !== user.id) error('Изменять отыгрыш может только его автор.');
  if (edit && (member.communicationDisabledUntilTimestamp > Date.now() || !perms.has(channel.isThread?.() ? P.SendMessagesInThreads : P.SendMessages))) error('Сейчас у вас нет права изменять сообщения в этом канале.');
  if (edit) {
    const bot = await channel.guild.members.fetchMe({ force: true });
    if (!channel.permissionsFor(bot)?.has([P.ViewChannel, channel.isThread?.() ? P.SendMessagesInThreads : P.SendMessages])) error('Бот больше не может писать в этот канал.');
  }
  if (remove && record.owner_id !== user.id && !perms.has(P.ManageMessages)) error('Удалять отыгрыш может автор или модератор канала.');
  return { record, channel, config };
}

async function recordWebhook(client, record) {
  const hook = await client.fetchWebhook(record.webhook_id);
  if (!hook.token || hook.owner?.id !== client.user.id) error('Вебхук этого сообщения недоступен.');
  return hook;
}

export async function editProxy(client, user, id, content, revision) {
  if (typeof content !== 'string' || content.length > 2000) error('Введите до 2000 символов.');
  const { record, config } = await loadProxyForUser(client, user, id, { edit: true });
  if (!content.trim() && !record.has_media) error('Добавьте текст: сообщение без вложений не может быть пустым.');
  // Fence concurrent edits with a persistent revision. Unlock only our own lease.
  const locked = await getDB().collection('tupper_messages').findOneAndUpdate({ _id: id, revision, deleted: false,
    $or: [{ edit_until: { $exists: false } }, { edit_until: { $lt: new Date() } }] },
    { $set: { edit_until: new Date(Date.now() + 120_000) }, $inc: { revision: 1 } }, { returnDocument: 'after' });
  if (!locked) error('Сообщение уже изменено. Откройте форму заново.');
  try {
    const hook = await recordWebhook(client, record);
    await hook.editMessage(id, { content, allowedMentions: noMentions, ...(record.thread_id ? { threadId: record.thread_id } : {}) });
    await getDB().collection('tupper_messages').updateOne({ _id: id, revision: locked.revision }, { $set: { content, edited_at: new Date() } });
    await proxyLog(client, config, record, 'Изменён отыгрыш');
  } finally {
    await getDB().collection('tupper_messages').updateOne({ _id: id, revision: locked.revision }, { $unset: { edit_until: '' } });
  }
}

export async function deleteProxy(client, user, id, expected = {}) {
  const { record, config } = await loadProxyForUser(client, user, id, { remove: true, ...expected });
  const hook = await recordWebhook(client, record);
  try { await hook.deleteMessage(id, record.thread_id); } catch (e) { if (e.code !== 10008) throw e; }
  await getDB().collection('tupper_messages').updateOne({ _id: id }, { $set: { deleted: true, deleted_by: user.id, deleted_at: new Date() } });
  await proxyLog(client, config, record, 'Удалён отыгрыш');
}

export async function handleTupperMessage(message) {
  try { return await proxyMessage(message); }
  catch (e) {
    console.warn('Tupper proxy failed', { messageId: message.id, code: e.code || e.name });
    if (!recognizedMessages.has(message) && !(e instanceof TupperError)) return false;
    // Do not expose REST errors (which can include webhook tokens).
    const content = tupperErrorText(e, 'Не удалось отправить отыгрыш. Проверьте права бота и попробуйте снова.');
    await message.reply({ content: content.slice(0, 1000), allowedMentions: noMentions }).catch(() => {});
    return true;
  }
}
