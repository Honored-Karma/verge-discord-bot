import { getDB, withTransaction } from "./db.js";
import { isTransactionUnsupportedError } from "./currencyTransferStore.js";
import {
  getShopItem,
  refreshShopCatalog,
  resolveShopDelivery,
  shopCooldownMs,
  shopPeriodKey,
  shopPrice,
} from "./shopCatalog.js";

function options(session) {
  return session ? { session } : {};
}

function safeId(value, maxLength = 120) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function publicOrderId(operationId) {
  const compact = String(operationId || "").replace(/[^a-z0-9]/gi, "");
  return compact.slice(0, 10).toUpperCase();
}

function purchaseStatus(delivery) {
  return delivery.kind === "order" ? "pending_review" : "completed";
}

function normalizePurchase(document, idempotent = false) {
  if (!document) return null;
  return {
    success: ["completed", "pending_review"].includes(document.status),
    idempotent,
    status: document.status,
    reason: document.reason || null,
    operationId: document.operation_id,
    itemId: document.item_id,
    itemName: document.item_name,
    currency: document.currency,
    price: Number(document.amount || 0),
    balance: Number(document.balance_after || 0),
    delivery: document.delivery || null,
    orderId: document.order_id || null,
    effectExpiresAt: document.effect_expires_at || null,
  };
}

/**
 * Сколько миллисекунд осталось до следующей покупки этого товара.
 *
 * Недельный лимит считает покупки внутри календарной недели и обнуляется в
 * понедельник — этим можно было брать несколько усилений подряд на стыке недель.
 * Кулдаун — скользящее окно от момента последней покупки, поэтому «богачи по кд»
 * больше не качаются: между покупками всегда проходит заданное время.
 *
 * Возвращает 0, если покупать можно.
 */
async function purchaseCooldownRemaining(purchases, context, session) {
  if (!context.cooldownMs) return 0;

  const last = await purchases.find({
    player_id: context.playerId,
    item_id: context.item.id,
    status: { $in: ["processing", "completed", "pending_review"] },
  }, options(session))
    .sort({ created_at: -1 })
    .limit(1)
    .toArray();

  const boughtAt = last[0]?.created_at ? new Date(last[0].created_at).getTime() : 0;
  if (!boughtAt) return 0;

  const elapsed = context.createdAt.getTime() - boughtAt;
  // Часы на сервере могли сдвинуться назад — отрицательное «прошло» не должно
  // превращаться в бесконечный запрет.
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.max(0, context.cooldownMs - elapsed);
}

async function completedPurchaseCount(purchases, playerId, itemId, periodKey, session) {
  return purchases.countDocuments({
    player_id: playerId,
    item_id: itemId,
    period_key: periodKey,
    status: { $in: ["processing", "completed", "pending_review"] },
  }, options(session));
}

async function deliverWithSession(collections, context, session) {
  const { delivery, item, playerId, userId, guildId, operationId, createdAt } = context;
  if (delivery.kind === "inventory") {
    const current = await collections.inventory.findOne({
      player_id: playerId,
      item_name: delivery.item_name,
    }, options(session));
    const previousQuantity = Number(current?.qty ?? 0);
    if (!Number.isSafeInteger(previousQuantity) || previousQuantity < 0
      || !Number.isSafeInteger(previousQuantity + 1)) {
      throw new Error("Inventory quantity is unsafe");
    }
    await collections.inventory.updateOne(
      { player_id: playerId, item_name: delivery.item_name },
      {
        $set: { player_id: playerId, item_name: delivery.item_name },
        $inc: { qty: 1 },
      },
      { ...options(session), upsert: true },
    );
    return { kind: "inventory", itemName: delivery.item_name };
  }

  if (delivery.kind === "active_effect") {
    const current = await collections.activeEffects.findOne({
      player_id: playerId,
      effect_key: delivery.effect_key,
    }, options(session));
    const nowMs = createdAt.getTime();
    const currentExpiry = current?.expires_at
      ? new Date(current.expires_at).getTime()
      : 0;
    const startsFrom = Math.max(nowMs, Number.isFinite(currentExpiry) ? currentExpiry : 0);
    const expiresAt = new Date(startsFrom + delivery.duration_seconds * 1000);
    await collections.activeEffects.updateOne(
      { player_id: playerId, effect_key: delivery.effect_key },
      {
        $set: {
          player_id: playerId,
          effect_key: delivery.effect_key,
          effect_type: "training_multiplier",
          applies_to: [...delivery.applies_to],
          bonus_percent: delivery.bonus_percent,
          source_item_id: item.id,
          started_at: createdAt,
          expires_at: expiresAt,
          updated_at: createdAt,
        },
      },
      { ...options(session), upsert: true },
    );
    return { kind: "active_effect", expiresAt };
  }

  if (delivery.kind === "order") {
    const orderId = publicOrderId(operationId);
    await collections.orders.insertOne({
      public_id: orderId,
      operation_id: operationId,
      guild_id: guildId,
      user_id: userId,
      player_id: playerId,
      item_id: item.id,
      item_name: item.name,
      order_type: delivery.order_type,
      tier: delivery.tier,
      status: "pending_review",
      created_at: createdAt,
      updated_at: createdAt,
    }, options(session));
    return { kind: "order", orderId };
  }

  throw new Error(`Unsupported shop delivery: ${delivery.kind}`);
}

