import { getDB } from "./db.js";
import {
  getManagedShopItem,
  listShopItems,
  refreshShopCatalog,
  validateShopCatalogItem,
} from "./shopCatalog.js";

function cleanDocument(document) {
  if (!document) return null;
  const { _id, ...clean } = document;
  return clean;
}

async function writeAudit({ adminId, action, itemId, before = null, after = null }) {
  try {
    await getDB().collection("shop_catalog_audit").insertOne({
      admin_id: adminId,
      action,
      item_id: itemId,
      before: cleanDocument(before),
      after: cleanDocument(after),
      created_at: new Date(),
    });
  } catch (error) {
    console.error("Could not write shop catalog audit entry:", error);
  }
}

function versionFilter(itemId, expectedVersion) {
  const filter = { id: itemId };
  if (expectedVersion !== null && expectedVersion !== undefined
    && Number.isSafeInteger(Number(expectedVersion))) {
    filter.version = Number(expectedVersion);
  }
  return filter;
}

function normalizeItem(item) {
  return {
    ...item,
    id: String(item.id || "").trim().toLowerCase(),
    name: String(item.name || "").trim(),
    description: String(item.description || "").trim(),
    emoji: String(item.emoji || "").trim(),
    category: String(item.category || "").trim(),
    rarity: String(item.rarity || "").trim(),
    price_yen: Number(item.price_yen),
    weekly_limit: Number(item.weekly_limit),
    stock: item.stock === null ? null : Number(item.stock),
    delivery: { ...item.delivery },
  };
}

export function listManagedShopItems() {
  return listShopItems(null, { includeInactive: true });
}

export async function getShopCatalogAudit(itemId = null, limit = 15) {
  const filter = itemId ? { item_id: itemId } : {};
  return getDB().collection("shop_catalog_audit")
    .find(filter)
    .sort({ created_at: -1 })
    .limit(Math.max(1, Math.min(20, Number(limit) || 15)))
    .toArray();
}

export async function createManagedShopItem(item, adminId) {
  const db = getDB();
  const normalized = normalizeItem({
    ...item,
    enabled: true,
    archived: false,
    sold_count: 0,
    version: 1,
    source: "admin",
  });
  const validation = validateShopCatalogItem(normalized);
  if (!validation.valid) return { success: false, reason: validation.reason };
  const maximum = await db.collection("shop_catalog_items")
    .find({})
    .sort({ sort_order: -1 })
    .limit(1)
    .next();
  const document = {
    ...normalized,
    sort_order: Number.isSafeInteger(Number(item.sort_order))
      ? Number(item.sort_order)
      : Number(maximum?.sort_order || 0) + 1,
    created_by: adminId,
    updated_by: adminId,
    created_at: new Date(),
    updated_at: new Date(),
  };
  try {
    await db.collection("shop_catalog_items").insertOne(document);
  } catch (error) {
    if (error?.code === 11000) return { success: false, reason: "duplicate_id" };
    throw error;
  }
  await refreshShopCatalog(db);
  await writeAudit({ adminId, action: "create", itemId: document.id, after: document });
  return { success: true, item: getManagedShopItem(document.id) };
}

export async function updateManagedShopItem(itemId, changes, adminId, expectedVersion = null) {
  const db = getDB();
  const before = await db.collection("shop_catalog_items").findOne({ id: itemId });
  if (!before) return { success: false, reason: "not_found" };
  const next = normalizeItem({
    ...before,
    ...changes,
    delivery: changes.delivery ? { ...changes.delivery } : { ...before.delivery },
  });
  const validation = validateShopCatalogItem(next);
  if (!validation.valid) return { success: false, reason: validation.reason };
  const editable = {
    name: next.name,
    description: next.description,
    emoji: next.emoji,
    category: next.category,
    rarity: next.rarity,
    price_yen: next.price_yen,
    weekly_limit: next.weekly_limit,
    delivery: next.delivery,
    sort_order: Number.isSafeInteger(Number(next.sort_order))
      ? Number(next.sort_order)
      : Number(before.sort_order || 0),
    updated_by: adminId,
    updated_at: new Date(),
  };
  const result = await db.collection("shop_catalog_items").findOneAndUpdate(
    versionFilter(itemId, expectedVersion),
    { $set: editable, $inc: { version: 1 } },
    { returnDocument: "after" },
  );
  if (!result) return { success: false, reason: "changed" };
  await refreshShopCatalog(db);
  await writeAudit({ adminId, action: "edit", itemId, before, after: result });
  return { success: true, item: getManagedShopItem(itemId) };
}

export async function setManagedShopItemState(
  itemId,
  action,
  adminId,
  expectedVersion = null,
) {
  const db = getDB();
  const before = await db.collection("shop_catalog_items").findOne({ id: itemId });
  if (!before) return { success: false, reason: "not_found" };
  let state;
  if (action === "enable") {
    if (before.archived) return { success: false, reason: "archived" };
    state = { enabled: true };
  } else if (action === "disable") {
    state = { enabled: false };
  } else if (action === "archive") {
    state = { enabled: false, archived: true };
  } else if (action === "restore") {
    state = { enabled: false, archived: false };
  } else {
    return { success: false, reason: "invalid_action" };
  }
  const result = await db.collection("shop_catalog_items").findOneAndUpdate(
    versionFilter(itemId, expectedVersion),
    {
      $set: {
        ...state,
        updated_by: adminId,
        updated_at: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  if (!result) return { success: false, reason: "changed" };
  await refreshShopCatalog(db);
  await writeAudit({ adminId, action, itemId, before, after: result });
  return { success: true, item: getManagedShopItem(itemId) };
}

export async function changeManagedShopStock(
  itemId,
  mode,
  quantity,
  adminId,
  expectedVersion = null,
) {
  const db = getDB();
  const before = await db.collection("shop_catalog_items").findOne({ id: itemId });
  if (!before) return { success: false, reason: "not_found" };
  const filter = versionFilter(itemId, expectedVersion);
  let update;
  if (mode === "unlimited") {
    update = { $set: { stock: null } };
  } else if (mode === "set") {
    const value = Number(quantity);
    if (!Number.isSafeInteger(value) || value < 0) {
      return { success: false, reason: "invalid_stock" };
    }
    update = { $set: { stock: value } };
  } else if (mode === "add") {
    const value = Number(quantity);
    if (!Number.isSafeInteger(value) || value === 0 || before.stock === null) {
      return { success: false, reason: before.stock === null ? "stock_unlimited" : "invalid_stock" };
    }
    if (Number(before.stock) + value < 0) return { success: false, reason: "stock_below_zero" };
    filter.stock = before.stock;
    update = { $inc: { stock: value } };
  } else {
    return { success: false, reason: "invalid_action" };
  }
  update.$set = {
    ...(update.$set || {}),
    updated_by: adminId,
    updated_at: new Date(),
  };
  update.$inc = { ...(update.$inc || {}), version: 1 };
  const result = await db.collection("shop_catalog_items").findOneAndUpdate(
    filter,
    update,
    { returnDocument: "after" },
  );
  if (!result) return { success: false, reason: "changed" };
  await refreshShopCatalog(db);
  await writeAudit({ adminId, action: `stock_${mode}`, itemId, before, after: result });
  return { success: true, item: getManagedShopItem(itemId) };
}
