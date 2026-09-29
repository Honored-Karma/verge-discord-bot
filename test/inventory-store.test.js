import assert from "node:assert/strict";
import test from "node:test";
import {
  decrementOrRemoveInventoryStack,
  incrementInventoryStack,
} from "../utils/inventoryStore.js";

function memoryInventory(initial = []) {
  const documents = initial.map((item, index) => ({ _id: index + 1, ...item }));
  return {
    documents,
    async findOne(filter) {
      return documents.find((item) => {
        if (filter.player_id && item.player_id !== filter.player_id) return false;
        if (filter.item_name) {
          if (filter.item_name instanceof RegExp || filter.item_name?.$regex) {
            const regex = filter.item_name instanceof RegExp ? filter.item_name : filter.item_name.$regex;
            return regex.test(item.item_name);
          }
          return item.item_name === filter.item_name;
        }
        return true;
      }) || null;
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
    async deleteOne(filter) {
      const index = documents.findIndex((candidate) => {
        if (filter._id && candidate._id !== filter._id) return false;
        if (Object.hasOwn(filter, "qty") && candidate.qty !== filter.qty) return false;
        return true;
      });
      if (index === -1) return { deletedCount: 0 };
      documents.splice(index, 1);
      return { deletedCount: 1 };
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

test("decrements, removes, and cleans up inventory stacks", async () => {
  const inventory = memoryInventory([
    { player_id: "player1", item_name: "Healing Potion", qty: 10 },
  ]);

  // Partial decrement
  const partial = await decrementOrRemoveInventoryStack(inventory, {
    playerId: "player1",
    itemName: "Healing Potion",
    quantity: 4,
  });
  assert.deepEqual(partial, {
    success: true,
    itemName: "Healing Potion",
    removedQuantity: 4,
    remainingQuantity: 6,
    previousQuantity: 10,
  });
  assert.equal(inventory.documents[0].qty, 6);

  // Insufficient quantity rejection
  const tooMany = await decrementOrRemoveInventoryStack(inventory, {
    playerId: "player1",
    itemName: "Healing Potion",
    quantity: 10,
  });
  assert.deepEqual(tooMany, {
    success: false,
    reason: "insufficient_quantity",
    available: 6,
    itemName: "Healing Potion",
  });

  // Exact decrement cleans up document
  const exact = await decrementOrRemoveInventoryStack(inventory, {
    playerId: "player1",
    itemName: "healing potion", // test case-insensitive match
    quantity: 6,
  });
  assert.deepEqual(exact, {
    success: true,
    itemName: "Healing Potion",
    removedQuantity: 6,
    remainingQuantity: 0,
    previousQuantity: 6,
  });
  assert.equal(inventory.documents.length, 0);

  // removeAll on new stack
  await incrementInventoryStack(inventory, {
    playerId: "player1",
    itemName: "Scroll of Wisdom",
    quantity: 50,
  });
  assert.equal(inventory.documents.length, 1);

  const removedAll = await decrementOrRemoveInventoryStack(inventory, {
    playerId: "player1",
    itemName: "Scroll of Wisdom",
    removeAll: true,
  });
  assert.deepEqual(removedAll, {
    success: true,
    itemName: "Scroll of Wisdom",
    removedQuantity: 50,
    remainingQuantity: 0,
    previousQuantity: 50,
  });
  assert.equal(inventory.documents.length, 0);

  // Item not found
  const notFound = await decrementOrRemoveInventoryStack(inventory, {
    playerId: "player1",
    itemName: "Nonexistent Item",
  });
  assert.deepEqual(notFound, {
    success: false,
    reason: "not_found",
  });
});

