import crypto from "crypto";
import { getDB } from "./db.js";
import {
  addAP,
  addSP,
  addReputation,
  getAllPlayerSP,
  getPlayer,
  giveItem,
  logAdminAction,
} from "./dataManager.js";
import { orgRoleKey } from "./orgRoles.js";
import { isRankSufficient, normalizeRank } from "./rankSystem.js";

export const MISSIONS_COLLECTION = "missions";

export const MISSION_STATUS = {
  recruiting: "recruiting",
  active: "active",
  completed: "completed",
  cancelled: "cancelled",
};

export const MISSION_ACCESS = {
  organization: "organization",
  open: "open",
  invited: "invited",
};

export const MISSION_TYPES = {
  well: "well",
  raid: "raid",
  investigation: "investigation",
  faction: "faction",
  social: "social",
  other: "other",
};

export const TYPE_LABELS = {
  well: "Скважина",
  raid: "Набег",
  investigation: "Расследование",
  faction: "Фракция",
  social: "Социальная",
  other: "Другое",
};

export const KNOWN_EMOJI_MARKUP = {
  "45lootbox": "<:45lootbox:1499585857995411576>",
  "14LightningPurple": "<:14LightningPurple:1494708639473074277>",
};

export const MISSION_EMOJIS = {
  party: ":25user:",
  objective: ":19warning:",
  rewards: "<:45lootbox:1499585857995411576>",
  borehole: ":63borehole:",
  info: ":66info:",
  link: ":15link:",
  star: ":26star:",
  lightning: "<:14LightningPurple:1494708639473074277>",
};

export const TYPE_FALLBACK_ICONS = {
  well: "🌀",
  raid: "⚔️",
  investigation: "🔍",
  faction: "🚩",
  social: "💬",
  other: "📜",
};

export const TYPE_ICONS = {
  well: ":63borehole:",
  raid: "<:14LightningPurple:1494708639473074277>",
  investigation: ":66info:",
  faction: ":26star:",
  social: ":15link:",
  other: ":66info:",
};

/**
 * Разрешает кастомный эмодзи по названию или строке тега.
 * Если передан client/guild, пытается найти эмодзи в кэше и вернуть полный формат <:name:id>.
 */
export function resolveCustomEmoji(emojiStrOrName, clientOrGuild = null, fallback = "") {
  if (!emojiStrOrName) return fallback;
  const str = String(emojiStrOrName).trim();

  // Если уже в полном формате Discord <:name:id> или <a:name:id>
  if (/^<a?:\w+:\d+>$/.test(str)) {
    return str;
  }

  // Извлекаем имя, если строка вида :name:
  const nameMatch = str.match(/^:?([a-zA-Z0-9_]+):?$/);
  const name = nameMatch ? nameMatch[1] : str;

  // 1. Проверяем известные статические теги
  if (KNOWN_EMOJI_MARKUP[name]) {
    return KNOWN_EMOJI_MARKUP[name];
  }

  // 2. Ищем в кэше Discord-клиента или гильдии, если передан
  const cache = clientOrGuild?.emojis?.cache || clientOrGuild?.client?.emojis?.cache;
  if (cache) {
    const found = cache.find((e) => e.name === name);
    if (found) return found.toString();
  }

  // 3. Возвращаем в формате :name:
  return `:${name}:`;
}

/**
 * Безопасный парсер для компонентов Discord (SelectMenu/Button),
 * где недопустима строка вида :name: без ID.
 */
export function parseOptionEmoji(emojiStr, fallback = undefined) {
  if (!emojiStr) return fallback;
  const str = String(emojiStr).trim();
  const match = str.match(/^<(a)?:(\w+):(\d+)>$/);
  if (match) {
    return { id: match[3], name: match[2], animated: Boolean(match[1]) };
  }
  if (!str.startsWith(":") && !str.includes("<")) {
    return str;
  }
  return fallback;
}

export const STATUS_LABELS = {
  recruiting: "Набор",
  active: "В процессе",
  completed: "Завершена",
  cancelled: "Отменена",
};

