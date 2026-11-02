import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  FileBuilder, FileUploadBuilder, LabelBuilder, MediaGalleryBuilder, MessageFlags, ModalBuilder, SectionBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder,
  PermissionFlagsBits as P,
} from 'discord.js';
import { getDB } from '../utils/db.js';
import {
  getTupper, getTuppers, getGroups, saveTupper, deleteTupper, saveGroup, deleteGroup,
  nameKey, newTupperId, channelScopes, resolveSettings, setUserSettings, exportTuppers,
  importTuppers, validateServerRules, serverAllows, purgeTuppers, pruneTuppers, validateImageUrl,
} from '../utils/tupperModel.js';
import { saveCharacterAvatar, isDiscordCdnUrl } from '../utils/avatarStorage.js';
import { createInteractionSession, saveInteractionSession } from '../utils/interactionSessions.js';
import { getServerConfig, proxyPermissionError, loadProxyForUser, editProxy, deleteProxy, downloadDiscordAttachment, assertPrivateThreadAccess } from '../services/tupperService.js';
import { getPlayer, getActiveSlot } from '../utils/dataManager.js';
import { cropTupperImage } from '../utils/tupperImage.js';
import { TupperError, tupperErrorText } from '../utils/tupperErrors.js';

export const TUPPER_NAMESPACE = 'tupper';
const EPHEMERAL = MessageFlags.Ephemeral;
const V2 = MessageFlags.IsComponentsV2;
const PAGE_SIZE = 25;
const actions = [
  ['create', 'Создать профиль'], ['edit', 'Изменить имя, аватар и маркеры'],
  ['details', 'Изменить описание, ник и группу'], ['brackets', 'Добавить пары маркеров'],
  ['appearance', 'Настроить баннер и отображение'], ['copy', 'Скопировать профиль'],
  ['character', 'Создать из игрового персонажа'], ['group', 'Создать или изменить группу'],
  ['deletegroup', 'Удалить группу'], ['settings', 'Настроить автопрокси и приватность'],
  ['search', 'Найти профиль'], ['import', 'Импортировать профили'], ['export', 'Экспортировать профили'],
  ['diagnose', 'Проверить работу в этом канале'], ['server', 'Настроить сервер'],
  ['rules', 'Настроить права отыгрыша'], ['delete', 'Удалить профиль'],
  ['share', 'Опубликовать карточку профиля'], ['find', 'Найти персонажа на сервере'],
  ['birthdays', 'Посмотреть ближайшие дни рождения'], ['prune', 'Удалить давно неиспользуемые профили'],
  ['purge', 'Удалить все свои профили и группы'],
  ['groups', 'Посмотреть или переименовать группу'],
  ['crop', 'Обрезать аватар или баннер'],
];
const needsProfile = new Set(['edit', 'details', 'brackets', 'appearance', 'copy', 'delete', 'share', 'crop']);
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
const choice = (id, label, choices, value, description) => {
  const select = new StringSelectMenuBuilder().setCustomId(id).setMinValues(1).setMaxValues(1)
    .addOptions(choices.map(([v, name]) => ({ label: name, value: v, default: v === String(value) })));
  const component = new LabelBuilder().setLabel(label).setStringSelectMenuComponent(select);
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
const pick = (interaction, id) => interaction.fields.getStringSelectValues(id)[0];
const boolChoice = [['inherit', 'Наследовать'], ['true', 'Включено'], ['false', 'Выключено']];
const parseBool = value => value === 'inherit' ? value : value === 'true';

export function profileModal(interaction, profile = null) {
  return modal(profile?._id ? 'edit' : 'create', interaction, profile?._id ? 'Изменить профиль отыгрыша' : 'Создать профиль отыгрыша', [
    field('name', 'Имя персонажа', { value: profile?.name, required: true, max: 80, placeholder: 'Ая' }),
    upload('avatar_file', 'Аватар — загрузить файл'),
    field('avatar_url', 'Аватар — ссылка на изображение', { value: profile?.avatar_url, max: 2000, placeholder: 'https://…', description: 'Оставьте пустым, чтобы убрать аватар.' }),
    field('prefix', 'Начальный маркер', { value: profile?.brackets?.[0], placeholder: 'ая:', max: 100, description: 'Пример: ая: Привет. Пробелы в маркере учитываются.' }),
    field('suffix', 'Конечный маркер', { value: profile?.brackets?.[1], placeholder: 'Необязательно, например ]', max: 100, description: 'Заполните хотя бы один из двух маркеров.' }),
  ], profile);
}

function groupModal(interaction, group = null) {
  return modal('group', interaction, group ? 'Изменить группу' : 'Создать или изменить группу', [
    field('name', 'Название группы', { value: group?.name, required: true, max: 80, description: 'При создании существующая группа с таким названием будет обновлена.' }),
    field('description', 'Описание группы', { value: group?.description, max: 2000, paragraph: true }),
    field('tag', 'Тег для всех персонажей группы', { value: group?.tag, max: 32 }),
    upload('avatar_file', 'Аватар группы — файл'), field('avatar_url', 'Аватар группы — ссылка', { value: group?.avatar_url, max: 2000 }),
  ], group);
}

export async function ensureTupperAccess(interaction, feature = 'commands') {
  if (!interaction.guild) return;
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  const config = await getServerConfig(interaction.guildId);
  if (!serverAllows(config, feature, member, interaction.channel)) err('Эта возможность отключена администрацией сервера.');
}

async function requireServerAdmin(interaction) {
  if (!interaction.guild) err('Настройки сервера доступны только на сервере.');
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  if (interaction.guild.ownerId !== member.id && !member.permissions.has(P.ManageGuild)) err('Для настройки отыгрыша нужно право «Управлять сервером».');
}

export async function renderTupperPanel(owner, state = {}, readOnly = false) {
  const [all, groups] = await Promise.all([getTuppers(owner), getGroups(owner)]);
  const profiles = state.query ? all.filter(p => nameKey(`${p.name} ${p.nick} ${groups.find(g => g._id === p.group_id)?.name || ''}`).includes(nameKey(state.query))) : all;
  const pages = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(Number(state.page) || 0, pages - 1));
  const selected = all.find(p => p._id === state.selected) || null;
  const container = new ContainerBuilder().setAccentColor(0x8b5cf6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(readOnly
      ? `### Публичные профили\nВладелец: <@${owner}>. Выберите профиль для просмотра.`
      : '### Профили для отыгрыша\nВыберите действие ниже: имя, аватар и маркеры задаются в форме.\n`ая: Привет` → сообщение от Аи. `\\текст` → сообщение от своего имени.'));
  if (selected) {
    const markers = selected.brackets.filter((_, i) => i % 2 === 0).map((_, i) => `${selected.brackets[i * 2]}текст${selected.brackets[i * 2 + 1]}`);
    const info = new TextDisplayBuilder().setContent(`**${clean(selected.nick || selected.name)}**\n${short(clean(selected.description) || 'Описание не задано.', 600)}\nМаркеры: ${short(markers.map(m => `\`${m.replace(/`/g, '')}\``).join(', '), 600)}\nГруппа: ${clean(groups.find(g => g._id === selected.group_id)?.name) || 'без группы'} · Отправлено: ${selected.posts || 0}`);
    if (selected.avatar_url) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(info)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(selected.avatar_url)));
    else container.addTextDisplayComponents(info);
    if (selected.banner_url) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item => item.setURL(selected.banner_url)));
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Профилей: **${all.length}** · Групп: **${groups.length}** · Страница **${page + 1}/${pages}**${state.query ? ` · Поиск: ${short(clean(state.query), 100)}` : ''}`));
  const slice = profiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (slice.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('tp_select').setPlaceholder('Выбрать профиль').addOptions(slice.map(p => ({
      label: short(p.name, 100), value: p._id, default: p._id === selected?._id,
      description: p.brackets.length ? short(`${p.brackets[0] || ''}текст${p.brackets[1] || ''}`, 100) : 'Без маркеров — доступно автопрокси',
    })))));
  else container.addTextDisplayComponents(new TextDisplayBuilder().setContent(state.query ? 'Профили не найдены. Измените поиск.' : 'Пока нет профилей. Выберите «Создать профиль» в меню.'));
  if (!readOnly) container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tp_action')
    .setPlaceholder('Создать, изменить или настроить…').addOptions(actions.map(([value, label]) => ({ value, label })))));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tp_prev').setLabel('Назад').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('tp_next').setLabel('Далее').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
    new ButtonBuilder().setCustomId('tp_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
  ));
  return { flags: V2, components: [container], allowedMentions: { parse: [] } };
}

