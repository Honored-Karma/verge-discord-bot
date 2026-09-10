import { PermissionFlagsBits } from "discord.js";
import { getDB } from "./db.js";
import { getActiveSlot, getPlayer, logAdminAction } from "./dataManager.js";
import { makePlayerKey } from "./playerKey.js";
import { normalizeOrganization } from "./rankSystem.js";

export const ORG_ROLES_COLLECTION = "org_roles";

/**
 * Соответствия «организация — роль Discord».
 *
 * Реестр лежит в базе, а не в переменных окружения, потому что кастомные
 * организации создаются прямо из Discord через `/org create`. Держать половину
 * настройки в Railway означало бы, что каждая новая фракция требует редеплоя.
 *
 * Четыре записи ниже — только начальные значения. Они проливаются через
 * `$setOnInsert`, как каталог магазина: правки, сделанные админом через
 * `/org role set`, при следующем старте не перетираются.
 */
export const DEFAULT_ORG_ROLES = [
  { org_key: "tenryu", label: "TENRYU", role_id: "1537014608660004935" },
  { org_key: "guardians", label: "GUARDIANS", role_id: "1537014611075928094" },
  { org_key: "мрачный блеск", label: "Мрачный Блеск", role_id: "1537014599071703050" },
  { org_key: "затмение", label: "Затмение", role_id: "1537014613168750612" },
];

export const ORG_SYNC = {
  applied: "applied",
  unchanged: "unchanged",
  noGuild: "no_guild",
  memberNotFound: "member_not_found",
  unmapped: "unmapped",
  missingPermission: "missing_permission",
  roleTooHigh: "role_too_high",
  roleNotFound: "role_not_found",
  failed: "failed",
};

/**
 * Приводит название организации к ключу реестра.
 *
 * Каноничные организации в базе лежат как `TENRYU`/`GUARDIANS`, кастомные — как
 * админ их назвал. Чтобы не разъезжаться с ранговой сеткой, каноничные названия
 * определяются той же `normalizeOrganization`, что и в `/set-rank`; всё
 * остальное становится ключом по самому названию.
 */
export function orgRoleKey(name) {
  const raw = String(name || "").trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const canonical = normalizeOrganization(raw);
  if (canonical) return canonical.toLowerCase();

  return raw.toLowerCase();
}

/**
 * Организация персонажа. Порядок тот же, что на карточке профиля: ранговая
 * организация важнее кастомной, если почему-то заполнены обе.
 */
export function playerOrgName(player) {
  if (!player) return null;
  const name = player.organization || player.custom_org || null;
  return name ? String(name).trim() || null : null;
}

function collection() {
  return getDB().collection(ORG_ROLES_COLLECTION);
}

