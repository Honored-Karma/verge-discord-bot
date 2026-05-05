import { getDB } from "./db.js";

const PLAYER_DEFAULTS = {
  character_avatar: null,
  character_name: null,
  krw: 0,
  yen: 0,
  ap: 0,
  rank: null,
  organization: null,
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
    ap_multiplier_expires_at: Number(player.ap_multiplier_expires_at || 0),
    sp_multiplier_expires_at: Number(player.sp_multiplier_expires_at || 0),
    unlocked_avatar: Number(player.unlocked_avatar || 0),
    last_train_timestamp: Number(player.last_train_timestamp || 0),
    last_socialrp_timestamp: Number(player.last_socialrp_timestamp || 0),
    last_ap_change_at: Number(player.last_ap_change_at || 0),
    last_sp_change_at: Number(player.last_sp_change_at || 0),
    last_salary_paid_at: Number(player.last_salary_paid_at || 0),
    last_sp_train_timestamp: Number(player.last_sp_train_timestamp || 0),
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
  const latest = Math.max(lastTrain, lastSocial);
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
      .find({ player_id: playerId, sp: { $gt: 0 } })
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
      sp: { $gt: 0 },
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
    const existing = await db.collection("inventory").findOne({
      player_id: playerId,
      item_name: itemName,
    });

    if (existing) {
      await db
        .collection("inventory")
        .updateOne(
          { player_id: playerId, item_name: itemName },
          { $inc: { qty } },
        );
    } else {
      await db.collection("inventory").insertOne({
        player_id: playerId,
        item_name: itemName,
        qty,
      });
    }

    if (adminId !== "system") {
      logAdminAction(
        adminId,
        "GIVE_ITEM",
        `Выдал ${qty}x ${itemName} игроку ${playerId}`,
      );
    }
    return true;
  } catch (error) {
    console.error("Error giving item:", error);
    return false;
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
    const inv = await db.collection("inventory").findOne({
      player_id: playerId,
      item_name: itemName,
    });

    if (!inv) return { success: false, reason: "Предмет не в инвентаре" };
    if (inv.qty < qty)
      return { success: false, reason: "Недостаточно предметов" };

    const newQty = inv.qty - qty;
    if (newQty === 0) {
      await db.collection("inventory").deleteOne({
        player_id: playerId,
        item_name: itemName,
      });
    } else {
      await db
        .collection("inventory")
        .updateOne(
          { player_id: playerId, item_name: itemName },
          { $set: { qty: newQty } },
        );
    }

    return { success: true, itemName };
  } catch (error) {
    console.error("Error using item:", error);
    return { success: false, reason: "Ошибка использования предмета" };
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
    if (currency !== "krw" && currency !== "yen")
      return { success: false, reason: "Неверная валюта" };

    const from = await getPlayer(fromId);
    const to = await getPlayer(toId);

    if (!from || !to) return { success: false, reason: "Игрок не найден" };

    const fromBalance = Number(from[currency]) || 0;
    const numAmount = Number(amount);
    if (fromBalance < numAmount)
      return { success: false, reason: "Недостаточно средств" };

    const tax = Math.ceil(numAmount * 0.02);
    const received = numAmount - tax;

    const updateObj1 = {};
    updateObj1[currency] = fromBalance - numAmount;

    const updateObj2 = {};
    updateObj2[currency] = (Number(to[currency]) || 0) + received;

    await db
      .collection("players")
      .updateOne({ id: fromId }, { $set: updateObj1 });

    await db
      .collection("players")
      .updateOne({ id: toId }, { $set: updateObj2 });

    return { success: true, tax, received };
  } catch (error) {
    console.error("Error transferring currency:", error);
    return { success: false, reason: "Ошибка перевода" };
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
    const player = await getPlayer(playerId);
    if (!player) return { success: false, reason: "Игрок не найден" };

    // Курс: 1 йен = 9.4 воны
    const EXCHANGE_RATE = 9.4;
    const numAmount = Number(amount);

    if (currency === "yen") {
      // Обменять йены на воны
      const playerYen = Number(player.yen) || 0;
      if (playerYen < numAmount)
        return {
          success: false,
          reason: `Недостаточно йен! У вас только ${playerYen.toLocaleString("ru-RU")} ¥`,
        };

      const krwReceived = Math.floor(numAmount * EXCHANGE_RATE);
      await db.collection("players").updateOne(
        { id: playerId },
        {
          $set: {
            yen: playerYen - numAmount,
            krw: (Number(player.krw) || 0) + krwReceived,
          },
        },
      );

      return { success: true, received: krwReceived };
    } else if (currency === "krw") {
      // Обменять воны на йены
      const playerKrw = Number(player.krw) || 0;
      if (playerKrw < numAmount)
        return {
          success: false,
          reason: `Недостаточно вон! У вас только ${playerKrw.toLocaleString("ru-RU")} ₩`,
        };

      const yenReceived = Math.floor(numAmount / EXCHANGE_RATE);
      if (yenReceived === 0)
        return {
          success: false,
          reason: `Слишком мало вон! Минимум ${Math.ceil(EXCHANGE_RATE)} ₩`,
        };

      await db.collection("players").updateOne(
        { id: playerId },
        {
          $set: {
            krw: playerKrw - numAmount,
            yen: (Number(player.yen) || 0) + yenReceived,
          },
        },
      );

      return { success: true, received: yenReceived };
    }

    return { success: false, reason: "Неверная валюта" };
  } catch (error) {
    console.error("Error exchanging currency:", error);
    return { success: false, reason: "Ошибка обмена" };
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
