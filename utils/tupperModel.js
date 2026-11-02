import { randomBytes } from 'node:crypto';
import { getDB, withTransaction } from './db.js';
import { TupperError } from './tupperErrors.js';

export const TUPPER_LIMIT = 5000;
export const MULTIPROXY_LIMIT = 30;
export const newTupperId = () => randomBytes(9).toString('hex');
export const nameKey = value => String(value).normalize('NFKC').trim().toLocaleLowerCase('ru');
const fail = text => { throw new TupperError(text); };
const text = (value, max, label, required = false) => {
  if (value != null && typeof value !== 'string') fail(`${label}: требуется текст.`);
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > max) fail(`${label}: укажите ${required ? 'от 1 до' : 'не больше'} ${max} символов.`);
  return result;
};

export function validateBrackets(value) {
  if (!Array.isArray(value) || value.length > 60 || value.length % 2) {
    fail('Маркеры: нужен массив пар ["начало", "конец"], до 30 пар.');
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 2) {
    const pair = value.slice(i, i + 2);
    if (pair.some(v => typeof v !== 'string' || v.length > 100 || /[\r\n]/.test(v)) || !pair.some(Boolean)) {
      fail('В паре нужен хотя бы один маркер. Каждый маркер — до 100 символов, без переноса строки.');
    }
    const key = JSON.stringify(pair);
    if (seen.has(key)) fail('Удалите повторяющиеся пары маркеров.');
    seen.add(key);
  }
  return [...value];
}

export function validateImageUrl(value) {
  if (!value) return null;
  const raw = text(value, 2000, 'Ссылка на изображение');
  let url;
  try { url = new URL(raw); } catch { fail('Укажите полную HTTPS-ссылку на изображение.'); }
  if (url.protocol !== 'https:' || url.username || url.password) fail('Укажите HTTPS-ссылку без логина и пароля.');
  return url.href;
}

export function normalizeProfile(input) {
  const name = text(input.name, 80, 'Имя', true);
  const nick = text(input.nick, 80, 'Отображаемое имя');
  for (const v of [name, nick]) {
    if (/[\u0000-\u001f\u007f]/u.test(v) || /clyde|discord/i.test(v)) fail('Имя не должно содержать управляющие символы, «clyde» или «discord».');
  }
  const birthday = input.birthday ? new Date(input.birthday) : null;
  if (birthday && Number.isNaN(birthday.getTime())) fail('Дата рождения: используйте ГГГГ-ММ-ДД.');
  return {
    name, name_key: nameKey(name), nick,
    brackets: validateBrackets(input.brackets),
    avatar_url: validateImageUrl(input.avatar_url),
    banner_url: validateImageUrl(input.banner_url),
    description: text(input.description, 2000, 'Описание'),
    tag: text(input.tag, 32, 'Тег'),
    group_id: input.group_id || null,
    show_brackets: input.show_brackets === true,
    birthday: birthday?.toISOString() || null,
    position: Number.isSafeInteger(input.position) && input.position >= 0 ? input.position : 0,
  };
}

export async function initializeTuppers(db) {
  await db.collection('tuppers').createIndex({ owner_id: 1, name_key: 1 }, { unique: true });
  await db.collection('tuppers').createIndex({ owner_id: 1, position: 1, _id: 1 });
  await db.collection('tuppers').createIndex({ name_key: 1 });
  await db.collection('tupper_groups').createIndex({ owner_id: 1, name_key: 1 }, { unique: true });
  await db.collection('tupper_messages').createIndex({ source_id: 1 });
  await db.collection('tupper_messages').createIndex({ owner_id: 1, channel_id: 1, created_at: -1 });
  await db.collection('tupper_sources').createIndex({ created_at: 1 }, { expireAfterSeconds: 30 * 86400 });
}

export const profileCollection = () => getDB().collection('tuppers');
export const getTupper = (owner, id) => profileCollection().findOne({ _id: id, owner_id: owner });
export const getTuppers = owner => profileCollection().find({ owner_id: owner }).sort({ position: 1, _id: 1 }).limit(TUPPER_LIMIT).toArray();
export const getGroups = owner => getDB().collection('tupper_groups').find({ owner_id: owner }).sort({ name_key: 1 }).toArray();

// Serialize account mutations inside MongoDB transactions, including quota checks/imports.
async function accountTransaction(owner, work) {
  return withTransaction(async session => {
    await getDB().collection('tupper_accounts').updateOne({ _id: owner }, { $inc: { revision: 1 } }, { upsert: true, session });
    return work(session);
  });
}

