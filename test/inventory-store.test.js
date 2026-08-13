import assert from "node:assert/strict";
import test from "node:test";
import { incrementInventoryStack } from "../utils/inventoryStore.js";

function memoryInventory(initial = []) {
  const documents = initial.map((item, index) => ({ _id: index + 1, ...item }));
  return {
    documents,
    async findOne(filter) {
      return documents.find((item) => (
        item.player_id === filter.player_id && item.item_name === filter.item_name
      )) || null;
    },
    async insertOne(document) {
      if (documents.some((item) => (
        item.player_id === document.player_id && item.item_name === document.item_name
      ))) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      documents.push({ _id: documents.length + 1, ...document });
      return { acknowledged: true };
    },
    async updateOne(filter, update) {
      const item = documents.find((candidate) => candidate._id === filter._id);
      const expectedQuantity = filter.qty;
      const matchesQuantity = expectedQuantity?.$exists === false
        ? !Object.hasOwn(item, "qty")
        : item?.qty === expectedQuantity;
      if (!item || !matchesQuantity) return { matchedCount: 0 };
      Object.assign(item, update.$set);
      return { matchedCount: 1 };
    },
  };
}

test("creates and increments an inventory stack", async () => {
  const inventory = memoryInventory();
  const created = await incrementInventoryStack(inventory, {
    playerId: "player",
    itemName: "AP Tome (50)",
    quantity: 25,
  });
  const incremented = await incrementInventoryStack(inventory, {
    playerId: "player",
    itemName: "AP Tome (50)",
    quantity: 10,
  });

  assert.deepEqual(created, {
    success: true,
    previousQuantity: 0,
    totalQuantity: 25,
  });
  assert.deepEqual(incremented, {
    success: true,
    previousQuantity: 25,
    totalQuantity: 35,
  });
  assert.equal(inventory.documents[0].qty, 35);
});

test("repairs a legacy stack without qty and rejects unsafe totals", async () => {
  const legacy = memoryInventory([{ player_id: "player", item_name: "Key" }]);
  const repaired = await incrementInventoryStack(legacy, {
    playerId: "player",
    itemName: "Key",
    quantity: 3,
  });
  assert.equal(repaired.totalQuantity, 3);

  const unsafe = memoryInventory([{
    player_id: "player",
    item_name: "Huge",
    qty: Number.MAX_SAFE_INTEGER,
  }]);
  assert.deepEqual(await incrementInventoryStack(unsafe, {
    playerId: "player",
    itemName: "Huge",
    quantity: 1,
  }), { success: false, reason: "quantity_too_large" });
});
