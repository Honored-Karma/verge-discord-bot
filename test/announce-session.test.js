import assert from "node:assert/strict";
import test from "node:test";
import { Collection, MessageFlags, PermissionFlagsBits } from "discord.js";
import {
  createAnnounceComponents,
  createAnnouncePreviewEmbed,
  createAnnounceState,
  createAnnounceStyleModal,
  createAnnounceTextModal,
  announceInteractionHandler,
  ANNOUNCE_BUILDER_NAMESPACE,
  ANN_BTN_CANCEL,
  ANN_BTN_SEND,
  ANN_BTN_STYLE,
  ANN_BTN_TEXT,
  ANN_INPUT_COLOR,
  ANN_INPUT_FOOTER,
  ANN_INPUT_IMAGE,
  ANN_INPUT_MESSAGE,
  ANN_INPUT_THUMBNAIL,
  ANN_INPUT_TITLE,
  ANN_SELECT_TARGET,
  ANN_SELECT_USER,
} from "../interactions/announceSession.js";
import { parseModalCustomId } from "../utils/interactionRouter.js";
import { registerInteractionHandlers } from "../interactions/index.js";
import { setDB } from "../utils/db.js";

registerInteractionHandlers();

function createMockDatabase() {
  const store = {
    interaction_sessions: [],
  };

  const db = {
    _store: store,
    collection(name) {
      if (!store[name]) store[name] = [];
      const list = store[name];

      return {
        async findOne(filter) {
          return list.find((doc) => {
            for (const [k, v] of Object.entries(filter)) {
              if (doc[k] !== v) return false;
            }
            return true;
          }) || null;
        },
        async insertOne(doc) {
          const inserted = { ...doc, _id: doc._id || `id_${Date.now()}_${Math.random()}` };
          list.push(inserted);
          return { insertedId: inserted._id, acknowledged: true };
        },
        async updateOne(filter, update) {
          const doc = list.find((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k] !== v) return false;
            }
            return true;
          });
          if (!doc) return { matchedCount: 0, modifiedCount: 0 };

          if (update.$set) {
            for (const [key, val] of Object.entries(update.$set)) {
              doc[key] = val;
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
          if (!doc) {
            if (options.upsert) {
              const newDoc = { ...filter, ...update.$set, ...update.$setOnInsert };
              list.push(newDoc);
              return { value: newDoc };
            }
            return { value: null };
          }
          if (update.$set) {
            for (const [key, val] of Object.entries(update.$set)) {
              doc[key] = val;
            }
          }
          return { value: doc };
        },
        async deleteOne(filter) {
          const idx = list.findIndex((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k] !== v) return false;
            }
            return true;
          });
          if (idx >= 0) {
            list.splice(idx, 1);
            return { deletedCount: 1 };
          }
          return { deletedCount: 0 };
        },
      };
    },
  };

  return db;
}

test("announce session: createAnnounceState clamps and defaults correctly", () => {
  const defaultState = createAnnounceState();
  assert.equal(defaultState.title, "📢 Объявление");
  assert.equal(defaultState.color, "#b209d4");
  assert.equal(defaultState.target, "channel");
  assert.equal(defaultState.target_user_id, null);

  const customState = createAnnounceState({
    title: "Большой турнир",
    message: "Внимание всем участникам!",
    color: "#ff0000",
    target: "single",
    target_user_id: "user_123",
  });
  assert.equal(customState.title, "Большой турнир");
  assert.equal(customState.message, "Внимание всем участникам!");
  assert.equal(customState.color, "#ff0000");
  assert.equal(customState.target, "single");
  assert.equal(customState.target_user_id, "user_123");
});

test("announce session: embed and components reflect state", () => {
  const state = createAnnounceState({
    title: "Тестовый заголовок",
    message: "Тестовое сообщение",
    target: "single",
    target_user_id: "u_999",
  });

  const embed = createAnnouncePreviewEmbed(state, "Verge Server");
  assert.equal(embed.data.title, "Тестовый заголовок");
  assert.ok(embed.data.description.includes("Тестовое сообщение"));
  assert.ok(embed.data.description.includes("<@u_999>"));

  const components = createAnnounceComponents(state);
  // Target menu + User select menu + Buttons row = 3 rows
  assert.equal(components.length, 3);
  assert.equal(components[0].components[0].data.custom_id, ANN_SELECT_TARGET);
  assert.equal(components[1].components[0].data.custom_id, ANN_SELECT_USER);
  assert.equal(components[2].components.length, 4);
});

test("announce session: modals build valid router custom IDs", () => {
  const state = createAnnounceState();
  const textModal = createAnnounceTextModal(state, "msg_announce_1");
  const parsedText = parseModalCustomId(textModal.data.custom_id);
  assert.ok(parsedText);
  assert.equal(parsedText.namespace, ANNOUNCE_BUILDER_NAMESPACE);
  assert.equal(parsedText.action, "text");
  assert.equal(parsedText.messageId, "msg_announce_1");

  const styleModal = createAnnounceStyleModal(state, "msg_announce_1");
  const parsedStyle = parseModalCustomId(styleModal.data.custom_id);
  assert.ok(parsedStyle);
  assert.equal(parsedStyle.namespace, ANNOUNCE_BUILDER_NAMESPACE);
  assert.equal(parsedStyle.action, "style");
  assert.equal(parsedStyle.messageId, "msg_announce_1");
});

