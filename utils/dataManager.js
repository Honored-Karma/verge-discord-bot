import { getDB, withTransaction } from "./db.js";
import { calculateExchange, calculateTransfer } from "./banking.js";
import { getItemDefinition } from "./itemSystem.js";
import { incrementInventoryStack } from "./inventoryStore.js";
import {
  isTransactionUnsupportedError,
  transferCurrencyCompensated,
  transferCurrencyInTransaction,
} from "./currencyTransferStore.js";

const PLAYER_DEFAULTS = {
  character_avatar: null,
  character_name: null,
  krw: 0,
  yen: 0,
  ap: 0,
  rank: null,
  organization: null,
  custom_org: null,
  salary_multiplier: 100,
  last_train_timestamp: 0,
  last_socialrp_timestamp: 0,
  unlocked_avatar: 0,
  ap_multiplier: 100,
  sp_multiplier: 100,
  ap_multiplier_expires_at: 0,
  sp_multiplier_expires_at: 0,
  last_ap_change_at: 0,
  last_sp_change_at: 0,
  last_salary_paid_at: 0,
  last_sp_train_timestamp: 0,
  reputation: 20,
};

function normalizePlayerDocument(player) {
  if (!player) return null;
  return {
    ...PLAYER_DEFAULTS,
    ...player,
    krw: Number(player.krw || 0),
    yen: Number(player.yen || 0),
    ap: Number(player.ap || 0),
    ap_multiplier: Number(player.ap_multiplier || 100),
    sp_multiplier: Number(player.sp_multiplier || 100),
    salary_multiplier: Number(player.salary_multiplier ?? 100),
    ap_multiplier_expires_at: Number(player.ap_multiplier_expires_at || 0),
    sp_multiplier_expires_at: Number(player.sp_multiplier_expires_at || 0),
    unlocked_avatar: Number(player.unlocked_avatar || 0),
    last_train_timestamp: Number(player.last_train_timestamp || 0),
    last_socialrp_timestamp: Number(player.last_socialrp_timestamp || 0),
    last_ap_change_at: Number(player.last_ap_change_at || 0),
    last_sp_change_at: Number(player.last_sp_change_at || 0),
    last_salary_paid_at: Number(player.last_salary_paid_at || 0),
    last_sp_train_timestamp: Number(player.last_sp_train_timestamp || 0),
    reputation:
      typeof player.reputation === "number" ? player.reputation : 20,
  };
}

function normalizeSlot(slot) {
  const s = Number(slot);
  if (s === 2) return 2;
  return 1;
}