function purchaseCollections(db) {
  return {
    players: db.collection("players"),
    inventory: db.collection("inventory"),
    purchases: db.collection("shop_purchases"),
    orders: db.collection("shop_orders"),
    activeEffects: db.collection("active_effects"),
    ledger: db.collection("economy_ledger"),
    catalog: db.collection("shop_catalog_items"),
  };
}

async function reserveCatalogStock(collections, context, session) {
  const filter = {
    id: context.item.id,
    version: context.item.version,
    enabled: true,
    archived: { $ne: true },
  };
  const current = await collections.catalog.findOne(filter, options(session));
  if (!current) return { success: false, reason: "item_changed" };
  const finite = current.stock !== null && current.stock !== undefined;
  if (finite && Number(current.stock) < 1) {
    return { success: false, reason: "out_of_stock" };
  }
  if (finite) filter.stock = { $gte: 1 };
  else filter.stock = null;
  const update = finite
    ? { $inc: { stock: -1, sold_count: 1 }, $set: { last_sold_at: context.createdAt } }
    : { $inc: { sold_count: 1 }, $set: { last_sold_at: context.createdAt } };
  const reserved = await collections.catalog.findOneAndUpdate(
    filter,
    update,
    { ...options(session), returnDocument: "after" },
  );
  if (!reserved) return { success: false, reason: finite ? "out_of_stock" : "item_changed" };
  return { success: true, finite };
}

async function releaseCatalogStock(collections, context, reservation, session = null) {
  if (!reservation?.success) return;
  const update = reservation.finite
    ? { $inc: { stock: 1, sold_count: -1 } }
    : { $inc: { sold_count: -1 } };
  await collections.catalog.updateOne(
    { id: context.item.id, sold_count: { $gte: 1 } },
    update,
    options(session),
  );
}

