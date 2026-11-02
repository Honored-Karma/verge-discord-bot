import assert from 'node:assert/strict';
import test, { before, after, beforeEach } from 'node:test';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Collection, PermissionsBitField, PermissionFlagsBits as P, ModalSubmitFields, ComponentType, ChannelType } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { setDB } from '../utils/db.js';
import {
  initializeTuppers, normalizeProfile, parseProxyMessage, resolveSettings, channelScopes,
  saveTupper, getTupper, getTuppers, deleteTupper, saveGroup, getGroups, deleteGroup,
  setUserSettings, serverAllows, validateServerRules, exportTuppers, importTuppers,
  displayTupperName, parseTupperImport, purgeTuppers, pruneTuppers,
} from '../utils/tupperModel.js';
import {
  proxyMessage, expandProxyBlocks, splitProxyContent, proxyPermissionError, getProxyWebhook,
  loadProxyForUser, editProxy, deleteProxy, downloadDiscordAttachment, assertPrivateThreadAccess,
  handleTupperMessage,
} from '../services/tupperService.js';
import { rollAdvancedTupperDice } from '../utils/tupperDice.js';
import { cropTupperImage } from '../utils/tupperImage.js';
import { profileModal, showTupperAction, renderTupperPanel, handleTupperModal, tupperInteractionHandler } from '../interactions/tupperSession.js';

let mongo, client, db;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  client = await MongoClient.connect(mongo.getUri());
  db = client.db('tupper_tests');
  setDB(db);
  await initializeTuppers(db);
});
after(async () => { setDB(null); await client?.close(); await mongo?.stop(); });
beforeEach(async () => {
  for (const c of await db.listCollections().toArray()) await db.collection(c.name).deleteMany({});
});