function formatDuration(seconds) {
  if (seconds <= 0) return "бессрочно";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}мин`);
  return parts.join(" ") || "менее 1 мин";
}

export async function expireMultipliers() {
  try {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const apResult = await db
      .collection("players")
      .updateMany(
        { ap_multiplier_expires_at: { $gt: 0, $lte: now } },
        { $set: { ap_multiplier: 100, ap_multiplier_expires_at: 0 } },
      );
    const spResult = await db
      .collection("players")
      .updateMany(
        { sp_multiplier_expires_at: { $gt: 0, $lte: now } },
        { $set: { sp_multiplier: 100, sp_multiplier_expires_at: 0 } },
      );
    if (apResult.modifiedCount > 0 || spResult.modifiedCount > 0) {
      console.log(
        `🔄 Expired multipliers: AP=${apResult.modifiedCount}, SP=${spResult.modifiedCount}`,
      );
    }
    return { ap: apResult.modifiedCount, sp: spResult.modifiedCount };
  } catch (error) {
    console.error("Error expiring multipliers:", error);
    return { ap: 0, sp: 0 };
  }
}

function getRankBonusPercent(rank) {
  const normalized = String(rank || "")
    .trim()
    .toUpperCase();
  const map = { S: 20, A: 15, B: 10, C: 5 };
  return map[normalized] || 0;
}

function getActivityBonusPercent(player) {
  const now = Math.floor(Date.now() / 1000);
  const lastTrain = Number(player.last_train_timestamp || 0);
  const lastSocial = Number(player.last_socialrp_timestamp || 0);
  const lastSPTrain = Number(player.last_sp_train_timestamp || 0);
  const latest = Math.max(lastTrain, lastSocial, lastSPTrain);
  if (!latest) return 0;
  // Bonus for active players (activity in last 7 days)
  return now - latest <= 7 * 24 * 60 * 60 ? 5 : 0;
}

// Получить активный слот пользователя (по умолчанию 1)
// Храним активный слот в отдельной коллекции user_settings, чтобы это работало даже если у пользователя есть только слот 2.
export async function getActiveSlot(userId) {
  try {
    const db = getDB();

    // Primary source of truth
    const settings = await db
      .collection("user_settings")
      .findOne({ id: userId });
    if (settings && settings.active_slot) {
      return normalizeSlot(settings.active_slot);
    }

    // Back-compat: migrate from legacy storage in players.active_slot (slot 1 doc)
    const playerSlot1 = await db.collection("players").findOne({ id: userId });
    if (playerSlot1 && playerSlot1.active_slot) {
      const slot = normalizeSlot(playerSlot1.active_slot);
      await db
        .collection("user_settings")
        .updateOne(
          { id: userId },
          { $set: { active_slot: slot } },
          { upsert: true },
        );
      return slot;
    }

    // Legacy edge case: user may historically have only slot 2 character
    const playerSlot2 = await db
      .collection("players")
      .findOne({ id: `${userId}_2` });
    if (playerSlot2) {
      return 2;
    }

    return 1;
  } catch (error) {
    console.error("Error getting active slot:", error);
    return 1;
  }
}

// Установить активный слот пользователя
export async function setActiveSlot(userId, slot) {
  try {
    const db = getDB();
    const normalized = normalizeSlot(slot);
    const res = await db
      .collection("user_settings")
      .updateOne(
        { id: userId },
        { $set: { active_slot: normalized } },
        { upsert: true },
      );

    // Treat "already set" as success too (modifiedCount may be 0)
    return (
      res.matchedCount > 0 || res.upsertedCount > 0 || res.modifiedCount > 0
    );
  } catch (error) {
    console.error("Error setting active slot:", error);
    return false;
  }
}

function logAdminAction(adminId, action, details) {
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const db = getDB();
    db.collection("admin_actions")
      .insertOne({
        admin_id: adminId,
        action,
        details,
        timestamp,
      })
      .catch((err) => console.error("Error logging to DB:", err));
  } catch (error) {
    console.error("Error logging admin action:", error);
  }
}

async function addProgressionHistory(
  playerId,
  type,
  oldValue,
  newValue,
  source = "system",
  details = null,
) {
  try {
    const db = getDB();
    await db.collection("progression_history").insertOne({
      player_id: playerId,
      type,
      old_value: oldValue,
      new_value: newValue,
      delta: newValue - oldValue,
      source,
      ...(details && typeof details === "object" ? details : {}),
      changed_at: new Date(),
    });
  } catch (error) {
    console.error("Error adding progression history:", error);
  }
}

export async function getPlayer(playerId) {
  try {
    const db = getDB();
    const player = await db.collection("players").findOne({ id: playerId });
    return normalizePlayerDocument(player);
  } catch (error) {
    console.error("Error getting player:", error);
    return null;
  }
}

export async function updatePlayer(playerId, updates) {
  try {
    const db = getDB();
    const res = await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: updates });
    return res.matchedCount > 0;
  } catch (error) {
    console.error("Error updating player:", error);
    return false;
  }
}

export async function registerPhysicalStats(playerId, stats, adminId) {
  try {
    const db = getDB();
    const now = new Date();
    const result = await db.collection("players").updateOne(
      { id: playerId, physical_stats: { $exists: false } },
      {
        $set: {
          physical_stats: {
            ...stats,
            created_at: now,
            updated_at: now,
            updated_by: adminId,
          },
        },
      },
    );

    if (result.matchedCount === 0) {
      const playerExists = await db.collection("players").findOne(
        { id: playerId },
        { projection: { id: 1 } },
      );
      return {
        success: false,
        reason: playerExists ? "already_registered" : "player_not_found",
      };
    }

    logAdminAction(
      adminId,
      "REGISTER_PHYSICAL_STATS",
      `Зарегистрировал физические показатели для игрока ${playerId}`,
    );
    return { success: true };
  } catch (error) {
    console.error("Error registering physical stats:", error);
    return { success: false, reason: "database_error" };
  }
}

export async function editPhysicalStats(playerId, updates, adminId) {
  try {
    const db = getDB();
    const setOperations = {
      "physical_stats.updated_at": new Date(),
      "physical_stats.updated_by": adminId,
    };

    for (const [field, value] of Object.entries(updates)) {
      setOperations[`physical_stats.${field}`] = value;
    }

    const result = await db.collection("players").updateOne(
      { id: playerId, physical_stats: { $exists: true } },
      { $set: setOperations },
    );

    if (result.matchedCount === 0) {
      const playerExists = await db.collection("players").findOne(
        { id: playerId },
        { projection: { id: 1 } },
      );
      return {
        success: false,
        reason: playerExists ? "not_registered" : "player_not_found",
      };
    }

    logAdminAction(
      adminId,
      "EDIT_PHYSICAL_STATS",
      `Изменил физические показатели игрока ${playerId}: ${Object.keys(updates).join(", ")}`,
    );
    return { success: true };
  } catch (error) {
    console.error("Error editing physical stats:", error);
    return { success: false, reason: "database_error" };
  }
}

export async function createPlayer(
  playerId,
  username,
  characterName,
  characterAvatar = null,
  slot = 1,
  attributeName = null,
) {
  try {
    const db = getDB();
    let id = playerId;
    if (slot && slot !== 1) {
      id = `${playerId}_${slot}`;
    }

    // If player already exists, treat as success (avoid duplicate-key race conditions)
    const existing = await db.collection("players").findOne({ id });
    if (existing) return true;

    await db.collection("players").insertOne({
      id,
      username,
      character_name: characterName,
      character_avatar: characterAvatar,
      attribute_name: attributeName,
      krw: 0,
      yen: 0,
      ap: 0,
      last_train_timestamp: 0,
      last_socialrp_timestamp: 0,
      last_sp_train_timestamp: 0,
      unlocked_avatar: 0,
      ap_multiplier: 100.0,
      sp_multiplier: 100.0,
      ap_multiplier_expires_at: 0,
      sp_multiplier_expires_at: 0,
      last_ap_change_at: 0,
      last_sp_change_at: 0,
      rank: null,
      organization: null,
    });
    return true;
  } catch (error) {
    // If another process inserted the same id simultaneously, treat as success
    try {
      if (error && error.code === 11000) {
        return true;
      }
    } catch (e) {}
    console.error("Error creating player:", error);
    return false;
  }
}

/**
 * Вычисляет эффективный множитель AP для игрока — ровно так же, как это делает addAP.
 * Используйте для отображения, чтобы избежать погрешности обратного вычисления.
 */
export function getEffectiveAPMultiplier(player) {
  const now = Math.floor(Date.now() / 1000);
  let apMultiplier = Number(player.ap_multiplier || 100);
  if (
    player.ap_multiplier_expires_at > 0 &&
    now >= player.ap_multiplier_expires_at
  ) {
    apMultiplier = 100;
  }
  const dynamicBonus =
    getRankBonusPercent(player.rank) + getActivityBonusPercent(player);
  return apMultiplier + dynamicBonus;
}

export async function addAP(playerId, amount, actionType = "train") {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return false;

    const now = Math.floor(Date.now() / 1000);
    let apMultiplier = player.ap_multiplier || 100;
    if (
      player.ap_multiplier_expires_at > 0 &&
      now >= player.ap_multiplier_expires_at
    ) {
      apMultiplier = 100;
      await db
        .collection("players")
        .updateOne(
          { id: playerId },
          { $set: { ap_multiplier: 100, ap_multiplier_expires_at: 0 } },
        );
    }
    const dynamicBonus =
      getRankBonusPercent(player.rank) + getActivityBonusPercent(player);
    const effectiveMultiplier = apMultiplier + dynamicBonus;
    const adjustedAmount = Math.round(amount * (effectiveMultiplier / 100));
    const newAP = player.ap + adjustedAmount;
    const timestamp = now;

    const updateObj = { ap: newAP, last_ap_change_at: timestamp };
    if (actionType === "train") {
      updateObj.last_train_timestamp = timestamp;
    } else if (actionType === "socialrp") {
      updateObj.last_socialrp_timestamp = timestamp;
    }

    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: updateObj });

    if (newAP >= 1000 && player.ap < 1000) {
      await db
        .collection("players")
        .updateOne({ id: playerId }, { $set: { unlocked_avatar: 1 } });
    }

    await addProgressionHistory(playerId, "ap", player.ap, newAP, actionType);

    return newAP;
  } catch (error) {
    console.error("Error adding AP:", error);
    return false;
  }
}

/**
 * Atomically completes an AP activity and applies its dedicated cooldown.
 * The conditional update prevents two simultaneously opened forms from
 * granting the same activity reward more than once.
 */
async function completeAPActivity(
  playerId,
  baseAmount,
  cooldownMs,
  timestampField,
  actionType,
) {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return { success: false, reason: "not_found" };

    const now = Math.floor(Date.now() / 1000);
    const cooldownSeconds = Math.ceil(Number(cooldownMs) / 1000);
    const availableBefore = now - cooldownSeconds;
    const lastAction = Number(player[timestampField] || 0);

    if (lastAction > availableBefore) {
      return {
        success: false,
        reason: "cooldown",
        retryAt: lastAction + cooldownSeconds,
      };
    }

    const multiplierExpired =
      Number(player.ap_multiplier_expires_at || 0) > 0 &&
      now >= Number(player.ap_multiplier_expires_at);
    const baseMultiplier = multiplierExpired
      ? 100
      : Number(player.ap_multiplier || 100);
    const dynamicBonus =
      getRankBonusPercent(player.rank) + getActivityBonusPercent(player);
    const multiplier = baseMultiplier + dynamicBonus;
    const gained = Math.max(
      0,
      Math.round(Number(baseAmount) * (multiplier / 100)),
    );
    const oldAP = Number(player.ap || 0);

    const setOperations = {
      [timestampField]: now,
      last_ap_change_at: now,
    };
    if (multiplierExpired) {
      setOperations.ap_multiplier = 100;
      setOperations.ap_multiplier_expires_at = 0;
    }
    if (oldAP + gained >= 1000) setOperations.unlocked_avatar = 1;

    const updatedPlayer = await db.collection("players").findOneAndUpdate(
      {
        id: playerId,
        $or: [
          { [timestampField]: { $lte: availableBefore } },
          { [timestampField]: { $exists: false } },
        ],
      },
      {
        $inc: { ap: gained },
        $set: setOperations,
      },
      { returnDocument: "after" },
    );

    if (!updatedPlayer) {
      const latest = await getPlayer(playerId);
      const latestAction = Number(latest?.[timestampField] || now);
      return {
        success: false,
        reason: "cooldown",
        retryAt: latestAction + cooldownSeconds,
      };
    }

    const newAP = Number(updatedPlayer.ap || oldAP + gained);
    const previousAP = newAP - gained;
    if (newAP >= 1000 && !updatedPlayer.unlocked_avatar) {
      await db
        .collection("players")
        .updateOne({ id: playerId }, { $set: { unlocked_avatar: 1 } });
    }
    await addProgressionHistory(playerId, "ap", previousAP, newAP, actionType);

    return {
      success: true,
      oldAP: previousAP,
      newAP,
      gained,
      multiplier,
      baseMultiplier,
      dynamicBonus,
      retryAt: now + cooldownSeconds,
    };
  } catch (error) {
    console.error(`Error completing AP activity (${actionType}):`, error);
    return { success: false, reason: "error" };
  }
}

export function completeAPTraining(playerId, baseAmount, cooldownMs) {
  return completeAPActivity(
    playerId,
    baseAmount,
    cooldownMs,
    "last_train_timestamp",
    "train",
  );
}

export function completeSocialRP(playerId, baseAmount, cooldownMs) {
  return completeAPActivity(
    playerId,
    baseAmount,
    cooldownMs,
    "last_socialrp_timestamp",
    "socialrp",
  );
}

export async function setAP(playerId, amount, adminId) {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return false;
    const updateObj = {
      ap: amount,
      last_ap_change_at: Math.floor(Date.now() / 1000),
    };
    if (amount >= 1000) {
      updateObj.unlocked_avatar = 1;
    }

    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: updateObj });

    logAdminAction(
      adminId,
      "SET_AP",
      `Установил AP на ${amount} для игрока ${playerId}`,
    );
    await addProgressionHistory(playerId, "ap", player.ap, amount, "set-ap");
    return true;
  } catch (error) {
    console.error("Error setting AP:", error);
    return false;
  }
}

export async function getSP(playerId, styleId) {
  try {
    const db = getDB();
    const result = await db.collection("player_sp").findOne({
      player_id: playerId,
      style_id: styleId,
    });
    return result ? result.sp : 0;
  } catch (error) {
    console.error("Error getting SP:", error);
    return 0;
  }
}

export async function getAllPlayerSP(playerId) {
  try {
    const db = getDB();
    const result = await db
      .collection("player_sp")
      .find({ player_id: playerId })
      .sort({ sp: -1 })
      .toArray();

    const styles = [];
    for (const row of result) {
      const style = await db.collection("styles").findOne({ id: row.style_id });
      if (style) {
        styles.push({
          id: row.style_id,
          name: style.name,
          sp: row.sp,
        });
      }
    }
    return styles;
  } catch (error) {
    console.error("Error getting all player SP:", error);
    return [];
  }
}

export async function getLearnedPlayerStyles(playerId) {
  try {
    const db = getDB();
    const records = await db
      .collection("player_sp")
      .aggregate([
        { $match: { player_id: playerId } },
        {
          $lookup: {
            from: "styles",
            localField: "style_id",
            foreignField: "id",
            as: "style",
          },
        },
        { $unwind: "$style" },
        {
          $project: {
            _id: 0,
            id: "$style.id",
            name: "$style.name",
            sp: { $max: [{ $ifNull: ["$sp", 0] }, 0] },
          },
        },
        { $sort: { sp: -1, name: 1 } },
      ])
      .toArray();
    return records.map((record) => ({
      ...record,
      sp: Math.max(0, Number(record.sp || 0)),
    }));
  } catch (error) {
    console.error("Error getting learned player styles:", error);
    return [];
  }
}

export async function getTotalSP(playerId) {
  try {
    const db = getDB();
    const result = await db
      .collection("player_sp")
      .aggregate([
        { $match: { player_id: playerId } },
        { $group: { _id: null, total: { $sum: "$sp" } } },
      ])
      .toArray();
    return result.length > 0 ? result[0].total : 0;
  } catch (error) {
    console.error("Error getting total SP:", error);
    return 0;
  }
}

export async function addSP(
  playerId,
  styleId,
  amount,
  adminId = null,
  source = "add-sp",
) {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return false;

    const now = Math.floor(Date.now() / 1000);
    let spMultiplier = player.sp_multiplier || 100;
    if (
      player.sp_multiplier_expires_at > 0 &&
      now >= player.sp_multiplier_expires_at
    ) {
      spMultiplier = 100;
      await db
        .collection("players")
        .updateOne(
          { id: playerId },
          { $set: { sp_multiplier: 100, sp_multiplier_expires_at: 0 } },
        );
    }
    const dynamicBonus =
      getRankBonusPercent(player.rank) + getActivityBonusPercent(player);
    const effectiveMultiplier = spMultiplier + dynamicBonus;
    const adjustedAmount = Math.round(amount * (effectiveMultiplier / 100));

    const currentSP = await getSP(playerId, styleId);
    const newSP = currentSP + adjustedAmount;

    await db
      .collection("player_sp")
      .updateOne(
        { player_id: playerId, style_id: styleId },
        { $set: { player_id: playerId, style_id: styleId, sp: newSP } },
        { upsert: true },
      );

    const timestamp = Math.floor(Date.now() / 1000);
    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: { last_sp_change_at: timestamp } });

    if (adminId) {
      logAdminAction(
        adminId,
        "ADD_SP",
        `Добавил ${amount} SP (×${spMultiplier}% = ${adjustedAmount}) стиль ${styleId} игроку ${playerId}`,
      );
    }
    await addProgressionHistory(playerId, "sp", currentSP, newSP, source);
    return newSP;
  } catch (error) {
    console.error("Error adding SP:", error);
    return false;
  }
}

/**
 * Atomically completes a player's SP training for an already learned style.
 * The player timestamp is updated in the same transaction-like operation as
 * the SP reward, preventing two open forms from granting duplicate rewards.
 */
export async function completeSPTraining(
  playerId,
  styleId,
  baseAmount,
  cooldownMs,
) {
  let claim = null;
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return { success: false, reason: "not_found" };

    const style = await db.collection("styles").findOne({ id: styleId });
    if (!style) return { success: false, reason: "style_not_found" };

    const learnedStyle = await db.collection("player_sp").findOne({
      player_id: playerId,
      style_id: styleId,
    });
    if (!learnedStyle) return { success: false, reason: "style_not_owned" };

    const now = Math.floor(Date.now() / 1000);
    const cooldownSeconds = Math.ceil(Number(cooldownMs) / 1000);
    const availableBefore = now - cooldownSeconds;
    const lastTraining = Number(player.last_sp_train_timestamp || 0);

    if (lastTraining > availableBefore) {
      return {
        success: false,
        reason: "cooldown",
        retryAt: lastTraining + cooldownSeconds,
      };
    }

    const multiplierExpired =
      Number(player.sp_multiplier_expires_at || 0) > 0 &&
      now >= Number(player.sp_multiplier_expires_at);
    const baseMultiplier = multiplierExpired
      ? 100
      : Number(player.sp_multiplier || 100);
    const dynamicBonus =
      getRankBonusPercent(player.rank) + getActivityBonusPercent(player);
    const multiplier = baseMultiplier + dynamicBonus;
    const gained = Math.max(
      0,
      Math.round(Number(baseAmount) * (multiplier / 100)),
    );

    const previousPlayerState = {
      last_sp_train_timestamp: lastTraining,
      last_sp_change_at: Number(player.last_sp_change_at || 0),
      sp_multiplier: Number(player.sp_multiplier || 100),
      sp_multiplier_expires_at: Number(player.sp_multiplier_expires_at || 0),
    };
    const setOperations = {
      last_sp_train_timestamp: now,
      last_sp_change_at: now,
    };
    if (multiplierExpired) {
      setOperations.sp_multiplier = 100;
      setOperations.sp_multiplier_expires_at = 0;
    }

    const claimedPlayer = await db.collection("players").findOneAndUpdate(
      {
        id: playerId,
        $or: [
          { last_sp_train_timestamp: { $lte: availableBefore } },
          { last_sp_train_timestamp: { $exists: false } },
        ],
      },
      { $set: setOperations },
      { returnDocument: "after" },
    );

    if (!claimedPlayer) {
      const latest = await getPlayer(playerId);
      const latestTraining = Number(latest?.last_sp_train_timestamp || now);
      return {
        success: false,
        reason: "cooldown",
        retryAt: latestTraining + cooldownSeconds,
      };
    }
    claim = { db, playerId, now, previousPlayerState };

    const updatedStyle = await db.collection("player_sp").findOneAndUpdate(
      { player_id: playerId, style_id: styleId },
      { $inc: { sp: gained } },
      { returnDocument: "after" },
    );

    if (!updatedStyle) {
      await db.collection("players").updateOne(
        { id: playerId, last_sp_train_timestamp: now },
        { $set: previousPlayerState },
      );
      claim = null;
      return { success: false, reason: "style_not_owned" };
    }

    const newSP = Number(updatedStyle.sp || 0);
    const oldSP = newSP - gained;
    await addProgressionHistory(
      playerId,
      "sp",
      oldSP,
      newSP,
      `train-sp:${style.id}`,
      { style_id: style.id, style_name: style.name },
    );

    return {
      success: true,
      style: { id: style.id, name: style.name },
      oldSP,
      newSP,
      gained,
      multiplier,
      baseMultiplier,
      dynamicBonus,
      retryAt: now + cooldownSeconds,
    };
  } catch (error) {
    if (claim) {
      await claim.db.collection("players").updateOne(
        { id: claim.playerId, last_sp_train_timestamp: claim.now },
        { $set: claim.previousPlayerState },
      ).catch((rollbackError) => {
        console.error("Error rolling back SP training cooldown:", rollbackError);
      });
    }
    console.error("Error completing SP training:", error);
    return { success: false, reason: "error" };
  }
}

export async function setSP(playerId, styleId, amount, adminId) {
  try {
    const db = getDB();

    await db
      .collection("player_sp")
      .updateOne(
        { player_id: playerId, style_id: styleId },
        { $set: { player_id: playerId, style_id: styleId, sp: amount } },
        { upsert: true },
      );

    const timestamp = Math.floor(Date.now() / 1000);
    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: { last_sp_change_at: timestamp } });

    logAdminAction(
      adminId,
      "SET_SP",
      `Установил SP на ${amount} (стиль ${styleId}) для игрока ${playerId}`,
    );
    return true;
  } catch (error) {
    console.error("Error setting SP:", error);
    return false;
  }
}

export async function listStyles() {
  try {
    const db = getDB();
    const styles = await db
      .collection("styles")
      .find({})
      .sort({ name: 1 })
      .toArray();
    return styles;
  } catch (error) {
    console.error("Error listing styles:", error);
    return [];
  }
}

export async function getStyleByName(name) {
  try {
    const db = getDB();
    const style = await db.collection("styles").findOne({ name });
    return style || null;
  } catch (error) {
    console.error("Error getting style by name:", error);
    return null;
  }
}

export async function getStyleById(styleId) {
  try {
    const db = getDB();
    const style = await db.collection("styles").findOne({ id: styleId });
    return style || null;
  } catch (error) {
    console.error("Error getting style by ID:", error);
    return null;
  }
}

export async function addStyle(name, adminId) {
  try {
    const db = getDB();
    const timestamp = Math.floor(Date.now() / 1000);

    // Get next ID
    const lastStyle = await db
      .collection("styles")
      .findOne({}, { sort: { id: -1 } });
    const nextId = lastStyle ? lastStyle.id + 1 : 1;

    await db.collection("styles").insertOne({
      id: nextId,
      name,
      created_by: adminId,
      created_at: timestamp,
    });
    logAdminAction(adminId, "ADD_STYLE", `Создал стиль: ${name}`);
    return true;
  } catch (error) {
    console.error("Error adding style:", error);
    return false;
  }
}

export async function getStylePlayerCount(styleId) {
  try {
    const db = getDB();
    const count = await db.collection("player_sp").countDocuments({
      style_id: styleId,
    });
    return count;
  } catch (error) {
    console.error("Error getting style player count:", error);
    return 0;
  }
}

export async function getPlayerInventory(playerId) {
  try {
    const db = getDB();
    const inventory = await db
      .collection("inventory")
      .find({ player_id: playerId })
      .sort({ _id: -1 })
      .toArray();
    return inventory;
  } catch (error) {
    console.error("Error getting inventory:", error);
    return [];
  }
}

export async function giveItem(playerId, itemName, qty, adminId) {
  try {
    const db = getDB();
    const safeName = String(itemName || "").trim();
    const safeQuantity = Number(qty);
    if (!safeName || safeName.length > 100
      || !Number.isSafeInteger(safeQuantity) || safeQuantity < 1) {
      return { success: false, reason: "invalid_item" };
    }

    const playerExists = await db.collection("players").findOne(
      { id: playerId },
      { projection: { id: 1 } },
    );
    if (!playerExists) return { success: false, reason: "player_not_found" };

    const result = await incrementInventoryStack(db.collection("inventory"), {
      playerId,
      itemName: safeName,
      quantity: safeQuantity,
    });
    if (!result.success) return result;

    if (adminId !== "system") {
      logAdminAction(
        adminId,
        "GIVE_ITEM",
        `Выдал ${safeQuantity}x ${safeName} игроку ${playerId}`,
      );
    }
    return {
      success: true,
      itemName: safeName,
      quantity: safeQuantity,
      previousQuantity: result.previousQuantity,
      totalQuantity: result.totalQuantity,
    };
  } catch (error) {
    console.error("Error giving item:", error);
    return {
      success: false,
      reason: "error",
    };
  }
}

export async function getLeaderboard(sortBy = "ap", limit = 10) {
  try {
    const db = getDB();
    let pipeline = [];

    if (sortBy === "sp") {
      pipeline = [
        {
          $lookup: {
            from: "player_sp",
            localField: "id",
            foreignField: "player_id",
            as: "sp_data",
          },
        },
        {
          $addFields: {
            total_sp: {
              $sum: "$sp_data.sp",
            },
          },
        },
        { $sort: { total_sp: -1 } },
        { $limit: limit },
        {
          $project: {
            id: 1,
            username: 1,
            character_name: 1,
            ap: 1,
            krw: 1,
            yen: 1,
            total_sp: 1,
          },
        },
      ];
    } else {
      const sortObj = {};
      if (sortBy === "ap") sortObj.ap = -1;
      else if (sortBy === "krw") sortObj.krw = -1;
      else if (sortBy === "yen") sortObj.yen = -1;

      pipeline = [
        { $sort: sortObj },
        { $limit: limit },
        {
          $project: {
            id: 1,
            username: 1,
            character_name: 1,
            ap: 1,
            krw: 1,
            yen: 1,
          },
        },
      ];
    }

    const result = await db.collection("players").aggregate(pipeline).toArray();
    return result.map((player) => normalizePlayerDocument(player));
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return [];
  }
}

export async function useItem(playerId, itemName, qty) {
  try {
    const db = getDB();
    const amountUsed = Number(qty);
    if (!Number.isSafeInteger(amountUsed) || amountUsed < 1) {
      return { success: false, reason: "invalid_quantity" };
    }

    const player = await getPlayer(playerId);
    if (!player) return { success: false, reason: "player_not_found" };

    const definition = getItemDefinition(itemName);
    if (!definition.usable) {
      return { success: false, reason: "not_usable", definition };
    }

    let style = null;
    let learnedStyle = null;
    if (definition.kind === "sp") {
      style = await db.collection("styles").findOne({ name: definition.styleName });
      if (!style) {
        return { success: false, reason: "style_not_found", definition };
      }
      learnedStyle = await db.collection("player_sp").findOne({
        player_id: playerId,
        style_id: style.id,
      });
      if (!learnedStyle) {
        return { success: false, reason: "style_not_owned", definition, style };
      }
    }

    const reward = definition.amount * amountUsed;
    if (!Number.isSafeInteger(reward) || reward < 1) {
      return { success: false, reason: "amount_too_large", definition };
    }
    const currentValue = definition.kind === "ap"
      ? Number(player.ap || 0)
      : Number(learnedStyle?.sp || 0);
    if (!Number.isSafeInteger(currentValue)
      || !Number.isSafeInteger(currentValue + reward)) {
      return { success: false, reason: "amount_too_large", definition };
    }

    const claimedItem = await db.collection("inventory").findOneAndUpdate(
      {
        player_id: playerId,
        item_name: itemName,
        qty: { $gte: amountUsed },
      },
      { $inc: { qty: -amountUsed } },
      { returnDocument: "before" },
    );

    if (!claimedItem) {
      const existing = await db.collection("inventory").findOne({
        player_id: playerId,
        item_name: itemName,
      });
      return {
        success: false,
        reason: existing ? "insufficient_quantity" : "not_found",
        available: Number(existing?.qty || 0),
        definition,
      };
    }

    const previousQuantity = Number(claimedItem.qty || 0);
    const remainingQuantity = previousQuantity - amountUsed;
    const now = Math.floor(Date.now() / 1000);
    let appliedEffect = null;

    try {
      let oldValue;
      let newValue;
      if (definition.kind === "ap") {
        const updatedPlayer = await db.collection("players").findOneAndUpdate(
          {
            id: playerId,
            ap: { $lte: Number.MAX_SAFE_INTEGER - reward },
          },
          {
            $inc: { ap: reward },
            $set: {
              last_ap_change_at: now,
              ...(Number(player.ap || 0) + reward >= 1000 ? { unlocked_avatar: 1 } : {}),
            },
          },
          { returnDocument: "after" },
        );
        if (!updatedPlayer) throw new Error("Player AP could not be safely updated");
        appliedEffect = { kind: "ap" };
        newValue = Number(updatedPlayer.ap || 0);
        oldValue = newValue - reward;
        await addProgressionHistory(playerId, "ap", oldValue, newValue, "item", {
          item_name: itemName,
          quantity: amountUsed,
        });
      } else {
        const updatedStyle = await db.collection("player_sp").findOneAndUpdate(
          {
            player_id: playerId,
            style_id: style.id,
            sp: { $lte: Number.MAX_SAFE_INTEGER - reward },
          },
          { $inc: { sp: reward } },
          { returnDocument: "after" },
        );
        if (!updatedStyle) throw new Error("Style SP could not be safely updated");
        appliedEffect = { kind: "sp", styleId: style.id };
        newValue = Number(updatedStyle.sp || 0);
        oldValue = newValue - reward;
        await db.collection("players").updateOne(
          { id: playerId },
          { $set: { last_sp_change_at: now } },
        );
        await addProgressionHistory(playerId, "sp", oldValue, newValue, "item", {
          item_name: itemName,
          quantity: amountUsed,
          style_id: style.id,
          style_name: style.name,
        });
      }

      if (remainingQuantity === 0) {
        await db.collection("inventory").deleteOne({
          _id: claimedItem._id,
          qty: 0,
        }).catch((cleanupError) => {
          console.error("Error cleaning up an empty inventory item:", cleanupError);
        });
      }

      return {
        success: true,
        itemName,
        quantity: amountUsed,
        remainingQuantity,
        definition,
        reward,
        oldValue,
        newValue,
        style: style ? { id: style.id, name: style.name } : null,
      };
    } catch (effectError) {
      if (appliedEffect?.kind === "ap") {
        await db.collection("players").updateOne(
          { id: playerId },
          { $inc: { ap: -reward } },
        ).catch(() => {});
      } else if (appliedEffect?.kind === "sp") {
        await db.collection("player_sp").updateOne(
          { player_id: playerId, style_id: appliedEffect.styleId },
          { $inc: { sp: -reward } },
        ).catch(() => {});
      }
      await db.collection("inventory").updateOne(
        { _id: claimedItem._id },
        { $inc: { qty: amountUsed } },
      );
      throw effectError;
    }
  } catch (error) {
    console.error("Error using item:", error);
    return { success: false, reason: "error" };
  }
}

const LEADERBOARD_FIELDS = new Set(["ap", "sp", "krw", "yen"]);

export async function getLeaderboardPage(
  sortBy = "ap",
  playerId = null,
  page = 0,
  pageSize = 10,
) {
  try {
    const db = getDB();
    const metric = LEADERBOARD_FIELDS.has(sortBy) ? sortBy : "ap";
    const safePage = Number.isSafeInteger(page) && page >= 0 ? page : 0;
    const safePageSize = Number.isSafeInteger(pageSize)
      ? Math.max(5, Math.min(20, pageSize))
      : 10;
    const metricStages = metric === "sp"
      ? [
          {
            $lookup: {
              from: "player_sp",
              localField: "id",
              foreignField: "player_id",
              as: "leaderboard_styles",
            },
          },
          {
            $set: {
              leaderboard_value: {
                $convert: {
                  input: { $sum: "$leaderboard_styles.sp" },
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        ]
      : [
          {
            $set: {
              leaderboard_value: {
                $convert: {
                  input: `$${metric}`,
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        ];

    const [snapshot] = await db.collection("players").aggregate([
      ...metricStages,
      {
        $setWindowFields: {
          sortBy: { leaderboard_value: -1, id: 1 },
          output: { leaderboard_position: { $documentNumber: {} } },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          username: 1,
          character_name: 1,
          leaderboard_value: 1,
          leaderboard_position: 1,
        },
      },
      {
        $facet: {
          podium: [{ $limit: 3 }],
          rows: [
            { $skip: safePage * safePageSize },
            { $limit: safePageSize },
          ],
          currentPlayer: playerId
            ? [{ $match: { id: playerId } }, { $limit: 1 }]
            : [{ $match: { id: "__missing_leaderboard_player__" } }],
          metadata: [{ $count: "total" }],
        },
      },
    ]).toArray();

    const total = Number(snapshot?.metadata?.[0]?.total || 0);
    return {
      metric,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      podium: snapshot?.podium || [],
      rows: snapshot?.rows || [],
      currentPlayer: snapshot?.currentPlayer?.[0] || null,
    };
  } catch (error) {
    console.error("Error getting leaderboard page:", error);
    return {
      metric: LEADERBOARD_FIELDS.has(sortBy) ? sortBy : "ap",
      page: 0,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      podium: [],
      rows: [],
      currentPlayer: null,
      error: true,
    };
  }
}

export async function addCurrency(playerId, currency, amount, adminId) {
  try {
    const db = getDB();
    if (currency !== "krw" && currency !== "yen") return false;

    const player = await getPlayer(playerId);
    if (!player) return false;

    const updateObj = {};
    updateObj[currency] = (Number(player[currency]) || 0) + Number(amount);

    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: updateObj });

    logAdminAction(
      adminId,
      "ADD_CURRENCY",
      `Добавил ${amount} ${currency.toUpperCase()} игроку ${playerId}`,
    );
    return updateObj[currency];
  } catch (error) {
    console.error("Error adding currency:", error);
    return false;
  }
}

export async function setCurrency(playerId, currency, amount, adminId) {
  try {
    const db = getDB();
    if (currency !== "krw" && currency !== "yen") return false;

    const updateObj = {};
    updateObj[currency] = Number(amount);

    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: updateObj });

    logAdminAction(
      adminId,
      "SET_CURRENCY",
      `Установил ${currency.toUpperCase()} на ${amount} для игрока ${playerId}`,
    );
    return true;
  } catch (error) {
    console.error("Error setting currency:", error);
    return false;
  }
}

export async function transferCurrency(fromId, toId, currency, amount) {
  try {
    const db = getDB();
    if (currency !== "krw" && currency !== "yen") {
      return { success: false, reason: "invalid_currency" };
    }
    if (fromId === toId) return { success: false, reason: "same_player" };
    const calculation = calculateTransfer(amount);
    if (!calculation.valid) {
      return { success: false, reason: calculation.reason };
    }

    const players = db.collection("players");
    try {
      return await withTransaction((session) => transferCurrencyInTransaction(
        players,
        { fromId, toId, currency, calculation, session },
      ));
    } catch (transactionError) {
      if (!isTransactionUnsupportedError(transactionError)) throw transactionError;
      console.warn("MongoDB transactions are unavailable; using compensated transfer.");
      return await transferCurrencyCompensated(players, {
        fromId,
        toId,
        currency,
        calculation,
      });
    }
  } catch (error) {
    console.error("Error transferring currency:", error);
    return { success: false, reason: "error" };
  }
}

export async function deletePlayer(playerId, adminId) {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return false;

    await db.collection("player_sp").deleteMany({ player_id: playerId });
    await db.collection("inventory").deleteMany({ player_id: playerId });
    await db.collection("players").deleteOne({ id: playerId });

    // Keep active slot consistent after deletions.
    // Example: slot1 deleted but slot2 exists -> switch active slot to 2.
    const baseUserId = String(playerId).split("_")[0];
    const slot1Id = baseUserId;
    const slot2Id = `${baseUserId}_2`;

    const slot1Exists = !!(await db
      .collection("players")
      .findOne({ id: slot1Id }, { projection: { id: 1 } }));
    const slot2Exists = !!(await db
      .collection("players")
      .findOne({ id: slot2Id }, { projection: { id: 1 } }));

    const settings = await db
      .collection("user_settings")
      .findOne({ id: baseUserId });
    const currentActive =
      settings && settings.active_slot
        ? normalizeSlot(settings.active_slot)
        : 1;

    if (!slot1Exists && !slot2Exists) {
      // No characters left -> clear active slot state
      await db.collection("user_settings").deleteOne({ id: baseUserId });
    } else if (currentActive === 1 && !slot1Exists && slot2Exists) {
      await db
        .collection("user_settings")
        .updateOne(
          { id: baseUserId },
          { $set: { active_slot: 2 } },
          { upsert: true },
        );
    } else if (currentActive === 2 && !slot2Exists && slot1Exists) {
      await db
        .collection("user_settings")
        .updateOne(
          { id: baseUserId },
          { $set: { active_slot: 1 } },
          { upsert: true },
        );
    }

    logAdminAction(
      adminId,
      "DELETE_PLAYER",
      `Удалил игрока ${playerId} (${player.character_name})`,
    );
    return true;
  } catch (error) {
    console.error("Error deleting player:", error);
    return false;
  }
}

export async function deleteStyle(styleId, adminId) {
  try {
    const db = getDB();
    const style = await db.collection("styles").findOne({ id: styleId });
    if (!style) return false;

    await db.collection("player_sp").deleteMany({ style_id: styleId });
    await db.collection("styles").deleteOne({ id: styleId });

    logAdminAction(adminId, "DELETE_STYLE", `Удалил стиль: ${style.name}`);
    return true;
  } catch (error) {
    console.error("Error deleting style:", error);
    return false;
  }
}

export async function setAPMultiplier(
  playerId,
  multiplier,
  adminId,
  durationSeconds = 0,
) {
  try {
    const db = getDB();
    const validMultiplier = Math.max(50, Math.min(500, multiplier));
    const expiresAt =
      durationSeconds > 0 ? Math.floor(Date.now() / 1000) + durationSeconds : 0;
    await db.collection("players").updateOne(
      { id: playerId },
      {
        $set: {
          ap_multiplier: validMultiplier,
          ap_multiplier_expires_at: expiresAt,
        },
      },
    );
    const durationText =
      expiresAt > 0 ? ` на ${formatDuration(durationSeconds)}` : " (бессрочно)";
    logAdminAction(
      adminId,
      "SET_AP_MULTIPLIER",
      `Установил множитель AP ${validMultiplier}%${durationText} для игрока ${playerId}`,
    );
    return { multiplier: validMultiplier, expiresAt };
  } catch (error) {
    console.error("Error setting AP multiplier:", error);
    return false;
  }
}

export async function getRecentProgressionHistory(playerId, limit = 5) {
  try {
    const db = getDB();
    return await db
      .collection("progression_history")
      .find({ player_id: playerId })
      .sort({ changed_at: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error("Error getting progression history:", error);
    return [];
  }
}

export async function setSPMultiplier(
  playerId,
  multiplier,
  adminId,
  durationSeconds = 0,
) {
  try {
    const db = getDB();
    const validMultiplier = Math.max(50, Math.min(500, multiplier));
    const expiresAt =
      durationSeconds > 0 ? Math.floor(Date.now() / 1000) + durationSeconds : 0;
    await db.collection("players").updateOne(
      { id: playerId },
      {
        $set: {
          sp_multiplier: validMultiplier,
          sp_multiplier_expires_at: expiresAt,
        },
      },
    );
    const durationText =
      expiresAt > 0 ? ` на ${formatDuration(durationSeconds)}` : " (бессрочно)";
    logAdminAction(
      adminId,
      "SET_SP_MULTIPLIER",
      `Установил множитель SP ${validMultiplier}%${durationText} для игрока ${playerId}`,
    );
    return { multiplier: validMultiplier, expiresAt };
  } catch (error) {
    console.error("Error setting SP multiplier:", error);
    return false;
  }
}

export async function giveStyle(playerId, styleName, initialSp = 0, adminId) {
  try {
    const db = getDB();
    const style = await getStyleByName(styleName);
    if (!style) return false;

    const existing = await db.collection("player_sp").findOne({
      player_id: playerId,
      style_id: style.id,
    });

    if (!existing) {
      await db.collection("player_sp").insertOne({
        player_id: playerId,
        style_id: style.id,
        sp: initialSp,
      });
    }

    logAdminAction(
      adminId,
      "GIVE_STYLE",
      `Выдал стиль ${styleName} игроку ${playerId} с начальным SP ${initialSp}`,
    );
    return true;
  } catch (error) {
    console.error("Error giving style:", error);
    return false;
  }
}

export async function exchangeCurrency(playerId, currency, amount) {
  try {
    const db = getDB();
    const calculation = calculateExchange(currency, amount);
    if (!calculation.valid) {
      return { success: false, reason: calculation.reason, ...calculation };
    }

    const player = await db.collection("players").findOne(
      { id: playerId },
      { projection: { krw: 1, yen: 1 } },
    );
    if (!player) return { success: false, reason: "player_not_found" };
    const sourceBalance = Number(player[currency] || 0);
    const targetBalance = Number(player[calculation.targetCurrency] || 0);
    if (!Number.isSafeInteger(sourceBalance) || !Number.isSafeInteger(targetBalance)) {
      return { success: false, reason: "unsafe_balance" };
    }
    if (sourceBalance < calculation.spent) {
      return {
        success: false,
        reason: "insufficient_funds",
        available: sourceBalance,
      };
    }
    if (!Number.isSafeInteger(targetBalance + calculation.received)) {
      return { success: false, reason: "unsafe_balance" };
    }

    const updated = await db.collection("players").findOneAndUpdate(
      {
        id: playerId,
        [currency]: { $gte: calculation.spent },
        [calculation.targetCurrency]: {
          $lte: Number.MAX_SAFE_INTEGER - calculation.received,
        },
      },
      {
        $inc: {
          [currency]: -calculation.spent,
          [calculation.targetCurrency]: calculation.received,
        },
      },
      { returnDocument: "after" },
    );
    if (!updated) return { success: false, reason: "balance_changed" };

    return {
      success: true,
      ...calculation,
      sourceBalance: Number(updated[currency] || 0),
      targetBalance: Number(updated[calculation.targetCurrency] || 0),
    };
  } catch (error) {
    console.error("Error exchanging currency:", error);
    return { success: false, reason: "error" };
  }
}

export async function getAdminActions(limit = 50) {
  try {
    const db = getDB();
    const actions = await db
      .collection("admin_actions")
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return actions;
  } catch (error) {
    console.error("Error getting admin actions:", error);
    return [];
  }
}

export async function setCharacterAvatar(playerId, avatarUrl) {
  try {
    const db = getDB();
    const result = await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: { character_avatar: avatarUrl } });
    return result.modifiedCount > 0;
  } catch (error) {
    console.error("Error setting character avatar:", error);
    return false;
  }
}

/**
 * Устанавливает индивидуальный множитель зарплаты для игрока/слота.
 * Значение в процентах: 100 = стандартная зарплата, 150 = +50%, 50 = -50%.
 */
export async function setSalaryMultiplier(playerId, multiplier, adminId) {
  try {
    const db = getDB();
    const validMultiplier = Math.max(0, Math.min(1000, multiplier));
    await db.collection("players").updateOne(
      { id: playerId },
      { $set: { salary_multiplier: validMultiplier } },
    );
    logAdminAction(
      adminId,
      "SET_SALARY_MULTIPLIER",
      `Установил множитель зарплаты ${validMultiplier}% для игрока ${playerId}`,
    );
    return validMultiplier;
  } catch (error) {
    console.error("Error setting salary multiplier:", error);
    return false;
  }
}

/**
 * Создаёт кастомную организацию.
 */
export async function createCustomOrg(name, createdBy) {
  try {
    const db = getDB();
    const existing = await db.collection("custom_orgs").findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existing) return { success: false, reason: 'Организация с таким названием уже существует.' };

    await db.collection("custom_orgs").insertOne({
      name,
      created_by: createdBy,
      created_at: new Date(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error creating custom org:", error);
    return { success: false, reason: 'Ошибка базы данных.' };
  }
}

/**
 * Удаляет кастомную организацию.
 */
export async function deleteCustomOrg(name) {
  try {
    const db = getDB();
    const result = await db.collection("custom_orgs").deleteOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    return result.deletedCount > 0;
  } catch (error) {
    console.error("Error deleting custom org:", error);
    return false;
  }
}

/**
 * Возвращает список всех кастомных организаций.
 */
export async function listCustomOrgs() {
  try {
    const db = getDB();
    return await db.collection("custom_orgs").find({}).sort({ name: 1 }).toArray();
  } catch (error) {
    console.error("Error listing custom orgs:", error);
    return [];
  }
}

/**
 * Назначает игроку кастомную организацию (без ранга).
 */
export async function setCustomOrg(playerId, orgName, adminId) {
  try {
    const db = getDB();
    await db.collection("players").updateOne(
      { id: playerId },
      { $set: { custom_org: orgName } },
    );
    logAdminAction(
      adminId,
      "SET_CUSTOM_ORG",
      `Назначил кастомную организацию "${orgName}" игроку ${playerId}`,
    );
    return true;
  } catch (error) {
    console.error("Error setting custom org:", error);
    return false;
  }
}

/**
 * Убирает кастомную организацию у игрока.
 */
export async function removeCustomOrg(playerId, adminId) {
  try {
    const db = getDB();
    await db.collection("players").updateOne(
      { id: playerId },
      { $unset: { custom_org: "" } },
    );
    logAdminAction(
      adminId,
      "REMOVE_CUSTOM_ORG",
      `Убрал кастомную организацию у игрока ${playerId}`,
    );
    return true;
  } catch (error) {
    console.error("Error removing custom org:", error);
    return false;
  }
}

// ─── Репутация ───────────────────────────────────────────────────────────────
// Дефолтные значения и тиры по ТЗ (см. PR description).
export const REPUTATION_DEFAULT = 20;

const REPUTATION_TIERS = [
  { min: 5000, name: "Мировой", emoji: "🌍" },
  { min: 3000, name: "Страна", emoji: "🏳️" },
  { min: 1500, name: "Городской", emoji: "🏙️" },
  { min: 800, name: "Район", emoji: "🏘️" },
  { min: 400, name: "Квартал", emoji: "🏠" },
  { min: 0, name: "Никто", emoji: "👤" },
];

export function getReputationTier(reputation) {
  const rep = Number(reputation || 0);
  if (rep < 0) {
    return { min: -Infinity, name: "Отрицательный", emoji: "⚠️" };
  }
  for (const tier of REPUTATION_TIERS) {
    if (rep >= tier.min) return tier;
  }
  return REPUTATION_TIERS[REPUTATION_TIERS.length - 1];
}

async function addReputationHistory(
  playerId,
  oldValue,
  newValue,
  source,
  reason,
  adminId,
) {
  try {
    const db = getDB();
    await db.collection("reputation_history").insertOne({
      player_id: playerId,
      old_value: oldValue,
      new_value: newValue,
      delta: newValue - oldValue,
      source: source || "system",
      reason: reason || null,
      admin_id: adminId || null,
      changed_at: new Date(),
    });
  } catch (error) {
    console.error("Error adding reputation history:", error);
  }
}

export async function getReputation(playerId) {
  try {
    const player = await getPlayer(playerId);
    if (!player) return null;
    return Number(player.reputation || 0);
  } catch (error) {
    console.error("Error getting reputation:", error);
    return null;
  }
}

export async function addReputation(playerId, amount, adminId, reason = null) {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return false;

    const oldRep = Number(player.reputation || 0);
    const newRep = oldRep + Number(amount);

    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: { reputation: newRep } });

    const action = Number(amount) >= 0 ? "ADD_REPUTATION" : "DEDUCT_REPUTATION";
    const verb = Number(amount) >= 0 ? "Добавил" : "Списал";
    const absAmount = Math.abs(Number(amount));
    logAdminAction(
      adminId,
      action,
      `${verb} ${absAmount} Rtg игроку ${playerId}${reason ? ` (причина: ${reason})` : ""}`,
    );
    await addReputationHistory(
      playerId,
      oldRep,
      newRep,
      action.toLowerCase(),
      reason,
      adminId,
    );
    return newRep;
  } catch (error) {
    console.error("Error adding reputation:", error);
    return false;
  }
}

export async function setReputation(playerId, amount, adminId, reason = null) {
  try {
    const db = getDB();
    const player = await getPlayer(playerId);
    if (!player) return false;

    const oldRep = Number(player.reputation || 0);
    const newRep = Number(amount);

    await db
      .collection("players")
      .updateOne({ id: playerId }, { $set: { reputation: newRep } });

    logAdminAction(
      adminId,
      "SET_REPUTATION",
      `Установил Rtg на ${newRep} для игрока ${playerId}${reason ? ` (причина: ${reason})` : ""}`,
    );
    await addReputationHistory(
      playerId,
      oldRep,
      newRep,
      "set_reputation",
      reason,
      adminId,
    );
    return newRep;
  } catch (error) {
    console.error("Error setting reputation:", error);
    return false;
  }
}

export async function getReputationLeaderboard(limit = 10) {
  try {
    const db = getDB();
    const result = await db
      .collection("players")
      .aggregate([
        { $sort: { reputation: -1 } },
        { $limit: limit },
        {
          $project: {
            id: 1,
            username: 1,
            character_name: 1,
            reputation: 1,
          },
        },
      ])
      .toArray();
    return result.map((player) => normalizePlayerDocument(player));
  } catch (error) {
    console.error("Error getting reputation leaderboard:", error);
    return [];
  }
}

export async function getRecentReputationHistory(playerId, limit = 10) {
  try {
    const db = getDB();
    return await db
      .collection("reputation_history")
      .find({ player_id: playerId })
      .sort({ changed_at: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error("Error getting reputation history:", error);
    return [];
  }
}
