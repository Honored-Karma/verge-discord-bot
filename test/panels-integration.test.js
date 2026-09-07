import assert from "node:assert/strict";
import test from "node:test";

/**
 * Панели проверяем на настоящем mongod: рендер читает игрока, инвентарь и
 * историю из базы, и именно на таком стыке пряталась поломка рейтинга
 * ($documentNumber падал только на живом сервере, моки её не видели).
 */
async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch {
    return null;
  }
}

const USER = { id: "u1", username: "user1" };
const fakeUser = {
  id: USER.id,
  username: USER.username,
  // Аватар намеренно пустой: тест не должен ходить в сеть — карточка нарисует
  // инициал, а рендер останется детерминированным.
  displayAvatarURL: () => null,
};

test("панели профиля и инвентаря рендерятся на живой базе", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const { createProfileSessionState, renderProfilePage } = await import("../interactions/profileSession.js");
  const {
    createInventorySessionState,
    renderInventory,
    visibleInventory,
    useErrorMessage,
  } = await import("../interactions/inventorySession.js");

  try {
    await connectDatabase();
    await dm.createPlayer("u1", "user1", "Аяко Мидзуки", null, 1, "Тень Пепла");
    await dm.addStyle("Муай Тай", "admin");
    await dm.giveStyle("u1", "Муай Тай", 1200, "admin");
    await dm.addCurrency("u1", "krw", 500000, "admin");
    await dm.giveItem("u1", "AP Tome (50)", 3, "admin");
    await dm.giveItem("u1", "Артефакт «Пепел»", 1, "admin");

    // ── Профиль: все три страницы ────────────────────────────────────────────
    const profileState = createProfileSessionState({
      playerId: "u1",
      targetUserId: USER.id,
      slot: 1,
    });

    for (const page of ["main", "physical", "history"]) {
      const view = await renderProfilePage({ ...profileState, page }, fakeUser);
      assert.ok(view, `${page}: рендер вернул null`);
      // Компоненты обязаны собираться в валидный payload Discord.
      const json = view.components.map((container) => container.toJSON());
      assert.ok(json.length > 0, `${page}: пустые компоненты`);
      assert.ok(JSON.stringify(json).includes("Аяко"), `${page}: нет имени персонажа`);
    }

    // Карточка есть только у основной страницы: у истории её быть не должно,
    // иначе канвас гоняется зря.
    const main = await renderProfilePage({ ...profileState, page: "main" }, fakeUser);
    const history = await renderProfilePage({ ...profileState, page: "history" }, fakeUser);
    assert.equal(main.files.length, 1, "у основной страницы должна быть картинка");
    assert.equal(history.files.length, 0, "у истории картинки быть не должно");

    // Физа не зарегистрирована — картинки нет, но страница рисуется.
    const physicalEmpty = await renderProfilePage({ ...profileState, page: "physical" }, fakeUser);
    assert.equal(physicalEmpty.files.length, 0);

    await dm.registerPhysicalStats("u1", {
      punch_strength_kg: 180,
      lifting_strength_kg: 240,
      speed_kmh: 38,
      stamina_percent: 82,
      reaction_ms: 120,
    }, "admin");
    const physicalFilled = await renderProfilePage({ ...profileState, page: "physical" }, fakeUser);
    assert.equal(physicalFilled.files.length, 1, "после регистрации должна появиться картинка");

    // Удалённый персонаж не должен ронять панель.
    const ghost = await renderProfilePage({ ...profileState, player_id: "нет-такого" }, fakeUser);
    assert.equal(ghost, null);

    // ── Инвентарь ────────────────────────────────────────────────────────────
    const inventoryState = createInventorySessionState({
      playerId: "u1",
      characterName: "Аяко Мидзуки",
      avatarUrl: null,
      canUse: true,
    });

    const list = await renderInventory(inventoryState);
    assert.ok(JSON.stringify(list.components.map((c) => c.toJSON())).includes("AP Tome"));
    assert.equal(list.inventory.length, 2);

    const detail = await renderInventory({
      ...inventoryState,
      view: "detail",
      selected_item: "AP Tome (50)",
    });
    assert.ok(JSON.stringify(detail.components.map((c) => c.toJSON())).includes("AP Tome"));

    // Выбранный предмет исчез — панель должна показать список, а не упасть.
    const stale = await renderInventory({
      ...inventoryState,
      view: "detail",
      selected_item: "Которого нет",
    });
    assert.ok(stale.components.length > 0);

    // Пустой инвентарь.
    const other = "u2";
    await dm.createPlayer(other, "user2", "Борис", null, 1, null);
    const empty = await renderInventory({ ...inventoryState, player_id: other });
    assert.equal(empty.inventory.length, 0);
    assert.ok(JSON.stringify(empty.components.map((c) => c.toJSON())).length > 10);

    // Предметы с нулевым количеством и пустым именем в список не попадают.
    assert.deepEqual(
      visibleInventory([
        { item_name: "AP Tome (50)", qty: 2 },
        { item_name: "  ", qty: 5 },
        { item_name: "Пустой", qty: 0 },
      ]).map((item) => item.item_name),
      ["AP Tome (50)"],
    );

    // Каждая причина отказа переведена на человеческий язык.
    for (const reason of [
      "not_found", "insufficient_quantity", "style_not_found",
      "style_not_owned", "not_usable", "invalid_quantity", "неизвестно",
    ]) {
      const message = useErrorMessage({ reason, available: 2 });
      assert.ok(message.length > 10, `${reason}: нет понятного текста`);
    }
  } finally {
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});

test("миниатюра аватара не может уронить панель", async () => {
  const { safeAvatarUrl, DEFAULT_AVATAR } = await import("../utils/avatarUrl.js");

  // Всё, что не похоже на ссылку, заменяется дефолтом — билдер Discord
  // валидирует аргумент и бросает исключение на остальном.
  for (const broken of [null, undefined, "", "   ", 42, {}, [], "не ссылка", "ftp://x/y"]) {
    assert.equal(safeAvatarUrl(broken), DEFAULT_AVATAR, `не обработано: ${JSON.stringify(broken)}`);
  }

  // Валидные ссылки проходят как есть.
  assert.equal(
    safeAvatarUrl("https://cdn.discordapp.com/avatars/1/a.png"),
    "https://cdn.discordapp.com/avatars/1/a.png",
  );
  assert.equal(safeAvatarUrl("  https://example.com/a.png  "), "https://example.com/a.png");
  assert.equal(safeAvatarUrl(null, "https://custom/fallback.png"), "https://custom/fallback.png");
});
