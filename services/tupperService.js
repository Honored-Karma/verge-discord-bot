import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { getDB } from '../utils/db.js';
import { getTuppers, channelScopes, resolveSettings, serverAllows, parseProxyMessage } from '../utils/tupperModel.js';
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

async function proxySourceState(message, snapshot) {
  let latest = message;
  if (message.channel.messages?.fetch) {
    try { latest = await message.channel.messages.fetch({ message: message.id, force: true }); }
    catch (e) { if (e.code === 10008) return 'deleted'; throw e; }
  }
  return latest.content === snapshot.content && latest.author.id === snapshot.owner
    && (latest.editedTimestamp ?? null) === snapshot.editedTimestamp
    && latest.attachments.size === snapshot.attachments.size
    && [...latest.attachments.keys()].every(id => snapshot.attachments.has(id)) ? 'unchanged' : 'changed';
}

async function processProxyMessage(message, { download = downloadDiscordAttachment, webhookFor = getProxyWebhook } = {}) {
  if (!message.guild || message.author.bot || message.webhookId || message.system || !message.channel?.isTextBased?.()) return false;
  const owner = message.author.id;
  const originalContent = message.content || '';
  const originalAttachments = new Map(message.attachments);
  const snapshot = { owner, content: originalContent, attachments: originalAttachments, editedTimestamp: message.editedTimestamp ?? null };
  const db = getDB();
  const [profiles, settingsDoc, config] = await Promise.all([getTuppers(owner), db.collection('tupper_settings').findOne({ _id: owner }), getServerConfig(message.guildId)]);
  if (!profiles.length) return false;
  const scopes = channelScopes(message.channel);
  const settings = { ...resolveSettings(settingsDoc, scopes), auto: 'off' };
  if (!settings.proxy) return false;
  const parsed = parseProxyMessage(originalContent, profiles, settings);
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
  const files = await Promise.all([...originalAttachments.values()].map(a => download(a)));
  const jobs = [];
  for (let i = 0; i < parsed.parts.length; i++) {
    const part = parsed.parts[i];
    const destination = message.channel;
    if (!serverAllows(config, 'proxies', member, destination)) error('Отыгрыш в канале назначения запрещён администрацией.');
    await assertPrivateThreadAccess(destination, member);
    const problem = proxyPermissionError(destination, member, bot, { source: false, files: i === 0 && files.length > 0 });
    if (problem) error(problem);
    const chunks = splitProxyContent(await replyPrefix(message, destination) + part.content);
    if (!chunks.length) chunks.push('');
    if (!chunks[0] && !(i === 0 && files.length)) error('После удаления маркеров сообщение пустое. Добавьте текст или вложение.');
    const hook = await webhookFor(destination, message.client);
    const username = part.profile.name;
    if (/clyde|discord/i.test(username)) error('Имя содержит «clyde» или «discord». Измените имя профиля.');
    for (let j = 0; j < chunks.length; j++) jobs.push({ part, destination, hook, payload: {
      content: chunks[j] || undefined,
      username,
      avatarURL: part.profile.avatar_url || message.client.user.displayAvatarURL(),
      allowedMentions: noMentions,
      ...(destination.isThread?.() ? { threadId: destination.id } : {}),
      ...(i === 0 && j === 0 ? { files } : {}),
    } });
  }
  if (jobs.length > 30) error('Сообщение после разбиения превышает 30 частей. Сократите текст.');
  // A user can cancel a slow download by changing the source.
  if (await proxySourceState(message, snapshot) !== 'unchanged') return true;
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
    // Sends/logging can take time. Preserve edits made after the pre-send check.
    const sourceState = await proxySourceState(message, snapshot);
    if (sourceState === 'unchanged') {
      try { await message.delete(); } catch (e) { if (e.code !== 10008) throw e; }
    }
    await db.collection('tupper_sources').updateOne({ _id: message.id }, { $set: { status: 'complete', source_preserved: sourceState === 'changed' } });
    for (const part of parsed.parts) await db.collection('tuppers').updateOne({ _id: part.profile._id, owner_id: owner }, { $inc: { posts: 1 }, $set: { last_used: new Date() } });
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
  // message is processed after the preceding one has finished.
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
