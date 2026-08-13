import assert from "node:assert/strict";
import test from "node:test";
import {
  getShopCategory,
  getShopItem,
  listShopCategories,
  listShopItems,
  resolveShopDelivery,
  shopPeriodKey,
  shopPrice,
  validateShopCatalogItem,
} from "../utils/shopCatalog.js";
import {
  createShopCategoryComponents,
  createShopConfirmationComponents,
  createShopHomeComponents,
  createShopItemComponents,
  createShopOrderResolutionComponents,
  createShopOrderResolutionReceipt,
  createShopOrdersComponents,
  createShopReceiptComponents,
  createShopStatusComponents,
  createShopStyleComponents,
} from "../utils/shopComponents.js";
import {
  createShopAdminListComponents,
  createShopAdminHistoryComponents,
  createShopAdminItemComponents,
  createShopAdminPreviewComponents,
  createShopAdminReceiptComponents,
} from "../utils/shopAdminComponents.js";

const avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
const balances = { yen: 100_000_000, krw: 940_000_000 };

test("shop catalog contains the intended economy tiers", () => {
  const categories = listShopCategories();
  const items = listShopItems();
  assert.equal(new Set(categories.map((category) => category.id)).size, categories.length);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.ok(items.some((item) => item.delivery.kind === "inventory"));
  assert.ok(items.some((item) => item.delivery.kind === "active_effect"));
  assert.ok(items.some((item) => item.delivery.kind === "order"));
  assert.equal(getShopItem("weak_artifact_order").price_yen, 5_000_000);
  assert.equal(getShopItem("medium_artifact_order").price_yen, 15_000_000);
  assert.equal(getShopItem("strong_artifact_order").price_yen, 50_000_000);
});