async function purchaseInTransaction(collections, context, session) {
  const existing = await collections.purchases.findOne(
    { operation_id: context.operationId },
    options(session),
  );
  if (existing) return normalizePurchase(existing, true);

  const count = await completedPurchaseCount(
    collections.purchases,
    context.playerId,
    context.item.id,
    context.periodKey,
    session,
  );
  if (count >= context.weeklyLimit) {
    return { success: false, reason: "weekly_limit", limit: context.weeklyLimit };
  }

  const cooldownLeft = await purchaseCooldownRemaining(
    collections.purchases,
    context,
    session,
  );
  if (cooldownLeft > 0) {
    return {
      success: false,
      reason: "cooldown",
      cooldownHours: context.cooldownHours,
      retryAt: Math.floor((context.createdAt.getTime() + cooldownLeft) / 1000),
    };
  }

  const playerBefore = await collections.players.findOne(
    { id: context.playerId },
    options(session),
  );
  if (!playerBefore) return { success: false, reason: "player_not_found" };
  if (Number(playerBefore[context.currency] || 0) < context.price) {
    return {
      success: false,
      reason: "insufficient_funds",
      available: Number(playerBefore[context.currency] || 0),
    };
  }

  const reservation = await reserveCatalogStock(collections, context, session);
  if (!reservation.success) return reservation;

  const limitKey = `${context.playerId}:${context.item.id}:${context.periodKey}:${count + 1}`;
  const purchaseDocument = {
    operation_id: context.operationId,
    limit_key: limitKey,
    guild_id: context.guildId,
    user_id: context.userId,
    player_id: context.playerId,
    item_id: context.item.id,
    item_name: context.item.name,
    currency: context.currency,
    amount: context.price,
    period_key: context.periodKey,
    status: "processing",
    stock_limited: reservation.finite,
    created_at: context.createdAt,
    updated_at: context.createdAt,
  };
  await collections.purchases.insertOne(purchaseDocument, options(session));

  const updatedPlayer = await collections.players.findOneAndUpdate(
    {
      id: context.playerId,
      [context.currency]: { $gte: context.price },
    },
    { $inc: { [context.currency]: -context.price } },
    { ...options(session), returnDocument: "after" },
  );
  if (!updatedPlayer) {
    const player = await collections.players.findOne(
      { id: context.playerId },
      options(session),
    );
    await collections.purchases.deleteOne(
      { operation_id: context.operationId },
      options(session),
    );
    await releaseCatalogStock(collections, context, reservation, session);
    if (!player) return { success: false, reason: "player_not_found" };
    return {
      success: false,
      reason: "insufficient_funds",
      available: Number(player[context.currency] || 0),
    };
  }

  const deliveryResult = await deliverWithSession(collections, context, session);
  const status = purchaseStatus(context.delivery);
  const balanceAfter = Number(updatedPlayer[context.currency] || 0);
  const update = {
    status,
    balance_after: balanceAfter,
    delivery: deliveryResult.kind,
    updated_at: context.createdAt,
  };
  if (deliveryResult.orderId) update.order_id = deliveryResult.orderId;
  if (deliveryResult.itemName) update.delivered_item_name = deliveryResult.itemName;
  if (deliveryResult.expiresAt) update.effect_expires_at = deliveryResult.expiresAt;
  await collections.purchases.updateOne(
    { operation_id: context.operationId },
    { $set: update },
    options(session),
  );
  await collections.ledger.insertOne({
    operation_id: context.operationId,
    player_id: context.playerId,
    type: "shop_purchase",
    currency: context.currency,
    amount: -context.price,
    balance_after: balanceAfter,
    item_id: context.item.id,
    item_name: context.item.name,
    created_at: context.createdAt,
  }, options(session));

  return normalizePurchase({ ...purchaseDocument, ...update });
}

