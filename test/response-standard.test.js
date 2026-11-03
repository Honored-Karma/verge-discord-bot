import assert from "node:assert/strict";
import test from "node:test";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, MessageFlagsBitField } from "discord.js";
import { createStatusComponents, modernizeResponsePayload, installModernResponseAdapter } from "../utils/modernResponses.js";
import { createErrorEmbed, createInfoEmbed, createSuccessEmbed } from "../utils/embeds.js";
import { RESPONSE_COLORS } from "../utils/responseStyle.js";
import { createProfileV2Components } from "../utils/profileComponents.js";
import { createTrainingModal, createTrainingSuccessComponents } from "../utils/trainingComponents.js";
import { createSPStyleSelectionComponents } from "../utils/spTrainingComponents.js";
import { createInventoryEmptyComponents, createInventoryComponents } from "../utils/inventoryComponents.js";
import { createPayPreviewComponents } from "../utils/bankingComponents.js";
import { calculateTransfer } from "../utils/banking.js";
import { createShopItemComponents, createShopOrdersComponents, createShopStyleComponents, SHOP_BACK_ID, SHOP_ORDERS_ID } from "../utils/shopComponents.js";
import { getShopItem, listShopItems } from "../utils/shopCatalog.js";
import { __testables as shop } from "../interactions/shopSession.js";
import { createMissionCardEmbed, createMissionActionRows, createMissionDetailsComponents } from "../utils/missionComponents.js";

const json = (components) => components.map((component) => component.toJSON?.() || component);
function flatten(components) {
  return json(components).flatMap((component) => [component, ...flatten(component.components || []),
    ...(component.accessory ? flatten([component.accessory]) : [])]);
}
function validatePayload(payload) {
  const data = modernizeResponsePayload(payload);
  const all = flatten(data.components);
  assert.ok(all.length <= 40, `component count: ${all.length}`);
  const text = all.filter(c => c.type === 10).map(c => c.content).join("");
  assert.ok(text.length <= 4000, `text length: ${text.length}`);
  assert.ok(data.flags & MessageFlags.IsComponentsV2);
  const ids = all.filter(c => c.custom_id).map(c => c.custom_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of all) {
    if (c.type === 1) assert.ok(c.components.length >= 1 && c.components.length <= 5);
    if (c.type === 2) assert.ok((c.label?.length || 0) <= 80 && (c.custom_id?.length || 0) <= 100);
    if (c.type === 3) {
      assert.ok(c.options.length >= 1 && c.options.length <= 25);
      for (const option of c.options) assert.ok(option.label.length <= 100 && (option.description?.length || 0) <= 100);
    }
  }
  return data;
}

test("explicit response states survive misleading character text and preserve flags/actions", () => {
  for (const [make, state] of [[createSuccessEmbed, "success"], [createErrorEmbed, "error"], [createInfoEmbed, "info"]]) {
    const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("action").setLabel("Продолжить").setStyle(ButtonStyle.Secondary));
    const data = validatePayload({ embeds: [make("Обновлено", "Ошибка — имя персонажа. Успешно — название стиля.")],
      components: [button], flags: [MessageFlags.Ephemeral, MessageFlags.SuppressNotifications], allowedMentions: { parse: [] } });
    assert.equal(json(data.components)[0].accent_color, RESPONSE_COLORS[state]);
    assert.ok(data.flags & MessageFlags.Ephemeral);
    assert.ok(data.flags & MessageFlags.SuppressNotifications);
    assert.deepEqual(data.allowedMentions, { parse: [] });
    assert.ok(flatten(data.components).some(c => c.custom_id === "action"));
    assert.equal(data.responseState, undefined);
  }
  const edited = modernizeResponsePayload({ content: "Текст", flags: new MessageFlagsBitField(MessageFlags.Ephemeral), responseState: "warning" }, { resetLegacyFields: true });
  assert.equal(edited.content, null);
  assert.deepEqual(edited.embeds, []);
  assert.equal(edited.components[0].toJSON().accent_color, RESPONSE_COLORS.warning);
});

test("large legacy messages preserve the complete text, media and controls within V2 limits", () => {
  const embeds = Array.from({ length: 10 }, (_, i) => new EmbedBuilder().setTitle(`Раздел ${i}`)
    .setDescription(`Начало ${i} ${"данные ".repeat(65)} Конец ${i}`)
    .setThumbnail(`https://example.test/thumb-${i}.png`).setImage(`https://example.test/image-${i}.png`));
  const rows = Array.from({ length: 5 }, (_, i) => new ActionRowBuilder().addComponents(
    Array.from({ length: 5 }, (_, j) => new ButtonBuilder().setCustomId(`action-${i}-${j}`).setLabel("Действие").setStyle(ButtonStyle.Secondary))));
  const original = Buffer.from("existing");
  const payload = validatePayload({ embeds, components: rows, files: [{ attachment: original, name: "existing.txt" }], ephemeral: true });
  assert.equal(payload.files.length, 2);
  assert.equal(payload.files[0].attachment, original);
  const fullText = payload.files[1].attachment.toString("utf8");
  for (let i = 0; i < 10; i++) assert.ok(fullText.includes(`Конец ${i}`));
  assert.equal(flatten(payload.components).filter(c => c.type === 2).length, 25);
  assert.equal(flatten(payload.components).filter(c => c.type === 12).flatMap(c => c.items).length, 20);
  assert.ok(payload.flags & MessageFlags.Ephemeral);
});

