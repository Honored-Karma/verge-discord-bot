import { getDB } from "./db.js";

export const TRAINING_TYPES = {
  ALL: "all",
  TRAIN_AP: "train-ap",
  TRAIN_SP: "train-sp",
  SOCIAL_RP: "social-rp",
};

export const TRAINING_NAMES = {
  all: "Все тренировки",
  "train-ap": "Тренировка AP (Физическая)",
  "train-sp": "Тренировка стилей SP",
  "social-rp": "Социальный RP (AP)",
};

export function formatTrainingName(type) {
  return TRAINING_NAMES[type] || type;
}

function normalizeSlot(slot) {
  const num = Number(slot);
  if (num === 1 || num === 2 || num === 3) return num;
  return null;
}

/**
 * Блокировать тренировку для пользователя
 */
export async function blockTraining({
  userId,
  slot = null,
  trainingType,
  reason = null,
  durationHours = 0,
  adminId,
}) {
  try {
    const db = getDB();
    if (!db) return { success: false, error: "База данных недоступна" };

    const now = new Date();
    const durationNum = Number(durationHours) || 0;
    const expiresAt =
      durationNum > 0
        ? new Date(now.getTime() + durationNum * 3600 * 1000)
        : null;
    const normSlot = normalizeSlot(slot);

    // Если блокируются все тренировки ("all"), деактивируем все индивидуальные блокировки этого слота/аккаунта,
    // так как "all" перекрывает их
    if (trainingType === TRAINING_TYPES.ALL) {
      const filter = {
        user_id: userId,
        is_active: true,
      };
      if (normSlot !== null) {
        filter.slot = normSlot;
      } else {
        filter.slot = null;
      }
      await db.collection("training_blocks").updateMany(filter, {
        $set: { is_active: false, deactivated_reason: "overwritten_by_all" },
      });
    }

    const blockDoc = {
      user_id: userId,
      training: trainingType,
      slot: normSlot,
      reason: reason ? String(reason).trim() : "Не указана",
      blocked_by: adminId,
      blocked_at: now,
      expires_at: expiresAt,
      is_active: true,
      updated_at: now,
    };

    await db.collection("training_blocks").updateOne(
      {
        user_id: userId,
        training: trainingType,
        slot: normSlot,
      },
      {
        $set: blockDoc,
      },
      { upsert: true },
    );

    return {
      success: true,
      block: blockDoc,
    };
  } catch (error) {
    console.error("Error in blockTraining:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Снять блокировку с тренировки
 */
export async function unblockTraining({
  userId,
  slot = null,
  trainingType,
  adminId,
}) {
  try {
    const db = getDB();
    if (!db) return { success: false, error: "База данных недоступна" };

    const now = new Date();
    const normSlot = normalizeSlot(slot);

    const slotQuery = normSlot !== null ? { slot: normSlot } : {};

    if (trainingType === TRAINING_TYPES.ALL) {
      // Полная разблокировка всех тренировок
      const res = await db.collection("training_blocks").updateMany(
        {
          user_id: userId,
          is_active: true,
          ...slotQuery,
        },
        {
          $set: {
            is_active: false,
            unblocked_by: adminId,
            unblocked_at: now,
          },
        },
      );
      return {
        success: true,
        unblockedCount: res.modifiedCount,
      };
    }

    // Если разблокируется конкретная тренировка, проверяем: нет ли активной блокировки "all"
    const activeAllBlock = await db.collection("training_blocks").findOne({
      user_id: userId,
      training: TRAINING_TYPES.ALL,
      is_active: true,
      ...slotQuery,
    });

    if (activeAllBlock) {
      // Проверяем срок годности "all"
      const isExpired =
        activeAllBlock.expires_at && now >= new Date(activeAllBlock.expires_at);
      if (!isExpired) {
        // Деактивируем "all" и переносим блокировки на остальные типы тренировок
        await db.collection("training_blocks").updateOne(
          { _id: activeAllBlock._id },
          {
            $set: {
              is_active: false,
              unblocked_by: adminId,
              unblocked_at: now,
            },
          },
        );

        const otherTypes = [
          TRAINING_TYPES.TRAIN_AP,
          TRAINING_TYPES.TRAIN_SP,
          TRAINING_TYPES.SOCIAL_RP,
        ].filter((t) => t !== trainingType);

        for (const other of otherTypes) {
          await db.collection("training_blocks").updateOne(
            {
              user_id: userId,
              training: other,
              slot: activeAllBlock.slot,
            },
            {
              $set: {
                user_id: userId,
                training: other,
                slot: activeAllBlock.slot,
                reason: activeAllBlock.reason,
                blocked_by: activeAllBlock.blocked_by,
                blocked_at: activeAllBlock.blocked_at,
                expires_at: activeAllBlock.expires_at,
                is_active: true,
                updated_at: now,
              },
            },
            { upsert: true },
          );
        }
      }
    }

    // Деактивируем прямую блокировку этой тренировки
    const res = await db.collection("training_blocks").updateMany(
      {
        user_id: userId,
        training: trainingType,
        is_active: true,
        ...slotQuery,
      },
      {
        $set: {
          is_active: false,
          unblocked_by: adminId,
          unblocked_at: now,
        },
      },
    );

    return {
      success: true,
      unblockedCount: res.modifiedCount,
    };
  } catch (error) {
    console.error("Error in unblockTraining:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Проверить, заблокирована ли конкретная тренировка для пользователя/слота
 */
export async function checkTrainingBlock(userId, slot, trainingType) {
  try {
    const db = getDB();
    if (!db) return { blocked: false };

    const normSlot = normalizeSlot(slot);
    const now = new Date();

    // Ищем блокировку: тренировки trainingType или ALL, для конкретного слота ИЛИ для всех слотов (slot: null)
    const slotConditions = [{ slot: null }];
    if (normSlot !== null) {
      slotConditions.push({ slot: normSlot });
    }

    const blocks = await db
      .collection("training_blocks")
      .find({
        user_id: userId,
        training: { $in: [trainingType, TRAINING_TYPES.ALL] },
        is_active: true,
        $or: slotConditions,
      })
      .toArray();

    if (!blocks || blocks.length === 0) {
      return { blocked: false };
    }

    // Проверяем сроки действия блокировок
    for (const block of blocks) {
      if (block.expires_at && now >= new Date(block.expires_at)) {
        // Блокировка истекла - отключаем ее в фоне
        db.collection("training_blocks")
          .updateOne(
            { _id: block._id },
            { $set: { is_active: false, expired_auto: true } },
          )
          .catch(() => {});
        continue;
      }

      // Найдена действующая блокировка
      return {
        blocked: true,
        training: block.training,
        trainingName: formatTrainingName(block.training),
        reason: block.reason || "Не указана",
        blockedBy: block.blocked_by,
        blockedAt: Math.floor(new Date(block.blocked_at).getTime() / 1000),
        expiresAt: block.expires_at
          ? Math.floor(new Date(block.expires_at).getTime() / 1000)
          : null,
        slot: block.slot,
      };
    }

    return { blocked: false };
  } catch (error) {
    console.error("Error in checkTrainingBlock:", error);
    return { blocked: false };
  }
}

/**
 * Получить список всех активных блокировок пользователя
 */
export async function getTrainingBlocksList(userId, slot = null) {
  try {
    const db = getDB();
    if (!db) return [];

    const normSlot = normalizeSlot(slot);
    const now = new Date();

    const query = {
      user_id: userId,
      is_active: true,
    };

    if (normSlot !== null) {
      query.$or = [{ slot: null }, { slot: normSlot }];
    }

    const blocks = await db
      .collection("training_blocks")
      .find(query)
      .sort({ blocked_at: -1 })
      .toArray();

    const activeBlocks = [];

    for (const block of blocks) {
      if (block.expires_at && now >= new Date(block.expires_at)) {
        db.collection("training_blocks")
          .updateOne(
            { _id: block._id },
            { $set: { is_active: false, expired_auto: true } },
          )
          .catch(() => {});
        continue;
      }

      activeBlocks.push({
        id: block._id.toString(),
        training: block.training,
        trainingName: formatTrainingName(block.training),
        reason: block.reason || "Не указана",
        blockedBy: block.blocked_by,
        blockedAt: Math.floor(new Date(block.blocked_at).getTime() / 1000),
        expiresAt: block.expires_at
          ? Math.floor(new Date(block.expires_at).getTime() / 1000)
          : null,
        slot: block.slot,
      });
    }

    return activeBlocks;
  } catch (error) {
    console.error("Error in getTrainingBlocksList:", error);
    return [];
  }
}
