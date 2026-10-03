import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_APPLICATION_NAMESPACE,
  createAcceptApplicationState,
  createAcceptApplicationPreviewEmbed,
  createAcceptApplicationComponents,
  createCharacterInfoModal,
  createAcceptStatsModal,
  createAcceptUrlModal,
  createJuniperAcceptanceEmbed,
  createJuniperPublicMessage,
  acceptApplicationInteractionHandler,
  ACC_BTN_INFO,
  ACC_BTN_STATS,
  ACC_BTN_URL,
  ACC_BTN_CONFIRM,
  ACC_BTN_CANCEL,
  DEFAULT_PLAYER_ROLE_ID,
  DEFAULT_UNVERIFIED_ROLE_ID,
} from "../interactions/acceptApplicationSession.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import { resolveAcceptanceSlot } from "../commands/accept.js";

test("accept command permissions: anketolog, GM, admin can run accept", () => {
  process.env.ANKETOLOG_ROLE_IDS = "1431759459528610013";

  const anketologMember = {
    id: "111",
    guild: { ownerId: "999" },
    permissions: { has: () => false },
    roles: { cache: [{ id: "1431759459528610013" }] },
  };

  const normalMember = {
    id: "222",
    guild: { ownerId: "999" },
    permissions: { has: () => false },
    roles: { cache: [{ id: "999999999" }] },
  };

  assert.equal(hasCommandPermission(anketologMember, "accept"), true);
  assert.equal(hasCommandPermission(anketologMember, "accept-application"), true);
  assert.equal(hasCommandPermission(normalMember, "accept"), false);
});

test("createAcceptApplicationState: initializes state with defaults and target user", () => {
  const state = createAcceptApplicationState({
    target_user_id: "123456789",
    target_username: "testuser",
    slot: 1,
    character_name: "Рейме",
    attribute_name: "Тень",
    stats: {
      punch_strength_kg: 500,
      lifting_strength_kg: 200,
      speed_kmh: 40,
      stamina_percent: 100,
      reaction_ms: 120,
    },
  });

  assert.equal(state.target_user_id, "123456789");
  assert.equal(state.player_id, "123456789");
  assert.equal(state.character_name, "Рейме");
  assert.equal(state.attribute_name, "Тень");
  assert.equal(state.stats.punch_strength_kg, 500);
  assert.equal(state.stats.lifting_strength_kg, 200);
  assert.equal(state.stats.speed_kmh, 40);
  assert.equal(state.stats.stamina_percent, 100);
  assert.equal(state.stats.reaction_ms, 120);

  // Test slot 2 id generation
  const stateSlot2 = createAcceptApplicationState({
    target_user_id: "123456789",
    slot: 2,
  });
  assert.equal(stateSlot2.player_id, "123456789_2");
  assert.equal(stateSlot2.slot, 2);
});

test("createAcceptApplicationPreviewEmbed: correctly renders preview with role mentions and preserves member role", () => {
  const state = createAcceptApplicationState({
    target_user_id: "555666",
    target_username: "hero",
    character_name: "Хана Ками",
    attribute_name: "Ангел",
    organization: "TENRYU",
    rank: "S",
    stats: {
      punch_strength_kg: 1000,
      lifting_strength_kg: 500,
      speed_kmh: 120,
      stamina_percent: 150,
      reaction_ms: 50,
    },
  });

  const embed = createAcceptApplicationPreviewEmbed(state);
  assert.equal(embed.data.title, "📋 Принятие анкеты и регистрация персонажа");
  assert.equal(embed.data.color, 0x27ff5d);

  const desc = embed.data.description;
  assert.ok(desc.includes("<@555666>"));
  assert.ok(desc.includes("Хана Ками"));
  assert.ok(desc.includes("Ангел"));
  assert.ok(desc.includes("TENRYU"));
  assert.ok(/1[\s\u00a0\u202f]000\s*кг/.test(desc));
  assert.ok(desc.includes(`Будет выдана роль: <@&${DEFAULT_PLAYER_ROLE_ID}>`));
  assert.ok(!desc.includes("Будет снята роль"));
});

