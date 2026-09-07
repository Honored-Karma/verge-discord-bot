import { readFileSync } from "node:fs";
import { EXCHANGE_RATE } from "./banking.js";
import { createSPItemName } from "./itemSystem.js";

const RARITIES = {
  common: { name: "Обычный", emoji: "⚪", color: 0x94a3b8 },
  uncommon: { name: "Необычный", emoji: "🟢", color: 0x22c55e },
  rare: { name: "Редкий", emoji: "🔵", color: 0x3b82f6 },
  epic: { name: "Эпический", emoji: "🟣", color: 0xa855f7 },
  legendary: { name: "Легендарный", emoji: "🟠", color: 0xf59e0b },
};

// Год — заведомо достаточный потолок: всё, что дольше, почти наверняка опечатка
// в часах вместо суток.
const MAX_COOLDOWN_HOURS = 8760;

export function isValidCooldown(value) {
  const hours = Number(value);
  return Number.isSafeInteger(hours) && hours >= 0 && hours <= MAX_COOLDOWN_HOURS;
}

export function normalizeCooldownHours(value) {
  const hours = Number(value);
  return isValidCooldown(hours) ? hours : 0;
}

/** Кулдаун товара в миллисекундах; 0 означает «без кулдауна». */
export function shopCooldownMs(item) {
  return normalizeCooldownHours(item?.cooldown_hours) * 60 * 60 * 1000;
}

function loadCatalog() {
  const file = readFileSync(
    new URL("../data/shop_items.json", import.meta.url),
    "utf8",
  );
  const catalog = JSON.parse(file);
  if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.items)) {
    throw new Error("Shop catalog must contain categories and items");
  }
  return catalog;
}

const CATALOG = loadCatalog();
const CATEGORY_BY_ID = new Map(CATALOG.categories.map((category) => [category.id, category]));
const DEFAULT_ITEMS = CATALOG.items.map((item) => ({
  ...item,
  delivery: { ...item.delivery },
  enabled: true,
  archived: false,
  stock: null,
  sold_count: 0,
  version: 1,
  source: "default",
}));
let runtimeItems = DEFAULT_ITEMS;
let itemById = new Map(runtimeItems.map((item) => [item.id, item]));

if (CATEGORY_BY_ID.size !== CATALOG.categories.length) {
  throw new Error("Shop category IDs must be unique");
}
if (itemById.size !== CATALOG.items.length) {
  throw new Error("Shop item IDs must be unique");
}

for (const item of CATALOG.items) {
  if (!item.id || !CATEGORY_BY_ID.has(item.category)) {
    throw new Error(`Invalid shop item: ${item.id || "without id"}`);
  }
  if (!Number.isSafeInteger(item.price_yen) || item.price_yen < 1) {
    throw new Error(`Invalid price for shop item ${item.id}`);
  }
  if (!Number.isSafeInteger(item.weekly_limit) || item.weekly_limit < 1) {
    throw new Error(`Invalid weekly limit for shop item ${item.id}`);
  }
  if (item.cooldown_hours !== undefined && !isValidCooldown(item.cooldown_hours)) {
    throw new Error(`Invalid cooldown for shop item ${item.id}`);
  }
  if (!item.delivery?.kind) throw new Error(`Missing delivery for shop item ${item.id}`);
  if (!RARITIES[item.rarity]) throw new Error(`Invalid rarity for shop item ${item.id}`);
}

export function listShopCategories() {
  return CATALOG.categories.map((category) => ({ ...category }));
}

function cloneItem(item) {
  return item ? { ...item, delivery: { ...item.delivery } } : null;
}

export function listShopItems(categoryId = null, { includeInactive = false } = {}) {
  return runtimeItems
    .filter((item) => includeInactive || (item.enabled !== false && item.archived !== true))
    .filter((item) => !categoryId || item.category === categoryId)
    .sort((left, right) => (
      Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || left.name.localeCompare(right.name, "ru")
    ))
    .map((item) => ({ ...item, delivery: { ...item.delivery } }));
}

export function getShopItem(itemId) {
  const item = itemById.get(String(itemId || ""));
  return item?.enabled !== false && item?.archived !== true ? cloneItem(item) : null;
}

export function getManagedShopItem(itemId) {
  return cloneItem(itemById.get(String(itemId || "")));
}

export function getShopCategory(categoryId) {
  const category = CATEGORY_BY_ID.get(String(categoryId || ""));
  return category ? { ...category } : null;
}

export function getShopRarity(rarity) {
  return RARITIES[rarity] || RARITIES.common;
}

