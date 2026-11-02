import assert from "node:assert/strict";
import test from "node:test";
import { cooldownLabel } from "../utils/shopComponents.js";
import {
  isValidCooldown,
  normalizeCooldownHours,
  shopCooldownMs,
  validateShopCatalogItem,
} from "../utils/shopCatalog.js";

/**
 * Кулдаун — скользящее окно от последней покупки, в отличие от недельного
 * лимита, который считает покупки внутри календарной недели и обнуляется в
 * понедельник. Проверяем на настоящем mongod: подделать время покупки в
 * коллекции можно только имея базу.
 */
async function startMongo() {
  try {
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    return await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  } catch {
    return null;
  }
}

test("кулдаун считается в часах и валидируется", () => {
  assert.equal(shopCooldownMs({ cooldown_hours: 72 }), 72 * 60 * 60 * 1000);
  assert.equal(shopCooldownMs({ cooldown_hours: 0 }), 0);
  assert.equal(shopCooldownMs({}), 0, "без поля кулдауна нет");
  assert.equal(shopCooldownMs(null), 0);

  assert.equal(isValidCooldown(0), true);
  assert.equal(isValidCooldown(72), true);
  assert.equal(isValidCooldown(8760), true);
  assert.equal(isValidCooldown(8761), false, "больше года — почти наверняка опечатка");
  assert.equal(isValidCooldown(-1), false);
  assert.equal(isValidCooldown(1.5), false);
  assert.equal(isValidCooldown("нет"), false);

  // Мусор не должен превращаться в вечный запрет покупки.
  assert.equal(normalizeCooldownHours("абв"), 0);
  assert.equal(normalizeCooldownHours(-5), 0);
});

test("подпись кулдауна читается по-русски", () => {
  assert.equal(cooldownLabel(0), "нет");
  assert.equal(cooldownLabel(24), "1 сутки");
  assert.equal(cooldownLabel(72), "3 суток");
  assert.equal(cooldownLabel(168), "7 суток");
  assert.equal(cooldownLabel(1), "1 час");
  assert.equal(cooldownLabel(3), "3 часа");
  assert.equal(cooldownLabel(5), "5 часов");
});

test("админ не может завести товар с некорректным кулдауном", () => {
  const base = {
    id: "test_item",
    category: "scrolls",
    rarity: "rare",
    name: "Тест",
    description: "Описание",
    emoji: "📘",
    price_yen: 1000,
    weekly_limit: 1,
    stock: null,
    delivery: { kind: "inventory", item_name: "Test" },
  };

  assert.equal(validateShopCatalogItem({ ...base, cooldown_hours: 72 }).valid, true);
  assert.equal(validateShopCatalogItem({ ...base, cooldown_hours: 0 }).valid, true);
  assert.equal(validateShopCatalogItem(base).valid, true, "поле необязательное");

  assert.deepEqual(
    validateShopCatalogItem({ ...base, cooldown_hours: -5 }),
    { valid: false, reason: "invalid_cooldown" },
  );
  assert.deepEqual(
    validateShopCatalogItem({ ...base, cooldown_hours: 100000 }),
    { valid: false, reason: "invalid_cooldown" },
  );
});

test("вторая покупка в кулдауне не проходит, а после истечения проходит", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, getDB, closeDatabase } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const { purchaseShopItem } = await import("../utils/shopStore.js");
  const { getShopItem, shopPrice } = await import("../utils/shopCatalog.js");

  try {
    await connectDatabase();
    const db = getDB();

    await dm.createPlayer("rich", "rich", "Богач", null, 1, null);
    // Денег заведомо больше, чем нужно: проверяем именно кулдаун, а не баланс.
    await db.collection("players").updateOne(
      { id: "rich" },
      { $set: { yen: 5_000_000_000 } },
    );

    const item = getShopItem("ap_tome_25");
    assert.equal(item.cooldown_hours, 72, "у тома должен стоять кулдаун 3 суток");

    const buy = (operationId) => purchaseShopItem({
      operationId,
      playerId: "rich",
      userId: "rich",
      guildId: "g1",
      itemId: item.id,
      currency: "yen",
      expectedVersion: item.version,
      expectedPrice: shopPrice(item, "yen"),
    });

    const first = await buy("shop:cd-1");
    assert.equal(first.success, true, `первая покупка должна пройти: ${first.reason}`);

    const second = await buy("shop:cd-2");
    assert.equal(second.success, false, "вторая покупка обязана упереться в кулдаун");
    assert.equal(second.reason, "cooldown");
    assert.equal(second.cooldownHours, 72);
    assert.ok(second.retryAt > Math.floor(Date.now() / 1000), "время повтора в будущем");

    // Тот же operationId — это повтор той же покупки, а не новая: должен вернуть
    // прежний результат, а не отказ по кулдауну.
    const replay = await buy("shop:cd-1");
    assert.equal(replay.success, true, "идемпотентный повтор не должен ломаться о кулдаун");

    // Отодвигаем покупку на 73 часа назад — кулдаун истёк.
    await db.collection("shop_purchases").updateMany(
      { player_id: "rich", item_id: item.id },
      { $set: { created_at: new Date(Date.now() - 73 * 60 * 60 * 1000) } },
    );

    const third = await buy("shop:cd-3");
    assert.equal(third.success, true, `после истечения кулдауна покупка должна пройти: ${third.reason}`);

    // Здесь недельный лимит уже исчерпан (2 покупки на неделе) — и это тоже
    // должно быть видно: два правила работают вместе, срабатывает первое.
    const limited = await buy("shop:cd-limit");
    assert.equal(limited.success, false);
    assert.equal(limited.reason, "weekly_limit", "после кулдауна упираемся в недельный лимит");

    // Часы сервера ушли назад — это не должно превращаться в вечный запрет.
    // Чистим покупки полностью: у shop_purchases есть уникальный limit_key, и
    // правка period_key на месте дала бы конфликт индекса, а не проверку кулдауна.
    await db.collection("shop_purchases").deleteMany({ player_id: "rich", item_id: item.id });
    await db.collection("shop_purchases").insertOne({
      operation_id: "shop:synthetic-future",
      player_id: "rich",
      item_id: item.id,
      status: "completed",
      period_key: "2000-W01",
      created_at: new Date(Date.now() + 10 * 60 * 60 * 1000),
    });
    const fourth = await buy("shop:cd-4");
    assert.equal(fourth.success, true, `покупка из будущего не должна блокировать навсегда: ${fourth.reason}`);

    // У товара без кулдауна ограничения нет — упереться можно только в лимит.
    const noCooldown = getShopItem("civilian_prosthesis");
    assert.equal(noCooldown.cooldown_hours, 0);
  } finally {
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});
