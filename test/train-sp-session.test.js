import assert from "node:assert/strict";
import test from "node:test";

/**
 * Выбор стиля перед тренировкой раньше жил в коллекторе на три минуты: список
 * снимался один раз, поэтому после рестарта кнопки умирали, а отобранный стиль
 * оставался в меню. Проверяем на настоящем mongod, что список читается заново.
 */
async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch {
    return null;
  }
}

test("меню стилей читает список заново и листается через сессию", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const {
    createTrainSpSessionState,
    renderStylePicker,
    TRAIN_SP_NAMESPACE,
  } = await import("../interactions/trainSpSession.js");

  try {
    await connectDatabase();
    await dm.createPlayer("s1", "s1", "Аяко", null, 1, null);

    const state = createTrainSpSessionState({
      playerId: "s1",
      slot: 1,
      characterName: "Аяко",
    });
    assert.equal(state.page, 0);
    assert.equal(TRAIN_SP_NAMESPACE, "train_sp");

    // Стилей нет — панель обязана объяснить это, а не показать пустое меню.
    const empty = await renderStylePicker(state);
    assert.equal(empty.styles.length, 0);
    assert.ok(
      JSON.stringify(empty.components.map((c) => c.toJSON())).includes("Нет изученных стилей"),
    );

    await dm.addStyle("Муай Тай", "admin");
    await dm.addStyle("Айкидо", "admin");
    await dm.giveStyle("s1", "Муай Тай", 1200, "admin");
    await dm.giveStyle("s1", "Айкидо", 300, "admin");

    // Тот же state — но список уже другой: он читается из базы на каждый показ.
    const filled = await renderStylePicker(state);
    assert.equal(filled.styles.length, 2);
    const text = JSON.stringify(filled.components.map((c) => c.toJSON()));
    assert.ok(text.includes("Муай Тай"));
    assert.ok(text.includes("Айкидо"));

    // Стиль отобрали, пока меню было открыто — он исчезает из выдачи.
    const aikido = await dm.getStyleByName("Айкидо");
    await dm.deleteStyle(aikido.id, "admin");
    const afterRemoval = await renderStylePicker(state);
    assert.equal(afterRemoval.styles.length, 1);
    assert.ok(
      !JSON.stringify(afterRemoval.components.map((c) => c.toJSON())).includes("Айкидо"),
      "удалённый стиль не должен оставаться в меню",
    );

    // Страница за пределами диапазона не должна ломать рендер.
    const beyond = await renderStylePicker({ ...state, page: 99 });
    assert.ok(beyond.components.length > 0);

    // Выключенное состояние собирается — им гасится панель.
    const disabled = await renderStylePicker(state, { disabled: true });
    assert.ok(disabled.components.length > 0);
  } finally {
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});

test("команда train-sp не поднимает коллектор и сохраняет обработчик модалки", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("commands/train-sp.js", "utf8");

  assert.ok(
    !source.includes("createMessageComponentCollector"),
    "коллектор должен быть заменён сессией",
  );
  assert.ok(source.includes("TRAIN_SP_NAMESPACE"), "сессия должна создаваться");

  // Модалка открывается из компонента и её customId несёт слот и стиль, поэтому
  // разбор формы остаётся на легаси-пути и переживает рестарт сам по себе.
  const command = await import("../commands/train-sp.js");
  assert.equal(typeof command.handlesModal, "function");
  assert.equal(typeof command.handleModalSubmit, "function");
  assert.equal(command.handlesModal({ customId: "train_sp_modal:1:5" }), true);
  assert.equal(command.handlesModal({ customId: "что-то_другое" }), false);
});