test("announce session: handleModal updates state for text and style", async () => {
  const db = createMockDatabase();
  setDB(db);

  const session = {
    status: "open",
    message_id: "msg_announce_edit",
    owner_id: "admin_1",
    state: createAnnounceState(),
  };
  await db.collection("interaction_sessions").insertOne(session);

  let updatedPayload = null;
  const textModalInteraction = {
    fields: {
      getTextInputValue(id) {
        if (id === ANN_INPUT_TITLE) return "Обновленный заголовок";
        if (id === ANN_INPUT_MESSAGE) return "Новый текст объявления";
        if (id === ANN_INPUT_FOOTER) return "От администрации";
        return "";
      },
    },
    guild: { name: "Test Guild" },
    update(payload) {
      updatedPayload = payload;
      return Promise.resolve();
    },
  };

  await announceInteractionHandler.handleModal({
    interaction: textModalInteraction,
    session,
    action: "text",
  });

  const updatedSession = await db.collection("interaction_sessions").findOne({ message_id: "msg_announce_edit" });
  assert.equal(updatedSession.state.title, "Обновленный заголовок");
  assert.equal(updatedSession.state.message, "Новый текст объявления");
  assert.equal(updatedSession.state.footer, "От администрации");
  assert.ok(updatedPayload);
  assert.equal(updatedPayload.embeds[0].data.title, "Обновленный заголовок");

  // Style modal
  const styleModalInteraction = {
    fields: {
      getTextInputValue(id) {
        if (id === ANN_INPUT_COLOR) return "#00ffcc";
        if (id === ANN_INPUT_IMAGE) return "https://example.com/banner.png";
        if (id === ANN_INPUT_THUMBNAIL) return "https://example.com/thumb.png";
        return "";
      },
    },
    guild: { name: "Test Guild" },
    update(payload) {
      updatedPayload = payload;
      return Promise.resolve();
    },
  };

  await announceInteractionHandler.handleModal({
    interaction: styleModalInteraction,
    session: updatedSession,
    action: "style",
  });

  const styleUpdatedSession = await db.collection("interaction_sessions").findOne({ message_id: "msg_announce_edit" });
  assert.equal(styleUpdatedSession.state.color, "#00ffcc");
  assert.equal(styleUpdatedSession.state.image, "https://example.com/banner.png");
  assert.equal(styleUpdatedSession.state.thumbnail, "https://example.com/thumb.png");
});

test("announce session: send announcement delivers to channel and completes session", async () => {
  const db = createMockDatabase();
  setDB(db);

  let sentPayload = null;
  const mockChannel = {
    id: "ch_announce_123",
    async send(payload) {
      sentPayload = payload;
      return { url: "https://discord.com/channels/1/2/3" };
    },
  };

  const session = {
    status: "open",
    message_id: "msg_announce_send",
    owner_id: "admin_1",
    state: createAnnounceState({
      title: "Важный апдейт",
      message: "Сервер перезагружается через 5 минут.",
      target: "channel",
      target_channel_id: "ch_announce_123",
    }),
  };
  await db.collection("interaction_sessions").insertOne(session);

  let editReplyPayload = null;
  const interaction = {
    customId: ANN_BTN_SEND,
    user: { id: "admin_1" },
    channelId: "ch_announce_123",
    guild: {
      name: "Test Guild",
      channels: {
        async fetch(id) {
          if (id === "ch_announce_123") return mockChannel;
          return null;
        },
      },
    },
    async deferUpdate() {},
    async editReply(payload) {
      editReplyPayload = payload;
      return payload;
    },
    isStringSelectMenu: () => false,
    isUserSelectMenu: () => false,
  };

  await announceInteractionHandler.handleComponent({
    interaction,
    session,
  });

  assert.ok(sentPayload);
  assert.ok(sentPayload.components && sentPayload.components.length > 0);
  assert.ok(Number(sentPayload.flags) & MessageFlags.IsComponentsV2);

  assert.ok(editReplyPayload);
  assert.ok(editReplyPayload.embeds[0].data.title.includes("Объявление опубликовано"));

  // Session closed
  const closedSession = await db.collection("interaction_sessions").findOne({ message_id: "msg_announce_send" });
  assert.ok(closedSession);
  assert.equal(closedSession.status, "closed");
});

test("announce session: authorization verifies owner and admin permissions", () => {
  const session = { owner_id: "admin_1" };

  // Non-owner rejected
  assert.equal(
    announceInteractionHandler.authorize({
      interaction: { user: { id: "other_user" }, member: {} },
      session,
    }),
    false
  );

  // Owner with administrator permission accepted
  const allowedMember = {
    id: "admin_1",
    permissions: {
      has(perm) {
        return perm === PermissionFlagsBits.Administrator;
      },
    },
    roles: { cache: new Collection() },
    guild: { ownerId: "guild_owner" },
  };
  assert.equal(
    announceInteractionHandler.authorize({
      interaction: { user: { id: "admin_1" }, member: allowedMember },
      session,
    }),
    true
  );
});