export function listShopRarities() {
  return Object.entries(RARITIES).map(([id, rarity]) => ({ id, ...rarity }));
}

export function validateShopCatalogItem(item) {
  if (!/^[a-z0-9][a-z0-9_-]{2,49}$/.test(String(item?.id || ""))) {
    return { valid: false, reason: "invalid_id" };
  }
  if (!CATEGORY_BY_ID.has(item.category)) return { valid: false, reason: "invalid_category" };
  if (!RARITIES[item.rarity]) return { valid: false, reason: "invalid_rarity" };
  if (!String(item.name || "").trim() || String(item.name).length > 100) {
    return { valid: false, reason: "invalid_name" };
  }
  if (!String(item.description || "").trim() || String(item.description).length > 1000) {
    return { valid: false, reason: "invalid_description" };
  }
  if (!String(item.emoji || "").trim() || String(item.emoji).length > 32) {
    return { valid: false, reason: "invalid_emoji" };
  }
  if (!Number.isSafeInteger(Number(item.price_yen)) || Number(item.price_yen) < 1) {
    return { valid: false, reason: "invalid_price" };
  }
  if (!Number.isSafeInteger(Number(item.weekly_limit))
    || Number(item.weekly_limit) < 1 || Number(item.weekly_limit) > 100) {
    return { valid: false, reason: "invalid_weekly_limit" };
  }
  if (item.stock !== null && (!Number.isSafeInteger(Number(item.stock)) || Number(item.stock) < 0)) {
    return { valid: false, reason: "invalid_stock" };
  }
  if (item.cooldown_hours !== undefined && item.cooldown_hours !== null
    && !isValidCooldown(item.cooldown_hours)) {
    return { valid: false, reason: "invalid_cooldown" };
  }
  const delivery = item.delivery;
  if (!delivery?.kind) return { valid: false, reason: "invalid_delivery" };
  if (delivery.kind === "inventory") {
    if (!String(delivery.item_name || "").trim()) return { valid: false, reason: "invalid_delivery" };
  } else if (delivery.kind === "sp_scroll") {
    if (!Number.isSafeInteger(Number(delivery.amount)) || Number(delivery.amount) < 1) {
      return { valid: false, reason: "invalid_delivery" };
    }
  } else if (delivery.kind === "active_effect") {
    const targets = Array.isArray(delivery.applies_to) ? delivery.applies_to : [];
    if (!String(delivery.effect_key || "").trim()
      || !targets.length || targets.some((target) => !["ap", "sp"].includes(target))
      || !Number.isSafeInteger(Number(delivery.bonus_percent))
      || Number(delivery.bonus_percent) < 1 || Number(delivery.bonus_percent) > 200
      || !Number.isSafeInteger(Number(delivery.duration_seconds))
      || Number(delivery.duration_seconds) < 60 || Number(delivery.duration_seconds) > 2_592_000) {
      return { valid: false, reason: "invalid_delivery" };
    }
  } else if (delivery.kind === "order") {
    if (!String(delivery.order_type || "").trim() || !String(delivery.tier || "").trim()) {
      return { valid: false, reason: "invalid_delivery" };
    }
  } else {
    return { valid: false, reason: "invalid_delivery" };
  }
  return { valid: true };
}

function catalogDocument(item) {
  return {
    ...cloneItem(item),
    enabled: item.enabled !== false,
    archived: item.archived === true,
    stock: item.stock === null || item.stock === undefined ? null : Number(item.stock),
    cooldown_hours: normalizeCooldownHours(item.cooldown_hours),
    sold_count: Math.max(0, Number(item.sold_count || 0)),
    version: Math.max(1, Number(item.version || 1)),
  };
}

export async function refreshShopCatalog(db) {
  const documents = await db.collection("shop_catalog_items").find({}).toArray();
  runtimeItems = documents.map(catalogDocument);
  itemById = new Map(runtimeItems.map((item) => [item.id, item]));
  return listShopItems(null, { includeInactive: true });
}

export async function initializeShopCatalog(db) {
  const collection = db.collection("shop_catalog_items");
  if (DEFAULT_ITEMS.length > 0) {
    await collection.bulkWrite(DEFAULT_ITEMS.map((item, index) => ({
      updateOne: {
        filter: { id: item.id },
        update: {
          $setOnInsert: {
            ...catalogDocument(item),
            sort_order: index,
            created_at: new Date(),
            updated_at: new Date(),
          },
        },
        upsert: true,
      },
    })));
  }
  await applyCatalogRevision(db);
  return refreshShopCatalog(db);
}