export async function purchaseShopItem({
  operationId,
  playerId,
  userId,
  guildId,
  itemId,
  currency,
  styleName = null,
  expectedVersion = null,
  expectedPrice = null,
}) {
  const safeOperationId = safeId(operationId);
  const safePlayerId = safeId(playerId);
  const safeUserId = safeId(userId);
  const safeGuildId = safeId(guildId);
  if (!safeOperationId || !safePlayerId || !safeUserId || !safeGuildId) {
    return { success: false, reason: "invalid_purchase" };
  }
  const db = getDB();
  const collections = purchaseCollections(db);
  // A committed purchase remains replayable even after its catalog entry was
  // edited or archived. Never turn an uncertain retry into a new purchase.
  const existing = await collections.purchases.findOne({ operation_id: safeOperationId });
  if (existing) {
    if (existing.player_id !== safePlayerId || existing.user_id !== safeUserId
      || existing.guild_id !== safeGuildId || existing.item_id !== itemId || existing.currency !== currency) {
      return { success: false, reason: "invalid_purchase" };
    }
    return normalizePurchase(existing, true);
  }
  const item = getShopItem(itemId);
  const delivery = resolveShopDelivery(item, { styleName });
  const price = shopPrice(item, currency);
  if (!item) return { success: false, reason: "item_unavailable" };
  if (expectedVersion !== null && Number(item.version) !== Number(expectedVersion)) {
    return { success: false, reason: "item_changed" };
  }
  if (expectedPrice !== null && price !== Number(expectedPrice)) {
    return { success: false, reason: "item_changed" };
  }
  if (!safeOperationId || !safePlayerId || !safeUserId || !safeGuildId
    || !item || !delivery || !Number.isSafeInteger(price)) {
    return { success: false, reason: "invalid_purchase" };
  }

  const context = {
    operationId: safeOperationId,
    playerId: safePlayerId,
    userId: safeUserId,
    guildId: safeGuildId,
    item,
    delivery,
    price,
    currency,
    weeklyLimit: Math.max(1, Number(item.weekly_limit || 1)),
    cooldownMs: shopCooldownMs(item),
    cooldownHours: Number(item.cooldown_hours || 0),
    periodKey: shopPeriodKey(),
    createdAt: new Date(),
  };
  try {
    const result = await withTransaction((session) => purchaseInTransaction(
      collections,
      context,
      session,
    ));
    if (result?.success) await refreshShopCatalog(db).catch(() => {});
    return result;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) return { success: false, reason: "transactions_required" };
    if (error?.code === 11000) {
      const existing = await collections.purchases.findOne({
        operation_id: context.operationId,
      });
      if (existing) return normalizePurchase(existing, true);
      return {
        success: false,
        reason: "weekly_limit",
        limit: context.weeklyLimit,
      };
    }
    console.error("Error purchasing shop item:", error);
    return { success: false, reason: "error" };
  }
}

export async function getActiveShopEffects(playerId) {
  const db = getDB();
  return db.collection("active_effects")
    .find({ player_id: playerId, expires_at: { $gt: new Date() } })
    .sort({ expires_at: 1 })
    .toArray();
}

export async function getShopTrainingBonus(playerId, appliesTo) {
  try {
    const effects = await getDB().collection("active_effects").find({
      player_id: playerId,
      effect_type: "training_multiplier",
      applies_to: appliesTo,
      expires_at: { $gt: new Date() },
    }).toArray();
    return effects.reduce(
      (maximum, effect) => Math.max(maximum, Number(effect.bonus_percent || 0)),
      0,
    );
  } catch (error) {
    console.error("Error reading active shop effects:", error);
    return 0;
  }
}

export async function getPlayerShopOrders(playerId, limit = 10) {
  return getDB().collection("shop_orders")
    .find({ player_id: playerId })
    .sort({ created_at: -1 })
    .limit(Math.max(1, Math.min(25, Number(limit) || 10)))
    .toArray();
}

function normalizeOrderDetails(order, purchase) {
  if (!order || !purchase) return null;
  return {
    order,
    purchase,
    publicId: order.public_id,
    status: order.status,
    playerId: order.player_id,
    userId: order.user_id,
    itemName: order.item_name,
    currency: purchase.currency,
    price: Number(purchase.amount || 0),
  };
}

async function restoreRejectedOrderStock(collections, order, purchase, session = null) {
  const current = await collections.catalog.findOne(
    { id: order.item_id },
    options(session),
  );
  if (!current || Number(current.sold_count || 0) < 1) return;
  const restoreLimitedStock = purchase.stock_limited === true
    && current.stock !== null && current.stock !== undefined;
  const update = restoreLimitedStock
    ? { $inc: { stock: 1, sold_count: -1 } }
    : { $inc: { sold_count: -1 } };
  await collections.catalog.updateOne(
    { _id: current._id, sold_count: { $gte: 1 } },
    update,
    options(session),
  );
}

export async function getShopOrderDetails(publicId) {
  const safePublicId = safeId(publicId, 20)?.toUpperCase();
  if (!safePublicId) return null;
  const collections = purchaseCollections(getDB());
  const order = await collections.orders.findOne({ public_id: safePublicId });
  if (!order) return null;
  const purchase = await collections.purchases.findOne({
    operation_id: order.operation_id,
  });
  return normalizeOrderDetails(order, purchase);
}

