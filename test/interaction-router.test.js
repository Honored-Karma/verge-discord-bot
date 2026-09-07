import assert from "node:assert/strict";
import test from "node:test";
import {
  claimSession,
  closeSession,
  findSession,
  insertSession,
  releaseSession,
  saveSessionState,
  sessionClosed,
  sessionExpired,
} from "../utils/interactionSessions.js";
import {
  createPaySessionState,
  PAY_CONFIRM_WINDOW_MS,
  transferError,
} from "../interactions/paySession.js";
import {
  createShopSessionState,
  preferredCurrency,
  __testables as shopTestables,
} from "../interactions/shopSession.js";
import {
  buildModalCustomId,
  clearInteractionHandlers,
  listInteractionHandlers,
  parseModalCustomId,
  registerInteractionHandler,
  routeComponentInteraction,
  routeModalInteraction,
} from "../utils/interactionRouter.js";

function matches(document, filter) {
  if (!document) return false;
  return Object.entries(filter).every(([key, expected]) => document[key] === expected);
}

function memorySessions(seed = []) {
  const documents = seed.map((entry) => ({ ...entry }));
  return {
    documents,
    async findOne(filter) {
      return documents.find((document) => matches(document, filter)) || null;
    },
    async insertOne(document) {
      if (documents.some((candidate) => candidate.message_id === document.message_id)) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      documents.push({ ...document });
      return { insertedId: document.message_id };
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const document = documents.find((candidate) => matches(candidate, filter));
      if (!document) return null;
      Object.assign(document, update.$set || {});
      for (const [key, delta] of Object.entries(update.$inc || {})) {
        document[key] = Number(document[key] || 0) + delta;
      }
      return options.returnDocument === "after" ? { ...document } : { ...document };
    },
    async deleteOne(filter) {
      const index = documents.findIndex((candidate) => matches(candidate, filter));
      if (index === -1) return { deletedCount: 0 };
      documents.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
}

function fakeInteraction({
  customId = "shop_back",
  userId = "owner",
  messageId = "message-1",
} = {}) {
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
    async deferUpdate() { calls.push(["deferUpdate"]); },
    isStringSelectMenu() { return false; },
  };
}

test("session store persists a panel and guards concurrent writes", async () => {
  const sessions = memorySessions();
  const created = await insertSession(sessions, {
    messageId: "message-1",
    namespace: "shop",
    ownerId: "owner",
    state: { view: "home" },
  });

  assert.equal(created.success, true);
  assert.equal(created.session.revision, 1);
  assert.equal(created.session.status, "open");

  const duplicate = await insertSession(sessions, {
    messageId: "message-1",
    namespace: "shop",
    ownerId: "owner",
  });
  assert.deepEqual(duplicate, { success: false, reason: "duplicate_session" });

  const saved = await saveSessionState(sessions, "message-1", 1, { view: "category" });
  assert.equal(saved.success, true);
  assert.equal(saved.session.revision, 2);
  assert.equal(saved.session.state.view, "category");

  // A second click rendered from the stale revision must not overwrite.
  const stale = await saveSessionState(sessions, "message-1", 1, { view: "home" });
  assert.equal(stale.success, false);
  assert.equal(stale.reason, "revision_conflict");
  assert.equal(stale.session.state.view, "category");

  const missing = await saveSessionState(sessions, "message-404", 1, {});
  assert.deepEqual(missing, { success: false, reason: "session_not_found" });
});

test("claiming a session is exclusive and survives release", async () => {
  const sessions = memorySessions();
  const created = await insertSession(sessions, {
    messageId: "message-2",
    namespace: "pay",
    ownerId: "owner",
    state: { amount: 100 },
  });

  const claimed = await claimSession(sessions, "message-2", created.session.revision);
  assert.ok(claimed);
  assert.equal(claimed.status, "working");

  // Double click: same revision is already consumed, and the status is no longer open.
  assert.equal(await claimSession(sessions, "message-2", created.session.revision), null);
  assert.equal(await claimSession(sessions, "message-2", claimed.revision), null);

  const released = await releaseSession(sessions, "message-2", { amount: 100 });
  assert.equal(released.status, "open");

  const reclaimed = await claimSession(sessions, "message-2", released.revision);
  assert.ok(reclaimed);

  const closed = await closeSession(sessions, "message-2");
  assert.equal(closed.status, "closed");
  assert.equal(sessionClosed(closed), true);
  assert.equal(await claimSession(sessions, "message-2", closed.revision), null);

  const stored = await findSession(sessions, "message-2");
  assert.equal(stored.status, "closed");
});

test("business deadline decides expiry, not document retention", () => {
  assert.equal(sessionExpired({ state: {} }), false);
  assert.equal(sessionExpired({ state: { deadline_at: Date.now() + 60_000 } }), false);
  assert.equal(sessionExpired({ state: { deadline_at: Date.now() - 1 } }), true);
});

test("router dispatches only interactions that own a session", async () => {
  clearInteractionHandlers();
  const handled = [];
  registerInteractionHandler("shop", {
    handleComponent: async ({ session }) => { handled.push(session.message_id); },
  });
  assert.deepEqual(listInteractionHandlers(), ["shop"]);

  const session = {
    message_id: "message-3",
    namespace: "shop",
    owner_id: "owner",
    status: "open",
    revision: 1,
    state: { view: "home" },
  };
  const loadSession = async (id) => (id === "message-3" ? session : null);

  const owned = fakeInteraction({ messageId: "message-3" });
  assert.equal(await routeComponentInteraction(owned, { loadSession }), true);
  assert.deepEqual(handled, ["message-3"]);

  // A collector-driven message from another command must be left alone.
  const foreignMessage = fakeInteraction({ messageId: "message-legacy" });
  assert.equal(await routeComponentInteraction(foreignMessage, { loadSession }), false);
  assert.equal(foreignMessage.calls.length, 0);

  const otherUser = fakeInteraction({ messageId: "message-3", userId: "intruder" });
  assert.equal(await routeComponentInteraction(otherUser, { loadSession }), true);
  assert.equal(otherUser.calls[0][0], "reply");
  assert.equal(handled.length, 1);

  clearInteractionHandlers();
});

test("router refuses closed and expired panels without touching the handler", async () => {
  clearInteractionHandlers();
  let handlerCalls = 0;
  registerInteractionHandler("pay", {
    handleComponent: async () => { handlerCalls += 1; },
  });

  const closed = {
    message_id: "m-closed",
    namespace: "pay",
    owner_id: "owner",
    status: "closed",
    revision: 2,
    state: {},
  };
  const expired = {
    message_id: "m-expired",
    namespace: "pay",
    owner_id: "owner",
    status: "open",
    revision: 1,
    state: { deadline_at: Date.now() - 1000 },
  };
  const loadSession = async (id) => (id === "m-closed" ? closed : expired);

  const first = fakeInteraction({ messageId: "m-closed" });
  assert.equal(await routeComponentInteraction(first, { loadSession }), true);
  const second = fakeInteraction({ messageId: "m-expired" });
  assert.equal(await routeComponentInteraction(second, { loadSession }), true);

  assert.equal(handlerCalls, 0);
  assert.equal(first.calls[0][0], "reply");
  assert.equal(second.calls[0][0], "reply");

  clearInteractionHandlers();
});

test("modal custom ids carry the session key both ways", async () => {
  clearInteractionHandlers();
  const seen = [];
  registerInteractionHandler("shop", {
    handleComponent: async () => {},
    handleModal: async ({ action, session }) => { seen.push([action, session.message_id]); },
  });

  const customId = buildModalCustomId("shop", "quantity", "message-9");
  assert.equal(customId, "shop|quantity|message-9");
  assert.deepEqual(parseModalCustomId(customId), {
    namespace: "shop",
    action: "quantity",
    messageId: "message-9",
  });
  assert.equal(parseModalCustomId("legacy_modal"), null);
  assert.equal(parseModalCustomId("unknown|quantity|message-9"), null);

  const session = {
    message_id: "message-9",
    namespace: "shop",
    owner_id: "owner",
    status: "open",
    revision: 1,
    state: {},
  };
  const modal = fakeInteraction({ customId, messageId: null });
  assert.equal(
    await routeModalInteraction(modal, { loadSession: async () => session }),
    true,
  );
  assert.deepEqual(seen, [["quantity", "message-9"]]);

  // Legacy modals stay with the per-command handlers.
  const legacy = fakeInteraction({ customId: "give_item_amount", messageId: null });
  assert.equal(
    await routeModalInteraction(legacy, { loadSession: async () => session }),
    false,
  );

  clearInteractionHandlers();
});

test("shop session state starts on the home view with the org currency", () => {
  const state = createShopSessionState({
    playerId: "111",
    characterName: "Кайто",
    characterAvatarUrl: "https://example.test/a.png",
    currency: preferredCurrency({ organization: "GUARDIANS" }),
  });

  assert.equal(state.currency, "krw");
  assert.equal(state.view, "home");
  assert.equal(state.operation_id, null);
  assert.equal(state.category_page, 0);
  assert.equal(preferredCurrency({ organization: "TENRYU" }), "yen");
  assert.equal(preferredCurrency(null), "yen");
});

test("shop back navigation walks the panel hierarchy", () => {
  const { backView } = shopTestables;
  assert.equal(backView("confirm"), "item");
  assert.equal(backView("style"), "item");
  assert.equal(backView("item"), "category");
  assert.equal(backView("category"), "home");
  assert.equal(backView("orders"), "home");
  assert.equal(backView("home"), "home");
});

test("pay session state carries a stored confirmation deadline", () => {
  const now = 1_700_000_000_000;
  const state = createPaySessionState({
    senderId: "111",
    recipientId: "222",
    recipientSlot: 1,
    senderName: "Кайто",
    recipientName: "Мина",
    senderAvatarUrl: "https://example.test/a.png",
    currency: "yen",
    amount: 500,
    now,
  });

  assert.equal(state.deadline_at, now + PAY_CONFIRM_WINDOW_MS);
  assert.equal(sessionExpired(state && { state }, now + 1), false);
  assert.equal(sessionExpired({ state }, now + PAY_CONFIRM_WINDOW_MS + 1), true);
  assert.match(transferError({ reason: "insufficient_funds", available: 10 }, "yen"), /10/);
  assert.match(transferError({ reason: "unknown" }, "krw"), /не изменены/);
});

test("leaderboard actions change only what the click implies", async () => {
  const { __testables } = await import("../interactions/leaderboardSession.js");
  const { applyAction } = __testables;
  const snapshot = { totalPages: 3 };

  const state = { metric: "ap", page: 0, page_size: 10 };
  assert.equal(applyAction("leaderboard_metric:ap", state, snapshot), false, "та же вкладка");
  assert.equal(applyAction("leaderboard_metric:zzz", state, snapshot), false, "неизвестная метрика");
  assert.equal(applyAction("leaderboard_prev", state, snapshot), false, "уже первая страница");

  assert.equal(applyAction("leaderboard_next", state, snapshot), true);
  assert.equal(state.page, 1);
  assert.equal(applyAction("leaderboard_next", state, snapshot), true);
  assert.equal(state.page, 2);
  assert.equal(applyAction("leaderboard_next", state, snapshot), false, "последняя страница");

  assert.equal(applyAction("leaderboard_prev", state, snapshot), true);
  assert.equal(state.page, 1);

  // Переключение метрики всегда возвращает на первую страницу.
  assert.equal(applyAction("leaderboard_metric:sp", state, snapshot), true);
  assert.equal(state.metric, "sp");
  assert.equal(state.page, 0);

  assert.equal(applyAction("leaderboard_refresh", state, snapshot), true);
  assert.equal(applyAction("something_else", state, snapshot), false);
});

test("кнопка «Ко мне» листает на страницу с персонажем", async () => {
  const { __testables } = await import("../interactions/leaderboardSession.js");
  const { applyAction } = __testables;

  const state = { metric: "ap", page: 0, page_size: 5 };
  // Строка 12 при странице по 5 — третья страница (индекс 2).
  const snapshot = { totalPages: 4, currentPlayer: { leaderboard_row: 12 } };
  assert.equal(applyAction("leaderboard_jump", state, snapshot), true);
  assert.equal(state.page, 2);
  assert.equal(applyAction("leaderboard_jump", state, snapshot), false, "уже на своей странице");

  // Персонажа нет в рейтинге — прыгать некуда.
  const absent = { totalPages: 4, currentPlayer: null };
  assert.equal(applyAction("leaderboard_jump", { metric: "ap", page: 0, page_size: 5 }, absent), false);
});