/**
 * Разовая синхронизация каталога с файлом при росте номера ревизии.
 *
 * Сидирование выше идёт через `$setOnInsert`, поэтому у уже существующих
 * товаров цена в базе не менялась никогда: правка `data/shop_items.json`
 * просто не доезжала до продакшена. Ревизия закрывает этот разрыв, но не
 * превращает файл в постоянный источник истины — иначе миграция затирала бы
 * всё, что администраторы поменяли через `/shop-admin`.
 *
 * Синхронизируется ровно два вида изменений:
 *   1) поля из REVISION_SYNCED_FIELDS у товаров, которые файл всё ещё описывает;
 *   2) архивация позиций, которых в файле больше нет.
 * Названия, описания, лимиты и остатки остаются за администраторами.
 */
// Поля, которые ревизия имеет право перетереть значением из файла. Всё
// остальное принадлежит администраторам и правится только через /shop-admin.
const REVISION_SYNCED_FIELDS = ["price_yen", "cooldown_hours"];

export async function applyCatalogRevision(db) {
  const meta = db.collection("shop_catalog_meta");
  const items = db.collection("shop_catalog_items");
  const audit = db.collection("shop_catalog_audit");

  const target = Number(CATALOG.version || 1);
  const stored = await meta.findOne({ _id: "catalog" });
  const applied = Number(stored?.revision || 1);
  if (!Number.isFinite(target) || applied >= target) {
    return { applied: false, revision: applied, changes: 0 };
  }

  const now = new Date();
  const known = DEFAULT_ITEMS.map((item) => item.id);
  const changes = [];

  for (const item of DEFAULT_ITEMS) {
    const before = await items.findOne({ id: item.id });
    if (!before) continue;

    const updates = {};
    const details = {};
    for (const field of REVISION_SYNCED_FIELDS) {
      const target = Number(item[field] ?? 0);
      if (Number(before[field] ?? 0) === target) continue;
      updates[field] = target;
      details[field] = { from: Number(before[field] ?? 0), to: target };
    }
    if (Object.keys(updates).length === 0) continue;

    await items.updateOne(
      { id: item.id },
      { $set: { ...updates, updated_at: now }, $inc: { version: 1 } },
    );
    changes.push({ item_id: item.id, action: "revision_fields", details });
  }

  // Позиции, удалённые из файла, не стираем: на них могут ссылаться уже
  // оформленные заявки и история покупок. Архивация убирает их с витрины и
  // оставляет данные целыми, а `/shop-admin state restore` вернёт карточку.
  const removed = await items.find({
    id: { $nin: known },
    archived: { $ne: true },
  }).toArray();

  if (removed.length > 0) {
    await items.updateMany(
      { id: { $in: removed.map((item) => item.id) } },
      { $set: { enabled: false, archived: true, updated_at: now }, $inc: { version: 1 } },
    );
    for (const item of removed) {
      changes.push({
        item_id: item.id,
        action: "revision_archive",
        details: { name: item.name },
      });
    }
  }

  // Пишем в тот же журнал, что и ручные правки, чтобы `/shop-admin history`
  // показывал автоматические изменения наравне с админскими.
  if (changes.length > 0) {
    await audit.insertMany(changes.map((change) => ({
      ...change,
      admin_id: "system",
      revision: target,
      created_at: now,
    })));
  }

  await meta.updateOne(
    { _id: "catalog" },
    { $set: { revision: target, applied_at: now, changed: changes.length } },
    { upsert: true },
  );

  console.log(`🛒 Каталог магазина обновлён до ревизии ${target}: изменений — ${changes.length}`);
  return { applied: true, revision: target, changes: changes.length };
}

export function shopPrice(item, currency) {
  if (!item || (currency !== "yen" && currency !== "krw")) return null;
  return currency === "yen"
    ? item.price_yen
    : Math.ceil(item.price_yen * EXCHANGE_RATE);
}

export function resolveShopDelivery(item, { styleName = null } = {}) {
  if (!item?.delivery) return null;
  if (item.delivery.kind !== "sp_scroll") return { ...item.delivery };
  const itemName = createSPItemName(styleName, item.delivery.amount);
  return itemName ? { kind: "inventory", item_name: itemName } : null;
}

export function shopDeliveryLabel(item) {
  switch (item?.delivery?.kind) {
    case "inventory": return "Предмет появится в инвентаре";
    case "sp_scroll": return "Перед оплатой нужно выбрать изученный стиль";
    case "active_effect": return "Эффект начнёт действовать сразу после оплаты";
    case "order": return "Оплата создаст заявку для ручного рассмотрения";
    default: return "Способ выдачи не определён";
  }
}

export function shopPeriodKey(date = new Date()) {
  const value = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