async function checkBracketConflicts(owner, profile, id, session) {
  const others = await profileCollection().find({ owner_id: owner, _id: { $ne: id } }, { session, projection: { brackets: 1 } }).toArray();
  for (let i = 0; i < profile.brackets.length; i += 2) {
    if (others.some(p => p.brackets.some((_, j) => j % 2 === 0 && p.brackets[j] === profile.brackets[i] && p.brackets[j + 1] === profile.brackets[i + 1]))) {
      fail('Эта пара маркеров уже используется другим профилем. Выберите другую.');
    }
  }
}

export async function saveTupper(owner, input, { id = newTupperId(), revision = null } = {}) {
  const profile = normalizeProfile(input);
  try {
    return await accountTransaction(owner, async session => {
      if (profile.group_id && !await getDB().collection('tupper_groups').findOne({ _id: profile.group_id, owner_id: owner }, { session })) fail('Группа больше не существует. Выберите другую.');
      await checkBracketConflicts(owner, profile, id, session);
      if (revision !== null) {
        const updated = await profileCollection().findOneAndUpdate({ _id: id, owner_id: owner, revision },
          { $set: { ...profile, updated_at: new Date() }, $inc: { revision: 1 } }, { session, returnDocument: 'after' });
        if (!updated) fail('Профиль уже изменён или удалён. Откройте его заново.');
        return updated;
      }
      if (await profileCollection().countDocuments({ owner_id: owner }, { session }) >= TUPPER_LIMIT) fail(`Достигнут лимит: ${TUPPER_LIMIT} профилей.`);
      const doc = { ...profile, _id: id, owner_id: owner, revision: 1, posts: 0, created_at: new Date(), updated_at: new Date() };
      await profileCollection().insertOne(doc, { session });
      return doc;
    });
  } catch (error) {
    if (error.code === 11000) fail('Профиль с таким именем уже существует. Выберите другое имя.');
    throw error;
  }
}

export async function deleteTupper(owner, id, revision) {
  return accountTransaction(owner, async session => {
    const result = await profileCollection().deleteOne({ _id: id, owner_id: owner, revision }, { session });
    if (!result.deletedCount) fail('Профиль уже изменён или удалён. Откройте его заново.');
    // Keep message ownership records: deleting a profile must not anonymize its old messages.
    return true;
  });
}

export async function purgeTuppers(owner) {
  return accountTransaction(owner, async session => {
    const profiles = await profileCollection().deleteMany({ owner_id: owner }, { session });
    await getDB().collection('tupper_groups').deleteMany({ owner_id: owner }, { session });
    await getDB().collection('tupper_settings').deleteOne({ _id: owner }, { session });
    await getDB().collection('tupper_sticky').deleteMany({ owner_id: owner }, { session });
    return profiles.deletedCount;
  });
}

export async function pruneTuppers(owner, days, { preview = false } = {}) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 36500) fail('Укажите от 1 до 36500 дней без использования.');
  const cutoff = new Date(Date.now() - days * 86400_000);
  const filter = { owner_id: owner, created_at: { $lt: cutoff }, $or: [{ last_used: { $lt: cutoff } }, { last_used: null }] };
  if (preview) return profileCollection().countDocuments(filter);
  return accountTransaction(owner, async session => (await profileCollection().deleteMany(filter, { session })).deletedCount);
}

export async function saveGroup(owner, input, { id = null, revision = null } = {}) {
  const name = text(input.name, 80, 'Название группы', true);
  const fields = { name, name_key: nameKey(name), description: text(input.description, 2000, 'Описание'),
    tag: text(input.tag, 32, 'Тег'), avatar_url: validateImageUrl(input.avatar_url) };
  return accountTransaction(owner, async session => {
    if (id) {
      const updated = await getDB().collection('tupper_groups').findOneAndUpdate({ _id: id, owner_id: owner, revision },
        { $set: fields, $inc: { revision: 1 } }, { session, returnDocument: 'after' });
      if (!updated) fail('Группа уже изменена или удалена. Откройте её заново.');
      return updated;
    }
    if (await getDB().collection('tupper_groups').countDocuments({ owner_id: owner }, { session }) >= 500
      && !await getDB().collection('tupper_groups').findOne({ owner_id: owner, name_key: fields.name_key }, { session })) fail('Достигнут лимит: 500 групп.');
    return getDB().collection('tupper_groups').findOneAndUpdate({ owner_id: owner, name_key: fields.name_key },
      { $set: fields, $setOnInsert: { _id: newTupperId() }, $inc: { revision: 1 } }, { upsert: true, session, returnDocument: 'after' });
  });
}