export const STATUS_ICONS = {
  recruiting: "🟢",
  active: "⚔️",
  completed: "🏆",
  cancelled: "❌",
};

function collection(db = null) {
  return (db || getDB()).collection(MISSIONS_COLLECTION);
}

/**
 * Generates a clean, readable public ID: MSN-XXXXXX (6 uppercase letters/numbers, excluding 0, O, 1, I).
 */
export function generateMissionPublicId() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `MSN-${code}`;
}

/**
 * Creates a new mission document in MongoDB with a unique public ID.
 */
export async function createMission({
  guildId,
  organizationId = null,
  organizationKey = null,
  organizationName = null,
  channelId,
  messageId = null,
  title,
  type = MISSION_TYPES.other,
  description,
  access = MISSION_ACCESS.open,
  maxPlayers = 5,
  minRank = null,
  createdBy,
  reward = {},
  imageUrl = null,
  thumbnailUrl = null,
  db = null,
}) {
  const target = collection(db);
  const now = new Date();

  // Retry generating public ID in the rare event of collision
  let publicId = generateMissionPublicId();
  let attempts = 0;
  while (attempts < 5) {
    const exists = await target.findOne({ public_id: publicId });
    if (!exists) break;
    publicId = generateMissionPublicId();
    attempts++;
  }

  const safeReward = {
    ap: Math.max(0, Number(reward.ap || 0)),
    sp: Math.max(0, Number(reward.sp || 0)),
    reputation: Math.max(0, Number(reward.reputation || 0)),
    item: reward.item?.item_name
      ? {
          item_id: reward.item.item_id || reward.item.item_name,
          item_name: String(reward.item.item_name).trim(),
          quantity: Math.max(1, Number(reward.item.quantity || 1)),
        }
      : null,
  };

  const missionDoc = {
    public_id: publicId,
    guild_id: String(guildId),
    organization_id: organizationId || null,
    organization_key: organizationKey || null,
    organization_name: organizationName || null,
    channel_id: String(channelId),
    message_id: messageId ? String(messageId) : null,
    thread_id: null,

    title: String(title).trim(),
    type: MISSION_TYPES[type] || MISSION_TYPES.other,
    description: String(description).trim(),

    access: MISSION_ACCESS[access] || MISSION_ACCESS.open,
    status: MISSION_STATUS.recruiting,
    max_players: Math.max(1, Math.min(50, Number(maxPlayers) || 5)),
    min_rank: minRank && String(minRank).toLowerCase() !== "none" ? normalizeRank(minRank) : null,

    image_url: imageUrl ? String(imageUrl).trim() : null,
    thumbnail_url: thumbnailUrl ? String(thumbnailUrl).trim() : null,

    created_by: {
      user_id: String(createdBy.user_id),
      username: String(createdBy.username || "Unknown"),
    },

    participants: [],
    invited_user_ids: [],

    reward: safeReward,
    reward_delivery: {},

    started_at: null,
    started_by: null,
    completed_at: null,
    completed_by: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,

    version: 1,
    created_at: now,
    updated_at: now,
  };

  await target.insertOne(missionDoc);

  logAdminAction(
    createdBy.user_id,
    "CREATE_MISSION",
    `Создал миссию "${missionDoc.title}" [${publicId}] (организация: ${organizationName || "Открытая"})`
  );

  return missionDoc;
}

/**
 * Retrieves a mission by public ID.
 */
export async function getMissionByPublicId(publicId, db = null) {
  if (!publicId) return null;
  return await collection(db).findOne({ public_id: String(publicId).trim() });
}

/**
 * Retrieves a mission by message ID.
 */
export async function getMissionByMessageId(messageId, db = null) {
  if (!messageId) return null;
  return await collection(db).findOne({ message_id: String(messageId).trim() });
}

/**
 * Associates the Discord message ID and thread ID with the mission.
 */
export async function setMissionMessageId(publicId, messageId, db = null) {
  return await collection(db).updateOne(
    { public_id: String(publicId).trim() },
    { $set: { message_id: String(messageId), updated_at: new Date() } }
  );
}

