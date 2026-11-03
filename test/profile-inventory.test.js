import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags } from "discord.js";
import {
  createProfileV2Components,
  PROFILE_INVENTORY_ID,
} from "../utils/profileComponents.js";

/**
 * Кнопка «Инвентарь» в профиле.
 *
 * Два разных свойства проверяются разными способами. Раскладку панели можно
 * собрать без базы — билдеры Discord чистые. А вот приватность окна проверяется
 * только сквозным прогоном через роутер: важно не то, что мы передали флаг, а
 * то, что до `interaction.reply` он доехал вместе с эфемерным битом и что
 * публичная панель профиля при этом осталась нетронутой.
 */

const PLAYER = { id: "u1", username: "user1" };
const fakeUser = {
  id: PLAYER.id,
  username: PLAYER.username,
  displayAvatarURL: () => null,
};

function buttons(json) {
  return json
    .flatMap((container) => container.components || [])
    .filter((row) => row.type === 1)
    .flatMap((row) => row.components || []);
}

function panelButtons(overrides = {}) {
  const components = createProfileV2Components({
    page: "main",
    player: { id: "u1", character_name: "Аяко", ap: 10, krw: 0, yen: 0, reputation: 20 },
    user: fakeUser,
    slot: 1,
    totalSP: 0,
    history: [],
    imageName: null,
    ...overrides,
  });
  return buttons(components.map((container) => container.toJSON()));
}

test("кнопка инвентаря есть на каждой странице профиля и гаснет вместе с панелью", () => {
  for (const page of ["main", "physical", "history"]) {
    const found = panelButtons({ page })
      .filter((button) => button.custom_id === PROFILE_INVENTORY_ID);

    assert.equal(found.length, 1, `${page}: кнопка инвентаря должна быть ровно одна`);
    assert.equal(found[0].disabled ?? false, false, `${page}: кнопка не должна быть выключена`);
  }

  // Панель мёртвого персонажа рисуется с disabled — действие обязано погаснуть
  // вместе с вкладками, иначе останется единственная живая кнопка на трупе.
  const dead = panelButtons({ disabled: true })
    .find((button) => button.custom_id === PROFILE_INVENTORY_ID);
  assert.equal(dead.disabled, true);

  // Вкладки и действие не должны оказаться в одном ряду: у них разный смысл.
  const rows = createProfileV2Components({
    page: "main",
    player: { id: "u1", character_name: "Аяко", ap: 10, krw: 0, yen: 0, reputation: 20 },
    user: fakeUser,
    slot: 1,
    totalSP: 0,
    history: [],
    imageName: null,
  })
    .map((container) => container.toJSON())
    .flatMap((container) => container.components || [])
    .filter((component) => component.type === 1);

  assert.equal(rows.length, 2, "ожидаются два ряда: вкладки и действия");
  assert.equal(rows[1].components.length, 3);
  assert.deepEqual(rows[1].components.map(button => button.custom_id), [PROFILE_INVENTORY_ID, "profile_text", "profile_refresh"]);
  assert.equal(rows[1].components[0].custom_id, PROFILE_INVENTORY_ID);
  // Идентификатор не должен пересечься с кнопками самого инвентаря.
  assert.ok(!PROFILE_INVENTORY_ID.startsWith("inventory_"));
});

async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch {
    return null;
  }
}

function fakeInteraction({ userId, messageId, replyId = "ephemeral-1", targetUser = null }) {
  const calls = [];
  return {
    calls,
    customId: PROFILE_INVENTORY_ID,
    user: { id: userId, username: userId, displayAvatarURL: () => null },
    message: { id: messageId },
    guildId: "guild-1",
    channelId: "channel-1",
    replied: false,
    deferred: false,
    client: {
      users: {
        fetch: async (id) => {
          if (targetUser && targetUser.id === id) return targetUser;
          throw new Error("unknown user");
        },
      },
    },
    async reply(payload) {
      calls.push(["reply", payload]);
      this.replied = true;
      return { id: replyId };
    },
    async fetchReply() { return { id: replyId }; },
    async followUp(payload) { calls.push(["followUp", payload]); },
    async update(payload) { calls.push(["update", payload]); },
    async editReply(payload) { calls.push(["editReply", payload]); },
    async deferUpdate() { calls.push(["deferUpdate"]); },
    isStringSelectMenu() { return false; },
  };
}

const isEphemeral = (flags) => (Number(flags) & MessageFlags.Ephemeral) !== 0;