const profile = (name = 'Ая', prefix = 'ая:', suffix = '') => ({ name, brackets: [prefix, suffix] });
const allPermissions = new PermissionsBitField(Object.values(P));
function fixture() {
  let next = 0;
  const sent = [], deleted = [], edits = [];
  const author = { id: '100', bot: false };
  const member = { id: '100', roles: { cache: new Collection() }, permissions: allPermissions };
  const bot = { id: '999', permissions: allPermissions };
  const hook = { id: 'hook', owner: { id: '999' }, name: 'Verge RP', token: 'secret',
    send: async payload => { sent.push(payload); return { id: `sent${++next}` }; },
    editMessage: async (id, payload) => edits.push({ id, ...payload }),
    deleteMessage: async id => deleted.push(id) };
  const channels = new Collection();
  const guild = { id: '200', ownerId: '100', members: {
    fetch: async ({ user } = {}) => user === '999' ? bot : { ...member, id: user || member.id },
    fetchMe: async () => bot,
  }, channels: { cache: channels, fetch: async id => channels.get(id) } };
  const channel = { id: '300', guildId: '200', guild, parentId: '400', isTextBased: () => true,
    isThread: () => false, permissionsFor: () => allPermissions,
    fetchWebhooks: async () => new Collection([[hook.id, hook]]), createWebhook: async () => hook };
  channels.set(channel.id, channel);
  const discord = { user: { id: '999', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' },
    channels: { fetch: async id => channels.get(id) }, fetchWebhook: async () => hook };
  let sourceDeleted = 0;
  const message = { id: 'source', content: 'ая: Привет!', author, guild, guildId: '200', channel, channelId: '300', client: discord,
    attachments: new Collection(), stickers: new Collection(), delete: async () => { sourceDeleted++; } };
  return { discord, channel, channels, guild, message, member, bot, hook, sent, edits, deleted, sourceDeleted: () => sourceDeleted };
}
function interaction(f = fixture()) {
  return { user: f.message.author, guild: f.guild, guildId: '200', channel: f.channel, channelId: '300', client: f.discord,
    showModal: async m => m.toJSON(), reply: async p => p, deferReply: async () => {},
    editReply: async p => p, ...f };
}

test('маркеры: скобки, пробелы, регистр, алиасы, длинный префикс и многострочный текст', () => {
  const a = { ...normalizeProfile(profile()), _id: 'a' };
  const b = { ...normalizeProfile(profile('Боб', '[', ']')), _id: 'b' };
  const c = { ...normalizeProfile(profile('Ая2', 'ая::')), _id: 'c' };
  const parse = content => parseProxyMessage(content, [a, b, c]);
  assert.equal(parse('ая: Привет').parts[0].content, 'Привет');
  assert.equal(parse('ая:: Привет').parts[0].profile._id, 'c');
  assert.equal(parse('[Привет\nмир]').parts[0].content, 'Привет\nмир');
  assert.equal(parse('АЯ: Привет').parts.length, 0);
  assert.equal(parse('ая: Привет\nпродолжение\n[Ответ]').parts.length, 2);
  assert.equal(parse('[Открыто').parts.length, 0);
  assert.equal(parse('обычный текст\nая: Привет').parts.length, 0);
  const suffix = { ...normalizeProfile(profile('Суффикс', '', ']')), _id: 'd' };
  assert.equal(parseProxyMessage('привет\nмир]', [suffix]).parts[0].content, 'привет\nмир');
  const spaced = { ...a, brackets: ['ая: ', ''] };
  assert.equal(parseProxyMessage('ая:текст', [spaced]).parts.length, 0);
  assert.equal(parseProxyMessage('ая: текст', [spaced]).parts.length, 1);
  assert.throws(() => normalizeProfile(profile('x', '', '')), /хотя бы один/);
});

test('автопрокси: фиксированный и sticky режимы, выход, команды других ботов', () => {
  const p = { ...normalizeProfile(profile()), _id: 'a' };
  assert.equal(parseProxyMessage('текст', [p], { auto: 'fixed', profile_id: 'a' }).parts[0].profile._id, 'a');
  assert.equal(parseProxyMessage('текст', [p], { auto: 'sticky', sticky_id: 'a' }).parts.length, 1);
  assert.equal(parseProxyMessage('текст', [p], { auto: 'fixed', profile_id: 'missing' }).parts.length, 0);
  for (const content of ['!box', 'tul!help', '/команда', '\\текст']) assert.equal(parseProxyMessage(content, [p], { auto: 'fixed', profile_id: 'a' }).parts.length, 0);
  assert.equal(parseProxyMessage('\\\\текст', [p]).reset, true);
  assert.throws(() => parseProxyMessage(Array(31).fill('ая: текст').join('\n'), [p]), /30/);
});

test('настройки наследуются от глобальной области до ветки', async () => {
  const channel = { id: '5', guildId: '1', parentId: '4', parent: { parentId: '3' }, isThread: () => true };
  assert.deepEqual(channelScopes(channel), ['guild_1', 'category_3', 'channel_4', 'thread_5']);
  const p = await saveTupper('100', profile());
  await setUserSettings('100', 'global', { proxy: true, private: false, auto: 'fixed', profile_id: p._id });
  await setUserSettings('100', 'guild_1', { proxy: false, private: 'inherit', auto: 'inherit' });
  await setUserSettings('100', 'thread_5', { proxy: true, private: true, auto: 'sticky' });
  const result = resolveSettings(await db.collection('tupper_settings').findOne({ _id: '100' }), channelScopes(channel));
  assert.equal(result.proxy, true);
  assert.equal(result.private, true);
  assert.equal(result.auto, 'sticky');
  await assert.rejects(setUserSettings('other', 'global', { proxy: true, private: true, auto: 'fixed', profile_id: p._id }), /свой/);
  await assert.rejects(setUserSettings('100', 'scopes.evil', {}));
});

test('профили: изоляция владельцев, версии, конфликт маркеров и параллельное создание', async () => {
  const p = await saveTupper('100', profile());
  assert.equal(await getTupper('other', p._id), null);
  await assert.rejects(saveTupper('other', { ...p, name: 'Чужой' }, { id: p._id, revision: p.revision }), /изменён|удалён/);
  const updated = await saveTupper('100', { ...p, nick: 'Героиня' }, { id: p._id, revision: p.revision });
  assert.equal(updated.revision, 2);
  await assert.rejects(deleteTupper('100', p._id, 1), /изменён/);
  await assert.rejects(saveTupper('100', profile('Другой', 'ая:')), /пара маркеров/);
  const results = await Promise.allSettled([saveTupper('100', profile('Один', 'а:')), saveTupper('100', profile('Два', 'а:'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await getTuppers('100')).length, 2);
});

test('группы, теги, дата рождения и удаление группы без потери профилей', async () => {
  const g = await saveGroup('100', { name: 'Отряд', tag: '[A]' });
  const p = await saveTupper('100', { ...profile(), group_id: g._id, tag: '★', birthday: '2000-04-17' });
  assert.match(displayTupperName(p, g, new Date('2026-04-17')), /Ая ★ \[A\].*🎂/);
  await assert.rejects(saveTupper('other', { ...profile(), group_id: g._id }), /Группа/);
  await deleteGroup('100', 'Отряд');
  assert.equal((await getTupper('100', p._id)).group_id, null);
  assert.equal((await getGroups('100')).length, 0);
});

test('импорт и экспорт Tupperbox/PluralKit; транзакционный откат при конфликте', async () => {
  await importTuppers('100', { groups: [{ id: 3, name: 'Группа', tag: '[G]' }], tuppers: [
    { name: 'Ая', brackets: ['a:', '', '[', ']'], nick: 'Героиня', group_id: 3, show_brackets: true, posts: 42, description: 'Описание' },
  ] });
  const exported = await exportTuppers('100');
  await importTuppers('200', exported);
  const p = (await getTuppers('200'))[0];
  assert.equal(p.posts, 42); assert.equal(p.nick, 'Героиня');
  assert.equal((await getGroups('200'))[0]._id, p.group_id);
  assert.deepEqual(p.brackets, ['a:', '', '[', ']']);
  await assert.rejects(importTuppers('100', { groups: [{ id: 4, name: 'Не сохранить' }], tuppers: [
    { name: 'Ошибка', brackets: ['a:', ''] },
  ] }), /одинаковые маркеры/);
  assert.equal((await getGroups('100')).length, 1);
  assert.equal((await getTuppers('100')).length, 1);
  await importTuppers('100', { groups: [{ id: 'g', name: 'PK', members: ['p'] }], members: [
    { id: 'p', name: 'Боб', display_name: 'Бобби', proxy_tags: [{ prefix: 'b:' }], keep_proxy: true },
  ] });
  const b = (await getTuppers('100')).find(p => p.name === 'Боб');
  assert.equal(b.nick, 'Бобби'); assert.equal(b.show_brackets, true); assert.ok(b.group_id);
  assert.throws(() => parseTupperImport({ tuppers: [{ name: 'Ая', brackets: ['', ''] }] }));
});

test('серверные правила: default → role → channel → user, deny при конфликте ролей', () => {
  const f = fixture();
  f.member.roles.cache.set('r', {});
  const rules = [{ scope: 'default', feature: 'proxies', allow: false },
    { scope: 'role', id: 'r', feature: 'proxies', allow: true }];
  assert.equal(serverAllows({ rules }, 'proxies', f.member, f.channel), true);
  rules.push({ scope: 'channel', id: '300', feature: 'proxies', allow: false });
  assert.equal(serverAllows({ rules }, 'proxies', f.member, f.channel), false);
  rules.push({ scope: 'user', id: '100', feature: 'proxies', allow: true });
  assert.equal(serverAllows({ rules }, 'proxies', f.member, f.channel), true);
  assert.throws(() => validateServerRules([{ scope: 'user', id: '$ne', feature: 'proxies', allow: true }]));
});

test('сообщение отправляется с аватаром/именем, без пингов, до удаления сохраняется автор', async () => {
  const p = await saveTupper('100', { ...profile(), avatar_url: 'https://example.com/a.png' });
  const f = fixture();
  f.message.delete = async () => {
    assert.equal((await db.collection('tupper_messages').findOne({ _id: 'sent1' })).owner_id, '100');
  };
  assert.equal(await proxyMessage(f.message), true);
  assert.equal(f.sent[0].username, 'Ая');
  assert.equal(f.sent[0].avatarURL, p.avatar_url);
  assert.deepEqual(f.sent[0].allowedMentions.parse, []);
  assert.equal(f.sent[0].content, 'Привет!');
  assert.equal((await getTupper('100', p._id)).posts, 1);
  await proxyMessage(f.message);
  assert.equal(f.sent.length, 1);
});

test('сбой вебхука сохраняет исходный текст и блокирует повтор неоднозначной отправки', async () => {
  await saveTupper('100', profile());
  const f = fixture();
  f.hook.send = async () => { throw new Error('network timeout'); };
  await assert.rejects(proxyMessage(f.message), /ошибкой/);
  assert.equal(f.sourceDeleted(), 0);
  assert.equal((await db.collection('tupper_sources').findOne({ _id: 'source' })).status, 'uncertain');
  assert.equal(await proxyMessage(f.message), true);
});

test('мультипрокси, вложения, ответы, ветки и липкий режим', async () => {
  const a = await saveTupper('100', profile());
  const b = await saveTupper('100', profile('Боб', 'б:'));
  await setUserSettings('100', 'channel_300', { auto: 'sticky', proxy: true, private: true });
  const f = fixture();
  f.message.content = 'ая: Привет\nб: Ответ';
  f.message.reference = { messageId: 'reply' };
  f.message.attachments.set('file', { name: 'photo.png', url: 'https://cdn.discordapp.com/a.png' });
  const options = { download: async () => ({ attachment: Buffer.from('x'), name: 'photo.png' }) };
  await proxyMessage(f.message, options);
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[0].files.length, 1);
  assert.equal(f.sent[1].files, undefined);
  assert.match(f.sent[0].content, /\/reply\nПривет/);
  assert.equal((await db.collection('tupper_sticky').findOne({ _id: '100_300' })).profile_id, b._id);
  f.message.id = 'source2'; f.message.content = 'Продолжение'; f.message.attachments.clear();
  await proxyMessage(f.message);
  assert.equal(f.sent[2].username, 'Боб');
  f.message.id = 'source3'; f.message.content = '\\\\сам';
  await proxyMessage(f.message);
  assert.equal(await db.collection('tupper_sticky').findOne({ _id: '100_300' }), null);
  f.channel.isThread = () => true;
  f.channel.parent = { ...f.channel, id: '400', isThread: () => false };
  f.message.id = 'source4'; f.message.content = 'ая: Ветка';
  await proxyMessage(f.message);
  assert.equal(f.sent.at(-1).threadId, '300');
  assert.equal((await getTupper('100', a._id)).posts, 2);
});

test('права Discord, тайм-аут, запрет в приватном канале и редирект', async () => {
  await saveTupper('100', profile());
  const f = fixture();
  assert.match(proxyPermissionError(f.channel, { ...f.member, communicationDisabledUntilTimestamp: Date.now() + 10000 }, f.bot), /тайм-аут/);
  const blocked = { ...f.channel, id: '301', name: 'secret', permissionsFor: who => who.id === '100' ? new PermissionsBitField() : allPermissions };
  f.channels.set(blocked.id, blocked);
  f.message.content = 'ая: {{#301}} Секрет';
  await assert.rejects(proxyMessage(f.message), /нет права/);
  assert.equal(f.sourceDeleted(), 0); assert.equal(f.sent.length, 0);
  blocked.permissionsFor = () => allPermissions;
  await proxyMessage(f.message);
  assert.equal(f.sent[0].content, 'Секрет');
});

test('блоки кубиков, вложенный JSON вставок, редирект, ограничения длины', async () => {
  const expanded = await expandProxyBlocks('Урон {{2d6+3}} {{"embed":{"title":"Заголовок","fields":[{"name":"A","value":"B"}]}}} {{#123}}');
  assert.match(expanded.content, /Урон.*2d6\+3/);
  assert.equal(expanded.embeds[0].title, 'Заголовок');
  assert.equal(expanded.embeds[0].fields[0].value, 'B');
  assert.equal(expanded.redirect, '123');
  const long = 'a'.repeat(1999) + '😀' + 'b'.repeat(2000);
  assert.equal(splitProxyContent(long).join(''), long);
  assert.ok(splitProxyContent(long).every(c => c.length <= 2000));
});

test('провижининг переиспользует только собственный вебхук', async () => {
  const f = fixture();
  let created = 0;
  f.channel.fetchWebhooks = async () => new Collection([['foreign', { ...f.hook, owner: { id: 'other' } }]]);
  f.channel.createWebhook = async () => { created++; return f.hook; };
  const hooks = await Promise.all([getProxyWebhook(f.channel, f.discord), getProxyWebhook(f.channel, f.discord)]);
  assert.equal(created, 1); assert.equal(hooks[0], hooks[1]);
});

test('правка/удаление: автор неизменяем, чужой профиль нельзя использовать для захвата сообщения', async () => {
  const p = await saveTupper('100', profile());
  const f = fixture();
  await proxyMessage(f.message);
  await assert.rejects(loadProxyForUser(f.discord, { id: '101' }, 'sent1', { edit: true }), /только его автор/);
  await assert.rejects(loadProxyForUser(f.discord, f.message.author, 'sent1', { channelId: 'wrong' }), /не найдено/);
  await editProxy(f.discord, f.message.author, 'sent1', 'Новый текст', 1);
  assert.equal(f.edits[0].content, 'Новый текст');
  await assert.rejects(editProxy(f.discord, f.message.author, 'sent1', 'Старая форма', 1), /уже изменено/);
  await deleteTupper('100', p._id, p.revision);
  assert.equal((await loadProxyForUser(f.discord, f.message.author, 'sent1')).record.owner_id, '100');
  await deleteProxy(f.discord, f.message.author, 'sent1');
  assert.equal(f.deleted[0], 'sent1');
});

test('все формы соответствуют API Discord; создание содержит имя, файл, ссылку и оба маркера', async () => {
  const i = interaction();
  const schema = profileModal(i).toJSON();
  assert.equal(schema.components.length, 5);
  assert.ok(schema.components.some(c => c.component.type === 19));
  const p = await saveTupper('100', profile());
  const actions = ['edit', 'details', 'brackets', 'appearance', 'copy', 'group', 'groups', 'deletegroup', 'settings', 'import', 'server', 'rules', 'delete', 'search', 'share', 'find', 'prune', 'purge', 'crop'];
  for (const action of actions) {
    const result = await showTupperAction(i, action, { selected: p._id });
    assert.ok(result.components.length <= 5, action);
    assert.ok(result.custom_id.length <= 100, action);
  }
  const payload = await renderTupperPanel('100', { selected: p._id });
  assert.ok(JSON.stringify(payload.components[0].toJSON()).includes('Ая'));
});

test('форма и панель другого владельца не могут изменить профиль', async () => {
  const i = interaction();
  let replied;
  i.customId = 'tp|create|other|-|0';
  i.reply = async p => { replied = p; };
  await handleTupperModal(i);
  assert.match(replied.content, /другому/);
  assert.equal((await getTuppers('100')).length, 0);
});

test('скачивание вложений не принимает произвольный хост или большой файл', async () => {
  await assert.rejects(downloadDiscordAttachment({ url: 'https://example.com/file', size: 1 }), /CDN Discord/);
  await assert.rejects(downloadDiscordAttachment({ url: 'https://cdn.discordapp.com/file', size: 30 * 1024 * 1024 }), /25 МиБ/);
});

test('настоящая структура ModalSubmitFields сохраняет профиль и сессию панели', async () => {
  const i = interaction();
  const values = { name: 'Ая', avatar_url: '', prefix: 'ая: ', suffix: '' };
  i.fields = new ModalSubmitFields([
    ...Object.entries(values).map(([customId, value]) => ({ type: ComponentType.Label, component: { type: ComponentType.TextInput, customId, value } })),
    { type: ComponentType.Label, component: { type: ComponentType.FileUpload, customId: 'avatar_file', attachments: new Collection() } },
  ]);
  i.customId = 'tp|create|100|-|0';
  i.deferReply = async () => { i.deferred = true; };
  const replies = [];
  i.editReply = async payload => { replies.push(payload); return { id: 'panel' }; };
  await handleTupperModal(i);
  const p = (await getTuppers('100'))[0];
  assert.equal(p.name, 'Ая'); assert.deepEqual(p.brackets, ['ая: ', '']);
  const session = await db.collection('interaction_sessions').findOne({ message_id: 'panel' });
  assert.equal(session.owner_id, '100'); assert.equal(session.state.selected, p._id);
  assert.ok(replies[0].components[0].toJSON().content.includes('сохранены'));
});

test('файл экспорта явно отображается в V2; список другого пользователя остаётся без управления', async () => {
  await saveTupper('100', profile());
  const i = interaction();
  const result = await showTupperAction(i, 'export');
  assert.ok(result.components.some(c => c.toJSON().type === ComponentType.File));
  assert.equal(result.files[0].name, 'verge-tuppers.json');
  const publicPanel = await renderTupperPanel('100', {}, true);
  assert.ok(!JSON.stringify(publicPanel).includes('tp_action'));
});

test('импорт без ID группы и без маркеров не присваивает случайную группу', async () => {
  await importTuppers('100', { groups: [{ name: 'Не назначать' }], tuppers: [{ name: 'Только авто', brackets: [] }] });
  const p = (await getTuppers('100'))[0];
  assert.equal(p.group_id, null); assert.deepEqual(p.brackets, []);
  await setUserSettings('100', 'global', { auto: 'fixed', profile_id: p._id, proxy: true, private: true });
  assert.equal(parseProxyMessage('Слово', [p], { auto: 'fixed', profile_id: p._id }).parts.length, 1);
});

test('переименование группы сохраняет связь профиля и не принимает старую форму', async () => {
  const g = await saveGroup('100', { name: 'Отряд', tag: '[G]' });
  const p = await saveTupper('100', { ...profile(), group_id: g._id });
  const renamed = await saveGroup('100', { ...g, name: 'Другая группа' }, { id: g._id, revision: g.revision });
  assert.equal(renamed._id, g._id); assert.equal((await getTupper('100', p._id)).group_id, g._id);
  await assert.rejects(saveGroup('100', g, { id: g._id, revision: g.revision }), /уже изменена/);
});

test('очистка старых профилей сначала считает, удаляет только неиспользуемые; purge сохраняет авторство сообщений', async () => {
  const a = await saveTupper('100', profile());
  const b = await saveTupper('100', profile('Боб', 'б:'));
  await saveTupper('other', profile());
  const old = new Date(Date.now() - 200 * 86400_000);
  await db.collection('tuppers').updateMany({ owner_id: '100' }, { $set: { created_at: old } });
  await db.collection('tuppers').updateOne({ _id: b._id }, { $set: { last_used: new Date() } });
  assert.equal(await pruneTuppers('100', 180, { preview: true }), 1);
  assert.ok(await getTupper('100', a._id));
  assert.equal(await pruneTuppers('100', 180), 1);
  assert.ok(await getTupper('100', b._id));
  const f = fixture(); f.message.content = 'б: Привет';
  await proxyMessage(f.message);
  assert.equal(await purgeTuppers('100'), 1);
  assert.equal((await loadProxyForUser(f.discord, f.message.author, 'sent1')).record.owner_id, '100');
  assert.equal((await getTuppers('other')).length, 1);
});

test('sticky сохраняет порядок двух сообщений, пришедших одновременно', async () => {
  await saveTupper('100', profile());
  await setUserSettings('100', 'channel_300', { auto: 'sticky', proxy: true, private: true });
  const f = fixture();
  const second = { ...f.message, id: 'second', content: 'Следующая реплика' };
  await Promise.all([proxyMessage(f.message), proxyMessage(second)]);
  assert.equal(f.sent.length, 2); assert.equal(f.sent[1].content, 'Следующая реплика');
});

test('приватная ветка требует участия, даже когда permissionsFor наследует доступ от родителя', async () => {
  const f = fixture();
  const channel = { ...f.channel, type: ChannelType.PrivateThread, permissionsFor: () => new PermissionsBitField([P.ViewChannel, P.SendMessagesInThreads]),
    members: { fetch: async () => { throw new Error('Unknown member'); } } };
  await assert.rejects(assertPrivateThreadAccess(channel, f.member), /приватной ветке/);
  channel.members.fetch = async () => ({ id: '100' });
  await assertPrivateThreadAccess(channel, f.member);
});

test('обрезка изображения проверяет границы и сохраняет PNG нужного размера', async () => {
  const canvas = createCanvas(32, 32);
  canvas.getContext('2d').fillRect(0, 0, 32, 32);
  const png = canvas.toBuffer('image/png');
  const cropped = await cropTupperImage(png, { x: 5, y: 5, width: 10, height: 12 });
  const image = await loadImage(cropped);
  assert.equal(image.width, 10); assert.equal(image.height, 12);
  await assert.rejects(cropTupperImage(png, { x: 30, y: 0, width: 10, height: 10 }), /выходит/);
});

test('расширенные кубики Tupperbox: взрывы, Fate, математика; сложный ввод ограничен', async () => {
  const rolled = await rollAdvancedTupperDice('2d6! + 4dF + ceil(2.5)');
  assert.match(rolled, /2d6!/); assert.match(rolled, /4dF/); assert.match(rolled, /=/);
  await assert.rejects(rollAdvancedTupperDice('d6+'.repeat(100)), /250 символов/);
});

test('удалённый или изменённый автором исходник отменяет отложенную отправку', async () => {
  await saveTupper('100', profile());
  const f = fixture();
  f.channel.messages = { fetch: async () => ({ ...f.message, content: 'Исправленная реплика' }) };
  await proxyMessage(f.message);
  assert.equal(f.sent.length, 0); assert.equal(f.sourceDeleted(), 0);
  f.channel.messages.fetch = async () => { const e = new Error('Unknown message'); e.code = 10008; throw e; };
  await proxyMessage(f.message);
  assert.equal(f.sent.length, 0);
});

test('исходник, уже удалённый во время подтверждённой отправки, не ломает учёт', async () => {
  const p = await saveTupper('100', profile());
  const f = fixture();
  f.message.delete = async () => { const e = new Error('Unknown message'); e.code = 10008; throw e; };
  await proxyMessage(f.message);
  assert.equal((await getTupper('100', p._id)).posts, 1);
  assert.equal((await db.collection('tupper_sources').findOne({ _id: 'source' })).status, 'complete');
});

test('сбой базы до распознавания отыгрыша не отправляет ошибки на обычные сообщения', async () => {
  const f = fixture(); let replies = 0;
  f.message.reply = async () => { replies++; };
  setDB(null);
  try { assert.equal(await handleTupperMessage(f.message), false); assert.equal(replies, 0); }
  finally { setDB(db); }
});
