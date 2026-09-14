import test from "node:test";
import assert from "node:assert/strict";
import { hasCommandPermission } from "../utils/adminCheck.js";

test("ANKETOLOG_ROLE_IDS grants permissions for onboarding/character approval commands", () => {
  const anketologRoleId = "1431759459528610013";
  process.env.ANKETOLOG_ROLE_IDS = `1431759459528610013, 1438987088975626251`;
  delete process.env.ADMIN_IDS;
  delete process.env.ADMIN_ROLE_IDS;
  delete process.env.GM_ROLE_IDS;
  delete process.env.GIVE_STYLE_ROLE_IDS;

  const anketologMember = {
    id: "555111222",
    guild: { ownerId: "999999999" },
    permissions: { has: () => false },
    roles: {
      cache: [
        { id: anketologRoleId, name: "Анкетолог" }
      ]
    }
  };

  const allowedCommands = [
    "give-style",
    "remove-player-style",
    "add-currency",
    "set-currency",
    "deduct-currency",
    "add-sp",
    "set-sp",
    "add-ap",
    "set-ap",
    "give-item",
    "set-rank",
    "add-reputation",
    "set-reputation",
    "deduct-reputation",
    "physical-register",
    "physical-edit",
    "accept",
    "accept-application"
  ];

  for (const cmd of allowedCommands) {
    assert.equal(
      hasCommandPermission(anketologMember, cmd),
      true,
      `Anketolog should have permission for '${cmd}'`
    );
  }

  const forbiddenCommands = [
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "train-block",
    "logs",
    "render-ui",
    "announce",
    "create-org",
    "delete-user",
    "delete-style",
    "add-style"
  ];

  for (const cmd of forbiddenCommands) {
    assert.equal(
      hasCommandPermission(anketologMember, cmd),
      false,
      `Anketolog should NOT have permission for '${cmd}'`
    );
  }

  // Regular member without anketolog role
  const regularMember = {
    id: "777888999",
    guild: { ownerId: "999999999" },
    permissions: { has: () => false },
    roles: {
      cache: [
        { id: "111222333444", name: "Игрок" }
      ]
    }
  };

  for (const cmd of allowedCommands) {
    assert.equal(
      hasCommandPermission(regularMember, cmd),
      false,
      `Regular member should NOT have permission for '${cmd}'`
    );
  }
});
