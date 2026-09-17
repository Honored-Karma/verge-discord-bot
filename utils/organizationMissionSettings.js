import { PermissionFlagsBits } from "discord.js";
import { getDB } from "./db.js";
import { orgRoleKey } from "./orgRoles.js";
import { logAdminAction } from "./dataManager.js";

export const ORG_MISSION_SETTINGS_COLLECTION = "organization_mission_settings";

/**
 * Built-in canonical organizations.
 */
export const CANONICAL_ORGANIZATIONS = [
  {
    id: "tenryu",
    key: "tenryu",
    name: "Tenryū",
    label: "Tenryū (Тенрю)",
    isCustom: false,
  },
  {
    id: "guardians",
    key: "guardians",
    name: "Стражи Мира",
    label: "Стражи Мира (Guardians)",
    isCustom: false,
  },
];

function collection(db = null) {
  return (db || getDB()).collection(ORG_MISSION_SETTINGS_COLLECTION);
}

/**
 * Retrieves all organizations from canonical definitions, org_roles, and custom_orgs in MongoDB.
 * Dynamically queries the database so any newly created custom organization appears immediately.
 */
export async function getAllOrganizations(db = null) {
  const database = db || getDB();
  const orgMap = new Map();

  // 1. Canonical organizations
  for (const org of CANONICAL_ORGANIZATIONS) {
    orgMap.set(org.key, { ...org, role_id: null });
  }

  // 2. Entries from org_roles registry
  if (database) {
    try {
      const orgRoles = await database.collection("org_roles").find({}).toArray();
      for (const entry of orgRoles) {
        const key = entry.org_key || orgRoleKey(entry.label);
        if (!key) continue;
        const existing = orgMap.get(key);
        if (!existing) {
          orgMap.set(key, {
            id: entry._id ? entry._id.toString() : key,
            key,
            name: entry.label || key,
            label: entry.label || key,
            role_id: entry.role_id || null,
            isCustom: true,
          });
        } else {
          existing.role_id = entry.role_id || existing.role_id || null;
          if (entry.label && !existing.label) existing.label = entry.label;
        }
      }
    } catch (error) {
      console.error("Error loading org_roles for mission organizations:", error);
    }

    // 3. Custom organizations created via /org create
    try {
      const customOrgs = await database.collection("custom_orgs").find({}).toArray();
      for (const custom of customOrgs) {
        const key = orgRoleKey(custom.name);
        if (!key) continue;
        const existing = orgMap.get(key);
        if (!existing) {
          orgMap.set(key, {
            id: custom._id ? custom._id.toString() : key,
            key,
            name: custom.name,
            label: custom.name,
            role_id: null,
            isCustom: true,
          });
        } else {
          if (!existing.id && custom._id) {
            existing.id = custom._id.toString();
          }
          if (custom.name && !existing.name) {
            existing.name = custom.name;
          }
        }
      }
    } catch (error) {
      console.error("Error loading custom_orgs for mission organizations:", error);
    }
  }

  return [...orgMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
}

/**
 * Finds an organization by canonical key or name.
 */
export async function getOrganizationByKey(rawKey, db = null) {
  const key = orgRoleKey(rawKey);
  if (!key) return null;

  const orgs = await getAllOrganizations(db);
  return orgs.find((o) => o.key === key) || null;
}

/**
 * Finds an organization by key, name, label or case-insensitive match.
 */
export async function findOrganization(input, db = null) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const key = orgRoleKey(raw);
  const orgs = await getAllOrganizations(db);

  if (key) {
    const foundByKey = orgs.find((o) => o.key === key);
    if (foundByKey) return foundByKey;
  }

  const lower = raw.toLowerCase();
  return (
    orgs.find(
      (o) =>
        o.name.toLowerCase() === lower ||
        (o.label && o.label.toLowerCase() === lower) ||
        o.key.toLowerCase() === lower
    ) || null
  );
}

/**
 * Verifies channel permissions for the bot.
 */
