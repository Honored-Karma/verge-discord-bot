import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraftState,
  createMainInfoModal,
  createMediaModal,
  createMissionBuilderComponents,
  createMissionBuilderEmbed,
  createRewardsModal,
  MB_BTN_CANCEL,
  MB_BTN_MAIN,
  MB_BTN_MEDIA,
  MB_BTN_PUBLISH,
  MB_BTN_REWARDS,
  MB_INPUT_AP,
  MB_INPUT_DESC,
  MB_INPUT_IMAGE,
  MB_INPUT_ITEM,
  MB_INPUT_PLAYERS,
  MB_INPUT_CHANNEL,
  MB_INPUT_QTY,
  MB_INPUT_REP,
  MB_INPUT_SP,
  MB_INPUT_THUMBNAIL,
  MB_INPUT_TITLE,
  MB_SELECT_ACCESS,
  MB_SELECT_CHANNEL,
  MB_SELECT_ORG,
  MB_SELECT_RANK,
  MB_SELECT_TYPE,
  MISSION_BUILDER_NAMESPACE,
  missionBuilderInteractionHandler,
} from "../interactions/missionBuilderSession.js";
import {
  MISSION_ACCESS,
  MISSION_TYPES,
  getMissionByPublicId,
} from "../utils/missionStore.js";
import { parseModalCustomId } from "../utils/interactionRouter.js";
import { registerInteractionHandlers } from "../interactions/index.js";
import { setDB } from "../utils/db.js";
import { Collection } from "discord.js";

// Регистрируем обработчики сессий для тестов
registerInteractionHandlers();