export async function openTupperPanel(interaction, state = {}, notice = '') {
  if (state.view_owner) await checkPublicList(interaction, state.view_owner);
  const payload = await renderTupperPanel(state.view_owner || interaction.user.id, state, Boolean(state.view_owner));
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
  if (action !== 'server' && action !== 'rules') await ensureTupperAccess(interaction);
  const p = state.selected ? await getTupper(interaction.user.id, state.selected) : null;
  if (needsProfile.has(action) && !p) err('Сначала выберите профиль в верхнем списке.');
  if (action === 'create') return interaction.showModal(profileModal(interaction));
  if (action === 'edit') return interaction.showModal(profileModal(interaction, p));
  if (action === 'details') return interaction.showModal(modal(action, interaction, 'Описание и принадлежность', [
    field('nick', 'Отображаемое имя', { value: p.nick, max: 80, description: 'Если пусто, сообщения отправляются с основным именем.' }),
    field('description', 'Описание персонажа', { value: p.description, max: 2000, paragraph: true }),
    field('tag', 'Тег после имени', { value: p.tag, max: 32 }),
    field('group', 'Название группы', { value: (await getGroups(interaction.user.id)).find(g => g._id === p.group_id)?.name, max: 80, description: 'Сначала создайте группу. Пустое поле убирает профиль из группы.' }),
    field('birthday', 'Дата рождения — ГГГГ-ММ-ДД', { value: p.birthday?.slice(0, 10), max: 10, placeholder: '2000-04-17' }),
  ], p));
  if (action === 'brackets') return interaction.showModal(modal(action, interaction, 'Все пары маркеров', [
    field('brackets', 'Маркеры в формате JSON', { value: JSON.stringify(p.brackets), required: true, max: 4000, paragraph: true,
      description: 'Чередуйте начало и конец: ["ая:", "", "[", "]"]. До 30 пар.' }),
  ], p));
  if (action === 'appearance') return interaction.showModal(modal(action, interaction, 'Вид профиля', [
    upload('banner_file', 'Баннер — загрузить файл'),
    field('banner_url', 'Баннер — ссылка на изображение', { value: p.banner_url, max: 2000, description: 'Баннер виден на карточке бота. Пустое поле убирает баннер.' }),
    choice('show_brackets', 'Сохранять маркеры в сообщениях', [['false', 'Убирать маркеры'], ['true', 'Сохранять маркеры']], p.show_brackets),
    field('position', 'Порядок в списке', { value: String(p.position), required: true, max: 7, description: 'Целое число от 0 до 1000000. Меньшие значения идут первыми.' }),
  ], p));
  if (action === 'crop') return interaction.showModal(modal(action, interaction, 'Обрезать изображение', [
    choice('image', 'Что обрезать', [['avatar_url', 'Аватар'], ['banner_url', 'Баннер']], 'avatar_url', 'Результат сохраняется как PNG. У GIF используется первый кадр.'),
    field('x', 'Отступ слева, пиксели', { value: '0', required: true, max: 5 }),
    field('y', 'Отступ сверху, пиксели', { value: '0', required: true, max: 5 }),
    field('width', 'Ширина, пиксели', { required: true, max: 5 }),
    field('height', 'Высота, пиксели', { required: true, max: 5 }),
  ], p));
  if (action === 'copy') return interaction.showModal(modal(action, interaction, 'Скопировать профиль', [
    field('name', 'Имя нового профиля', { required: true, max: 80 }),
    field('prefix', 'Начальный маркер', { max: 100 }), field('suffix', 'Конечный маркер', { max: 100 }),
  ], p));
  if (action === 'character') {
    const slot = await getActiveSlot(interaction.user.id);
    const player = await getPlayer(slot === 1 ? interaction.user.id : `${interaction.user.id}_${slot}`);
    if (!player?.character_name) err('Сначала создайте игрового персонажа командой /register.');
    return interaction.showModal(profileModal(interaction, { name: player.character_name, avatar_url: player.character_avatar, brackets: [`${player.character_name}:`, ''] }));
  }
  if (action === 'group') return interaction.showModal(groupModal(interaction));
  if (action === 'groups') return interaction.showModal(modal(action, interaction, 'Открыть группу', [
    field('name', 'Название группы', { required: true, max: 80, description: 'Карточка группы откроется с кнопкой изменения и переименования.' }),
  ]));
  if (action === 'deletegroup') return interaction.showModal(modal(action, interaction, 'Удалить группу', [
    field('name', 'Название удаляемой группы', { required: true, max: 80, description: 'Профили останутся, принадлежность к группе будет убрана.' }),
    field('confirm', 'Для подтверждения введите УДАЛИТЬ', { required: true, max: 20 }),
  ]));
  if (action === 'delete') return interaction.showModal(modal(action, interaction, 'Удалить профиль', [
    field('confirm', `Введите имя: ${short(p.name, 30)}`, { required: true, max: 80, description: 'Профиль будет удалён. Уже отправленные сообщения останутся.' }),
  ], p));
  if (action === 'search') return interaction.showModal(modal(action, interaction, 'Найти профиль', [
    field('query', 'Имя, ник или группа', { value: state.query, max: 80, description: 'Оставьте пустым, чтобы показать все профили.' }),
  ]));
  if (action === 'share') return interaction.showModal(modal(action, interaction, 'Опубликовать карточку профиля', [
    field('channel', 'ID канала для публикации', { value: interaction.guildId ? interaction.channelId : '', required: true, max: 20 }),
    choice('confirm', 'Какие данные будут опубликованы', [['share', 'Имя, аватар, баннер, описание и автор']], 'share', 'Карточку увидят участники выбранного канала, даже если список профилей скрыт.'),
  ], p));
  if (action === 'find') {
    if (!interaction.guild) err('Поиск по участникам доступен только на сервере.');
    await ensureTupperAccess(interaction, 'queries');
    return interaction.showModal(modal(action, interaction, 'Найти персонажа на сервере', [
      field('query', 'Начало имени персонажа', { required: true, max: 80, description: 'Поиск среди участников сервера, открывших свой список профилей.' }),
    ]));
  }
  if (action === 'birthdays') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const now = new Date();
    const upcoming = (await getTuppers(interaction.user.id)).filter(t => t.birthday).map(t => {
      const birthday = new Date(t.birthday);
      const next = new Date(Date.UTC(now.getUTCFullYear(), birthday.getUTCMonth(), birthday.getUTCDate(), 23, 59, 59));
      if (next < now) next.setUTCFullYear(next.getUTCFullYear() + 1);
      return { name: t.nick || t.name, date: next.toISOString().slice(0, 10) };
    }).sort((a, b) => a.date.localeCompare(b.date));
    return interaction.editReply(plain(upcoming.length ? `Ближайшие дни рождения (UTC):\n${upcoming.slice(0, 30).map(t => `${t.date} — ${clean(t.name)}`).join('\n')}` : 'У профилей пока нет дат рождения. Добавьте дату через «Изменить описание, ник и группу».'));
  }
  if (action === 'prune' || action === 'purge') return interaction.showModal(modal(action, interaction,
    action === 'purge' ? 'Удалить все профили и группы' : 'Удалить неиспользуемые профили', [
      ...(action === 'prune' ? [field('days', 'Дней без использования', { value: '180', required: true, max: 5, description: 'Удаляются профили, созданные до этой даты и не использованные с тех пор.' })] : []),
      choice('mode', 'Действие', [['preview', 'Только показать количество'], ['delete', 'Удалить подходящие профили']], 'preview'),
      field('confirm', 'Для удаления введите УДАЛИТЬ', { max: 20, description: action === 'purge' ? 'Будут удалены все ваши профили, группы и настройки. Старые сообщения останутся.' : 'Перед удалением можно сделать экспорт. Группы и старые сообщения останутся.' }),
    ]));
  if (action === 'settings') {
    const scopes = [['global', 'Везде'], ...(interaction.guild ? [[`guild_${interaction.guildId}`, 'На этом сервере']] : [])];
    if (interaction.channel && interaction.guild) {
      const current = channelScopes(interaction.channel);
      for (const key of current.slice(1)) scopes.push([key, key.startsWith('category') ? 'В этой категории' : key.startsWith('thread') ? 'В этой ветке' : 'В этом канале']);
    }
    const scope = scopes.at(-1)[0];
    const doc = await getDB().collection('tupper_settings').findOne({ _id: interaction.user.id });
    const local = doc?.scopes?.[scope] || {};
    const autoProfile = local.profile_id ? await getTupper(interaction.user.id, local.profile_id) : null;
    return interaction.showModal(modal(action, interaction, 'Автопрокси и приватность', [
      choice('scope', 'Где применить настройки', scopes, scopes.at(-1)[0]),
      choice('auto', 'Автоматическая отправка', [['inherit', 'Наследовать'], ['off', 'Выключить'], ['sticky', 'Последний использованный профиль'], ['fixed', 'Указанный профиль']], local.auto || 'inherit'),
      field('profile', 'Имя профиля для фиксированного режима', { value: autoProfile?.name, max: 80 }),
      choice('proxy', 'Разрешить отыгрыш', boolChoice, local.proxy ?? 'inherit'),
      choice('private', 'Скрывать список профилей от других', boolChoice, local.private ?? 'inherit', 'Автор отправленного сообщения всегда доступен для просмотра.'),
    ]));
  }
  if (action === 'import') return interaction.showModal(modal(action, interaction, 'Импортировать профили', [
    new LabelBuilder().setLabel('JSON-файл Tupperbox или PluralKit').setDescription('До 2 МиБ. Файл имеет приоритет над текстом.')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId('import_file').setRequired(false).setMinValues(0).setMaxValues(1)),
    field('json', 'Или вставьте JSON', { max: 4000, paragraph: true }),
    choice('confirm', 'Профили с совпадающими именами', [['merge', 'Обновить данными из файла']], 'merge', 'Остальные профили сохранятся. До импорта можно сделать экспорт.'),
  ]));
  if (action === 'server' || action === 'rules') {
    await requireServerAdmin(interaction);
    const config = await getServerConfig(interaction.guildId);
    return interaction.showModal(modal(action, interaction, action === 'server' ? 'Настройки сервера' : 'Права отыгрыша', action === 'server' ? [
      field('log_channel', 'ID канала журнала', { value: config?.log_channel_id, max: 20, description: 'Журнал хранит автора и ссылку на сообщение. Пустое поле выключает журнал.' }),
    ] : [field('rules', 'Правила доступа — JSON', { value: JSON.stringify(config?.rules || []), max: 4000, paragraph: true, required: true,
      description: '[{"scope":"role","id":"123","feature":"proxies","allow":true}]. Scope: default, role, channel, user.' })]));
  }
  if (action === 'export') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const data = await exportTuppers(interaction.user.id);
    return interaction.editReply({ flags: V2,
      files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name: 'verge-tuppers.json' })],
      // V2 attachments must be exposed explicitly to appear in Discord.
      components: [new TextDisplayBuilder().setContent('Экспорт профилей и групп.'), new FileBuilder().setURL('attachment://verge-tuppers.json')],
    });
  }
  if (action === 'diagnose') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const doc = await getDB().collection('tupper_settings').findOne({ _id: interaction.user.id });
    const settings = resolveSettings(doc, interaction.channel && interaction.guild ? channelScopes(interaction.channel) : []);
    const profiles = await getTuppers(interaction.user.id);
    let status = 'Для отыгрыша нужен текстовый канал сервера.';
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
      const bot = await interaction.guild.members.fetchMe();
      status = proxyPermissionError(interaction.channel, member, bot) || 'Права Discord в порядке.';
      if (!serverAllows(await getServerConfig(interaction.guildId), 'proxies', member, interaction.channel)) status += ' Отыгрыш запрещён правилами сервера.';
    }
    if (settings.auto === 'fixed' && !profiles.some(p => p._id === settings.profile_id)) status += ' Профиль фиксированного автопрокси удалён: выберите другой в настройках.';
    return interaction.editReply(plain(`${status}\nОтыгрыш: ${settings.proxy ? 'включён' : 'выключен'}. Автопрокси: ${settings.auto}.\nСоздано профилей: ${profiles.length}.`));
  }
  err('Действие не найдено. Откройте /tupper заново.');
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
    if (!['server', 'rules', 'message_edit', 'message_delete'].includes(action)) await ensureTupperAccess(interaction);
    const p = target !== '-' ? await getTupper(owner, target) : null;
    if (needsProfile.has(action) && (!p || p.revision !== Number(version))) err('Профиль уже изменён или удалён. Откройте его заново.');
    let saved = p;
    if (action === 'create' || action === 'edit') {
      const pair = [read(interaction, 'prefix'), read(interaction, 'suffix')];
      const brackets = p?.brackets.length === 0 && !pair.some(Boolean) ? [] : [...pair, ...(p?.brackets.slice(2) || [])];
      saved = await saveTupper(owner, { ...p, name: read(interaction, 'name'), brackets,
        avatar_url: await storeImage(interaction, 'avatar_file', 'avatar_url', p?.avatar_url) }, p ? { id: p._id, revision: p.revision } : {});
    } else if (action === 'details') {
      const groupName = read(interaction, 'group').trim();
      const group = groupName ? (await getGroups(owner)).find(g => g.name_key === nameKey(groupName)) : null;
      if (groupName && !group) err('Группа не найдена. Сначала создайте её через меню.');
      saved = await saveTupper(owner, { ...p, nick: read(interaction, 'nick'), description: read(interaction, 'description'),
        tag: read(interaction, 'tag'), group_id: group?._id || null, birthday: read(interaction, 'birthday') }, { id: p._id, revision: p.revision });
    } else if (action === 'brackets') {
      let brackets;
      try { brackets = JSON.parse(read(interaction, 'brackets')); } catch { err('Маркеры: проверьте JSON. Пример: ["ая:", "", "[", "]"].'); }
      saved = await saveTupper(owner, { ...p, brackets }, { id: p._id, revision: p.revision });
    } else if (action === 'appearance') {
      const position = Number(read(interaction, 'position'));
      if (!Number.isSafeInteger(position) || position < 0 || position > 1000000) err('Порядок: введите целое число от 0 до 1000000.');
      saved = await saveTupper(owner, { ...p, banner_url: await storeImage(interaction, 'banner_file', 'banner_url', p.banner_url),
        show_brackets: pick(interaction, 'show_brackets') === 'true', position }, { id: p._id, revision: p.revision });
    } else if (action === 'copy') {
      saved = await saveTupper(owner, { ...p, name: read(interaction, 'name'), brackets: [read(interaction, 'prefix'), read(interaction, 'suffix')] });
    } else if (action === 'crop') {
      requirePublicImageBase();
      const image = pick(interaction, 'image');
      if (!['avatar_url', 'banner_url'].includes(image) || !p[image]) err('Сначала загрузите выбранное изображение в профиль.');
      const rectangle = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(read(interaction, key))]));
      const cropped = await cropTupperImage(p[image], rectangle, interaction.client);
      const result = await saveCharacterAvatar(`tupper_${newTupperId()}`, cropped, interaction.client);
      if (!result.success) err('Не удалось сохранить обрезанное изображение. Попробуйте снова.');
      saved = await saveTupper(owner, { ...p, [image]: result.avatarUrl }, { id: p._id, revision: p.revision });
    } else if (action === 'delete') {
      if (read(interaction, 'confirm') !== p.name) err('Имя не совпало. Профиль сохранён.');
      await deleteTupper(owner, p._id, p.revision); saved = null;
    } else if (action === 'group') {
      const group = target !== '-' ? await getDB().collection('tupper_groups').findOne({ _id: target, owner_id: owner, revision: Number(version) }) : null;
      if (target !== '-' && !group) err('Группа уже изменена или удалена. Откройте её заново.');
      await saveGroup(owner, { name: read(interaction, 'name'), description: read(interaction, 'description'), tag: read(interaction, 'tag'),
        avatar_url: await storeImage(interaction, 'avatar_file', 'avatar_url', group?.avatar_url) }, group ? { id: group._id, revision: group.revision } : {});
    } else if (action === 'groups') {
      const group = (await getGroups(owner)).find(g => g.name_key === nameKey(read(interaction, 'name')));
      if (!group) err('Группа не найдена. Проверьте название или создайте группу через меню.');
      const container = new ContainerBuilder().setAccentColor(0x8b5cf6);
      const info = new TextDisplayBuilder().setContent(`### ${clean(group.name)}\n${clean(group.description) || 'Описание не задано.'}\nТег: ${clean(group.tag) || 'без тега'}\nПрофилей: ${(await getTuppers(owner)).filter(t => t.group_id === group._id).length}`);
      if (group.avatar_url) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(info).setThumbnailAccessory(new ThumbnailBuilder().setURL(group.avatar_url)));
      else container.addTextDisplayComponents(info);
      container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tp_group_edit').setLabel('Изменить группу').setStyle(ButtonStyle.Primary)));
      const sent = await interaction.editReply({ flags: V2, components: [container] });
      await createInteractionSession({ messageId: sent.id, namespace: TUPPER_NAMESPACE, ownerId: owner,
        state: { group_id: group._id, deadline_at: Date.now() + 86400_000 } });
      return;
    } else if (action === 'deletegroup') {
      if (read(interaction, 'confirm') !== 'УДАЛИТЬ') err('Для удаления группы введите УДАЛИТЬ.');
      await deleteGroup(owner, read(interaction, 'name'));
    } else if (action === 'settings') {
      const scope = pick(interaction, 'scope');
      const allowed = ['global', ...(interaction.guild && interaction.channel ? channelScopes(interaction.channel) : [])];
      if (!allowed.includes(scope)) err('Эта область недоступна в текущем канале.');
      const profile = (await getTuppers(owner)).find(t => t.name_key === nameKey(read(interaction, 'profile')));
      await setUserSettings(owner, scope, { proxy: parseBool(pick(interaction, 'proxy')), private: parseBool(pick(interaction, 'private')),
        auto: pick(interaction, 'auto'), profile_id: profile?._id });
    } else if (action === 'search') {
      return openTupperPanel(interaction, { query: read(interaction, 'query') });
    } else if (action === 'share') {
      if (!interaction.guild) err('Карточку можно опубликовать из команды на сервере.');
      const id = read(interaction, 'channel').trim();
      const channel = /^\d{1,20}$/.test(id) && await interaction.guild.channels.fetch(id).catch(() => null);
      if (!channel?.isTextBased?.()) err('Укажите текстовый канал этого сервера.');
      const member = await interaction.guild.members.fetch({ user: owner, force: true });
      const bot = await interaction.guild.members.fetchMe();
      const send = channel.isThread?.() ? P.SendMessagesInThreads : P.SendMessages;
      if (!channel.permissionsFor(member)?.has([P.ViewChannel, send]) || !channel.permissionsFor(bot)?.has([P.ViewChannel, send])) err('У вас и бота должно быть право писать в выбранный канал.');
      await assertPrivateThreadAccess(channel, member);
      if (channel.archived || channel.locked) err('Ветка закрыта. Сначала откройте её.');
      if (!serverAllows(await getServerConfig(interaction.guildId), 'commands', member, channel)) err('Команды профилей в этом канале отключены.');
      const container = new ContainerBuilder().setAccentColor(0x8b5cf6);
      const info = new TextDisplayBuilder().setContent(`### ${clean(p.nick || p.name)}\n${clean(p.description) || 'Описание не задано.'}\nАвтор: <@${owner}>`);
      if (p.avatar_url) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(info)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(p.avatar_url)));
      else container.addTextDisplayComponents(info);
      if (p.banner_url) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item => item.setURL(p.banner_url)));
      await channel.send({ flags: V2, components: [container], allowedMentions: { parse: [] } });
      return interaction.editReply(plain('Карточка профиля опубликована.'));
    } else if (action === 'find') {
      if (!interaction.guild) err('Поиск доступен только на сервере.');
      await ensureTupperAccess(interaction, 'queries');
      const query = nameKey(read(interaction, 'query')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!query) err('Введите начало имени.');
      const candidates = await getDB().collection('tuppers').find({ name_key: { $regex: `^${query}` } }).limit(100).toArray();
      const results = [];
      const checked = new Map();
      for (const candidate of candidates) {
        if (!checked.has(candidate.owner_id)) {
          const settings = await getDB().collection('tupper_settings').findOne({ _id: candidate.owner_id });
          const visible = !resolveSettings(settings, channelScopes(interaction.channel)).private;
          checked.set(candidate.owner_id, visible && Boolean(await interaction.guild.members.fetch({ user: candidate.owner_id, force: true }).catch(() => null)));
        }
        if (checked.get(candidate.owner_id)) results.push(`**${clean(candidate.name)}** — <@${candidate.owner_id}>`);
        if (results.length === 20) break;
      }
      return interaction.editReply(plain(results.length ? `Найденные персонажи:\n${results.join('\n')}\nПолный список: /tupper user:участник` : 'Доступные профили с таким началом имени не найдены. Скрытые списки в поиске не участвуют.'));
    } else if (action === 'prune' || action === 'purge') {
      const preview = pick(interaction, 'mode') === 'preview';
      if (!preview && read(interaction, 'confirm') !== 'УДАЛИТЬ') err('Для удаления введите УДАЛИТЬ. Изменения не внесены.');
      const count = action === 'prune' ? await pruneTuppers(owner, Number(read(interaction, 'days')), { preview })
        : preview ? (await getTuppers(owner)).length : await purgeTuppers(owner);
      return openTupperPanel(interaction, {}, preview ? `Подходит под удаление профилей: ${count}. Изменения не внесены.` : `Удалено профилей: ${count}.`);
    } else if (action === 'import') {
      const file = interaction.fields.getUploadedFiles('import_file')?.first();
      let data;
      try { data = JSON.parse(file ? (await downloadDiscordAttachment(file, 2 * 1024 * 1024)).attachment.toString('utf8') : read(interaction, 'json')); }
      catch { err('Не удалось прочитать JSON. Загрузите экспорт Tupperbox/PluralKit до 2 МиБ или вставьте корректный JSON.'); }
      const result = await importTuppers(owner, data);
      return openTupperPanel(interaction, {}, `Импортировано профилей: ${result.profiles}, групп: ${result.groups}.`);
    } else if (action === 'server' || action === 'rules') {
      await requireServerAdmin(interaction);
      let fields;
      if (action === 'server') {
        const id = read(interaction, 'log_channel').trim();
        const channel = id && /^\d{1,20}$/.test(id) ? await interaction.guild.channels.fetch(id).catch(() => null) : null;
        if (id && (!channel?.isTextBased?.() || !channel.permissionsFor(await interaction.guild.members.fetchMe())?.has([P.ViewChannel, P.SendMessages]))) err('Укажите ID текстового канала этого сервера, в который бот может писать.');
        fields = { log_channel_id: channel?.id || null };
      } else {
        let rules;
        try { rules = JSON.parse(read(interaction, 'rules')); } catch { err('Правила: проверьте синтаксис JSON.'); }
        fields = { rules: validateServerRules(rules) };
      }
      await getDB().collection('tupper_servers').updateOne({ _id: interaction.guildId }, { $set: fields }, { upsert: true });
    } else if (action === 'message_edit') {
      // target is a Discord message ID here, not a profile ID.
      await editProxy(interaction.client, interaction.user, target, read(interaction, 'content'), Number(version));
      return interaction.editReply(plain('Сообщение изменено.'));
    } else if (action === 'message_delete') {
      if (read(interaction, 'confirm') !== 'УДАЛИТЬ') err('Введите УДАЛИТЬ, чтобы удалить сообщение.');
      await deleteProxy(interaction.client, interaction.user, target);
      return interaction.editReply(plain('Сообщение удалено.'));
    } else err('Форма больше не поддерживается. Откройте /tupper заново.');
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
      if (session.state.group_id) {
        await ensureTupperAccess(interaction);
        const group = await getDB().collection('tupper_groups').findOne({ _id: session.state.group_id, owner_id: interaction.user.id });
        if (!group) err('Группа удалена.');
        return interaction.showModal(groupModal(interaction, group));
      }
      if (session.state.view_owner) await checkPublicList(interaction, session.state.view_owner);
      if (interaction.customId === 'tp_action') {
        if (session.state.view_owner) err('Это список другого пользователя. Откройте /tupper для управления своими профилями.');
        return await showTupperAction(interaction, interaction.values[0], session.state);
      }
      if (!session.state.view_owner) await ensureTupperAccess(interaction);
      await interaction.deferUpdate();
      const state = { ...session.state };
      if (interaction.customId === 'tp_select') state.selected = interaction.values[0];
      if (interaction.customId === 'tp_prev') state.page = Math.max(0, (state.page || 0) - 1);
      if (interaction.customId === 'tp_next') state.page = (state.page || 0) + 1;
      const result = await saveInteractionSession(session.message_id, session.revision, state);
      if (!result.success) return interaction.followUp({ ...plain('Панель уже обновлена. Нажмите «Обновить».'), flags: EPHEMERAL });
      await interaction.editReply(await renderTupperPanel(state.view_owner || session.owner_id, state, Boolean(state.view_owner)));
    } catch (e) {
      const payload = { ...plain(short(tupperErrorText(e), 1500)), flags: EPHEMERAL };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  },
};

async function checkPublicList(interaction, owner) {
  await ensureTupperAccess(interaction, 'queries');
  const settings = await getDB().collection('tupper_settings').findOne({ _id: owner });
  if (resolveSettings(settings, interaction.guild && interaction.channel ? channelScopes(interaction.channel) : []).private) {
    err('Этот пользователь скрыл список профилей. Автора конкретного отыгрыша можно посмотреть в меню сообщения.');
  }
}

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