test("shop prices, style delivery and weekly periods are deterministic", () => {
  const item = getShopItem("sp_scroll_20");
  assert.equal(shopPrice(item, "yen"), 400_000);
  assert.equal(shopPrice(item, "krw"), 3_760_000);
  assert.deepEqual(resolveShopDelivery(item, { styleName: "Muay Thai" }), {
    kind: "inventory",
    item_name: "SP Scroll: Muay Thai (20)",
  });
  assert.equal(resolveShopDelivery(item), null);
  assert.equal(shopPeriodKey(new Date("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(shopPeriodKey(new Date("2026-12-31T12:00:00Z")), "2026-W53");
});

test("builds every shop and order-review interface state", () => {
  const categories = listShopCategories();
  const scrollCategory = getShopCategory("scrolls");
  const scrollItems = listShopItems("scrolls");
  const item = getShopItem("sp_scroll_20");
  const artifact = getShopItem("strong_artifact_order");
  const details = {
    publicId: "ABC123DEF4",
    itemName: artifact.name,
    userId: "123456789012345678",
    price: artifact.price_yen,
    currency: "yen",
  };
  const states = [
    ...createShopHomeComponents({
      characterName: "Hero **test**",
      avatarUrl,
      balances,
      currency: "yen",
      categories,
      effects: [{ bonus_percent: 15, expires_at: new Date("2026-08-15T12:00:00Z") }],
    }),
    ...createShopCategoryComponents({
      characterName: "Hero",
      avatarUrl,
      balances,
      currency: "yen",
      category: scrollCategory,
      items: scrollItems,
    }),
    ...createShopItemComponents({
      characterName: "Hero",
      avatarUrl,
      balance: balances.yen,
      currency: "yen",
      item,
      selectedStyle: { name: "Muay Thai" },
    }),
    ...createShopStyleComponents({
      item,
      styles: [{ id: 1, name: "Muay Thai", sp: 30 }],
    }),
    ...createShopConfirmationComponents({
      characterName: "Hero",
      avatarUrl,
      balance: balances.yen,
      currency: "yen",
      item: artifact,
    }),
    ...createShopReceiptComponents({
      item: artifact,
      result: {
        delivery: "order",
        orderId: details.publicId,
        price: details.price,
        currency: details.currency,
        balance: balances.yen - details.price,
        operationId: "shop:test-operation",
      },
    }),
    ...createShopOrdersComponents({
      orders: [{
        public_id: details.publicId,
        item_name: details.itemName,
        status: "rejected",
        created_at: new Date("2026-08-14T12:00:00Z"),
        resolution_reason: "Способность не соответствует правилам",
      }],
    }),
    ...createShopOrderResolutionComponents({
      details,
      action: "reject",
      reason: "Не согласованы ограничения",
    }),
    ...createShopOrderResolutionReceipt({
      result: { ...details, status: "rejected", balance: balances.yen },
    }),
    ...createShopStatusComponents("Проверка", "Состояние магазина", "neutral"),
  ];
  for (const state of states) assert.doesNotThrow(() => state.toJSON());
});

test("validates administrator-created catalog items", () => {
  const item = {
    id: "admin_test_item",
    name: "Тестовый предмет",
    category: "scrolls",
    rarity: "rare",
    emoji: "📦",
    description: "Предмет для проверки управляемого каталога.",
    price_yen: 123_456,
    weekly_limit: 3,
    stock: 10,
    delivery: { kind: "inventory", item_name: "AP Tome (25)" },
  };
  assert.deepEqual(validateShopCatalogItem(item), { valid: true });
  assert.equal(validateShopCatalogItem({ ...item, stock: -1 }).reason, "invalid_stock");
  assert.equal(validateShopCatalogItem({
    ...item,
    delivery: {
      kind: "active_effect",
      effect_key: "bad",
      applies_to: ["ap"],
      bonus_percent: 500,
      duration_seconds: 3600,
    },
  }).reason, "invalid_delivery");
});

test("builds catalog moderation states and sold-out item state", () => {
  const item = { ...getShopItem("ap_tome_25"), stock: 0, sold_count: 7, version: 4 };
  const changed = { ...item, stock: 20, price_yen: 300_000, version: 5 };
  const states = [
    ...createShopAdminListComponents(Array.from({ length: 21 }, (_, index) => ({
      ...item,
      id: `admin_item_${index}`,
      name: `Товар ${index}`,
    }))),
    ...createShopAdminHistoryComponents([{
      action: "stock_set",
      item_id: item.id,
      admin_id: "123456789012345678",
      created_at: new Date("2026-08-14T12:00:00Z"),
      before: { ...item, stock: 0 },
      after: { ...item, stock: 20 },
    }]),
    ...createShopAdminItemComponents(item),
    ...createShopAdminPreviewComponents({ action: "edit", before: item, after: changed }),
    ...createShopAdminPreviewComponents({ action: "archive", before: item, after: { ...item, archived: true, enabled: false } }),
    ...createShopAdminReceiptComponents({ action: "stock", item: changed }),
    ...createShopItemComponents({
      characterName: "Hero",
      avatarUrl,
      balance: balances.yen,
      currency: "yen",
      item,
    }),
  ];
  const json = states.map((state) => state.toJSON());
  assert.equal(json.length, states.length);
  const soldOutButton = json.at(-1).components
    .flatMap((component) => component.components || [])
    .find((component) => component.custom_id === "shop_buy");
  assert.equal(soldOutButton.disabled, true);
  assert.doesNotThrow(() => createShopHomeComponents({
    characterName: "Hero",
    avatarUrl,
    balances,
    currency: "yen",
    categories: [],
  })[0].toJSON());
  assert.doesNotThrow(() => createShopCategoryComponents({
    characterName: "Hero",
    avatarUrl,
    balances,
    currency: "yen",
    category: getShopCategory("scrolls"),
    items: [],
  })[0].toJSON());
  assert.doesNotThrow(() => createShopCategoryComponents({
    characterName: "Hero",
    avatarUrl,
    balances,
    currency: "yen",
    category: getShopCategory("scrolls"),
    items: Array.from({ length: 26 }, (_, index) => ({
      ...getShopItem("ap_tome_25"),
      id: `page_item_${index}`,
      name: `Товар ${index}`,
    })),
    page: 1,
  })[0].toJSON());
});