/**
 * Saves thread ID for a mission.
 */
export async function setMissionThreadId(publicId, threadId, db = null) {
  return await collection(db).updateOne(
    { public_id: String(publicId).trim() },
    { $set: { thread_id: String(threadId), updated_at: new Date() } }
  );
}

/**
 * Joins a mission atomically.
 * Ensures:
 * 1. Status is 'recruiting'
 * 2. Organization access restriction matches player's organization
 * 3. User / character has not already joined
 * 4. Capacity limit (participants.length < max_players) is atomically enforced
 */
export async function joinMission({
  publicId,
  playerId,
  userId,
  characterName,
  organizationName = null,
  rank = null,
  db = null,
}) {
  const target = collection(db);
  const mission = await target.findOne({ public_id: String(publicId).trim() });

  if (!mission) {
    return { success: false, reason: "mission_not_found" };
  }

  if (mission.status !== MISSION_STATUS.recruiting) {
    return { success: false, reason: "not_recruiting", status: mission.status };
  }

  // Check if player or user is already in the party
  const alreadyJoined = mission.participants.some(
    (p) => p.user_id === String(userId) || p.player_id === String(playerId)
  );
  if (alreadyJoined) {
    return { success: false, reason: "already_joined" };
  }

  // Access validation: organization restriction
  if (mission.access === MISSION_ACCESS.organization && mission.organization_key) {
    const playerOrgKey = orgRoleKey(organizationName);
    if (playerOrgKey !== mission.organization_key) {
      return {
        success: false,
        reason: "organization_mismatch",
        requiredOrg: mission.organization_name,
        playerOrg: organizationName || "Без организации",
      };
    }
  }

  // Access validation: invited only
  if (mission.access === MISSION_ACCESS.invited) {
    const isInvited =
      (mission.invited_user_ids || []).includes(String(userId)) ||
      mission.created_by.user_id === String(userId);
    if (!isInvited) {
      return { success: false, reason: "not_invited" };
    }
  }

  // Access validation: minimum rank requirement
  if (mission.min_rank) {
    if (!rank) {
      return {
        success: false,
        reason: "rank_required",
        requiredRank: mission.min_rank,
        playerRank: null,
      };
    }

    if (!isRankSufficient(rank, mission.min_rank)) {
      return {
        success: false,
        reason: "rank_too_low",
        requiredRank: mission.min_rank,
        playerRank: rank,
      };
    }
  }

  const participant = {
    player_id: String(playerId),
    user_id: String(userId),
    character_name: String(characterName || "Безымянный").trim(),
    organization_name: organizationName ? String(organizationName).trim() : null,
    rank: rank ? String(rank).trim() : null,
    joined_at: new Date(),
  };

  // Atomic join: checks not full AND user not already in party simultaneously
  const updated = await target.findOneAndUpdate(
    {
      public_id: String(publicId).trim(),
      status: MISSION_STATUS.recruiting,
      "participants.user_id": { $ne: String(userId) },
      "participants.player_id": { $ne: String(playerId) },
      $expr: { $lt: [{ $size: "$participants" }, "$max_players"] },
    },
    {
      $push: { participants: participant },
      $set: { updated_at: new Date() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    // Determine why atomic update didn't match
    const fresh = await target.findOne({ public_id: String(publicId).trim() });
    if (!fresh || fresh.status !== MISSION_STATUS.recruiting) {
      return { success: false, reason: "not_recruiting" };
    }
    if (fresh.participants.some((p) => p.user_id === String(userId) || p.player_id === String(playerId))) {
      return { success: false, reason: "already_joined" };
    }
    return { success: false, reason: "party_full" };
  }

  logAdminAction(
    userId,
    "JOIN_MISSION",
    `Персонаж ${participant.character_name} вступил в миссию ${mission.title} [${publicId}]`
  );

  return { success: true, mission: updated, participant };
}

/**
 * Leaves a mission. Only allowed while status is 'recruiting'.
 */
export async function leaveMission({ publicId, playerId, userId, db = null }) {
  const target = collection(db);
  const mission = await target.findOne({ public_id: String(publicId).trim() });

  if (!mission) {
    return { success: false, reason: "mission_not_found" };
  }

  if (mission.status !== MISSION_STATUS.recruiting) {
    return {
      success: false,
      reason: "locked",
      message: "Нельзя покинуть миссию после начала или завершения.",
    };
  }

  const isMember = mission.participants.some(
    (p) => p.user_id === String(userId) || p.player_id === String(playerId)
  );
  if (!isMember) {
    return { success: false, reason: "not_in_party" };
  }

  const updated = await target.findOneAndUpdate(
    {
      public_id: String(publicId).trim(),
      status: MISSION_STATUS.recruiting,
    },
    {
      $pull: {
        participants: {
          $or: [{ user_id: String(userId) }, { player_id: String(playerId) }],
        },
      },
      $set: { updated_at: new Date() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" }
  );

  logAdminAction(
    userId,
    "LEAVE_MISSION",
    `Игрок ${userId} покинул миссию ${mission.title} [${publicId}]`
  );

  return { success: true, mission: updated };
}

/**
 * Starts a mission, locking the party roster.
 */
export async function startMission({
  publicId,
  actorId,
  actorUsername,
  threadId = null,
  db = null,
}) {
  const target = collection(db);
  const now = new Date();

  const updated = await target.findOneAndUpdate(
    {
      public_id: String(publicId).trim(),
      status: MISSION_STATUS.recruiting,
    },
    {
      $set: {
        status: MISSION_STATUS.active,
        started_at: now,
        started_by: {
          user_id: String(actorId),
          username: String(actorUsername || "Unknown"),
        },
        thread_id: threadId ? String(threadId) : null,
        updated_at: now,
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    const current = await target.findOne({ public_id: String(publicId).trim() });
    return {
      success: false,
      reason: current ? "invalid_status" : "not_found",
      currentStatus: current?.status,
    };
  }

  logAdminAction(
    actorId,
    "START_MISSION",
    `Запустил миссию "${updated.title}" [${publicId}] (участников: ${updated.participants.length})`
  );

  return { success: true, mission: updated };
}

/**
 * Cancels a mission without granting any rewards.
 */
export async function cancelMission({
  publicId,
  actorId,
  actorUsername,
  reason = null,
  db = null,
}) {
  const target = collection(db);
  const now = new Date();

  const updated = await target.findOneAndUpdate(
    {
      public_id: String(publicId).trim(),
      status: { $in: [MISSION_STATUS.recruiting, MISSION_STATUS.active] },
    },
    {
      $set: {
        status: MISSION_STATUS.cancelled,
        cancelled_at: now,
        cancelled_by: {
          user_id: String(actorId),
          username: String(actorUsername || "Unknown"),
        },
        cancel_reason: reason ? String(reason).trim() : null,
        updated_at: now,
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    const current = await target.findOne({ public_id: String(publicId).trim() });
    return {
      success: false,
      reason: current?.status === MISSION_STATUS.completed ? "already_completed" : "not_found",
    };
  }

  logAdminAction(
    actorId,
    "CANCEL_MISSION",
    `Отменил миссию "${updated.title}" [${publicId}] (причина: ${reason || "не указана"})`
  );

  return { success: true, mission: updated };
}

/**
 * Delivers rewards to all locked mission participants idempotently.
 * Safe functions are used: addAP, addSP, addReputation, giveItem.
 * Every delivery operation uses a unique key:
 *   mission:<public_id>:<player_id>:ap
 *   mission:<public_id>:<player_id>:sp
 *   mission:<public_id>:<player_id>:reputation
 *   mission:<public_id>:<player_id>:item
 *
 * If any reward fails, the mission is NOT marked completed and can be retried.
 */
export async function deliverMissionRewards({
  publicId,
  actorId,
  actorUsername,
  db = null,
}) {
  const target = collection(db);
  const mission = await target.findOne({ public_id: String(publicId).trim() });

  if (!mission) {
    return { success: false, reason: "not_found" };
  }

  if (mission.status === MISSION_STATUS.completed) {
    return { success: true, alreadyCompleted: true, mission };
  }

  if (mission.status === MISSION_STATUS.cancelled) {
    return { success: false, reason: "mission_cancelled" };
  }

  const deliveryReport = [];
  const deliveries = { ...(mission.reward_delivery || {}) };
  let allDelivered = true;
  let hasFailures = false;

  for (const participant of mission.participants) {
    const playerId = participant.player_id;
    const participantReport = {
      player_id: playerId,
      character_name: participant.character_name,
      user_id: participant.user_id,
      rewards: {},
    };

    // 1. AP Delivery
    if (mission.reward.ap > 0) {
      const apKey = `mission:${mission.public_id}:${playerId}:ap`;
      if (deliveries[apKey]?.status === "delivered") {
        participantReport.rewards.ap = { status: "already_delivered", amount: mission.reward.ap };
      } else {
        try {
          const res = await addAP(playerId, mission.reward.ap, "mission", true);
          if (res !== false) {
            deliveries[apKey] = {
              status: "delivered",
              amount: mission.reward.ap,
              delivered_at: new Date(),
            };
            participantReport.rewards.ap = { status: "delivered", amount: mission.reward.ap };
          } else {
            deliveries[apKey] = { status: "failed", error: "Не удалось начислить AP" };
            participantReport.rewards.ap = { status: "failed", error: "Не удалось начислить AP" };
            allDelivered = false;
            hasFailures = true;
          }
        } catch (err) {
          deliveries[apKey] = { status: "failed", error: err.message };
          participantReport.rewards.ap = { status: "failed", error: err.message };
          allDelivered = false;
          hasFailures = true;
        }
      }
    }

    // 2. SP Delivery
    if (mission.reward.sp > 0) {
      const spKey = `mission:${mission.public_id}:${playerId}:sp`;
      if (deliveries[spKey]?.status === "delivered") {
        participantReport.rewards.sp = { status: "already_delivered", amount: mission.reward.sp };
      } else {
        try {
          const styles = await getAllPlayerSP(playerId);
          if (styles && styles.length > 0) {
            // Apply SP to the participant's highest/primary learned style
            const targetStyle = styles[0];
            const res = await addSP(
              playerId,
              targetStyle.id,
              mission.reward.sp,
              actorId,
              `mission:${mission.public_id}`,
              true
            );
            if (res !== false) {
              deliveries[spKey] = {
                status: "delivered",
                amount: mission.reward.sp,
                style_id: targetStyle.id,
                style_name: targetStyle.name,
                delivered_at: new Date(),
              };
              participantReport.rewards.sp = {
                status: "delivered",
                amount: mission.reward.sp,
                style: targetStyle.name,
              };
            } else {
              deliveries[spKey] = { status: "failed", error: "Не удалось начислить SP в базу" };
              participantReport.rewards.sp = { status: "failed", error: "Не удалось начислить SP в базу" };
              allDelivered = false;
              hasFailures = true;
            }
          } else {
            // Player has no learned martial styles
            deliveries[spKey] = {
              status: "failed",
              error: "У персонажа нет изученных боевых стилей для начисления SP",
            };
            participantReport.rewards.sp = {
              status: "failed",
              error: "У персонажа нет изученных боевых стилей",
            };
            allDelivered = false;
            hasFailures = true;
          }
        } catch (err) {
          deliveries[spKey] = { status: "failed", error: err.message };
          participantReport.rewards.sp = { status: "failed", error: err.message };
          allDelivered = false;
          hasFailures = true;
        }
      }
    }

    // 3. Reputation Delivery
    if (mission.reward.reputation > 0) {
      const repKey = `mission:${mission.public_id}:${playerId}:reputation`;
      if (deliveries[repKey]?.status === "delivered") {
        participantReport.rewards.reputation = {
          status: "already_delivered",
          amount: mission.reward.reputation,
        };
      } else {
        try {
          const res = await addReputation(
            playerId,
            mission.reward.reputation,
            actorId,
            `Завершение миссии: ${mission.title} [${mission.public_id}]`
          );
          if (res !== false) {
            deliveries[repKey] = {
              status: "delivered",
              amount: mission.reward.reputation,
              delivered_at: new Date(),
            };
            participantReport.rewards.reputation = {
              status: "delivered",
              amount: mission.reward.reputation,
            };
          } else {
            deliveries[repKey] = { status: "failed", error: "Не удалось начислить репутацию" };
            participantReport.rewards.reputation = { status: "failed", error: "Не удалось начислить репутацию" };
            allDelivered = false;
            hasFailures = true;
          }
        } catch (err) {
          deliveries[repKey] = { status: "failed", error: err.message };
          participantReport.rewards.reputation = { status: "failed", error: err.message };
          allDelivered = false;
          hasFailures = true;
        }
      }
    }

    // 4. Item Delivery
    if (mission.reward.item?.item_name) {
      const itemKey = `mission:${mission.public_id}:${playerId}:item`;
      if (deliveries[itemKey]?.status === "delivered") {
        participantReport.rewards.item = {
          status: "already_delivered",
          itemName: mission.reward.item.item_name,
          qty: mission.reward.item.quantity,
        };
      } else {
        try {
          const res = await giveItem(
            playerId,
            mission.reward.item.item_name,
            mission.reward.item.quantity,
            actorId
          );
          if (res && res.success) {
            deliveries[itemKey] = {
              status: "delivered",
              itemName: mission.reward.item.item_name,
              quantity: mission.reward.item.quantity,
              delivered_at: new Date(),
            };
            participantReport.rewards.item = {
              status: "delivered",
              itemName: mission.reward.item.item_name,
              qty: mission.reward.item.quantity,
            };
          } else {
            const errorMsg = res?.reason || "Ошибка выдачи предмета в инвентарь";
            deliveries[itemKey] = { status: "failed", error: errorMsg };
            participantReport.rewards.item = { status: "failed", error: errorMsg };
            allDelivered = false;
            hasFailures = true;
          }
        } catch (err) {
          deliveries[itemKey] = { status: "failed", error: err.message };
          participantReport.rewards.item = { status: "failed", error: err.message };
          allDelivered = false;
          hasFailures = true;
        }
      }
    }

    deliveryReport.push(participantReport);
  }

  const now = new Date();
  const updateData = {
    reward_delivery: deliveries,
    updated_at: now,
  };

  // Only transition to completed when all required rewards for all members are delivered
  if (allDelivered) {
    updateData.status = MISSION_STATUS.completed;
    updateData.completed_at = now;
    updateData.completed_by = {
      user_id: String(actorId),
      username: String(actorUsername || "Unknown"),
    };
  }

  const updatedMission = await target.findOneAndUpdate(
    { public_id: String(publicId).trim() },
    { $set: updateData, $inc: { version: 1 } },
    { returnDocument: "after" }
  );

  if (allDelivered) {
    logAdminAction(
      actorId,
      "COMPLETE_MISSION",
      `Завершил миссию "${mission.title}" [${publicId}], награды успешно выданы всем (${mission.participants.length}) участникам`
    );
  } else {
    logAdminAction(
      actorId,
      "PARTIAL_MISSION_REWARDS",
      `Частичная выдача наград для миссии "${mission.title}" [${publicId}]. Требуется повтор для невыданных наград.`
    );
  }

  return {
    success: true,
    allDelivered,
    hasFailures,
    mission: updatedMission,
    deliveryReport,
  };
}

/**
 * Lists missions matching search criteria.
 */
export async function listMissions({
  guildId,
  organizationKey = null,
  status = null,
  minRank = null,
  limit = 20,
  db = null,
}) {
  const query = { guild_id: String(guildId) };

  if (organizationKey) {
    query.organization_key = orgRoleKey(organizationKey);
  }

  if (status) {
    query.status = status;
  }

  if (minRank && String(minRank).toLowerCase() !== "none") {
    query.min_rank = normalizeRank(minRank);
  }

  return await collection(db)
    .find(query)
    .sort({ created_at: -1 })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)))
    .toArray();
}