export async function initializeOrgRoles(db) {
  const target = db.collection(ORG_ROLES_COLLECTION);
  await target.createIndex(
    { org_key: 1 },
    { unique: true, name: "org_role_key_unique" },
  );

  let seeded = 0;
  for (const entry of DEFAULT_ORG_ROLES) {
    const result = await target.updateOne(
      { org_key: entry.org_key },
      {
        $setOnInsert: {
          org_key: entry.org_key,
          label: entry.label,
          role_id: entry.role_id,
          updated_by: "system",
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) seeded += 1;
  }

  if (seeded > 0) {
    console.log(`🏷️  Реестр ролей организаций: добавлено записей — ${seeded}`);
  }
  return { seeded };
}

export async function listOrgRoles() {
  try {
    return await collection().find({}).sort({ label: 1 }).toArray();
  } catch (error) {
    console.error("Error listing org roles:", error);
    return [];
  }
}

export async function setOrgRole(name, roleId, adminId) {
  const org_key = orgRoleKey(name);
  const role_id = String(roleId || "").trim();
  if (!org_key || !role_id) return { success: false, reason: "invalid_input" };

  const label = String(name || "").trim().replace(/\s+/g, " ");
  try {
    await collection().updateOne(
      { org_key },
      {
        $set: {
          org_key,
          label,
          role_id,
          updated_by: adminId || null,
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
    logAdminAction(
      adminId,
      "SET_ORG_ROLE",
      `Привязал роль ${role_id} к организации "${label}"`,
    );
    return { success: true, org_key, label, role_id };
  } catch (error) {
    console.error("Error setting org role:", error);
    return { success: false, reason: "database_error" };
  }
}

export async function unsetOrgRole(name, adminId) {
  const org_key = orgRoleKey(name);
  if (!org_key) return { success: false, reason: "invalid_input" };

  try {
    const result = await collection().deleteOne({ org_key });
    if (result.deletedCount === 0) return { success: false, reason: "not_found" };
    logAdminAction(
      adminId,
      "UNSET_ORG_ROLE",
      `Отвязал роль от организации "${org_key}"`,
    );
    return { success: true };
  } catch (error) {
    console.error("Error unsetting org role:", error);
    return { success: false, reason: "database_error" };
  }
}

/**
 * Какую роль должен носить участник — считается по АКТИВНОМУ слоту.
 *
 * Роль в Discord одна на аккаунт, а персонажей у игрока два, и они могут быть в
 * разных организациях. Объединять их нельзя: Тенрю и Стражи Мира — противоборцы,
 * и человек с обеими ролями сразу выглядит для остальных игроков ошибкой. Роль
 * показывает того персонажа, которым игрок играет прямо сейчас, поэтому
 * `/slot` тоже пересобирает роли.
 */
export async function resolveWantedOrg(userId, registry) {
  const slot = await getActiveSlot(userId);
  const player = await getPlayer(makePlayerKey(userId, slot));
  const orgName = playerOrgName(player);
  if (!orgName) return { orgName: null, row: null, slot };

  const key = orgRoleKey(orgName);
  const row = registry.find((entry) => entry.org_key === key) || null;
  return { orgName, row, slot };
}

function managedRoleIds(registry) {
  return registry
    .map((entry) => String(entry.role_id || "").trim())
    .filter(Boolean);
}

/**
 * Приводит роли организации у участника к состоянию его активного персонажа.
 *
 * Идемпотентна: её можно звать после любой правки организации, в том числе по
 * неактивному слоту — тогда она просто ничего не изменит. Поэтому вызывающим
 * командам не нужно самим выяснять, затронут ли активный персонаж.
 *
 * Роли снимаются только те, что перечислены в реестре. Косметические, админские
 * и любые другие роли участника не наша забота — `roles.set` здесь был бы
 * катастрофой.
 */
export async function syncOrgRoles({ guild, userId, actorId = null, registry = null }) {
  const empty = { added: null, removed: [], orgName: null };
  if (!guild) return { ...empty, status: ORG_SYNC.noGuild };

  const rows = registry || await listOrgRoles();
  const managed = managedRoleIds(rows);

  const { orgName, row } = await resolveWantedOrg(userId, rows);
  const wantedId = row?.role_id ? String(row.role_id).trim() : null;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ...empty, orgName, status: ORG_SYNC.memberNotFound };

  const stale = managed.filter((id) => id !== wantedId && member.roles.cache.has(id));
  const needsAdd = Boolean(wantedId) && !member.roles.cache.has(wantedId);

  if (!needsAdd && stale.length === 0) {
    const status = orgName && !wantedId ? ORG_SYNC.unmapped : ORG_SYNC.unchanged;
    return { ...empty, orgName, status };
  }

  const me = guild.members.me;
  if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ...empty, orgName, status: ORG_SYNC.missingPermission };
  }

  const reason = actorId
    ? `Организация персонажа (изменил ${actorId})`
    : "Синхронизация роли организации";

  const added = [];
  const removed = [];

  // Сначала выдаём новую роль, потом снимаем прежние: при обратном порядке
  // между двумя запросами игрок остался бы вообще без организации.
  if (needsAdd) {
    const role = guild.roles.cache.get(wantedId)
      || await guild.roles.fetch(wantedId).catch(() => null);
    if (!role) return { ...empty, orgName, status: ORG_SYNC.roleNotFound };
    if (me && role.position >= me.roles.highest.position) {
      return { ...empty, orgName, status: ORG_SYNC.roleTooHigh };
    }

    try {
      await member.roles.add(role, reason);
      added.push(wantedId);
    } catch (error) {
      console.error(`Не удалось выдать роль организации ${wantedId}:`, error);
      return { ...empty, orgName, status: ORG_SYNC.failed };
    }
  }

  for (const id of stale) {
    try {
      await member.roles.remove(id, reason);
      removed.push(id);
    } catch (error) {
      console.error(`Не удалось снять роль организации ${id}:`, error);
    }
  }

  // Названия отдаём отдельно от id: в ответе команды роль называется словами.
  // Синтаксис `<@&id>` в Components V2 — живое упоминание, и каждая выдача ранга
  // пинговала бы всю фракцию (allowed_mentions в ответах команд не выставляется).
  const labelOf = (roleId) => rows.find((entry) => String(entry.role_id) === roleId)?.label || roleId;

  return {
    status: orgName && !wantedId ? ORG_SYNC.unmapped : ORG_SYNC.applied,
    orgName,
    added: added[0] || null,
    removed,
    addedLabel: added[0] ? labelOf(added[0]) : null,
    removedLabels: removed.map(labelOf),
  };
}

/**
 * Базовые Discord-id всех игроков, у которых хоть в одном слоте есть организация.
 * `$ne: null` отбрасывает и пустые, и отсутствующие поля.
 */
export async function listPlayersWithOrg() {
  try {
    const rows = await getDB().collection("players").find(
      { $or: [{ organization: { $ne: null } }, { custom_org: { $ne: null } }] },
      { projection: { id: 1 } },
    ).toArray();
    return [...new Set(rows.map((row) => String(row.id).split("_")[0]))];
  } catch (error) {
    console.error("Error listing players with org:", error);
    return [];
  }
}

export const SYNC_ALL_LIMIT = 1000;
const FULL_FETCH_MEMBER_CAP = 5000;

/**
 * Разовая пересинхронизация всего сервера.
 *
 * Нужна при первом включении: у игроков организации уже проставлены, а ролей
 * ещё нет, и без этого прохода они получат роль только когда организацию выдадут
 * заново. Кандидаты берутся с двух сторон — те, у кого организация есть в базе
 * (надо выдать), и те, у кого висит роль из реестра (возможно, надо снять).
 */
export async function syncAllOrgRoles({ guild, actorId = null }) {
  if (!guild) return { status: ORG_SYNC.noGuild, processed: 0, counts: {} };

  const registry = await listOrgRoles();
  const managed = managedRoleIds(registry);
  const candidates = new Set(await listPlayersWithOrg());

  // Полный список участников тянем только на посильном сервере: на большом это
  // десятки тысяч запросов ради снятия единичных ролей.
  if (managed.length > 0 && Number(guild.memberCount || 0) <= FULL_FETCH_MEMBER_CAP) {
    const members = await guild.members.fetch().catch((error) => {
      console.error("Не удалось получить список участников:", error);
      return null;
    });
    if (members) {
      for (const member of members.values()) {
        if (managed.some((id) => member.roles.cache.has(id))) candidates.add(member.id);
      }
    }
  }

  const ids = [...candidates].slice(0, SYNC_ALL_LIMIT);
  const counts = {};
  for (const userId of ids) {
    const result = await syncOrgRoles({ guild, userId, actorId, registry });
    counts[result.status] = (counts[result.status] || 0) + 1;
  }

  return {
    status: ORG_SYNC.applied,
    processed: ids.length,
    truncated: candidates.size > ids.length,
    counts,
  };
}

/**
 * Человеческая приписка к ответу команды. Админ должен видеть, что произошло с
 * ролью, иначе молчание бота выглядит как поломка.
 */
export function describeOrgSync(result) {
  switch (result?.status) {
    case ORG_SYNC.applied: {
      const parts = [];
      if (result.addedLabel) parts.push(`выдана роль **${result.addedLabel}**`);
      if (result.removedLabels?.length) {
        parts.push(`снято: ${result.removedLabels.map((label) => `**${label}**`).join(", ")}`);
      }
      return `🏷️ Роли обновлены — ${parts.join("; ")}.`;
    }
    case ORG_SYNC.unchanged:
      return "🏷️ Роли уже соответствуют активному персонажу.";
    case ORG_SYNC.unmapped:
      return `⚠️ Для организации **${result.orgName}** не задана роль. Привяжите её: \`/org role set\`.`;
    case ORG_SYNC.memberNotFound:
      return "⚠️ Роль не выдана: игрока нет на сервере.";
    case ORG_SYNC.missingPermission:
      return "⚠️ Роль не выдана: у бота нет права «Управление ролями».";
    case ORG_SYNC.roleTooHigh:
      return "⚠️ Роль не выдана: она выше роли бота в списке. Поднимите роль бота.";
    case ORG_SYNC.roleNotFound:
      return "⚠️ Роль не выдана: привязанная роль на сервере не найдена.";
    case ORG_SYNC.failed:
      return "⚠️ Роль не выдана: Discord отклонил запрос. Проверьте права бота.";
    case ORG_SYNC.noGuild:
      return "";
    default:
      return "";
  }
}
