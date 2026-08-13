import assert from "node:assert/strict";
import test from "node:test";
import {
  createInventoryComponents,
  createInventoryItemComponents,
  createItemUsedComponents,
  getInventoryPageCount,
} from "../utils/inventoryComponents.js";
import { formatItemEffect, getItemDefinition } from "../utils/itemSystem.js";

const avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";

test("recognizes supported AP and SP consumables", () => {
  const ap = getItemDefinition("AP Tome (50)");
  const defaultSP = getItemDefinition("SP Scroll: Muay Thai");
  const customSP = getItemDefinition("SP Scroll: Muay Thai (75)");

  assert.equal(ap.kind, "ap");
  assert.equal(ap.amount, 50);
  assert.equal(defaultSP.styleName, "Muay Thai");
  assert.equal(defaultSP.amount, 30);
  assert.equal(customSP.styleName, "Muay Thai");
  assert.equal(customSP.amount, 75);
  assert.equal(formatItemEffect("AP Tome (50)", 3), "+150 AP");
  assert.equal(getItemDefinition("\u0422\u043e\u043c AP (100)").amount, 100);
  assert.equal(getItemDefinition("\u0421\u0432\u0438\u0442\u043e\u043a SP: Aikido: reverse").styleName, "Aikido: reverse");
  assert.equal(getItemDefinition("SP Scroll: Aikido").styleName, "Aikido: reverse");
  assert.equal(getItemDefinition("SP Scroll: Muay Thai (999999999999999999999)").usable, false);
});

test("keeps unknown items collectible and non-consumable", () => {
  const item = getItemDefinition("Quest Key");
  assert.equal(item.kind, "collectible");
  assert.equal(item.usable, false);
});

test("builds valid Components V2 pages and item states", () => {
  const inventory = Array.from({ length: 30 }, (_, index) => ({
    item_name: index === 0 ? "AP Tome (50)" : `Quest Item ${index}`,
    qty: index + 1,
  }));
  const base = { characterName: "Test **Hero**", avatarUrl };

  assert.equal(getInventoryPageCount(inventory), 3);

  const components = [
    ...createInventoryComponents({ ...base, inventory, canUse: true }),
    ...createInventoryItemComponents({
      ...base,
      item: inventory[0],
      canUse: true,
    }),
    ...createItemUsedComponents({
      ...base,
      result: {
        definition: getItemDefinition("AP Tome (50)"),
        style: null,
        itemName: "AP Tome (50)",
        quantity: 1,
        reward: 50,
        newValue: 150,
        remainingQuantity: 0,
      },
    }),
  ];

  for (const component of components) {
    assert.doesNotThrow(() => component.toJSON());
  }
});

test("keeps extreme legacy quantities inside Discord component limits", () => {
  const item = { item_name: "AP Tome (50)", qty: 1e300 };
  const components = createInventoryItemComponents({
    characterName: "Extreme Hero",
    avatarUrl,
    item,
    canUse: true,
  });

  assert.doesNotThrow(() => components[0].toJSON());
});
