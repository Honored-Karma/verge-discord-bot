import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags } from "discord.js";

function interaction(messageId, customId, options = {}) {
  const calls = [];
  return { calls, customId, message: { id: messageId }, guildId: "test-guild", channelId: "test-channel",
    user: { id: "sender", username: "sender", tag: "sender", displayAvatarURL: () => null }, client: {},
    async reply(payload) { calls.push(["reply", payload]); this.replied = true; return { id: "private" }; },
    async followUp(payload) { calls.push(["followUp", payload]); },
    async update(payload) { calls.push(["update", payload]); },
    async editReply(payload) { calls.push(["editReply", payload]); },
    async deferUpdate() { this.deferred = true; },
    async showModal(payload) { calls.push(["modal", payload]); },
    fields: { getTextInputValue: () => "50" },
    isStringSelectMenu: () => false,
    ...options };
}

test("persistent response flows: editable transfer, replay, permissions, exchange recovery and profile fallback", { timeout: 120000 }, async (t) => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase, getDB } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const sessions = await import("../utils/interactionSessions.js");
  const router = await import("../utils/interactionRouter.js");
  const pay = await import("../interactions/paySession.js");
  const exchange = await import("../interactions/exchangeSession.js");
  const profile = await import("../interactions/profileSession.js");
  const bank = await import("../utils/bankingComponents.js");
  const { installModernResponseAdapter } = await import("../utils/modernResponses.js");
  const createSession = (messageId, namespace, state) => sessions.createInteractionSession({ messageId, namespace,
    ownerId: "sender", guildId: "test-guild", channelId: "test-channel", state });
  try {
    await connectDatabase();
    await dm.createPlayer("sender", "sender", "Имя Ошибка", null, 1, "Атрибут");
    await dm.createPlayer("recipient", "recipient", "Получатель", null, 1);
    await getDB().collection("players").updateOne({ id: "sender" }, { $set: { yen: 1000, krw: 0 } });
    router.registerInteractionHandler("pay", pay.payInteractionHandler);
    router.registerInteractionHandler("exchange", exchange.exchangeInteractionHandler);
    router.registerInteractionHandler("profile", profile.profileInteractionHandler);

    await t.test("amount changes only the draft; stale/foreign forms cannot change it", async () => {
      const state = pay.createPaySessionState({ senderId: "sender", recipientId: "recipient", recipientSlot: 1,
        senderName: "Отправитель", recipientName: "Получатель", currency: "yen", amount: 100 });
      await createSession("pay-1", "pay", state);
      const foreign = interaction("pay-1", bank.PAY_AMOUNT_ID, { user: { id: "intruder" } });
      await router.routeComponentInteraction(foreign);
      assert.equal(foreign.calls[0][0], "reply");
      assert.ok(foreign.calls[0][1].flags & MessageFlags.Ephemeral);
      const owner = interaction("pay-1", bank.PAY_AMOUNT_ID);
      await router.routeComponentInteraction(owner);
      const customId = owner.calls[0][1].toJSON().custom_id;
      const modal = interaction("pay-1", customId);
      await router.routeModalInteraction(modal);
      assert.equal((await sessions.getInteractionSession("pay-1")).state.amount, 50);
      assert.equal((await dm.getPlayer("sender")).yen, 1000);
      const stale = interaction("pay-1", customId, { fields: { getTextInputValue: () => "999" } });
      await router.routeModalInteraction(stale);
      assert.equal((await sessions.getInteractionSession("pay-1")).state.amount, 50);
      const wrongNamespace = interaction("pay-1", "exchange|amount:1|pay-1");
      // A handler with modal support must never receive another namespace's session.
      router.registerInteractionHandler("test-modal", { handleModal() { assert.fail("cross-namespace dispatch"); } });
      wrongNamespace.customId = "test-modal|amount|pay-1";
      assert.equal(await router.routeModalInteraction(wrongNamespace), true);
    });

    await t.test("simultaneous confirmation debits once and a closed receipt replays", async () => {
      await Promise.all([router.routeComponentInteraction(interaction("pay-1", bank.PAY_CONFIRM_ID)),
        router.routeComponentInteraction(interaction("pay-1", bank.PAY_CONFIRM_ID))]);
      assert.equal((await dm.getPlayer("sender")).yen, 950);
      assert.equal((await dm.getPlayer("recipient")).yen, 49);
      const replay = interaction("pay-1", bank.PAY_CONFIRM_ID);
      await router.routeComponentInteraction(replay);
      assert.match(JSON.stringify(replay.calls), /Перевод выполнен/);
      assert.equal((await dm.getPlayer("sender")).yen, 950);
      assert.equal(await getDB().collection("operation_receipts").countDocuments({ _id: "pay:pay-1" }), 1);
    });

    await t.test("unknown financial outcomes disable editing and cancellation", async () => {
      const state = { ...(await sessions.getInteractionSession("pay-1")).state, operation_pending: true };
      await createSession("pending", "pay", state);
      for (const customId of [bank.PAY_AMOUNT_ID, bank.PAY_CANCEL_ID]) {
        const attempt = interaction("pending", customId);
        await router.routeComponentInteraction(attempt);
        assert.match(JSON.stringify(attempt.calls), /Результат проверяется/);
      }
      assert.equal((await sessions.getInteractionSession("pending")).status, "open");
    });

    await t.test("a failed amount edit requires showing the new quote before any debit", async () => {
      const state = pay.createPaySessionState({ senderId: "sender", recipientId: "recipient", recipientSlot: 1,
        senderName: "Имя", recipientName: "Получатель", currency: "yen", amount: 100 });
      await createSession("failed-quote", "pay", state);
      const edit = interaction("failed-quote", "pay|amount:1|failed-quote", {
        async editReply() { throw new Error("test: quote not delivered"); },
      });
      await assert.rejects(router.routeModalInteraction(edit), /quote not delivered/);
      assert.equal((await sessions.getInteractionSession("failed-quote")).state.quote_pending, true);
      const balance = (await dm.getPlayer("sender")).yen;
      const refresh = interaction("failed-quote", bank.PAY_CONFIRM_ID);
      await router.routeComponentInteraction(refresh);
      assert.equal((await dm.getPlayer("sender")).yen, balance);
      assert.equal((await sessions.getInteractionSession("failed-quote")).state.quote_pending, false);
      assert.match(JSON.stringify(refresh.calls), /50/);
      await router.routeComponentInteraction(interaction("failed-quote", bank.PAY_CANCEL_ID));
    });

    await t.test("exchange uses the same session/receipt protocol and survives failed Discord edits", async () => {
      const state = exchange.createExchangeSessionState({ playerId: "sender", currency: "yen", amount: 100,
        characterName: "Отправитель", avatarUrl: null });
      await createSession("exchange-1", "exchange", state);
      const failedEdit = interaction("exchange-1", bank.EXCHANGE_CONFIRM_ID, { async editReply() { throw new Error("test: Discord unavailable"); } });
      await router.routeComponentInteraction(failedEdit);
      assert.equal((await dm.getPlayer("sender")).yen, 850);
      assert.equal((await dm.getPlayer("sender")).krw, 940);
      assert.match(JSON.stringify(failedEdit.calls), /Обмен выполнен/);
      const replay = interaction("exchange-1", bank.EXCHANGE_CONFIRM_ID);
      await router.routeComponentInteraction(replay);
      assert.match(JSON.stringify(replay.calls), /Обмен выполнен/);
      const result = await dm.exchangeCurrency("sender", "yen", 100, "exchange:exchange-1");
      assert.equal(result.success, true);
      assert.equal((await dm.getPlayer("sender")).yen, 850);
      assert.equal(await getDB().collection("operation_receipts").countDocuments({ _id: "exchange:exchange-1" }), 1);
    });

    await t.test("expired, deleted and wrong-guild panels never perform an operation", async () => {
      const state = exchange.createExchangeSessionState({ playerId: "sender", currency: "yen", amount: 100, characterName: "Имя", now: 0 });
      await createSession("expired", "exchange", state);
      const expired = interaction("expired", bank.EXCHANGE_CONFIRM_ID);
      await router.routeComponentInteraction(expired);
      assert.match(JSON.stringify(expired.calls), /Сессия обмена завершена/);
      const deleted = interaction("deleted", bank.EXCHANGE_CONFIRM_ID);
      assert.equal(await router.routeComponentInteraction(deleted), true);
      assert.match(JSON.stringify(deleted.calls), /exchange/);
      const wrongGuild = interaction("exchange-1", bank.EXCHANGE_CONFIRM_ID, { guildId: "other-guild" });
      await router.routeComponentInteraction(wrongGuild);
      assert.match(JSON.stringify(wrongGuild.calls), /чужая квитанция/);
      assert.equal((await dm.getPlayer("sender")).yen, 850);
    });

    await t.test("failed image rendering leaves full text; text mode skips rendering", async () => {
      await dm.addStyle("Стиль", "test-admin");
      await dm.giveStyle("sender", "Стиль", 123, "test-admin");
      const state = profile.createProfileSessionState({ playerId: "sender", targetUserId: "sender", slot: 1 });
      const failingRender = async () => { throw new Error("test: renderer unavailable"); };
      const view = await profile.renderProfilePage(state, { displayAvatarURL: () => null }, { renderMain: failingRender });
      assert.equal(view.files.length, 0);
      for (const value of ["Множители", "Стиль", "123", "850", "940"]) assert.ok(JSON.stringify(view.components).includes(value));
      const text = await profile.renderProfilePage({ ...state, text_mode: true }, null, { renderMain: () => assert.fail("text mode rendered an image") });
      assert.equal(text.files.length, 0);
      await createSession("profile-1", "profile", state);
      const toggle = interaction("profile-1", "profile_text");
      installModernResponseAdapter(toggle);
      await router.routeComponentInteraction(toggle);
      assert.equal((await sessions.getInteractionSession("profile-1")).state.text_mode, true);
      assert.ok(toggle.calls.find(([method]) => method === "editReply")[1].flags & MessageFlags.IsComponentsV2);
    });
  } finally {
    router.clearInteractionHandlers();
    await closeDatabase();
    await server.stop();
  }
});
