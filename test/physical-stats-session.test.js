import assert from "node:assert/strict";
import test from "node:test";
import { Collection } from "discord.js";
import {
  createPhysicalStatsComponents,
  createPhysicalStatsEmbed,
  createPhysicalStatsState,
  createStatsInputModal,
  createUrlInputModal,
  PHYSICAL_STATS_NAMESPACE,
  physicalStatsInteractionHandler,
  PS_BTN_CANCEL,
  PS_BTN_SAVE,
  PS_BTN_STATS,
  PS_BTN_URL,
  PS_INPUT_LIFT,
  PS_INPUT_PUNCH,
  PS_INPUT_REACTION,
  PS_INPUT_SPEED,
  PS_INPUT_STAMINA,
  PS_INPUT_URL,
} from "../interactions/physicalStatsSession.js";
import { parseModalCustomId } from "../utils/interactionRouter.js";
import { registerInteractionHandlers } from "../interactions/index.js";
import { setDB } from "../utils/db.js";

registerInteractionHandlers();

function createMockDatabase() {
  const store = {
    players: [],
    admin_actions: [],
    interaction_sessions: [],
  };

  const db = {
    _store: store,
    collection(name) {
      if (!store[name]) store[name] = [];
      const list = store[name];

      return {
        async findOne(filter) {
          return (
            list.find((doc) => {
              for (const [k, v] of Object.entries(filter)) {
                if (k === "physical_stats" && v && v.$exists === false) {
                  if (doc.physical_stats !== undefined) return false;
                  continue;
                }
                if (k === "physical_stats" && v && v.$exists === true) {
                  if (doc.physical_stats === undefined) return false;
                  continue;
                }
                if (doc[k] !== v) return false;
              }
              return true;
            }) || null
          );
        },
        async insertOne(doc) {
          const inserted = { ...doc, _id: doc._id || `id_${Date.now()}_${Math.random()}` };
          list.push(inserted);
          return { insertedId: inserted._id, acknowledged: true };
        },
        async updateOne(filter, update) {
          const doc = list.find((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (k === "physical_stats" && v && v.$exists === false) {
                if (d.physical_stats !== undefined) return false;
                continue;
              }
              if (k === "physical_stats" && v && v.$exists === true) {
                if (d.physical_stats === undefined) return false;
                continue;
              }
              if (d[k] !== v) return false;
            }
            return true;
          });
          if (!doc) return { matchedCount: 0, modifiedCount: 0 };

          if (update.$set) {
            for (const [key, val] of Object.entries(update.$set)) {
              if (key.includes(".")) {
                const parts = key.split(".");
                let cur = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (!cur[parts[i]]) cur[parts[i]] = {};
                  cur = cur[parts[i]];
                }
                cur[parts[parts.length - 1]] = val;
              } else {
                doc[key] = val;
              }
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        async findOneAndUpdate(filter, update, options = {}) {
          const doc = list.find((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k] !== v) return false;
            }
            return true;
          });
          if (!doc) return null;

          if (update.$set) Object.assign(doc, update.$set);
          if (update.$inc) {
            for (const [k, val] of Object.entries(update.$inc)) {
              doc[k] = (doc[k] || 0) + val;
            }
          }
          return options.returnDocument === "after" ? { ...doc } : doc;
        },
      };
    },
  };

  return db;
}

test("createPhysicalStatsState initializes register and edit states", () => {
  const regState = createPhysicalStatsState({
    mode: "register",
    target_user_id: "user_123",
    target_username: "Hero",
    slot: 1,
    player_id: "user_123",
    character_name: "Hero",
  });

  assert.equal(regState.mode, "register");
  assert.equal(regState.target_user_id, "user_123");
  assert.equal(regState.stats.punch_strength_kg, null);

  const editState = createPhysicalStatsState({
    mode: "edit",
    target_user_id: "user_123",
    target_username: "Hero",
    slot: 2,
    player_id: "user_123_2",
    character_name: "Hero2",
    stats: {
      punch_strength_kg: 100,
      lifting_strength_kg: 200,
      speed_kmh: 30,
      stamina_percent: 80,
      reaction_ms: 120,
      character_url: "https://example.com/sheet",
    },
  });

  assert.equal(editState.mode, "edit");
  assert.equal(editState.stats.punch_strength_kg, 100);
  assert.equal(editState.stats.character_url, "https://example.com/sheet");
});

test("createPhysicalStatsEmbed and createPhysicalStatsComponents generate valid structures", () => {
  const state = createPhysicalStatsState({
    mode: "register",
    target_user_id: "user_456",
    character_name: "Ren",
    slot: 1,
    stats: {
      punch_strength_kg: 150,
      character_url: "https://sheet.example.com",
    },
  });

  const embed = createPhysicalStatsEmbed(state);
  const data = embed.toJSON();
  assert.ok(data.title.includes("Регистрация физических показателей"));
  assert.ok(data.description.includes("150"));
  assert.ok(data.description.includes("https://sheet.example.com"));

  const components = createPhysicalStatsComponents(state);
  assert.equal(components.length, 1);
  const buttons = components[0].components.map((b) => b.toJSON().custom_id);
  assert.deepEqual(buttons, [PS_BTN_STATS, PS_BTN_URL, PS_BTN_SAVE, PS_BTN_CANCEL]);
});