function createMockDatabase() {
  const store = {
    missions: [],
    organization_mission_settings: [],
    players: [],
    player_sp: [],
    styles: [],
    inventory: [],
    admin_actions: [],
    interaction_sessions: [],
    org_roles: [],
    custom_orgs: [],
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
                if (doc[k] !== v) return false;
              }
              return true;
            }) || null
          );
        },
        find(filter = {}) {
          const matched = list.filter((doc) => {
            for (const [k, v] of Object.entries(filter)) {
              if (doc[k] !== v) return false;
            }
            return true;
          });
          return {
            toArray: async () => matched,
          };
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

          if (update.$set) Object.assign(doc, update.$set);
          if (update.$inc) {
            for (const [k, val] of Object.entries(update.$inc)) {
              doc[k] = (doc[k] || 0) + val;
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

test("createDraftState initializes default and custom parameters correctly", () => {
  const defaults = createDraftState();
  assert.equal(defaults.title, "");
  assert.equal(defaults.description, "");
  assert.equal(defaults.type, MISSION_TYPES.well);
  assert.equal(defaults.access, MISSION_ACCESS.open);
  assert.equal(defaults.max_players, 5);
  assert.equal(defaults.reward.ap, 0);
  assert.equal(defaults.reward.sp, 0);
  assert.equal(defaults.reward.reputation, 0);
  assert.equal(defaults.reward.item_name, "");
  assert.equal(defaults.reward.item_qty, 1);

  const custom = createDraftState({
    title: "Охота на босса",
    description: "Сложная вылазка в пустоши",
    type: MISSION_TYPES.raid,
    access: MISSION_ACCESS.organization,
    max_players: 12,
    organization_key: "tenryu",
    organization_name: "Tenryū",
    channel_id: "123456789012345678",
    reward: {
      ap: 50,
      sp: 25,
      reputation: 100,
      item_name: "Древний клинок",
      item_qty: 2,
    },
  });

  assert.equal(custom.title, "Охота на босса");
  assert.equal(custom.description, "Сложная вылазка в пустоши");
  assert.equal(custom.type, MISSION_TYPES.raid);
  assert.equal(custom.access, MISSION_ACCESS.organization);
  assert.equal(custom.max_players, 12);
  assert.equal(custom.organization_key, "tenryu");
  assert.equal(custom.organization_name, "Tenryū");
  assert.equal(custom.channel_id, "123456789012345678");
  assert.equal(custom.reward.ap, 50);
  assert.equal(custom.reward.sp, 25);
  assert.equal(custom.reward.reputation, 100);
  assert.equal(custom.reward.item_name, "Древний клинок");
  assert.equal(custom.reward.item_qty, 2);
});

test("createMissionBuilderEmbed and createMissionBuilderComponents generate valid structures", () => {
  const state = createDraftState({
    title: "Тестовая миссия",
    description: "Проверка компонентов мастера",
    type: MISSION_TYPES.investigation,
    channel_id: "999888777666555444",
  });

  const embed = createMissionBuilderEmbed(state);
  const data = embed.toJSON();
  assert.ok(data.title.includes("Мастер создания миссии"));
  assert.ok(data.description.includes("Тестовая миссия"));
  assert.ok(data.description.includes("Расследование"));
  assert.ok(data.description.includes("<#999888777666555444>"));

  const orgs = [{ key: "tenryu", name: "Tenryū" }];
  const components = createMissionBuilderComponents(state, orgs, "msg_123");

  // Ровно 5 Action Rows
  assert.equal(components.length, 5);

  const [typeRow, rankRow, accessRow, orgRow, btnRow] = components;
  const typeMenu = typeRow.components[0].toJSON();
  assert.equal(typeMenu.custom_id, MB_SELECT_TYPE);
  assert.ok(typeMenu.options.length >= 6);

  const rankMenu = rankRow.components[0].toJSON();
  assert.equal(rankMenu.custom_id, MB_SELECT_RANK);
  assert.equal(rankMenu.options.length, 14);
  assert.equal(rankMenu.options[0].value, "none");
  assert.equal(rankMenu.options[1].value, "VI"); // Korean ranks first
  assert.equal(rankMenu.options[7].value, "F");  // Then Japanese ranks

  const accessMenu = accessRow.components[0].toJSON();
  assert.equal(accessMenu.custom_id, MB_SELECT_ACCESS);
  assert.equal(accessMenu.options.length, 3);

  const orgMenu = orgRow.components[0].toJSON();
  assert.equal(orgMenu.custom_id, MB_SELECT_ORG);
  assert.ok(orgMenu.options.some((opt) => opt.value === "tenryu"));

  const buttons = btnRow.components.map((b) => b.toJSON().custom_id);
  assert.deepEqual(buttons, [
    MB_BTN_MAIN,
    MB_BTN_REWARDS,
    MB_BTN_MEDIA,
    MB_BTN_PUBLISH,
    MB_BTN_CANCEL,
  ]);
});

test("createMainInfoModal and createRewardsModal build valid modal dialogs with parsed customIds", () => {
  const state = createDraftState({
    title: "Рейд на логово",
    description: "Описание рейда",
    max_players: 8,
    reward: { ap: 30, sp: 15, reputation: 50, item_name: "Зелье", item_qty: 3 },
  });

  const mainModal = createMainInfoModal(state, "msg_main_999");
  const mainData = mainModal.toJSON();
  assert.equal(mainData.title, "Основная информация миссии");
  const parsedMain = parseModalCustomId(mainData.custom_id);
  assert.equal(parsedMain.namespace, MISSION_BUILDER_NAMESPACE);
  assert.equal(parsedMain.action, "main");
  assert.equal(parsedMain.messageId, "msg_main_999");

  const rewardsModal = createRewardsModal(state, "msg_rew_999");
  const rewData = rewardsModal.toJSON();
  assert.equal(rewData.title, "Награды за миссию");
  const parsedRew = parseModalCustomId(rewData.custom_id);
  assert.equal(parsedRew.namespace, MISSION_BUILDER_NAMESPACE);
  assert.equal(parsedRew.action, "rewards");
  assert.equal(parsedRew.messageId, "msg_rew_999");

  const mediaModal = createMediaModal(state, "msg_media_999");
  const mediaData = mediaModal.toJSON();
  assert.equal(mediaData.title, "Изображения и обложка миссии");
  const parsedMedia = parseModalCustomId(mediaData.custom_id);
  assert.equal(parsedMedia.namespace, MISSION_BUILDER_NAMESPACE);
  assert.equal(parsedMedia.action, "media");
  assert.equal(parsedMedia.messageId, "msg_media_999");

  // Проверяем, что при пустом начальном состоянии поля с min_length не содержат value: ""
  const emptyState = createDraftState();
  const emptyModal = createMainInfoModal(emptyState, "msg_empty");
  const emptyData = emptyModal.toJSON();
  const emptyTitle = emptyData.components[0].components[0];
  const emptyDesc = emptyData.components[2].components[0];
  assert.equal(emptyTitle.value, undefined);
  assert.equal(emptyDesc.value, undefined);
});

test("missionBuilderInteractionHandler authorizes GM/Admin owner and rejects foreign or non-staff", () => {
  const session = { owner_id: "user_admin", state: {} };

  const adminMember = {
    id: "user_admin",
    guild: { ownerId: "user_guild_owner" },
    permissions: { has: (perm) => perm === (1n << 3n) }, // Administrator
    roles: { cache: new Collection() },
  };
  const foreignAdminMember = {
    id: "user_other",
    guild: { ownerId: "user_guild_owner" },
    permissions: { has: () => true },
    roles: { cache: new Collection() },
  };
  const nonAdminMember = {
    id: "user_admin",
    guild: { ownerId: "user_guild_owner" },
    permissions: { has: () => false },
    roles: { cache: new Collection() },
  };

  // 1. Владелец сессии + Админ -> Разрешено
  assert.equal(
    missionBuilderInteractionHandler.authorize({
      interaction: { user: { id: "user_admin" }, member: adminMember },
      session,
    }),
    true
  );

  // 2. Чужой админ -> Запрещено (управляет только открывший)
  assert.equal(
    missionBuilderInteractionHandler.authorize({
      interaction: { user: { id: "user_other" }, member: foreignAdminMember },
      session,
    }),
    false
  );

  // 3. Владелец, но без прав ГМ/Админа -> Запрещено
  assert.equal(
    missionBuilderInteractionHandler.authorize({
      interaction: { user: { id: "user_admin" }, member: nonAdminMember },
      session,
    }),
    false
  );
});

test("missionBuilderInteractionHandler handles component selects and cancel button", async () => {
  const db = createMockDatabase();
  setDB(db);

  const initialDoc = {
    message_id: "msg_builder_1",
    namespace: MISSION_BUILDER_NAMESPACE,
    owner_id: "user_admin",
    status: "open",
    revision: 1,
    state: createDraftState(),
  };
  await db.collection("interaction_sessions").insertOne(initialDoc);

  let updatedPayload = null;

  // 1. Смена типа миссии
  const typeInteraction = {
    customId: MB_SELECT_TYPE,
    isStringSelectMenu: () => true,
    isChannelSelectMenu: () => false,
    values: [MISSION_TYPES.raid],
    update: async (payload) => {
      updatedPayload = payload;
    },
  };
  await missionBuilderInteractionHandler.handleComponent({
    interaction: typeInteraction,
    session: initialDoc,
  });

  const afterTypeDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_builder_1" });
  assert.equal(afterTypeDoc.state.type, MISSION_TYPES.raid);
  assert.ok(updatedPayload.embeds[0].data.description.includes("Набег"));

  // 2. Смена доступа
  const accessInteraction = {
    customId: MB_SELECT_ACCESS,
    isStringSelectMenu: () => true,
    isChannelSelectMenu: () => false,
    values: [MISSION_ACCESS.organization],
    update: async (payload) => {
      updatedPayload = payload;
    },
  };
  await missionBuilderInteractionHandler.handleComponent({
    interaction: accessInteraction,
    session: afterTypeDoc,
  });

  const afterAccessDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_builder_1" });
  assert.equal(afterAccessDoc.state.access, MISSION_ACCESS.organization);

  // 3. Кнопка «Отмена»
  let cancelUpdated = null;
  const cancelInteraction = {
    customId: MB_BTN_CANCEL,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    update: async (payload) => {
      cancelUpdated = payload;
    },
  };
  await missionBuilderInteractionHandler.handleComponent({
    interaction: cancelInteraction,
    session: afterAccessDoc,
  });

  const afterCancelDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_builder_1" });
  assert.equal(afterCancelDoc.status, "closed");
  assert.ok(cancelUpdated.embeds[0].data.title.includes("Создание миссии отменено"));
  assert.deepEqual(cancelUpdated.components, []);
});

test("missionBuilderInteractionHandler handles modal submissions for main info and rewards", async () => {
  const db = createMockDatabase();
  setDB(db);

  const doc = {
    message_id: "msg_modal_test",
    namespace: MISSION_BUILDER_NAMESPACE,
    owner_id: "user_gm",
    status: "open",
    revision: 1,
    state: createDraftState(),
  };
  await db.collection("interaction_sessions").insertOne(doc);

  let modalUpdatePayload = null;

  // 1. Отправка модалки "main"
  const mainModalInteraction = {
    fields: {
      getTextInputValue(fieldId) {
        if (fieldId === MB_INPUT_TITLE) return "Зачистка катакомб";
        if (fieldId === MB_INPUT_PLAYERS) return "10";
        if (fieldId === MB_INPUT_DESC) return "Необходимо уничтожить гнездо мутантов.";
        return "";
      },
    },
    update: async (payload) => {
      modalUpdatePayload = payload;
    },
  };

  await missionBuilderInteractionHandler.handleModal({
    interaction: mainModalInteraction,
    session: doc,
    action: "main",
  });

  const afterMainDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_modal_test" });
  assert.equal(afterMainDoc.state.title, "Зачистка катакомб");
  assert.equal(afterMainDoc.state.max_players, 10);
  assert.equal(afterMainDoc.state.description, "Необходимо уничтожить гнездо мутантов.");
  assert.ok(modalUpdatePayload.embeds[0].data.description.includes("Зачистка катакомб"));

  // 2. Отправка модалки "rewards"
  const rewModalInteraction = {
    fields: {
      getTextInputValue(fieldId) {
        if (fieldId === MB_INPUT_AP) return "40";
        if (fieldId === MB_INPUT_SP) return "20";
        if (fieldId === MB_INPUT_REP) return "80";
        if (fieldId === MB_INPUT_ITEM) return "Свиток молнии";
        if (fieldId === MB_INPUT_QTY) return "3";
        return "";
      },
    },
    update: async (payload) => {
      modalUpdatePayload = payload;
    },
  };

  await missionBuilderInteractionHandler.handleModal({
    interaction: rewModalInteraction,
    session: afterMainDoc,
    action: "rewards",
  });

  const afterRewDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_modal_test" });
  assert.equal(afterRewDoc.state.reward.ap, 40);
  assert.equal(afterRewDoc.state.reward.sp, 20);
  assert.equal(afterRewDoc.state.reward.reputation, 80);
  assert.equal(afterRewDoc.state.reward.item_name, "Свиток молнии");
  assert.equal(afterRewDoc.state.reward.item_qty, 3);
  assert.ok(modalUpdatePayload.embeds[0].data.description.includes("Свиток молнии"));

  // 3. Отправка модалки "media"
  const mediaModalInteraction = {
    fields: {
      getTextInputValue(fieldId) {
        if (fieldId === MB_INPUT_IMAGE) return "https://example.com/banner.png";
        if (fieldId === MB_INPUT_THUMBNAIL) return "https://example.com/icon.png";
        return "";
      },
    },
    update: async (payload) => {
      modalUpdatePayload = payload;
    },
  };

  await missionBuilderInteractionHandler.handleModal({
    interaction: mediaModalInteraction,
    session: afterRewDoc,
    action: "media",
  });

  const afterMediaDoc = await db.collection("interaction_sessions").findOne({ message_id: "msg_modal_test" });
  assert.equal(afterMediaDoc.state.image_url, "https://example.com/banner.png");
  assert.equal(afterMediaDoc.state.thumbnail_url, "https://example.com/icon.png");
  assert.equal(modalUpdatePayload.embeds[0].data.image.url, "https://example.com/banner.png");
  assert.equal(modalUpdatePayload.embeds[0].data.thumbnail.url, "https://example.com/icon.png");
});

test("publishMission validates required fields, permissions and publishes mission", async () => {
  const db = createMockDatabase();
  setDB(db);

  // 1. Попытка публикации без названия
  const emptyTitleDoc = {
    message_id: "msg_pub_1",
    namespace: MISSION_BUILDER_NAMESPACE,
    owner_id: "user_gm",
    status: "open",
    revision: 1,
    state: createDraftState({ title: "", description: "Вводная есть" }),
  };

  let errorContent = null;
  const failInteraction = {
    customId: MB_BTN_PUBLISH,
    reply: async ({ content }) => {
      errorContent = content;
    },
  };

  await missionBuilderInteractionHandler.handleComponent({
    interaction: failInteraction,
    session: emptyTitleDoc,
  });
  assert.ok(errorContent.includes("Укажите название миссии"));

  // 2. Успешная публикация
  const validDoc = {
    message_id: "msg_pub_valid",
    namespace: MISSION_BUILDER_NAMESPACE,
    owner_id: "user_gm",
    guild_id: "guild_123",
    status: "open",
    revision: 1,
    state: createDraftState({
      title: "Эпический рейд",
      description: "Битва на вершине башни",
      type: MISSION_TYPES.raid,
      access: MISSION_ACCESS.open,
      max_players: 6,
      channel_id: "channel_456",
      reward: { ap: 50, sp: 25, reputation: 100 },
    }),
  };
  await db.collection("interaction_sessions").insertOne(validDoc);

  let targetChannelSentPayload = null;
  let finalEditReplyPayload = null;

  const mockChannel = {
    id: "channel_456",
    guildId: "guild_123",
    permissionsFor: () => ({
      has: () => true, // Все права есть
    }),
    send: async (payload) => {
      targetChannelSentPayload = payload;
      return {
        id: "msg_mission_published_789",
        url: "https://discord.com/channels/guild_123/channel_456/msg_mission_published_789",
        startThread: async () => ({
          send: async () => {},
        }),
      };
    },
  };

  const publishInteraction = {
    customId: MB_BTN_PUBLISH,
    guildId: "guild_123",
    channelId: "channel_456",
    user: { id: "user_gm", username: "GM_Master" },
    guild: {
      id: "guild_123",
      members: { me: { id: "bot_123" } },
      channels: {
        fetch: async (id) => (id === "channel_456" ? mockChannel : null),
      },
    },
    deferUpdate: async () => {},
    editReply: async (payload) => {
      finalEditReplyPayload = payload;
    },
  };

  await missionBuilderInteractionHandler.handleComponent({
    interaction: publishInteraction,
    session: validDoc,
  });

  // Проверяем:
  // а) Карточка миссии отправлена в целевой канал
  assert.ok(targetChannelSentPayload);
  assert.ok(targetChannelSentPayload.embeds[0].data.title.includes("Эпический рейд"));

  // б) Создана миссия в MongoDB
  const allMissions = db._store.missions;
  assert.equal(allMissions.length, 1);
  const createdMission = allMissions[0];
  assert.equal(createdMission.title, "Эпический рейд");
  assert.equal(createdMission.max_players, 6);
  assert.equal(createdMission.channel_id, "channel_456");
  assert.equal(createdMission.reward.ap, 50);

  // в) Сессия черновика закрыта
  const closedDraft = await db.collection("interaction_sessions").findOne({ message_id: "msg_pub_valid" });
  assert.equal(closedDraft.status, "closed");

  // г) Финальное сообщение ГМу содержит ссылку на созданную миссию
  assert.ok(finalEditReplyPayload.embeds[0].data.title.includes("Миссия успешно создана"));
  assert.ok(finalEditReplyPayload.components[0].components[0].data.url.includes("msg_mission_published_789"));
});

test("mission builder allows selecting Korean and Japanese minimum ranks and persists to mission", async () => {
  const db = createMockDatabase();
  setDB(db);

  const draftState = createDraftState({
    title: "Миссия с ранговым ограничением",
    description: "Требуются опытные бойцы",
    min_rank: "none",
  });
  assert.equal(draftState.min_rank, null);

  const sessionDoc = {
    message_id: "msg_rank_session",
    owner_id: "user_gm_rank",
    guild_id: "guild_rank",
    channel_id: "chan_rank",
    status: "active",
    expires_at: new Date(Date.now() + 600000),
    state: draftState,
  };
  await db.collection("interaction_sessions").insertOne(sessionDoc);

  // 1. Выбираем корейский ранг IV
  const selectKoreanRankInteraction = {
    customId: MB_SELECT_RANK,
    isStringSelectMenu: () => true,
    values: ["IV"],
    guildId: "guild_rank",
    channelId: "chan_rank",
    user: { id: "user_gm_rank" },
    client: {},
    update: async () => {},
  };

  await missionBuilderInteractionHandler.handleComponent({
    interaction: selectKoreanRankInteraction,
    session: sessionDoc,
  });

  const updatedSession1 = await db.collection("interaction_sessions").findOne({ message_id: "msg_rank_session" });
  assert.equal(updatedSession1.state.min_rank, "IV");

  // 2. Меняем на японский ранг B
  const selectJapaneseRankInteraction = {
    customId: MB_SELECT_RANK,
    isStringSelectMenu: () => true,
    values: ["B"],
    guildId: "guild_rank",
    channelId: "chan_rank",
    user: { id: "user_gm_rank" },
    client: {},
    update: async () => {},
  };

  await missionBuilderInteractionHandler.handleComponent({
    interaction: selectJapaneseRankInteraction,
    session: updatedSession1,
  });

  const updatedSession2 = await db.collection("interaction_sessions").findOne({ message_id: "msg_rank_session" });
  assert.equal(updatedSession2.state.min_rank, "B");

  // 3. Публикуем миссию и проверяем, что в созданной миссии сохранён min_rank: "B"
  const mockChannel = {
    id: "chan_rank",
    guildId: "guild_rank",
    permissionsFor: () => ({ has: () => true }),
    send: async () => ({
      id: "msg_card_rank",
      url: "https://discord.com/channels/guild_rank/chan_rank/msg_card_rank",
    }),
  };

  const publishInteraction = {
    customId: MB_BTN_PUBLISH,
    guildId: "guild_rank",
    channelId: "chan_rank",
    user: { id: "user_gm_rank", username: "GM_Rank" },
    guild: {
      id: "guild_rank",
      members: { me: { id: "bot_rank" } },
      channels: { fetch: async () => mockChannel },
    },
    deferUpdate: async () => {},
    editReply: async () => {},
  };

  await missionBuilderInteractionHandler.handleComponent({
    interaction: publishInteraction,
    session: updatedSession2,
  });

  const createdMission = db._store.missions.find((m) => m.title === "Миссия с ранговым ограничением");
  assert.ok(createdMission);
  assert.equal(createdMission.min_rank, "B");
});

