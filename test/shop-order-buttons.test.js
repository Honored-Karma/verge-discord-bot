import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrderReviewComponents,
  createOrderSessionState,
  ORDER_APPROVE_ID,
  ORDER_REJECT_ID,
  SHOP_ORDER_NAMESPACE,
  __testables,
} from "../interactions/shopOrderSession.js";
import {
  buildModalCustomId,
  clearInteractionHandlers,
  parseModalCustomId,
  registerInteractionHandler,
  routeComponentInteraction,
  routeModalInteraction,
} from "../utils/interactionRouter.js";

const STATE = createOrderSessionState({
  publicId: "AB12CD34EF",
  itemName: "Контролируемая мутация",
  playerId: "111",
  characterName: "Аяко",
  userId: "111",
  price: 150_000_000,
  currency: "yen",
  delivery: "заявка",
});

function fakeInteraction({ customId, userId = "admin", messageId = "m1" } = {}) {
  const calls = [];
  return {
    calls,
    customId,
    user: { id: userId },
    message: messageId ? { id: messageId } : null,
    replied: false,
    deferred: false,
    async reply(payload) { calls.push(["reply", payload]); },
    async followUp(payload) { calls.push(["followUp", payload]); },
    async update(payload) { calls.push(["update", payload]); },
    async editReply(payload) { calls.push(["editReply", payload]); },
    async deferUpdate() { calls.push(["deferUpdate"]); },
    async showModal(modal) { calls.push(["showModal", modal.toJSON()]); },
    isStringSelectMenu() { return false; },
  };
}

test("панель заявки несёт обе кнопки решения", () => {
  const json = createOrderReviewComponents(STATE)[0].toJSON();
  const text = JSON.stringify(json);

  assert.ok(text.includes("AB12CD34EF"), "нет номера заявки");
  assert.ok(text.includes("Контролируемая мутация"));
  assert.ok(text.includes("150"), "нет цены");

  const row = json.components.find((component) => component.type === 1);
  const ids = row.components.map((button) => button.custom_id);
  assert.deepEqual(ids, [ORDER_APPROVE_ID, ORDER_REJECT_ID]);
  assert.equal(row.components.every((button) => button.disabled !== true), true);

  // После решения кнопки должны глушиться.
  const disabled = createOrderReviewComponents(STATE, { disabled: true })[0].toJSON();
  const disabledRow = disabled.components.find((component) => component.type === 1);
  assert.equal(disabledRow.components.every((button) => button.disabled === true), true);
});

test("решение по заявке доступно любому админу, а не владельцу сообщения", async () => {
  clearInteractionHandlers();
  const handled = [];

  // Панель общая: право проверяет authorize, а не совпадение с owner_id.
  registerInteractionHandler(SHOP_ORDER_NAMESPACE, {
    authorize: async ({ interaction }) => interaction.user.id.startsWith("admin"),
    handleComponent: async ({ interaction }) => { handled.push(interaction.user.id); },
  });

  const session = {
    message_id: "m1",
    namespace: SHOP_ORDER_NAMESPACE,
    // Владелец — покупатель, но нажимать должен админ.
    owner_id: "111",
    status: "open",
    revision: 1,
    state: STATE,
  };
  const loadSession = async () => session;

  const admin = fakeInteraction({ customId: ORDER_APPROVE_ID, userId: "admin-7" });
  assert.equal(await routeComponentInteraction(admin, { loadSession }), true);
  assert.deepEqual(handled, ["admin-7"], "админ должен пройти, хотя он не владелец");

  const player = fakeInteraction({ customId: ORDER_APPROVE_ID, userId: "111" });
  assert.equal(await routeComponentInteraction(player, { loadSession }), true);
  assert.equal(handled.length, 1, "покупатель не должен решать свою заявку");
  assert.equal(player.calls[0][0], "reply");

  clearInteractionHandlers();
});

test("отказ спрашивает причину модалкой, привязанной к сообщению", async () => {
  clearInteractionHandlers();
  const { shopOrderInteractionHandler } = await import("../interactions/shopOrderSession.js");
  registerInteractionHandler(SHOP_ORDER_NAMESPACE, shopOrderInteractionHandler);

  const session = {
    message_id: "m1",
    namespace: SHOP_ORDER_NAMESPACE,
    owner_id: "111",
    status: "open",
    revision: 1,
    state: STATE,
  };

  const interaction = fakeInteraction({ customId: ORDER_REJECT_ID, userId: "admin-1" });
  await shopOrderInteractionHandler.handleComponent({ interaction, session });

  const [[kind, modal]] = interaction.calls;
  assert.equal(kind, "showModal", "нажатие «Отклонить» должно открыть форму");
  // Модалку нельзя показать после deferUpdate — проверяем, что его не было.
  assert.equal(interaction.calls.some(([name]) => name === "deferUpdate"), false);

  assert.equal(modal.custom_id, buildModalCustomId(SHOP_ORDER_NAMESPACE, "reject", "m1"));
  assert.deepEqual(parseModalCustomId(modal.custom_id), {
    namespace: SHOP_ORDER_NAMESPACE,
    action: "reject",
    messageId: "m1",
  });

  const field = modal.components[0].components[0];
  assert.equal(field.required, true, "причина обязательна");
  assert.ok(field.max_length <= 400);

  clearInteractionHandlers();
});

test("модалка отказа маршрутизируется по сообщению, а не по коллектору", async () => {
  clearInteractionHandlers();
  const seen = [];
  registerInteractionHandler(SHOP_ORDER_NAMESPACE, {
    authorize: async () => true,
    handleComponent: async () => {},
    handleModal: async ({ action, session }) => { seen.push([action, session.message_id]); },
  });

  const customId = buildModalCustomId(SHOP_ORDER_NAMESPACE, "reject", "m1");
  const modal = fakeInteraction({ customId, messageId: null });
  const session = {
    message_id: "m1",
    namespace: SHOP_ORDER_NAMESPACE,
    owner_id: "111",
    status: "open",
    revision: 1,
    state: STATE,
  };

  assert.equal(await routeModalInteraction(modal, { loadSession: async () => session }), true);
  assert.deepEqual(seen, [["reject", "m1"]]);

  clearInteractionHandlers();
});

test("причины отказа объяснены человеческим языком", () => {
  const { failureMessage } = __testables;
  for (const reason of [
    "order_not_found", "already_resolved", "refund_failed", "invalid_resolution", "непонятно",
  ]) {
    assert.ok(failureMessage(reason).length > 20, `${reason}: слишком короткий текст`);
  }
  assert.match(failureMessage("refund_failed"), /не повторяйте/i);
});

test("карточка решения показывает кто решил и причину отказа", () => {
  const { createResolutionComponents } = __testables;

  const rejected = createResolutionComponents(STATE, {
    result: { status: "rejected", price: 150_000_000, currency: "yen" },
    adminId: "admin-9",
    reason: "нет сюжетного основания",
  });
  const rejectedText = JSON.stringify(rejected.map((c) => c.toJSON()));
  assert.ok(rejectedText.includes("отклонена"));
  assert.ok(rejectedText.includes("admin-9"), "видно кто решил");
  assert.ok(rejectedText.includes("нет сюжетного основания"));
  assert.ok(rejectedText.includes("возвращено"));

  const approved = createResolutionComponents(STATE, {
    result: { status: "fulfilled" },
    adminId: "admin-9",
    reason: "Выдано администратором",
  });
  const approvedText = JSON.stringify(approved.map((c) => c.toJSON()));
  assert.ok(approvedText.includes("выдана"));
  assert.ok(!approvedText.includes("возвращено"), "при выдаче возврата нет");
});