test("createStatsInputModal and createUrlInputModal build valid modals", () => {
  const state = createPhysicalStatsState({
    stats: {
      punch_strength_kg: 75.5,
      character_url: "https://test.com",
    },
  });

  const statsModal = createStatsInputModal(state, "msg_ps_123");
  const statsData = statsModal.toJSON();
  assert.equal(statsData.title, "Физические показатели");
  const parsedStats = parseModalCustomId(statsData.custom_id);
  assert.equal(parsedStats.namespace, PHYSICAL_STATS_NAMESPACE);
  assert.equal(parsedStats.action, "stats");

  const urlModal = createUrlInputModal(state, "msg_ps_123");
  const urlData = urlModal.toJSON();
  assert.equal(urlData.title, "Ссылка на анкету персонажа");
  const parsedUrl = parseModalCustomId(urlData.custom_id);
  assert.equal(parsedUrl.namespace, PHYSICAL_STATS_NAMESPACE);
  assert.equal(parsedUrl.action, "url");
});

test("physicalStatsInteractionHandler handles modal submissions for stats and url", async () => {
  const db = createMockDatabase();
  setDB(db);

  const doc = {
    message_id: "msg_ps_session",
    namespace: PHYSICAL_STATS_NAMESPACE,
    owner_id: "admin_user",
    status: "open",
    revision: 1,
    state: createPhysicalStatsState({ mode: "register", target_user_id: "target_1" }),
  };
  await db.collection("interaction_sessions").insertOne(doc);

  let updatedEmbeds = null;

  // 1. Submit stats modal
  const statsInteraction = {
    fields: {
      getTextInputValue(id) {
        if (id === PS_INPUT_PUNCH) return "150,5";
        if (id === PS_INPUT_LIFT) return "300";
        if (id === PS_INPUT_SPEED) return "45";
        if (id === PS_INPUT_STAMINA) return "90";
        if (id === PS_INPUT_REACTION) return "110";
        return "";
      },
    },
    update: async ({ embeds }) => {
      updatedEmbeds = embeds;
    },
  };

  await physicalStatsInteractionHandler.handleModal({
    interaction: statsInteraction,
    session: doc,
    action: "stats",
  });

  const afterStatsDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_ps_session" });
  assert.equal(afterStatsDoc.state.stats.punch_strength_kg, 150.5);
  assert.equal(afterStatsDoc.state.stats.lifting_strength_kg, 300);
  assert.equal(afterStatsDoc.state.stats.speed_kmh, 45);
  assert.equal(afterStatsDoc.state.stats.stamina_percent, 90);
  assert.equal(afterStatsDoc.state.stats.reaction_ms, 110);
  assert.ok(updatedEmbeds[0].data.description.includes("150,5"));

  // 2. Submit URL modal
  const urlInteraction = {
    fields: {
      getTextInputValue: (id) => (id === PS_INPUT_URL ? "https://sheet.example.com/ch1" : ""),
    },
    update: async ({ embeds }) => {
      updatedEmbeds = embeds;
    },
  };

  await physicalStatsInteractionHandler.handleModal({
    interaction: urlInteraction,
    session: afterStatsDoc,
    action: "url",
  });

  const afterUrlDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_ps_session" });
  assert.equal(afterUrlDoc.state.stats.character_url, "https://sheet.example.com/ch1");
});

test("physicalStatsInteractionHandler validates and saves stats to database", async () => {
  const db = createMockDatabase();
  setDB(db);

  // Создаём игрока в БД
  await db.collection("players").insertOne({
    id: "user_target_1",
    character_name: "Джин",
  });

  const sessionDoc = {
    message_id: "msg_save_test",
    namespace: PHYSICAL_STATS_NAMESPACE,
    owner_id: "admin_user",
    status: "open",
    revision: 1,
    state: createPhysicalStatsState({
      mode: "register",
      target_user_id: "user_target_1",
      player_id: "user_target_1",
      character_name: "Джин",
      slot: 1,
      stats: {
        punch_strength_kg: 120,
        lifting_strength_kg: 240,
        speed_kmh: 30,
        stamina_percent: 85,
        reaction_ms: 130,
        character_url: "https://example.com/jin",
      },
    }),
  };
  await db.collection("interaction_sessions").insertOne(sessionDoc);

  let channelSentPayload = null;
  let finalEditReplyPayload = null;

  const saveInteraction = {
    customId: PS_BTN_SAVE,
    user: { id: "admin_user", tag: "Admin#0001" },
    guildId: "guild_1",
    channelId: "chan_1",
    channel: {
      send: async (payload) => {
        channelSentPayload = payload;
      },
    },
    deferUpdate: async () => {},
    editReply: async (payload) => {
      finalEditReplyPayload = payload;
    },
  };

  await physicalStatsInteractionHandler.handleComponent({
    interaction: saveInteraction,
    session: sessionDoc,
  });

  // Проверяем:
  // а) Запись обновлена в players с physical_stats
  const updatedPlayer = await db.collection("players").findOne({ id: "user_target_1" });
  assert.ok(updatedPlayer.physical_stats);
  assert.equal(updatedPlayer.physical_stats.punch_strength_kg, 120);
  assert.equal(updatedPlayer.physical_stats.character_url, "https://example.com/jin");

  // б) В канал отправлено подтверждение
  assert.ok(channelSentPayload);
  assert.ok(channelSentPayload.embeds[0].data.title.includes("Физические показатели зарегистрированы"));

  // в) Панель черновика закрыта
  const closedSession = await db.collection("interaction_sessions").findOne({ message_id: "msg_save_test" });
  assert.equal(closedSession.status, "closed");
});