export async function deleteGroup(owner, name) {
  return accountTransaction(owner, async session => {
    const group = await getDB().collection('tupper_groups').findOneAndDelete({ owner_id: owner, name_key: nameKey(name) }, { session });
    if (!group) fail('Группа с таким названием не найдена.');
    await profileCollection().updateMany({ owner_id: owner, group_id: group._id }, { $set: { group_id: null }, $inc: { revision: 1 } }, { session });
  });
}

export function resolveSettings(doc, scopes) {
  const result = { proxy: true, auto: 'off', profile_id: null, private: true };
  for (const key of ['global', ...scopes]) {
    for (const [field, value] of Object.entries(doc?.scopes?.[key] || {})) {
      if (value !== null && value !== 'inherit') result[field] = value;
    }
  }
  return result;
}

export function channelScopes(channel) {
  const scopes = [];
  if (channel.guildId || channel.guild?.id) scopes.push(`guild_${channel.guildId || channel.guild.id}`);
  const thread = channel.isThread?.();
  const category = thread ? channel.parent?.parentId : channel.parentId;
  if (category) scopes.push(`category_${category}`);
  if (thread && channel.parentId) scopes.push(`channel_${channel.parentId}`);
  scopes.push(`${thread ? 'thread' : 'channel'}_${channel.id}`);
  return scopes;
}

export async function setUserSettings(owner, scope, input) {
  if (!/^(global|(guild|category|channel|thread)_\d{1,20})$/.test(scope)) fail('Не удалось определить область настройки.');
  if (![true, false, 'inherit'].includes(input.proxy) || ![true, false, 'inherit'].includes(input.private)
    || !['off', 'sticky', 'fixed', 'inherit'].includes(input.auto)) fail('Выберите значения из списка.');
  if (input.auto === 'fixed' && !await getTupper(owner, input.profile_id)) fail('Для автопрокси выберите свой существующий профиль.');
  await getDB().collection('tupper_settings').updateOne({ _id: owner },
    { $set: { [`scopes.${scope}`]: { proxy: input.proxy, private: input.private, auto: input.auto, profile_id: input.auto === 'fixed' ? input.profile_id : null } } }, { upsert: true });
}

export function serverAllows(config, feature, member, channel) {
  let allowed = true;
  const rules = config?.rules || [];
  const roles = member?.roles?.cache;
  const levels = [
    rules.filter(r => r.scope === 'default'),
    rules.filter(r => r.scope === 'role' && roles?.has(r.id)),
    rules.filter(r => r.scope === 'channel' && [channel.parent?.parentId, channel.parentId, channel.id].includes(r.id)),
    rules.filter(r => r.scope === 'user' && r.id === member?.id),
  ];
  for (const level of levels) {
    const values = level.filter(r => r.feature === feature).map(r => r.allow);
    if (values.length) allowed = !values.includes(false);
  }
  return allowed;
}

export function validateServerRules(rules) {
  if (!Array.isArray(rules) || rules.length > 200) fail('Правила: массив JSON, не больше 200 записей.');
  return rules.map(rule => {
    if (!rule || !['default', 'role', 'channel', 'user'].includes(rule.scope)
      || !['commands', 'proxies', 'queries'].includes(rule.feature) || typeof rule.allow !== 'boolean'
      || (rule.scope !== 'default' && !/^\d{1,20}$/.test(rule.id))) fail('Правило: scope, id, feature (commands/proxies/queries), allow (true/false).');
    return { scope: rule.scope, id: rule.scope === 'default' ? null : rule.id, feature: rule.feature, allow: rule.allow };
  });
}

export function displayTupperName(profile, group, now = new Date()) {
  const birthday = profile.birthday && new Date(profile.birthday);
  const cake = birthday && birthday.getUTCMonth() === now.getUTCMonth() && birthday.getUTCDate() === now.getUTCDate() ? ' 🎂' : '';
  return [profile.nick || profile.name, profile.tag, group?.tag, cake].filter(Boolean).join(' ').slice(0, 80);
}

