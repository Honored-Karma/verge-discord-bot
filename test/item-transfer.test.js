import assert from "node:assert/strict";
import test from "node:test";
import {
  transferItemCompensated,
  transferItemInTransaction,
} from "../utils/itemTransferStore.js";
import {
  createItemTransferListComponents,
  createItemTransferPreviewComponents,
  createItemTransferReceiptComponents,
  createItemTransferStatusComponents,
} from "../utils/itemTransferComponents.js";

function matches(document, filter) {
  if (!document) return false;
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "_id" && document._id !== expected) return false;
    else if (key === "id" && document.id !== expected) return false;
    else if (key === "player_id" && document.player_id !== expected) return false;
    else if (key === "item_name" && document.item_name !== expected) return false;
    else if (expected?.$gte !== undefined && !(document[key] >= expected.$gte)) return false;
    else if (expected?.$lte !== undefined && !(document[key] <= expected.$lte)) return false;
    else if (typeof expected !== "object" && !["_id", "id", "player_id", "item_name"].includes(key)
      && document[key] !== expected) return false;
  }
  return true;
}

function memoryCollections({ playerIds = ["sender", "recipient"], stacks = [] } = {}) {
  const documents = stacks.map((stack, index) => ({ _id: index + 1, ...stack }));
  const inventory = {
    documents,
    async findOne(filter) {
      return documents.find((document) => matches(document, filter)) || null;
    },
    async findOneAndUpdate(filter, update) {
      const document = documents.find((candidate) => matches(candidate, filter));
      if (!document) return null;
      for (const [key, delta] of Object.entries(update.$inc || {})) {
        document[key] = Number(document[key] || 0) + delta;
      }
      return { ...document };
    },
    async updateOne(filter, update) {
      const document = documents.find((candidate) => matches(candidate, filter));
      if (!document) return { matchedCount: 0, modifiedCount: 0 };
      for (const [key, delta] of Object.entries(update.$inc || {})) {
        document[key] = Number(document[key] || 0) + delta;
      }
      Object.assign(document, update.$set || {});
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async insertOne(document) {
      if (documents.some((candidate) => (
        candidate.player_id === document.player_id
        && candidate.item_name === document.item_name
      ))) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      documents.push({ _id: documents.length + 1, ...document });
      return { acknowledged: true };
    },
  };
  return {
    players: {
      async findOne({ id }) {
        return playerIds.includes(id) ? { id } : null;
      },
    },
    inventory,
  };
}

test("moves an item to a new recipient stack", async () => {
  const collections = memoryCollections({
    stacks: [{ player_id: "sender", item_name: "AP Tome (50)", qty: 10 }],
  });
  const result = await transferItemCompensated(collections, {
    fromId: "sender",
    toId: "recipient",
    itemName: "AP Tome (50)",
    quantity: 4,
  });

  assert.equal(result.success, true);
  assert.equal(result.senderQuantity, 6);
  assert.equal(result.recipientQuantity, 4);
  assert.equal(collections.inventory.documents[0].qty, 6);
  assert.equal(collections.inventory.documents[1].qty, 4);
});

test("adds to an existing recipient stack in transaction mode", async () => {
  const collections = memoryCollections({
    stacks: [
      { player_id: "sender", item_name: "Key", qty: 10 },
      { player_id: "recipient", item_name: "Key", qty: 2 },
    ],
  });
  const result = await transferItemInTransaction(collections, {
    fromId: "sender",
    toId: "recipient",
    itemName: "Key",
    quantity: 3,
    session: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.senderQuantity, 7);
  assert.equal(result.recipientQuantity, 5);
});

test("keeps both inventories unchanged when quantity is insufficient", async () => {
  const collections = memoryCollections({
    stacks: [
      { player_id: "sender", item_name: "Key", qty: 2 },
      { player_id: "recipient", item_name: "Key", qty: 5 },
    ],
  });
  const result = await transferItemCompensated(collections, {
    fromId: "sender",
    toId: "recipient",
    itemName: "Key",
    quantity: 3,
  });

  assert.deepEqual(result, {
    success: false,
    reason: "insufficient_quantity",
    available: 2,
  });
  assert.equal(collections.inventory.documents[0].qty, 2);
  assert.equal(collections.inventory.documents[1].qty, 5);
});

test("builds every item-transfer interface state with valid emoji", () => {
  const avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
  const inventory = [{ item_name: "AP Tome (50)", qty: 10 }];
  const states = [
    ...createItemTransferListComponents({
      senderName: "Sender",
      senderAvatarUrl: avatarUrl,
      recipientName: "Recipient",
      recipientSlot: 2,
      inventory,
      quantity: 3,
    }),
    ...createItemTransferPreviewComponents({
      senderName: "Sender",
      senderAvatarUrl: avatarUrl,
      recipientName: "Recipient",
      recipientSlot: 2,
      item: inventory[0],
      quantity: 3,
    }),
    ...createItemTransferReceiptComponents({
      senderName: "Sender",
      senderAvatarUrl: avatarUrl,
      recipientName: "Recipient",
      recipientSlot: 2,
      result: {
        itemName: "AP Tome (50)",
        quantity: 3,
        senderQuantity: 7,
        recipientQuantity: 3,
      },
    }),
    ...createItemTransferStatusComponents("Cancelled", "Inventories unchanged", "neutral"),
  ];
  for (const state of states) assert.doesNotThrow(() => state.toJSON());

  const emojis = states
    .map((state) => state.toJSON())
    .flatMap((container) => container.components || [])
    .flatMap((component) => component.components || [])
    .map((component) => component.emoji?.name)
    .filter(Boolean);
  for (const emoji of emojis) assert.match(emoji, /\p{Extended_Pictographic}/u);
});
