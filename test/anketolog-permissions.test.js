import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hasCommandPermission } from "../utils/adminCheck.js";

test("ANKETOLOG_ROLE_IDS grants permissions for onboarding/character approval commands", () => {
  const anketologRoleId = "1431759459528610013";
  const headAnketologRoleId = "1438987088975626251";
  process.env.ANKETOLOG_ROLE_IDS = anketologRoleId;
  process.env.HEAD_ANKETOLOG_ROLE_IDS = headAnketologRoleId;
  delete process.env.ADMIN_IDS;
  delete process.env.ADMIN_ROLE_IDS;
  delete process.env.GM_ROLE_IDS;
  delete process.env.HEAD_GM_ROLE_IDS;
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

  const headAnketologMember = {
    id: "555111333",
    guild: { ownerId: "999999999" },
    permissions: { has: () => false },
    roles: {
      cache: [
        { id: headAnketologRoleId, name: "Главный Анкетолог" }
      ]
    }
  };

  const allowedForAnketolog = [
    "give-style",
    "add-currency",
    "physical-register",
    "physical-edit",
    "accept",
    "accept-application"
  ];

  for (const cmd of allowedForAnketolog) {
    assert.equal(
      hasCommandPermission(anketologMember, cmd),
      true,
      `Anketolog should have permission for '${cmd}'`
    );
  }

  // Regular anketolog should not have /set-* or management commands
  const forbiddenForAnketolog = [
    "set-currency",
    "set-rank",
    "set-reputation",
    "deduct-currency",
    "deduct-reputation",
    "grant-slot",
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "train-block",
    "train-channel-block",
    "logs",
    "render-ui",
    "announce",
    "create-org",
    "delete-user",
    "delete-style",
    "add-style"
  ];

  for (const cmd of forbiddenForAnketolog) {
    assert.equal(
      hasCommandPermission(anketologMember, cmd),
      false,
      `Anketolog should NOT have permission for '${cmd}'`
    );
  }

  // Head anketolog has /set's and overrides
  const allowedForHeadAnketolog = [
    ...allowedForAnketolog,
    "set-rank",
    "set-currency",
    "set-reputation",
    "deduct-currency",
    "deduct-reputation",
    "grant-slot",
    "remove-player-style",
    "set-avatar",
    "give-item",
    "remove-item"
  ];

  for (const cmd of allowedForHeadAnketolog) {
    assert.equal(
      hasCommandPermission(headAnketologMember, cmd),
      true,
      `Head Anketolog should have permission for '${cmd}'`
    );
  }

  // Regular member without any staff role
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

  for (const cmd of allowedForHeadAnketolog) {
    assert.equal(
      hasCommandPermission(regularMember, cmd),
      false,
      `Regular member should NOT have permission for '${cmd}'`
    );
  }
});

test("GM_ROLE_IDS and HEAD_GM_ROLE_IDS grant correct permissions for Game Masters", () => {
  const gmRoleId = "1431759694179074162";
  const headGmRoleId = "1438987072026185808";
  process.env.GM_ROLE_IDS = gmRoleId;
  process.env.HEAD_GM_ROLE_IDS = headGmRoleId;
  delete process.env.ADMIN_IDS;
  delete process.env.ADMIN_ROLE_IDS;
  delete process.env.ANKETOLOG_ROLE_IDS;
  delete process.env.HEAD_ANKETOLOG_ROLE_IDS;

  const gmMember = {
    id: "gm-test-1",
    guild: { ownerId: "owner" },
    permissions: { has: () => false },
    roles: { cache: [{ id: gmRoleId, name: "Мастер игры" }] }
  };

  const headGmMember = {
    id: "head-gm-test-1",
    guild: { ownerId: "owner" },
    permissions: { has: () => false },
    roles: { cache: [{ id: headGmRoleId, name: "Главный ГМ" }] }
  };

  const allowedForGM = [
    "add-ap",
    "add-sp",
    "give-style",
    "add-currency",
    "add-reputation",
    "purge-offtop",
    "mission",
    "mission-create",
    "physical-register",
    "physical-edit",
    "train-block",
  ];

  for (const cmd of allowedForGM) {
    assert.equal(hasCommandPermission(gmMember, cmd), true, `GM should have permission for '${cmd}'`);
    assert.equal(hasCommandPermission(headGmMember, cmd), true, `Head GM should have permission for '${cmd}'`);
  }

  // Regular GM should not have /set-* or multipliers
  const forbiddenForGM = [
    "set-ap",
    "set-sp",
    "set-currency",
    "set-reputation",
    "set-rank",
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "logs",
    "send-json",
    "render-ui",
    "delete-user",
    "train-channel-block",
  ];

  for (const cmd of forbiddenForGM) {
    assert.equal(hasCommandPermission(gmMember, cmd), false, `GM should NOT have permission for '${cmd}'`);
  }

  // Head GM has /set's and multipliers
  const allowedForHeadGM = [
    "set-ap",
    "set-sp",
    "set-currency",
    "set-reputation",
    "set-rank",
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "deduct-currency",
    "deduct-reputation",
    "give-item",
    "remove-item",
    "remove-player-style",
    "train-block",
    "logs"
  ];

  for (const cmd of allowedForHeadGM) {
    assert.equal(hasCommandPermission(headGmMember, cmd), true, `Head GM should have permission for '${cmd}'`);
  }
});

function configureStaffRoles(t) {
  const envNames = [
    "ADMIN_IDS", "ADMIN_ROLE_IDS", "ADMIN_ROLE_ID",
    "HEAD_GM_ROLE_IDS", "HEAD_GM_ROLE_ID",
    "HEAD_ANKETOLOG_ROLE_IDS", "HEAD_ANKETOLOG_ROLE_ID",
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