test("createAcceptApplicationComponents: creates buttons with correct customIds", () => {
  const components = createAcceptApplicationComponents(false);
  assert.equal(components.length, 2);

  const row1Buttons = components[0].components;
  assert.equal(row1Buttons.length, 3);
  assert.equal(row1Buttons[0].data.custom_id, ACC_BTN_INFO);
  assert.equal(row1Buttons[1].data.custom_id, ACC_BTN_STATS);
  assert.equal(row1Buttons[2].data.custom_id, ACC_BTN_URL);

  const row2Buttons = components[1].components;
  assert.equal(row2Buttons.length, 2);
  assert.equal(row2Buttons[0].data.custom_id, ACC_BTN_CONFIRM);
  assert.equal(row2Buttons[1].data.custom_id, ACC_BTN_CANCEL);
});

test("createCharacterInfoModal, stats modal, and url modal have valid structure", () => {
  const state = createAcceptApplicationState({
    target_user_id: "123",
    character_name: "Акира",
    attribute_name: "Молния",
  });

  const infoModal = createCharacterInfoModal(state, "msg_123");
  assert.ok(infoModal.data.custom_id.startsWith(`${ACCEPT_APPLICATION_NAMESPACE}|info|msg_123`));
  assert.equal(infoModal.components.length, 5);

  const statsModal = createAcceptStatsModal(state, "msg_123");
  assert.ok(statsModal.data.custom_id.startsWith(`${ACCEPT_APPLICATION_NAMESPACE}|stats|msg_123`));
  assert.equal(statsModal.components.length, 5);

  const urlModal = createAcceptUrlModal(state, "msg_123");
  assert.ok(urlModal.data.custom_id.startsWith(`${ACCEPT_APPLICATION_NAMESPACE}|url|msg_123`));
  assert.equal(urlModal.components.length, 1);
});

test("createJuniperPublicMessage: matches exact Juniper template and settings", () => {
  const state = createAcceptApplicationState({
    target_user_id: "998877",
    character_name: "Казе",
  });

  const message = createJuniperPublicMessage(state);
  assert.ok(message.content.includes("<@998877>"));
  assert.ok(
    message.content.includes(
      "- ***Дорогой анкетолог, не забудьте отправить эту анкету в __архив__! А также создать отчёт.***"
    )
  );

  const embed = message.embeds[0];
  assert.equal(embed.data.color, 0x27ff5d);
  assert.equal(embed.data.title, "╔════ ☒-☒-☒-☒-☒-□ ════╗");
  assert.equal(embed.data.image.url, "https://c.tenor.com/G-tCLZtt-U8AAAAC/tenor.gif");
  assert.equal(embed.data.footer.text, "<-✧ —□— —□— ✦✧✦ —□— —□— ✧ -><-✧ —□— —□— ✦✧✦ -");

  const desc = embed.data.description;
  assert.ok(desc.includes("# > ₊˚.༄ ೃ - ПРИНЯТИЕ АНКЕТЫ!"));
  assert.ok(desc.includes("Ваша анкета прошла проверку. Теперь вы являетесь полноправным __игроком__ на проекте."));
  assert.ok(desc.includes("Мастерам Игры"));
  assert.ok(desc.includes("Казе"));
  assert.ok(desc.includes("```ansi"));
  assert.ok(desc.includes("\u001b[2;32m"));
  assert.ok(desc.includes("Помните! Наш сервер всегда рад новым игрокам."));
});

test("acceptApplicationInteractionHandler.authorize: validates owner and anketolog permissions", () => {
  process.env.ANKETOLOG_ROLE_IDS = "1431759459528610013";

  const session = { owner_id: "111" };
  const authorizedMember = {
    id: "111",
    guild: { ownerId: "999" },
    permissions: { has: () => false },
    roles: { cache: [{ id: "1431759459528610013" }] },
  };

  const unauthorizedOwner = {
    id: "222",
    guild: { ownerId: "999" },
    permissions: { has: () => false },
    roles: { cache: [] },
  };

  assert.equal(
    acceptApplicationInteractionHandler.authorize({
      interaction: { user: { id: "111" }, member: authorizedMember },
      session,
    }),
    true
  );

  assert.equal(
    acceptApplicationInteractionHandler.authorize({
      interaction: { user: { id: "222" }, member: unauthorizedOwner },
      session,
    }),
    false
  );
});

