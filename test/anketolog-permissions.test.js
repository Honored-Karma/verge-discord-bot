import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
    "remove-item",
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

function configureStaffRoles(t) {
  const envNames = [
    "ADMIN_IDS", "ADMIN_ROLE_IDS", "ADMIN_ROLE_ID",
    "ANKETOLOG_ROLE_IDS", "ANKETOLOG_ROLE_ID",
    "MODERATOR_ROLE_IDS", "MODERATOR_ROLE_ID",
    "GM_ROLE_IDS", "GM_ROLE_ID", "LIMITED_ADMIN_ROLE_IDS",
    "GIVE_STYLE_ROLE_IDS", "GIVE_STYLE_ROLE_ID",
  ];
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  for (const name of envNames) delete process.env[name];
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.ANKETOLOG_ROLE_IDS = "reviewer";
  process.env.MODERATOR_ROLE_IDS = "moderator";
  process.env.GM_ROLE_IDS = "gm";
  const originalRead = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (path, ...args) => String(path).endsWith("admins.json")
    ? JSON.stringify({ anketologRoleIds: ["file-reviewer"] })
    : originalRead(path, ...args));
}

function staffMember(...roleIds) {
  return {
    id: "staff-user",
    guild: { ownerId: "owner" },
    permissions: { has: () => false },
    roles: { cache: roleIds.map(id => ({ id, name: id })) },
  };
}

test("reviewers configured through ENV or admins.json can give styles", t => {
  configureStaffRoles(t);
  assert.equal(hasCommandPermission(staffMember("reviewer"), "give-style"), true);
  assert.equal(hasCommandPermission(staffMember("file-reviewer"), "give-style"), true);
  delete process.env.ANKETOLOG_ROLE_IDS;
  process.env.ANKETOLOG_ROLE_ID = "single-reviewer";
  assert.equal(hasCommandPermission(staffMember("single-reviewer"), "give-style"), true);
  assert.equal(hasCommandPermission(staffMember("player"), "give-style"), false);
});

test("moderator roles grant only add-sp among character-management commands", t => {
  configureStaffRoles(t);
  const moderator = staffMember("moderator");
  const forbidden = [
    "give-style", "remove-player-style", "add-style", "delete-style",
    "add-ap", "set-ap", "set-sp", "add-currency", "set-currency", "deduct-currency",
    "give-item", "remove-item", "set-rank", "add-reputation", "set-reputation",
    "deduct-reputation", "physical-register", "physical-edit", "train-block", "logs",
    "set-ap-multiplier", "set-sp-multiplier", "set-salary-multiplier",
    "accept", "accept-application", "announce", "delete-user",
  ];
  assert.equal(hasCommandPermission(moderator, "add-sp"), true);
  for (const command of forbidden) {
    assert.equal(hasCommandPermission(moderator, command), false, command);
  }
  delete process.env.MODERATOR_ROLE_IDS;
  process.env.MODERATOR_ROLE_ID = "moderator";
  assert.equal(hasCommandPermission(moderator, "add-sp"), true);
  assert.equal(hasCommandPermission(moderator, "physical-edit"), false);
  assert.equal(hasCommandPermission(staffMember("player"), "add-sp"), false);
});

test("reviewer, GM and administrator permissions still work alongside a moderator role", t => {
  configureStaffRoles(t);
  assert.equal(hasCommandPermission(staffMember("moderator", "reviewer"), "give-style"), true);
  assert.equal(hasCommandPermission(staffMember("gm"), "physical-edit"), true);
  assert.equal(hasCommandPermission(staffMember("reviewer"), "physical-register"), true);
  const admin = staffMember("moderator");
  admin.permissions.has = () => true;
  assert.equal(hasCommandPermission(admin, "give-style"), true);
  assert.equal(hasCommandPermission(admin, "physical-edit"), true);
});
