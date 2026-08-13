import assert from "node:assert/strict";
import test from "node:test";
import {
  createAPItemName,
  createSPItemName,
  getItemDefinition,
  listCatalogItems,
} from "../utils/itemSystem.js";
import {
  createGiveItemAPModal,
  createGiveItemCenterComponents,
  createGiveItemCollectibleModal,
  createGiveItemCustomModal,
  createGiveItemPreviewComponents,
  createGiveItemReceiptComponents,
  createGiveItemSPModal,
  createGiveItemQuantityModal,
  createGiveItemStatusComponents,
  createGiveItemStyleComponents,
} from "../utils/giveItemComponents.js";

const avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
const base = {
  characterName: "Target **Hero**",
  avatarUrl,
  slot: 2,
  quantity: 25,
};

test("builds canonical AP and SP item names", () => {
  assert.equal(createAPItemName(50), "AP Tome (50)");
  assert.equal(createAPItemName(0), null);
  assert.equal(createSPItemName("Muay Thai", 30), "SP Scroll: Muay Thai");
  assert.equal(createSPItemName("Muay Thai", 75), "SP Scroll: Muay Thai (75)");
  assert.notEqual(getItemDefinition("AP Tome (0)").kind, "collectible");
  assert.ok(listCatalogItems().length >= 4);
});

test("builds every give-item interface state", () => {
  const catalog = listCatalogItems();
  const styles = [
    { id: 1, name: "Muay Thai" },
    { id: 2, name: "Aikido: reverse" },
  ];
  const states = [
    ...createGiveItemCenterComponents({ ...base, catalog }),
    ...createGiveItemStyleComponents({ ...base, styles }),
    ...createGiveItemPreviewComponents({
      ...base,
      itemName: "AP Tome (50)",
    }),
    ...createGiveItemReceiptComponents({
      ...base,
      result: {
        success: true,
        itemName: "SP Scroll: Muay Thai",
        quantity: 25,
        previousQuantity: 25,
        totalQuantity: 50,
      },
    }),
    ...createGiveItemStatusComponents("Issue cancelled", "Inventory unchanged.", "neutral"),
  ];
  for (const state of states) assert.doesNotThrow(() => state.toJSON());
});

test("builds valid custom item modals", () => {
  const context = "123456789012345678:2:25";
  const modals = [
    createGiveItemAPModal(context),
    createGiveItemSPModal(`${context}:15`, "Very long martial art name"),
    createGiveItemCollectibleModal(context),
    createGiveItemCustomModal(context),
    createGiveItemQuantityModal(context, 25),
  ];
  for (const modal of modals) assert.doesNotThrow(() => modal.toJSON());
});

test("give-item buttons use Discord-compatible emoji", () => {
  const states = [
    ...createGiveItemPreviewComponents({
      ...base,
      itemName: "AP Tome (50)",
    }),
    ...createGiveItemReceiptComponents({
      ...base,
      result: {
        itemName: "AP Tome (50)",
        quantity: 1,
        previousQuantity: 0,
        totalQuantity: 1,
      },
    }),
  ].map((component) => component.toJSON());
  const emojis = states
    .flatMap((container) => container.components || [])
    .flatMap((component) => component.components || [])
    .map((component) => component.emoji?.name)
    .filter(Boolean);

  assert.deepEqual(emojis, ["✅", "❌", "🔁", "⬅️"]);
  for (const emoji of emojis) assert.match(emoji, /\p{Extended_Pictographic}/u);
});
