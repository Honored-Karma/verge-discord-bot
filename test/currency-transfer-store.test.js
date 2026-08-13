import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransactionUnsupportedError,
  transferCurrencyCompensated,
} from "../utils/currencyTransferStore.js";
import { calculateTransfer } from "../utils/banking.js";

function matches(document, filter) {
  if (!document || document.id !== filter.id) return false;
  if (filter.$or) return filter.$or.some((condition) => matches(document, {
    id: filter.id,
    ...condition,
  }));
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "id") continue;
    if (expected?.$gte !== undefined && !(document[key] >= expected.$gte)) return false;
    if (expected?.$lte !== undefined && !(document[key] <= expected.$lte)) return false;
    if (expected?.$exists !== undefined
      && Object.hasOwn(document, key) !== expected.$exists) return false;
  }
  return true;
}

function memoryPlayers(initial) {
  const documents = initial.map((document) => ({ ...document }));
  return {
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
      if (!document) return { modifiedCount: 0 };
      for (const [key, delta] of Object.entries(update.$inc || {})) {
        document[key] = Number(document[key] || 0) + delta;
      }
      return { modifiedCount: 1 };
    },
  };
}

test("transfers currency without MongoDB transaction support", async () => {
  const players = memoryPlayers([
    { id: "sender", krw: 1_000 },
    { id: "recipient", krw: 100 },
  ]);
  const result = await transferCurrencyCompensated(players, {
    fromId: "sender",
    toId: "recipient",
    currency: "krw",
    calculation: calculateTransfer(500),
  });

  assert.equal(result.success, true);
  assert.equal(result.mode, "compensated");
  assert.equal(result.senderBalance, 500);
  assert.equal(result.recipientBalance, 590);
  assert.equal(players.documents[0].krw, 500);
  assert.equal(players.documents[1].krw, 590);
});

test("does not debit when funds are insufficient", async () => {
  const players = memoryPlayers([
    { id: "sender", yen: 10 },
    { id: "recipient", yen: 100 },
  ]);
  const result = await transferCurrencyCompensated(players, {
    fromId: "sender",
    toId: "recipient",
    currency: "yen",
    calculation: calculateTransfer(50),
  });

  assert.deepEqual(result, {
    success: false,
    reason: "insufficient_funds",
    available: 10,
  });
  assert.equal(players.documents[0].yen, 10);
  assert.equal(players.documents[1].yen, 100);
});

test("refunds sender if recipient disappears", async () => {
  const players = memoryPlayers([{ id: "sender", krw: 1_000 }]);
  const result = await transferCurrencyCompensated(players, {
    fromId: "sender",
    toId: "missing",
    currency: "krw",
    calculation: calculateTransfer(500),
  });

  assert.deepEqual(result, { success: false, reason: "recipient_not_found" });
  assert.equal(players.documents[0].krw, 1_000);
});

test("recognizes standalone MongoDB transaction errors", () => {
  assert.equal(isTransactionUnsupportedError({
    code: 20,
    codeName: "IllegalOperation",
    message: "Transaction numbers are only allowed on a replica set member or mongos",
  }), true);
  assert.equal(isTransactionUnsupportedError(new Error("network timeout")), false);
});
