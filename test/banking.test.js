import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateExchange,
  calculateTransfer,
  EXCHANGE_RATE,
} from "../utils/banking.js";
import {
  createBankStatusComponents,
  createExchangePreviewComponents,
  createExchangeReceiptComponents,
  createPayPreviewComponents,
  createPayReceiptComponents,
} from "../utils/bankingComponents.js";

const avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";

test("calculates transfer tax and rejects unsafe amounts", () => {
  assert.deepEqual(calculateTransfer(100), {
    valid: true,
    sent: 100,
    tax: 2,
    received: 98,
  });
  assert.deepEqual(calculateTransfer(2), {
    valid: true,
    sent: 2,
    tax: 1,
    received: 1,
  });
  assert.equal(calculateTransfer(1).valid, false);
  assert.equal(calculateTransfer(Number.MAX_SAFE_INTEGER).valid, true);
  assert.equal(calculateTransfer(Number.MAX_SAFE_INTEGER + 1).valid, false);
});

test("calculates both exchange directions with floor rounding", () => {
  const krwToYen = calculateExchange("krw", Math.ceil(EXCHANGE_RATE));
  const yenToKrw = calculateExchange("yen", 10);
  assert.equal(krwToYen.received, 1);
  assert.equal(krwToYen.targetCurrency, "yen");
  assert.equal(yenToKrw.received, 94);
  assert.equal(yenToKrw.targetCurrency, "krw");
  assert.equal(calculateExchange("krw", 9).valid, false);
});

test("builds valid bank previews, receipts and status states", () => {
  const transfer = calculateTransfer(1_000);
  const exchange = calculateExchange("krw", 940);
  const states = [
    ...createPayPreviewComponents({
      senderName: "Sender **One**",
      senderAvatarUrl: avatarUrl,
      recipientName: "Recipient",
      recipientSlot: 2,
      currency: "krw",
      calculation: transfer,
      senderBalance: 5_000,
    }),
    ...createPayReceiptComponents({
      senderName: "Sender",
      senderAvatarUrl: avatarUrl,
      recipientName: "Recipient",
      currency: "krw",
      result: { ...transfer, senderBalance: 4_000 },
    }),
    ...createExchangePreviewComponents({
      characterName: "Trader",
      avatarUrl,
      calculation: exchange,
      sourceBalance: 2_000,
    }),
    ...createExchangeReceiptComponents({
      characterName: "Trader",
      avatarUrl,
      result: { ...exchange, sourceBalance: 1_060, targetBalance: 100 },
    }),
    ...createBankStatusComponents("Transfer cancelled", "Balances unchanged.", "neutral"),
  ];

  for (const state of states) assert.doesNotThrow(() => state.toJSON());
});