test("private follow-ups and failed edits never replace the cached original panel", async () => {
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("confirm").setLabel("Подтвердить").setStyle(ButtonStyle.Success));
  const source = modernizeResponsePayload({ content: "Исходная панель", components: [row] });
  const calls = [];
  const interaction = { message: { id: "cache-test", components: source.components },
    async followUp(payload) { return { id: "private-follow-up" }; },
    async editReply(payload) { calls.push(payload); return { id: "cache-test" }; },
    async update() { throw new Error("Discord unavailable"); } };
  installModernResponseAdapter(interaction);
  installModernResponseAdapter(interaction);
  await interaction.followUp({ content: "Личные сведения", ephemeral: true });
  await assert.rejects(interaction.update({ content: "Не сохранено" }));
  await interaction.editReply({ components: [] });
  const text = JSON.stringify(calls[0]);
  assert.match(text, /Исходная панель/);
  assert.doesNotMatch(text, /Личные сведения|Не сохранено|confirm/);
});

test("a private component reply without a returned message id cannot leak into its public source", async () => {
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("source-action").setLabel("Открыть").setStyle(ButtonStyle.Secondary));
  const source = modernizeResponsePayload({ content: "Публичная карточка", components: [row] });
  const calls = [];
  const interaction = { message: { id: "public-source", components: source.components },
    async reply() {},
    async update(payload) { calls.push(["public", payload]); },
    async editReply(payload) { calls.push(["private", payload]); } };
  installModernResponseAdapter(interaction);
  await interaction.reply({ content: "Личный баланс: 500", ephemeral: true });
  await interaction.update({ components: [] });
  await interaction.editReply({ components: [] });
  assert.match(JSON.stringify(calls[0]), /Публичная карточка/);
  assert.doesNotMatch(JSON.stringify(calls[0]), /Личный баланс/);
  assert.match(JSON.stringify(calls[1]), /Личный баланс/);
});

test("all shared states serialize; empty data and long names remain usable", () => {
  for (const state of ["info", "success", "warning", "error", "confirm", "empty", "unavailable", "expired", "closed"]) {
    validatePayload({ components: createStatusComponents("Состояние", "Пояснение и следующий шаг.", state) });
  }
  const name = "Очень длинное имя **персонажа** ".repeat(25);
  validatePayload({ components: createProfileV2Components({ page: "main", player: { character_name: name, yen: Number.MAX_SAFE_INTEGER }, slot: 1,
    styles: Array.from({ length: 60 }, (_, i) => ({ name: `${i} ${name}`, sp: i })) }) });
  validatePayload({ components: createTrainingSuccessComponents({ characterName: name, gained: 12, newAP: 100, baseReward: 10,
    multiplier: 120, retryAt: 2000000000, activityText: "Текст ".repeat(700) }) });
  validatePayload({ components: createSPStyleSelectionComponents({ characterName: name, styles: [] }) });
  validatePayload({ components: createInventoryComponents({ characterName: name, inventory: [] }) });
  validatePayload({ components: createInventoryEmptyComponents(name) });
  validatePayload({ components: createPayPreviewComponents({ senderName: name, recipientName: name, recipientSlot: 2,
    currency: "yen", calculation: calculateTransfer(1000), senderBalance: 800 }) });
  const item = getShopItem(listShopItems()[0].id);
  const emptyStyles = validatePayload({ components: createShopStyleComponents({ item, styles: [] }) });
  assert.ok(flatten(emptyStyles.components).some(c => c.custom_id === SHOP_BACK_ID));
  assert.equal(flatten(emptyStyles.components).some(c => c.type === 3), false);
  validatePayload({ components: createShopItemComponents({ characterName: name, balance: 0, currency: "yen", item: { ...item, stock: 0, description: name.repeat(10) } }) });
  validatePayload({ components: createShopOrdersComponents({ orders: Array.from({ length: 10 }, (_, i) => ({ item_name: name, public_id: `R${i}`, status: "pending_review", created_at: new Date(), resolution_reason: name })) }) });
  const modal = createTrainingModal(1).toJSON();
  assert.ok(modal.components.length <= 5);
  assert.ok(modal.components.find(c => c.type === 18).description.length <= 100);
});

test("mission summary and full conditions survive long titles, objectives and rosters", () => {
  const mission = { title: "Название ".repeat(50), public_id: "M123", description: "Условия сцены. ".repeat(200),
    status: "recruiting", max_players: 20, created_by: { username: "ГМ" }, reward: { ap: 10 },
    participants: Array.from({ length: 20 }, (_, i) => ({ character_name: `Игрок ${i} ` + "Имя ".repeat(30), rank: "A" })) };
  const embed = createMissionCardEmbed(mission);
  assert.doesNotThrow(() => embed.toJSON());
  const payload = validatePayload({ embeds: [embed], components: createMissionActionRows(mission) });
  assert.equal(json(payload.components)[0].accent_color, RESPONSE_COLORS.info);
  assert.ok(flatten(payload.components).some(c => c.custom_id === "mission_details"));
  const details = validatePayload({ components: createMissionDetailsComponents(mission), flags: MessageFlags.Ephemeral });
  assert.ok(JSON.stringify(details).includes("канонические последствия"));
});

test("shop return from orders preserves category, page, currency and item", async () => {
  const state = { view: "item", item_id: "item", category_id: "category", category_page: 2, currency: "krw" };
  await shop.applyNavigation({ customId: SHOP_ORDERS_ID }, state);
  await shop.applyNavigation({ customId: SHOP_BACK_ID }, state);
  assert.deepEqual(state, { view: "item", item_id: "item", category_id: "category", category_page: 2, currency: "krw", return_view: "item" });
});
