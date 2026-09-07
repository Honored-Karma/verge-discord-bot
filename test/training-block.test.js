import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAINING_TYPES,
  TRAINING_NAMES,
  formatTrainingName,
  blockTraining,
  unblockTraining,
  checkTrainingBlock,
  getTrainingBlocksList,
} from "../utils/trainingBlocks.js";
import { createTrainingBlockedEmbed } from "../utils/embeds.js";
import { hasCommandPermission } from "../utils/adminCheck.js";

test("TRAINING_TYPES contains valid constants", () => {
  assert.equal(TRAINING_TYPES.ALL, "all");
  assert.equal(TRAINING_TYPES.TRAIN_AP, "train-ap");
  assert.equal(TRAINING_TYPES.TRAIN_SP, "train-sp");
  assert.equal(TRAINING_TYPES.SOCIAL_RP, "social-rp");
});

test("formatTrainingName returns human readable names", () => {
  assert.equal(formatTrainingName(TRAINING_TYPES.ALL), "Все тренировки");
  assert.equal(
    formatTrainingName(TRAINING_TYPES.TRAIN_AP),
    "Тренировка AP (Физическая)",
  );
  assert.equal(
    formatTrainingName(TRAINING_TYPES.TRAIN_SP),
    "Тренировка стилей SP",
  );
  assert.equal(
    formatTrainingName(TRAINING_TYPES.SOCIAL_RP),
    "Социальный RP (AP)",
  );
  assert.equal(formatTrainingName("custom"), "custom");
});

test("createTrainingBlockedEmbed correctly populates embed fields", () => {
  const blockInfo = {
    trainingName: "Тренировка AP (Физическая)",
    slot: 1,
    reason: "Нарушение правил отыгрыша",
    blockedBy: "1234567890",
    blockedAt: 1700000000,
    expiresAt: 1700086400,
  };

  const embed = createTrainingBlockedEmbed(blockInfo);
  assert.ok(embed);
  const json = embed.toJSON();
  assert.ok(json.title.includes("Тренировка AP"));
  assert.equal(json.color, 0xed4245);

  const slotField = json.fields.find((f) => f.name.includes("Слот"));
  assert.ok(slotField);
  assert.equal(slotField.value, "Слот 1");

  const reasonField = json.fields.find((f) => f.name.includes("Причина"));
  assert.ok(reasonField);
  assert.equal(reasonField.value, "Нарушение правил отыгрыша");

  const adminField = json.fields.find((f) => f.name.includes("Заблокировал"));
  assert.ok(adminField);
  assert.ok(adminField.value.includes("1234567890"));
});

test("createTrainingBlockedEmbed handles all-slots and permanent block", () => {
  const blockInfo = {
    trainingName: "Все тренировки",
    slot: null,
    reason: null,
    blockedBy: null,
    blockedAt: 1700000000,
    expiresAt: null,
  };

  const embed = createTrainingBlockedEmbed(blockInfo);
  assert.ok(embed);
  const json = embed.toJSON();

  const slotField = json.fields.find((f) => f.name.includes("Слот"));
  assert.ok(slotField);
  assert.equal(slotField.value, "Все слоты (аккаунт)");

  const expiryField = json.fields.find((f) => f.name.includes("Срок"));
  assert.ok(expiryField);
  assert.equal(expiryField.value, "Бессрочно");
});

test("hasCommandPermission permits GM role to execute train-block", () => {
  process.env.GM_ROLE_IDS = "111,222";
  const gmMember = {
    id: "999",
    guild: { ownerId: "123" },
    permissions: { has: () => false },
    roles: {
      cache: [
        { id: "222", name: "GM" },
      ],
    },
  };
  assert.equal(hasCommandPermission(gmMember, "train-block"), true);

  const regularMember = {
    id: "888",
    guild: { ownerId: "123" },
    permissions: { has: () => false },
    roles: {
      cache: [
        { id: "333", name: "User" },
      ],
    },
  };
  assert.equal(hasCommandPermission(regularMember, "train-block"), false);
});
