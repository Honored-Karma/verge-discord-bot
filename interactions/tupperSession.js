import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder, SectionBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder,
} from 'discord.js';
import { getDB } from '../utils/db.js';
import {
  getTupper, getTuppers, saveTupper, deleteTupper, newTupperId, serverAllows, validateImageUrl,
} from '../utils/tupperModel.js';
import { saveCharacterAvatar, isDiscordCdnUrl } from '../utils/avatarStorage.js';
import { createInteractionSession, saveInteractionSession } from '../utils/interactionSessions.js';
import { getServerConfig, loadProxyForUser, editProxy, deleteProxy } from '../services/tupperService.js';
import { TupperError, tupperErrorText } from '../utils/tupperErrors.js';

export const TUPPER_NAMESPACE = 'tupper';
const EPHEMERAL = MessageFlags.Ephemeral;
const V2 = MessageFlags.IsComponentsV2;
const PAGE_SIZE = 25;
const actions = [
  ['create', 'Создать профиль'], ['edit', 'Изменить профиль'], ['delete', 'Удалить профиль'],
];
const needsProfile = new Set(['edit', 'delete']);
const supportedModals = new Set([...actions.map(([action]) => action), 'message_edit', 'message_delete']);
const err = message => { throw new TupperError(message); };
const clean = value => String(value || '').replace(/[`*_~|<>@]/g, '');
const short = (value, n) => String(value || '').slice(0, n);
const plain = content => ({ content, allowedMentions: { parse: [] } });
const formId = (action, owner, target = '-', revision = 0) => `tp|${action}|${owner}|${target}|${revision}`;
const field = (id, label, { value = '', placeholder = '', required = false, max = 100, paragraph = false, description } = {}) => {
  const input = new TextInputBuilder().setCustomId(id).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required).setMaxLength(max);
  if (value) input.setValue(short(value, max));
  if (placeholder) input.setPlaceholder(placeholder);
  const component = new LabelBuilder().setLabel(label).setTextInputComponent(input);
  if (description) component.setDescription(description);
  return component;
};
const upload = (id, label) => new LabelBuilder().setLabel(label)
  .setDescription('PNG, JPEG, GIF или WebP, до 8 МиБ. Файл имеет приоритет над ссылкой.')
  .setFileUploadComponent(new FileUploadBuilder().setCustomId(id).setRequired(false).setMinValues(0).setMaxValues(1));
const modal = (action, interaction, title, fields, profile) => new ModalBuilder()
  .setCustomId(formId(action, interaction.user.id, profile?._id, profile?.revision))
  .setTitle(title).addLabelComponents(...fields);
const read = (interaction, id) => interaction.fields.getTextInputValue(id);

export function profileModal(interaction, profile = null) {
  return modal(profile?._id ? 'edit' : 'create', interaction, profile?._id ? 'Изменить профиль отыгрыша' : 'Создать профиль отыгрыша', [
    field('name', 'Имя персонажа', { value: profile?.name, required: true, max: 80, placeholder: 'Ая' }),
    upload('avatar_file', 'Аватар — загрузить файл'),
    field('avatar_url', 'Аватар — ссылка на изображение', { value: profile?.avatar_url, max: 2000, placeholder: 'https://…', description: 'Оставьте пустым, чтобы убрать аватар.' }),
    field('prefix', 'Начальный маркер', { value: profile?.brackets?.[0], placeholder: 'ая:', max: 100, description: 'Пример: ая: Привет. Пробелы в маркере учитываются.' }),
    field('suffix', 'Конечный маркер', { value: profile?.brackets?.[1], placeholder: 'Необязательно, например ]', max: 100, description: 'Заполните хотя бы один из двух маркеров.' }),
  ], profile);
}

export async function ensureTupperAccess(interaction, feature = 'commands') {
  if (!interaction.guild) return;
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  const config = await getServerConfig(interaction.guildId);
  if (!serverAllows(config, feature, member, interaction.channel)) err('Эта возможность отключена администрацией сервера.');
}

export async function renderTupperPanel(owner, state = {}) {
  const profiles = await getTuppers(owner);
  const pages = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(Number(state.page) || 0, pages - 1));
  const selected = profiles.find(p => p._id === state.selected) || null;
  const container = new ContainerBuilder().setAccentColor(0x8b5cf6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Профили для отыгрыша\nВыберите свой профиль и действие: создать, изменить или удалить.\n`ая: Привет` → сообщение от Аи.'));
  if (selected) {
    const markers = `${selected.brackets[0] || ''}текст${selected.brackets[1] || ''}`;
    const info = new TextDisplayBuilder().setContent(`**${clean(selected.name)}**\nМаркеры: \`${short(markers.replace(/`/g, ''), 600)}\``);
    if (selected.avatar_url) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(info)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(selected.avatar_url)));
    else container.addTextDisplayComponents(info);
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Профилей: **${profiles.length}** · Страница **${page + 1}/${pages}**`));
  const slice = profiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (slice.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('tp_select').setPlaceholder('Выбрать профиль').addOptions(slice.map(p => ({
      label: short(p.name, 100), value: p._id, default: p._id === selected?._id,
    })))));
  else container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Пока нет профилей. Выберите «Создать профиль» в меню.'));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tp_action')
    .setPlaceholder('Создать, изменить или удалить профиль').addOptions(actions.map(([value, label]) => ({ value, label })))));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tp_prev').setLabel('Назад').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('tp_next').setLabel('Далее').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
    new ButtonBuilder().setCustomId('tp_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
  ));
  return { flags: V2, components: [container], allowedMentions: { parse: [] } };
}

export async function openTupperPanel(interaction, state = {}, notice = '') {
  if (state.view_owner || state.group_id) err('Эта панель больше не поддерживается. Откройте /vupper заново.');
  const payload = await renderTupperPanel(interaction.user.id, state);
  if (notice) payload.components.unshift(new TextDisplayBuilder().setContent(notice));
  let message;
  if (interaction.deferred || interaction.replied) message = await interaction.editReply(payload);
  else message = await interaction.reply({ ...payload, flags: V2 | EPHEMERAL, fetchReply: true });
  const messageId = message?.id || (await interaction.fetchReply()).id;
  await createInteractionSession({ messageId, namespace: TUPPER_NAMESPACE, ownerId: interaction.user.id,
    guildId: interaction.guildId, channelId: interaction.channelId,
    state: { ...state, deadline_at: Date.now() + 86400_000 }, ttlMs: 2 * 86400_000 });
}

export async function showTupperAction(interaction, action, state = {}) {
  if (!actions.some(([value]) => value === action)) err('Действие больше не поддерживается. Откройте /vupper заново.');
  await ensureTupperAccess(interaction);
  const p = state.selected ? await getTupper(interaction.user.id, state.selected) : null;
  if (needsProfile.has(action) && !p) err('Сначала выберите свой профиль в верхнем списке.');
  if (action === 'create') return interaction.showModal(profileModal(interaction));
  if (action === 'edit') return interaction.showModal(profileModal(interaction, p));
  return interaction.showModal(modal('delete', interaction, 'Удалить профиль', [
    field('confirm', `Введите имя: ${short(p.name, 30)}`, { required: true, max: 80, description: 'Профиль будет удалён. Уже отправленные сообщения останутся.' }),
  ], p));
}

function requirePublicImageBase() {
  const base = process.env.WEB_BASE_URL;
  let validBase = false;
  try { const parsed = new URL(base); validBase = parsed.protocol === 'https:' && !/^(localhost|127\.|\[?::1)/i.test(parsed.hostname); } catch { /* handled below */ }
  if (!validBase) err('Для загрузки файлов настройте публичный HTTPS-адрес WEB_BASE_URL у бота. Также можно указать постоянную HTTPS-ссылку на изображение.');
}

async function storeImage(interaction, fileId, urlId, previous = null) {
  const file = interaction.fields.getUploadedFiles(fileId)?.first();
  const url = read(interaction, urlId).trim();
  if (!file && !url) return null;
  if (!file && url === previous) return previous;
  if (!file) validateImageUrl(url);
  if (file || isDiscordCdnUrl(url)) requirePublicImageBase();
  const saved = await saveCharacterAvatar(`tupper_${newTupperId()}`, file || url, interaction.client);
  if (!saved.success) err('Не удалось сохранить изображение. Используйте PNG, JPEG, GIF или WebP до 8 МиБ и проверьте ссылку.');
  return saved.avatarUrl;
}

export function handlesTupperModal(interaction) { return interaction.customId?.startsWith('tp|'); }

export async function handleTupperModal(interaction) {
  const [, action, owner, target, version] = interaction.customId.split('|');
  if (owner !== interaction.user.id) return interaction.reply({ ...plain('Эта форма принадлежит другому пользователю.'), flags: EPHEMERAL });
  await interaction.deferReply({ flags: EPHEMERAL });
  try {
    if (!supportedModals.has(action)) err('Форма больше не поддерживается. Откройте /vupper заново.');
    if (!action.startsWith('message_')) await ensureTupperAccess(interaction);
    const p = needsProfile.has(action) ? await getTupper(owner, target) : null;
    if (needsProfile.has(action) && (!p || p.revision !== Number(version))) err('Профиль уже изменён или удалён. Откройте его заново.');
    let saved = p;
    if (action === 'create' || action === 'edit') {
      const pair = [read(interaction, 'prefix'), read(interaction, 'suffix')];
      saved = await saveTupper(owner, { ...p, name: read(interaction, 'name'), brackets: pair,
        avatar_url: await storeImage(interaction, 'avatar_file', 'avatar_url', p?.avatar_url) }, p ? { id: p._id, revision: p.revision } : {});
    } else if (action === 'delete') {
      if (read(interaction, 'confirm') !== p.name) err('Имя не совпало. Профиль сохранён.');
      await deleteTupper(owner, p._id, p.revision); saved = null;
    } else if (action === 'message_edit') {
      // target is a Discord message ID here, not a profile ID.
      await editProxy(interaction.client, interaction.user, target, read(interaction, 'content'), Number(version));
      return interaction.editReply(plain('Сообщение изменено.'));
    } else if (action === 'message_delete') {
      if (read(interaction, 'confirm') !== 'УДАЛИТЬ') err('Введите УДАЛИТЬ, чтобы удалить сообщение.');
      await deleteProxy(interaction.client, interaction.user, target);
      return interaction.editReply(plain('Сообщение удалено.'));
    } else err('Форма больше не поддерживается. Откройте /vupper заново.');
    await openTupperPanel(interaction, { selected: saved?._id || null }, action === 'delete' ? 'Профиль удалён.' : 'Изменения сохранены.');
  } catch (e) {
    const message = tupperErrorText(e, 'Не удалось сохранить изменения. Откройте форму заново и повторите попытку.');
    await interaction.editReply(plain(short(message, 1500)));
  }
}

export async function proxyMessageModal(interaction, action, id, constraints = {}) {
  const { record } = await loadProxyForUser(interaction.client, interaction.user, id, {
    edit: action === 'message_edit', remove: action === 'message_delete', ...constraints,
  });
  return interaction.showModal(new ModalBuilder().setCustomId(formId(action, interaction.user.id, id, record.revision))
    .setTitle(action === 'message_edit' ? 'Изменить отыгрыш' : 'Удалить отыгрыш')
    .addLabelComponents(action === 'message_edit'
      ? field('content', 'Текст сообщения', { value: record.content, required: !record.has_media, max: 2000, paragraph: true })
      : field('confirm', 'Для удаления введите УДАЛИТЬ', { required: true, max: 20 })));
}

export async function queryProxy(interaction, id, constraints = {}) {
  await interaction.deferReply({ flags: EPHEMERAL });
  const { record } = await loadProxyForUser(interaction.client, interaction.user, id, constraints);
  return interaction.editReply(plain(`Автор: <@${record.owner_id}> (ID ${record.owner_id}).\nПрофиль: ${clean(record.profile_name)}.\nСообщение отправлено ${new Date(record.created_at).toISOString()}.`));
}

export async function runTupperMessageAction(interaction, action) {
  try {
    const constraints = { guildId: interaction.guildId, channelId: interaction.channelId };
    if (action === 'query') return await queryProxy(interaction, interaction.targetId, constraints);
    return await proxyMessageModal(interaction, action, interaction.targetId, constraints);
  } catch (e) {
    const payload = { ...plain(tupperErrorText(e)), flags: EPHEMERAL };
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return interaction.reply(payload);
  }
}

export const tupperInteractionHandler = {
  async handleComponent({ interaction, session }) {
    try {
      if (session.state.proxy_message) {
        return await proxyMessageModal(interaction, 'message_edit', session.state.proxy_message);
      }
      if (session.state.group_id || session.state.view_owner) err('Эта панель больше не поддерживается. Откройте /vupper заново.');
      if (interaction.customId === 'tp_action') {
        return await showTupperAction(interaction, interaction.values[0], session.state);
      }
      await ensureTupperAccess(interaction);
      await interaction.deferUpdate();
      const state = { ...session.state };
      if (interaction.customId === 'tp_select') state.selected = interaction.values[0];
      if (interaction.customId === 'tp_prev') state.page = Math.max(0, (state.page || 0) - 1);
      if (interaction.customId === 'tp_next') state.page = (state.page || 0) + 1;
      const result = await saveInteractionSession(session.message_id, session.revision, state);
      if (!result.success) return interaction.followUp({ ...plain('Панель уже обновлена. Нажмите «Обновить».'), flags: EPHEMERAL });
      await interaction.editReply(await renderTupperPanel(session.owner_id, state));
    } catch (e) {
      const payload = { ...plain(short(tupperErrorText(e), 1500)), flags: EPHEMERAL };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  },
};

export async function handleTupperReaction(reaction, user) {
  if (user.bot || !['❓', '❌', '📝'].includes(reaction.emoji.name)) return;
  if (reaction.partial) await reaction.fetch();
  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
  if (!message.guildId || !message.webhookId) return;
  const exists = await getDB().collection('tupper_messages').findOne({ _id: message.id, deleted: false });
  if (!exists) return;
  try {
    const { record } = await loadProxyForUser(message.client, user, message.id, {
      remove: reaction.emoji.name === '❌', edit: reaction.emoji.name === '📝', guildId: message.guildId, channelId: message.channelId,
    });
    if (reaction.emoji.name === '❌') await deleteProxy(message.client, user, message.id);
    else if (reaction.emoji.name === '❓') await user.send(plain(`Автор: <@${record.owner_id}> (ID ${record.owner_id}).\nПрофиль: ${clean(record.profile_name)}.\n${message.url}`));
    else {
      const sent = await user.send({ ...plain(`Изменить сообщение ${message.url}`), components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tp_message_edit').setLabel('Изменить отыгрыш').setStyle(ButtonStyle.Primary))] });
      await createInteractionSession({ messageId: sent.id, namespace: TUPPER_NAMESPACE, ownerId: user.id,
        state: { proxy_message: message.id, deadline_at: Date.now() + 3600_000 } });
    }
    await reaction.users.remove(user.id).catch(() => {});
  } catch (e) {
    await user.send(plain('Не удалось выполнить действие. Откройте меню сообщения → Приложения: там можно посмотреть автора, изменить или удалить отыгрыш.')).catch(() => {});
  }
}