// Longest pair wins. A new speaker starts at the beginning of a new line.
export function parseProxyMessage(content, profiles, { auto = 'off', profile_id = null, sticky_id = null } = {}) {
  if (content.startsWith('\\')) return { parts: [], escape: true, reset: content.startsWith('\\\\') };
  const pairs = profiles.flatMap(profile => profile.brackets.flatMap((_, i) => i % 2 ? [] : [{ profile, prefix: profile.brackets[i], suffix: profile.brackets[i + 1] }]))
    .sort((a, b) => b.prefix.length + b.suffix.length - a.prefix.length - a.suffix.length || a.profile._id.localeCompare(b.profile._id));
  const lines = content.split('\n');
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    const pair = pairs.find(p => p.prefix && line.startsWith(p.prefix));
    if (pair) starts.push({ offset, pair });
    offset += line.length + 1;
  }
  const parts = [];
  if (!starts.some(s => s.offset === 0) && pairs.some(p => !p.prefix && content.endsWith(p.suffix))) {
    starts.unshift({ offset: 0 });
  }
  if (starts[0]?.offset === 0) {
    let index = 0;
    while (index < starts.length) {
      const start = starts[index];
      let found = false;
      for (let end = index + 1; end <= starts.length; end++) {
        const raw = content.slice(start.offset, starts[end]?.offset ?? content.length).trimEnd();
        const pair = pairs.find(p => raw.startsWith(p.prefix) && raw.endsWith(p.suffix) && raw.length >= p.prefix.length + p.suffix.length);
        if (!pair) continue;
        const body = raw.slice(pair.prefix.length, pair.suffix ? -pair.suffix.length : undefined).trim();
        parts.push({ profile: pair.profile, content: pair.profile.show_brackets ? raw : body });
        index = end;
        found = true;
        break;
      }
      if (!found) return { parts: [], invalid: true };
      if (parts.length > MULTIPROXY_LIMIT) fail(`В одном сообщении можно использовать до ${MULTIPROXY_LIMIT} персонажей.`);
    }
    return { parts, explicit: true, last_id: parts.at(-1)?.profile._id };
  }
  const id = auto === 'fixed' ? profile_id : auto === 'sticky' ? sticky_id : null;
  const profile = profiles.find(p => p._id === id);
  // Preserve commands from other bots when autoproxy is enabled.
  return { parts: profile && !/^[!/$?]|^\w+!/.test(content) ? [{ profile, content }] : [], explicit: false };
}

export async function exportTuppers(owner) {
  const [profiles, groups] = await Promise.all([getTuppers(owner), getGroups(owner)]);
  const groupIds = new Map(groups.map((g, i) => [g._id, i + 1]));
  return {
    groups: groups.map(g => ({ id: groupIds.get(g._id), user_id: owner, name: g.name, description: g.description, tag: g.tag, avatar_url: g.avatar_url })),
    tuppers: profiles.map((p, i) => ({ id: i + 1, user_id: owner, name: p.name, nick: p.nick, brackets: p.brackets,
      avatar_url: p.avatar_url || undefined, banner_url: p.banner_url || undefined, description: p.description, tag: p.tag,
      group_id: groupIds.get(p.group_id) || null, show_brackets: p.show_brackets, birthday: p.birthday,
      posts: p.posts, created_at: p.created_at, last_used: p.last_used || null, position: p.position })),
  };
}

