import assert from "node:assert/strict";
import test from "node:test";
import { createPurchaseNotice, shopLogChannelId } from "../utils/shopNotifier.js";

/**
 * Цены в базе никогда не обновлялись из файла: сидирование идёт через
 * `$setOnInsert`. Тест поднимает настоящий mongod, заводит каталог со старыми
 * ценами и проверяет, что ревизия их догоняет, а удалённые позиции уезжают в
 * архив, а не пропадают вместе с историей.
 */
async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch {
    return null;
  }
}

test("ревизия каталога догоняет цены и архивирует снятые позиции", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, getDB, closeDatabase } = await import("../utils/db.js");
  const { applyCatalogRevision, getShopItem, listShopCategories, refreshShopCatalog } =
    await import("../utils/shopCatalog.js");

  try {
    await connectDatabase();
    const db = getDB();
    const items = db.collection("shop_catalog_items");

    // Возвращаем состояние «как в проде до правки»: старая цена и живой артефакт.
    await items.updateOne({ id: "ap_tome_25" }, { $set: { price_yen: 250000 } });
    await items.insertOne({
      id: "weak_artifact_order",
      category: "artifacts",
      name: "Заказ слабого артефакта",
      price_yen: 5000000,
      enabled: true,
      archived: false,
      version: 1,
      delivery: { kind: "order", order_type: "artifact", tier: "weak" },
    });
    await db.collection("shop_catalog_meta").deleteMany({});

    const first = await applyCatalogRevision(db);
    assert.equal(first.applied, true, "ревизия должна примениться");
    assert.ok(first.changes >= 2, `изменений слишком мало: ${first.changes}`);

    await refreshShopCatalog(db);

    // Цена догнала файл.
    assert.equal((await items.findOne({ id: "ap_tome_25" })).price_yen, 20000000);
    assert.equal(getShopItem("ap_tome_25").price_yen, 20000000);

    // Артефакт архивирован, но документ на месте — история покупок цела.
    const artifact = await items.findOne({ id: "weak_artifact_order" });
    assert.equal(artifact.archived, true);
    assert.equal(artifact.enabled, false);
    assert.ok(artifact, "документ не должен удаляться");
    assert.equal(getShopItem("weak_artifact_order"), null, "с витрины товар убран");

    // Раздела артефактов в магазине больше нет.
    assert.equal(listShopCategories().some((c) => c.id === "artifacts"), false);

    // Повторный запуск ничего не делает: админские правки не затираются.
    await items.updateOne({ id: "ap_tome_25" }, { $set: { price_yen: 777 } });
    const second = await applyCatalogRevision(db);
    assert.equal(second.applied, false, "ревизия не должна применяться дважды");
    assert.equal((await items.findOne({ id: "ap_tome_25" })).price_yen, 777);

    // Автоматические изменения попали в тот же журнал, что и ручные.
    const audit = await db.collection("shop_catalog_audit")
      .find({ admin_id: "system" }).toArray();
    assert.ok(audit.length >= 2);
    assert.ok(audit.some((entry) => entry.action === "revision_price"));
    assert.ok(audit.some((entry) => entry.action === "revision_archive"));
  } finally {
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});

test("уведомление о покупке собирается для обычного товара и для заявки", () => {
  const item = { name: "Том боевой дисциплины", delivery: { kind: "inventory", item_name: "AP Tome (25)" } };

  const purchase = createPurchaseNotice({
    item,
    result: { price: 20000000, currency: "yen", delivery: "inventory" },
    playerId: "111",
    characterName: "Аяко",
    userId: "111",
  });
  const purchaseJson = JSON.stringify(purchase.map((c) => c.toJSON()));
  assert.ok(purchaseJson.includes("Покупка в магазине"));
  assert.ok(purchaseJson.includes("Аяко"));
  assert.ok(!purchaseJson.includes("shop-order"), "у обычной покупки не должно быть команд заявки");

  // Заявки уходят панелью с кнопками — она проверяется в shop-order-buttons.test.js.

  // Опасные символы в имени персонажа не должны ломать разметку.
  const nasty = createPurchaseNotice({
    item,
    result: { price: 1, currency: "krw" },
    playerId: "111",
    characterName: "**@everyone** `code`",
    userId: "111",
  });
  const nastyJson = JSON.stringify(nasty.map((c) => c.toJSON()));
  assert.ok(!nastyJson.includes("**@everyone**"), "разметка должна быть экранирована");
});

test("канал уведомлений берётся из окружения, иначе — админский по умолчанию", () => {
  const original = process.env.SHOP_LOG_CHANNEL_ID;
  try {
    delete process.env.SHOP_LOG_CHANNEL_ID;
    assert.equal(shopLogChannelId(), "1494015049797206147");

    process.env.SHOP_LOG_CHANNEL_ID = "1234567890123";
    assert.equal(shopLogChannelId(), "1234567890123");

    // Мусор в переменной не должен отключать уведомления молча.
    process.env.SHOP_LOG_CHANNEL_ID = "не-айди";
    assert.equal(shopLogChannelId(), "1494015049797206147");
  } finally {
    if (original === undefined) delete process.env.SHOP_LOG_CHANNEL_ID;
    else process.env.SHOP_LOG_CHANNEL_ID = original;
  }
});