async function resolveOrderInTransaction(collections, context, session) {
  const order = await collections.orders.findOne(
    { public_id: context.publicId },
    options(session),
  );
  if (!order) return { success: false, reason: "order_not_found" };
  if (order.status !== "pending_review") {
    return {
      success: false,
      reason: "already_resolved",
      status: order.status,
    };
  }
  const purchase = await collections.purchases.findOne(
    { operation_id: order.operation_id },
    options(session),
  );
  if (!purchase) return { success: false, reason: "purchase_not_found" };

  if (context.action === "fulfill") {
    await collections.orders.updateOne(
      { _id: order._id, status: "pending_review" },
      {
        $set: {
          status: "fulfilled",
          resolution_reason: context.reason,
          resolved_by: context.adminId,
          resolved_at: context.now,
          updated_at: context.now,
        },
      },
      options(session),
    );
    return {
      success: true,
      status: "fulfilled",
      publicId: order.public_id,
      userId: order.user_id,
      itemName: order.item_name,
      currency: purchase.currency,
      price: Number(purchase.amount || 0),
    };
  }

  const refundMarker = `shop_refunds.${order.public_id}`;
  const updatedPlayer = await collections.players.findOneAndUpdate(
    {
      id: order.player_id,
      [refundMarker]: { $ne: true },
      [purchase.currency]: { $lte: Number.MAX_SAFE_INTEGER - Number(purchase.amount || 0) },
    },
    {
      $inc: { [purchase.currency]: Number(purchase.amount || 0) },
      $set: { [refundMarker]: true },
    },
    { ...options(session), returnDocument: "after" },
  );
  if (!updatedPlayer) return { success: false, reason: "refund_failed" };

  const refundOperationId = `shop_refund:${order.public_id}`;
  await collections.ledger.updateOne(
    { operation_id: refundOperationId },
    {
      $setOnInsert: {
        operation_id: refundOperationId,
        player_id: order.player_id,
        type: "shop_refund",
        currency: purchase.currency,
        amount: Number(purchase.amount || 0),
        balance_after: Number(updatedPlayer[purchase.currency] || 0),
        item_id: order.item_id,
        item_name: order.item_name,
        order_id: order.public_id,
        created_at: context.now,
      },
    },
    { ...options(session), upsert: true },
  );
  await collections.purchases.updateOne(
    { operation_id: order.operation_id },
    {
      $set: {
        status: "refunded",
        reason: "order_rejected",
        refunded_at: context.now,
        updated_at: context.now,
      },
      $unset: { limit_key: "" },
    },
    options(session),
  );
  await restoreRejectedOrderStock(collections, order, purchase, session);
  await collections.orders.updateOne(
    { _id: order._id, status: "pending_review" },
    {
      $set: {
        status: "rejected",
        resolution_reason: context.reason,
        resolved_by: context.adminId,
        resolved_at: context.now,
        updated_at: context.now,
      },
    },
    options(session),
  );
  return {
    success: true,
    status: "rejected",
    publicId: order.public_id,
    userId: order.user_id,
    itemName: order.item_name,
    currency: purchase.currency,
    price: Number(purchase.amount || 0),
    balance: Number(updatedPlayer[purchase.currency] || 0),
  };
}

export async function resolveShopOrder({ publicId, action, adminId, reason = "" }) {
  const context = {
    publicId: safeId(publicId, 20)?.toUpperCase(),
    action: action === "reject" ? "reject" : action === "fulfill" ? "fulfill" : null,
    adminId: safeId(adminId),
    reason: String(reason || "").trim().slice(0, 500) || "Причина не указана",
    now: new Date(),
  };
  if (!context.publicId || !context.action || !context.adminId) {
    return { success: false, reason: "invalid_resolution" };
  }
  const collections = purchaseCollections(getDB());
  try {
    const result = await withTransaction((session) => resolveOrderInTransaction(
      collections,
      context,
      session,
    ));
    if (result?.success && result.status === "rejected") {
      await refreshShopCatalog(getDB()).catch(() => {});
    }
    return result;
  } catch (error) {
    if (isTransactionUnsupportedError(error)) return { success: false, reason: "transactions_required" };
    console.error("Error resolving shop order:", error);
    return { success: false, reason: "error" };
  }
}