test("инвентарь из профиля открывается приватно и не трогает панель профиля", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const { createInteractionSession, getInteractionSession } =
    await import("../utils/interactionSessions.js");
  const { routeComponentInteraction, clearInteractionHandlers } =
    await import("../utils/interactionRouter.js");
  const { registerInteractionHandlers } = await import("../interactions/index.js");
  const { createProfileSessionState, PROFILE_NAMESPACE } =
    await import("../interactions/profileSession.js");
  const { INVENTORY_NAMESPACE } = await import("../interactions/inventorySession.js");

  try {
    await connectDatabase();
    clearInteractionHandlers();
    registerInteractionHandlers();

    await dm.createPlayer("u1", "user1", "Аяко Мидзуки", null, 1, null);
    await dm.giveItem("u1", "AP Tome (50)", 2, "admin");
    await dm.createPlayer("u2", "user2", "Борис", null, 1, null);
    await dm.giveItem("u2", "Артефакт «Пепел»", 1, "admin");

    async function openProfile({ messageId, ownerId, targetUserId, playerId }) {
      const created = await createInteractionSession({
        messageId,
        namespace: PROFILE_NAMESPACE,
        ownerId,
        guildId: "guild-1",
        channelId: "channel-1",
        state: createProfileSessionState({ playerId, targetUserId, slot: 1 }),
      });
      assert.equal(created.success, true);
    }

    // ── Свой профиль ─────────────────────────────────────────────────────────
    await openProfile({
      messageId: "profile-own",
      ownerId: "u1",
      targetUserId: "u1",
      playerId: "u1",
    });

    const own = fakeInteraction({ userId: "u1", messageId: "profile-own" });
    assert.equal(await routeComponentInteraction(own), true);

    assert.deepEqual(own.calls.map(([kind]) => kind), ["reply"]);
    const payload = own.calls[0][1];
    assert.ok(isEphemeral(payload.flags), "окно инвентаря обязано быть эфемерным");
    assert.ok(
      (Number(payload.flags) & MessageFlags.IsComponentsV2) !== 0,
      "инвентарь рисуется компонентами V2",
    );
    assert.ok(
      JSON.stringify(payload.components.map((c) => c.toJSON())).includes("AP Tome"),
      "в окне должен быть предмет игрока",
    );

    // Панель профиля не переписана: игрок возвращается к вкладкам без /profile.
    assert.ok(!own.calls.some(([kind]) => kind === "update" || kind === "editReply"));

    // У эфемерного окна своя сессия — значит его кнопки переживут рестарт.
    const inventorySession = await getInteractionSession("ephemeral-1");
    assert.ok(inventorySession, "сессия инвентаря должна быть сохранена");
    assert.equal(inventorySession.namespace, INVENTORY_NAMESPACE);
    assert.equal(inventorySession.owner_id, "u1");
    assert.equal(inventorySession.state.player_id, "u1");
    assert.equal(inventorySession.state.can_use, true);

    // Сессия самого профиля не тронута: ревизия прежняя, страница прежняя.
    const profileSession = await getInteractionSession("profile-own");
    assert.equal(profileSession.revision, 1);
    assert.equal(profileSession.state.page, "main");

    // ── Чужой профиль: смотреть можно, тратить нельзя ────────────────────────
    await openProfile({
      messageId: "profile-foreign",
      ownerId: "u1",
      targetUserId: "u2",
      playerId: "u2",
    });

    const foreign = fakeInteraction({
      userId: "u1",
      messageId: "profile-foreign",
      replyId: "ephemeral-2",
      targetUser: { id: "u2", username: "user2", displayAvatarURL: () => null },
    });
    assert.equal(await routeComponentInteraction(foreign), true);
    assert.ok(isEphemeral(foreign.calls[0][1].flags));

    const foreignSession = await getInteractionSession("ephemeral-2");
    assert.equal(foreignSession.state.player_id, "u2");
    assert.equal(
      foreignSession.state.can_use,
      false,
      "из чужого инвентаря предметы использовать нельзя",
    );

    // ── Чужой зритель до кнопки не доходит ───────────────────────────────────
    const intruder = fakeInteraction({
      userId: "u999",
      messageId: "profile-own",
      replyId: "ephemeral-3",
    });
    assert.equal(await routeComponentInteraction(intruder), true);
    assert.equal(intruder.calls[0][0], "reply");
    assert.match(intruder.calls[0][1].content, /не ваш интерфейс/i);
    assert.equal(
      await getInteractionSession("ephemeral-3"),
      null,
      "чужому не должна создаваться сессия инвентаря",
    );

    // ── Пустой инвентарь тоже отвечает приватно ──────────────────────────────
    await dm.createPlayer("u3", "user3", "Хару", null, 1, null);
    await openProfile({
      messageId: "profile-empty",
      ownerId: "u3",
      targetUserId: "u3",
      playerId: "u3",
    });

    const empty = fakeInteraction({
      userId: "u3",
      messageId: "profile-empty",
      replyId: "ephemeral-4",
    });
    assert.equal(await routeComponentInteraction(empty), true);
    assert.ok(isEphemeral(empty.calls[0][1].flags), "пустой инвентарь тоже прячем");
  } finally {
    clearInteractionHandlers();
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});