export function verifyChannelPermissions(channel, clientMember) {
  if (!channel || !clientMember) {
    return { ok: false, missing: ["Канал или бот не найден"], canCreateThreads: false };
  }

  const permissions = channel.permissionsFor(clientMember);
  if (!permissions) {
    return { ok: false, missing: ["Нет доступа к каналу"], canCreateThreads: false };
  }

  const required = [
    { bit: PermissionFlagsBits.ViewChannel, name: "Просмотр канала (ViewChannel)" },
    { bit: PermissionFlagsBits.SendMessages, name: "Отправка сообщений (SendMessages)" },
    { bit: PermissionFlagsBits.EmbedLinks, name: "Встраивание ссылок (EmbedLinks)" },
  ];

  const missing = [];
  for (const { bit, name } of required) {
    if (!permissions.has(bit)) {
      missing.push(name);
    }
  }

  const canCreateThreads = permissions.has(PermissionFlagsBits.CreatePublicThreads) &&
    permissions.has(PermissionFlagsBits.SendMessagesInThreads);

  return {
    ok: missing.length === 0,
    missing,
    canCreateThreads,
  };
}

/**
 * Binds an organization to a Discord mission channel in MongoDB.
 */
export async function setOrganizationMissionChannel({
  guildId,
  orgKey,
  orgId,
  orgName,
  channelId,
  adminId,
  db = null,
}) {
  const normalizedKey = orgRoleKey(orgKey);
  if (!guildId || !normalizedKey || !channelId) {
    return { success: false, reason: "invalid_input" };
  }

  const target = collection(db);
  const now = new Date();

  await target.updateOne(
    { guild_id: String(guildId), organization_key: normalizedKey },
    {
      $set: {
        guild_id: String(guildId),
        organization_key: normalizedKey,
        organization_id: orgId || normalizedKey,
        organization_name: orgName || normalizedKey,
        channel_id: String(channelId),
        updated_by: adminId || "system",
        updated_at: now,
      },
      $setOnInsert: {
        created_at: now,
      },
    },
    { upsert: true }
  );

  if (adminId) {
    logAdminAction(
      adminId,
      "SET_ORG_MISSION_CHANNEL",
      `Назначил канал <#${channelId}> для организации "${orgName || normalizedKey}" (${normalizedKey})`
    );
  }

  return {
    success: true,
    guild_id: String(guildId),
    organization_key: normalizedKey,
    channel_id: String(channelId),
  };
}

/**
 * Removes an organization's channel configuration.
 */
export async function removeOrganizationMissionChannel({
  guildId,
  orgKey,
  adminId,
  db = null,
}) {
  const normalizedKey = orgRoleKey(orgKey);
  if (!guildId || !normalizedKey) {
    return { success: false, reason: "invalid_input" };
  }

  const target = collection(db);
  const result = await target.deleteOne({
    guild_id: String(guildId),
    organization_key: normalizedKey,
  });

  if (result.deletedCount === 0) {
    return { success: false, reason: "not_found" };
  }

  if (adminId) {
    logAdminAction(
      adminId,
      "REMOVE_ORG_MISSION_CHANNEL",
      `Удалил привязку канала миссий для организации "${normalizedKey}"`
    );
  }

  return { success: true };
}

/**
 * Gets configured mission channel setting for an organization.
 */
export async function getOrganizationMissionChannel({ guildId, orgKey, db = null }) {
  const normalizedKey = orgRoleKey(orgKey);
  if (!guildId || !normalizedKey) return null;

  return await collection(db).findOne({
    guild_id: String(guildId),
    organization_key: normalizedKey,
  });
}

/**
 * Checks if a channel is bound to an organization in the guild.
 */
export async function getOrganizationByChannelId({ guildId, channelId, db = null }) {
  if (!guildId || !channelId) return null;

  return await collection(db).findOne({
    guild_id: String(guildId),
    channel_id: String(channelId),
  });
}

/**
 * Lists all organization mission settings for a guild.
 */
export async function listOrganizationMissionSettings({ guildId, db = null }) {
  if (!guildId) return [];

  return await collection(db)
    .find({ guild_id: String(guildId) })
    .sort({ organization_name: 1 })
    .toArray();
}