test("resolveAcceptanceSlot: auto-selects slot 1 when user has no characters", () => {
  const res = resolveAcceptanceSlot({
    requestedSlot: null,
    slot1Player: null,
    slot2Player: null,
    slot3Player: null,
    isSlot3Unlocked: false,
    targetUserId: "123",
  });
  assert.equal(res.ok, true);
  assert.equal(res.slot, 1);
});

test("resolveAcceptanceSlot: auto-selects slot 2 when slot 1 is occupied", () => {
  const res = resolveAcceptanceSlot({
    requestedSlot: null,
    slot1Player: { character_name: "Первый" },
    slot2Player: null,
    slot3Player: null,
    isSlot3Unlocked: false,
    targetUserId: "123",
  });
  assert.equal(res.ok, true);
  assert.equal(res.slot, 2);
});

test("resolveAcceptanceSlot: blocks accepting into occupied slot 1", () => {
  const res = resolveAcceptanceSlot({
    requestedSlot: 1,
    slot1Player: { character_name: "Первый" },
    slot2Player: null,
    slot3Player: null,
    isSlot3Unlocked: false,
    targetUserId: "123",
  });
  assert.equal(res.ok, false);
  assert.equal(res.title, "Слот занят");
  assert.ok(res.message.includes("Первый"));
  assert.ok(res.message.includes("во избежание удаления существующего персонажа"));
});

test("resolveAcceptanceSlot: blocks accepting into occupied slot 2", () => {
  const res = resolveAcceptanceSlot({
    requestedSlot: 2,
    slot1Player: { character_name: "Первый" },
    slot2Player: { character_name: "Второй" },
    slot3Player: null,
    isSlot3Unlocked: false,
    targetUserId: "123",
  });
  assert.equal(res.ok, false);
  assert.equal(res.title, "Слот занят");
  assert.ok(res.message.includes("Второй"));
});

test("resolveAcceptanceSlot: enforces sequential rule (slot 2 requires slot 1)", () => {
  const res = resolveAcceptanceSlot({
    requestedSlot: 2,
    slot1Player: null,
    slot2Player: null,
    slot3Player: null,
    isSlot3Unlocked: false,
    targetUserId: "123",
  });
  assert.equal(res.ok, false);
  assert.equal(res.title, "Сначала примите слот 1");
});

test("resolveAcceptanceSlot: blocks slot 3 when locked and allows when unlocked and slots 1&2 exist", () => {
  const lockedRes = resolveAcceptanceSlot({
    requestedSlot: 3,
    slot1Player: { character_name: "Первый" },
    slot2Player: { character_name: "Второй" },
    slot3Player: null,
    isSlot3Unlocked: false,
    targetUserId: "123",
  });
  assert.equal(lockedRes.ok, false);
  assert.equal(lockedRes.title, "Слот 3 заблокирован");

  const unlockedRes = resolveAcceptanceSlot({
    requestedSlot: 3,
    slot1Player: { character_name: "Первый" },
    slot2Player: { character_name: "Второй" },
    slot3Player: null,
    isSlot3Unlocked: true,
    targetUserId: "123",
  });
  assert.equal(unlockedRes.ok, true);
  assert.equal(unlockedRes.slot, 3);
});

test("resolveAcceptanceSlot: blocks accepting when all slots are occupied", () => {
  const res = resolveAcceptanceSlot({
    requestedSlot: null,
    slot1Player: { character_name: "Первый" },
    slot2Player: { character_name: "Второй" },
    slot3Player: { character_name: "Третий" },
    isSlot3Unlocked: true,
    targetUserId: "123",
  });
  assert.equal(res.ok, false);
  assert.equal(res.title, "Все слоты заняты");
});