export function parseTupperImport(data) {
  const plural = Array.isArray(data?.members);
  const raw = plural ? data.members : data?.tuppers;
  if (!Array.isArray(raw) || raw.length > TUPPER_LIMIT || !Array.isArray(data.groups || [])) fail('Загрузите экспорт Tupperbox или PluralKit (до 5000 профилей).');
  if ((data.groups || []).length > 500) fail('Можно импортировать до 500 групп.');
  const groups = (data.groups || []).map(g => {
    if (!g || typeof g !== 'object') fail('Каждая группа в импорте должна быть объектом JSON.');
    return ({ external_id: g.id, name: text(g.name, 80, 'Название группы', true), description: text(g.description, 2000, 'Описание группы'), tag: text(g.tag, 32, 'Тег группы'),
    avatar_url: validateImageUrl(g.avatar_url || (plural ? g.icon : null) || (g.avatar && g.user_id && /^[\w-]+$/.test(g.avatar) && /^\d+$/.test(g.user_id) ? `https://cdn.tupperbox.app/group-pfp/${g.user_id}/${g.avatar}.webp` : null)), members: g.members || [] });
  });
  const profiles = raw.map((p, i) => {
    if (!p || typeof p !== 'object') fail('Каждый профиль в импорте должен быть объектом JSON.');
    const pkGroup = plural && groups.find(g => Array.isArray(g.members) && g.members.includes(p.id));
    return { ...normalizeProfile({
      name: p.name, nick: plural ? p.display_name : p.nick,
      brackets: plural ? (p.proxy_tags || []).flatMap(t => [t.prefix || '', t.suffix || '']) : p.brackets,
      avatar_url: plural ? p.webhook_avatar_url || p.avatar_url : (p.avatar && p.user_id && /^[\w-]+$/.test(p.avatar) && /^\d+$/.test(p.user_id) ? `https://cdn.tupperbox.app/pfp/${p.user_id}/${p.avatar}.webp` : p.avatar_url),
      banner_url: p.banner_url || (plural ? p.banner : (p.banner && p.user_id && /^[\w-]+$/.test(p.banner) && /^\d+$/.test(p.user_id) ? `https://cdn.tupperbox.app/banner/${p.user_id}/${p.banner}.webp` : null)),
      description: p.description, tag: plural ? data.tag : p.tag, show_brackets: plural ? p.keep_proxy : p.show_brackets,
      birthday: p.birthday, position: p.position ?? i,
    }), external_group: pkGroup?.external_id ?? p.group_id, external_group_name: p.group_name,
    posts: Number.isSafeInteger(plural ? p.message_count : p.posts) && (plural ? p.message_count : p.posts) >= 0 ? (plural ? p.message_count : p.posts) : 0,
    created_at: Number.isFinite(Date.parse(p.created_at || p.created)) ? new Date(p.created_at || p.created) : new Date(),
    last_used: Number.isFinite(Date.parse(p.last_used || p.last_message_timestamp)) ? new Date(p.last_used || p.last_message_timestamp) : null };
  });
  if (new Set(profiles.map(p => p.name_key)).size !== profiles.length) fail('В импорте есть профили с одинаковым именем. Переименуйте их.');
  if (new Set(groups.map(g => nameKey(g.name))).size !== groups.length) fail('В импорте есть группы с одинаковым названием.');
  const groupIds = groups.map(g => g.external_id).filter(id => id !== undefined && id !== null);
  if (new Set(groupIds).size !== groupIds.length) fail('В импорте есть группы с одинаковым ID.');
  return { profiles, groups };
}

export async function importTuppers(owner, data) {
  const parsed = parseTupperImport(data);
  return accountTransaction(owner, async session => {
    const collection = profileCollection();
    const old = await collection.find({ owner_id: owner }, { session }).toArray();
    if (old.length + parsed.profiles.filter(p => !old.some(o => o.name_key === p.name_key)).length > TUPPER_LIMIT) fail('Импорт превысит лимит 5000 профилей.');
    const groupMap = new Map();
    for (const { external_id, members, ...group } of parsed.groups) {
      const doc = await getDB().collection('tupper_groups').findOneAndUpdate({ owner_id: owner, name_key: nameKey(group.name) },
        { $set: group, $setOnInsert: { _id: newTupperId() }, $inc: { revision: 1 } }, { upsert: true, session, returnDocument: 'after' });
      if (external_id !== undefined && external_id !== null) groupMap.set(external_id, doc._id);
    }
    if (await getDB().collection('tupper_groups').countDocuments({ owner_id: owner }, { session }) > 500) fail('Импорт превысит лимит 500 групп.');
    for (const { external_group, external_group_name, ...profile } of parsed.profiles) {
      const previous = old.find(p => p.name_key === profile.name_key);
      const namedGroup = external_group_name && await getDB().collection('tupper_groups').findOne({ owner_id: owner, name_key: nameKey(external_group_name) }, { session });
      await collection.updateOne({ owner_id: owner, name_key: profile.name_key },
        { $set: { ...profile, group_id: groupMap.get(external_group) || previous?.group_id || namedGroup?._id || null, updated_at: new Date() },
          $setOnInsert: { _id: newTupperId() }, $inc: { revision: 1 } }, { upsert: true, session });
    }
    const all = await collection.find({ owner_id: owner }, { session }).toArray();
    const brackets = new Set();
    for (const p of all) for (let i = 0; i < p.brackets.length; i += 2) {
      const key = JSON.stringify(p.brackets.slice(i, i + 2));
      if (brackets.has(key)) fail('Импорт создаст одинаковые маркеры у разных профилей. Исправьте пары в JSON.');
      brackets.add(key);
    }
    return { profiles: parsed.profiles.length, groups: parsed.groups.length };
  });
}
