import test from "node:test";
import assert from "node:assert/strict";
import { isAdmin, hasCommandPermission } from "../utils/adminCheck.js";
import { loadAdminConfigFile } from "../config/adminConfig.js";
import { resolveUserPermissions } from "../services/authService.js";
import { calculateUserCapabilities } from "../services/permissionService.js";
import { isGMOrAdmin } from "../interactions/missionSession.js";
import {
  createAcceptApplicationState,
  createAcceptApplicationPreviewEmbed,
} from "../interactions/acceptApplicationSession.js";
import { data as acceptData } from "../commands/accept.js";
import { data as purgeOfftopData, execute as purgeOfftopExecute } from "../commands/purge-offtop.js";

const ROLE_ADMIN = "1438987035862892544";
const ROLE_HEAD_GM = "1438987072026185808";
const ROLE_HEAD_ANKETOLOG = "1438987088975626251";
const ROLE_ANKETOLOG = "1431759459528610013";
const ROLE_GM = "1431759694179074162";

function createMemberWithRole(roleId) {
  return {
    id: `user-with-role-${roleId}`,
    guild: { ownerId: "guild-owner-999" },
    permissions: { has: () => false },
    roles: {
      cache: [{ id: roleId, name: `Role-${roleId}` }],
      some(fn) {
        return [{ id: roleId }].some(fn);
      },
    },
  };
}

test("config/admins.json contains all configured role IDs correctly", () => {
  const config = loadAdminConfigFile();
  assert.ok(config.adminRoleIds.includes(ROLE_ADMIN), "adminRoleIds must include Admin role");
  assert.ok(config.headGmRoleIds.includes(ROLE_HEAD_GM), "headGmRoleIds must include Head GM role");
  assert.ok(config.headAnketologRoleIds.includes(ROLE_HEAD_ANKETOLOG), "headAnketologRoleIds must include Head Anketolog role");
  assert.ok(config.anketologRoleIds.includes(ROLE_ANKETOLOG), "anketologRoleIds must include Anketolog role");
  assert.ok(config.gmRoleIds.includes(ROLE_GM), "gmRoleIds must include GM role");
});

test("веб-сессии распознают все пять ролей из admins.json без Discord Administrator", () => {
  const cases = [
    [ROLE_ADMIN, true, true, true, true, true],
    [ROLE_HEAD_GM, false, true, false, true, true],
    [ROLE_HEAD_ANKETOLOG, false, false, true, true, false],
    [ROLE_ANKETOLOG, false, false, true, false, false],
    [ROLE_GM, false, true, false, false, false],
  ];
  for (const [roleId, admin, gm, anketolog, manageCharacters, manageEconomy] of cases) {
    const id = `web-role-${roleId}`;
    const permissions = resolveUserPermissions(id, { roles: [roleId], permissions: "0" });
    assert.equal(permissions.isAdmin, admin, roleId);
    assert.equal(permissions.isGM, gm, roleId);
    assert.equal(permissions.isAnketolog, anketolog, roleId);
    assert.equal(permissions.isStaff, true, roleId);
    const capabilities = calculateUserCapabilities({ id, permissions });
    assert.equal(capabilities.canAccessAdmin, true, roleId);
    assert.equal(capabilities.canManageApplications, anketolog, roleId);
    assert.equal(capabilities.canManageCharacters, manageCharacters, roleId);
    assert.equal(capabilities.canManageEconomy, manageEconomy, roleId);
  }
});

test("главный анкетолог с правом add-ap не получает управление миссиями ГМ", () => {
  assert.equal(isGMOrAdmin(createMemberWithRole(ROLE_HEAD_ANKETOLOG)), false);
  assert.equal(isGMOrAdmin(createMemberWithRole(ROLE_GM)), true);
  assert.equal(isGMOrAdmin(createMemberWithRole(ROLE_HEAD_GM)), true);
});

test("роль анкетолога из ENV не даёт удалять стили игроков", t => {
  const old = process.env.ANKETOLOG_ROLE_IDS;
  process.env.ANKETOLOG_ROLE_IDS = "reviewer-env-regression";
  t.after(() => {
    if (old === undefined) delete process.env.ANKETOLOG_ROLE_IDS;
    else process.env.ANKETOLOG_ROLE_IDS = old;
  });
  const member = createMemberWithRole("reviewer-env-regression");
  assert.equal(hasCommandPermission(member, "give-style"), true);
  assert.equal(hasCommandPermission(member, "remove-player-style"), false);
});

test("алиасы ENV объединяются с основными настройками одинаково в боте и веб-панели", t => {
  const env = {
    ADMIN_ROLE_IDS: "admin-env-primary",
    ADMIN_ROLE_ID: " admin-env-alias ",
    ADMIN_IDS: "admin-user-primary",
    ADMIN_USER_IDS: "admin-user-alias",
    GM_ROLE_IDS: "gm-env-primary",
    GM_ROLE_ID: "gm-env-alias",
    LIMITED_ADMIN_ROLE_IDS: "gm-env-legacy",
    HEAD_GM_ROLE_ID: "head-gm-env-alias",
    HEAD_ANKETOLOG_ROLE_ID: "head-reviewer-env-alias",
    ANKETOLOG_ROLE_ID: "reviewer-env-alias",
  };
  const previous = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const id of ["admin-env-primary", "admin-env-alias"]) {
    const member = { id: `member-${id}`, roles: [id], permissions: "0" };
    assert.equal(isAdmin(member), true);
    assert.equal(resolveUserPermissions(member.id, member).isAdmin, true);
    assert.equal(calculateUserCapabilities(member).canManageRoles, true);
  }
  for (const id of ["admin-user-primary", "admin-user-alias"]) {
    assert.equal(isAdmin({ id, roles: [] }), true);
    assert.equal(resolveUserPermissions(id, { roles: [] }).isAdmin, true);
    assert.equal(calculateUserCapabilities({ id, roles: [] }).canManageRoles, true);
  }
  for (const id of ["gm-env-primary", "gm-env-alias", "gm-env-legacy", "head-gm-env-alias"]) {
    const member = { id: `member-${id}`, roles: [id], permissions: "0" };
    assert.equal(hasCommandPermission(member, "add-ap"), true);
    assert.equal(resolveUserPermissions(member.id, member).isGM, true);
    assert.equal(calculateUserCapabilities(member).canAccessAdmin, true);
  }
  for (const id of ["head-reviewer-env-alias", "reviewer-env-alias"]) {
    const member = { id: `member-${id}`, roles: [id], permissions: "0" };
    assert.equal(hasCommandPermission(member, "accept"), true);
    assert.equal(resolveUserPermissions(member.id, member).isAnketolog, true);
    assert.equal(calculateUserCapabilities(member).canManageApplications, true);
  }
});

test("Администратор (1438987035862892544) has full access to all bot commands", () => {
  const adminMember = createMemberWithRole(ROLE_ADMIN);
  assert.equal(isAdmin(adminMember), true);

  const testCommands = [
    "accept", "add-ap", "add-currency", "add-reputation", "add-sp", "add-style",
    "announce", "create-org", "deduct-currency", "deduct-reputation", "delete-style",
    "delete-user", "give-item", "give-style", "grant-slot", "log-disable", "log-enable",
    "logs", "mission", "physical-edit", "physical-register", "purge-offtop", "remove-item",
    "remove-player-style", "render-ui", "send-json", "set-ap-multiplier", "set-ap",
    "set-currency", "set-rank", "set-reputation", "set-salary-multiplier", "set-sp-multiplier",
    "set-sp", "shop-admin", "train-block", "train-channel-block"
  ];

  for (const cmd of testCommands) {
    assert.equal(hasCommandPermission(adminMember, cmd), true, `Admin must have permission for ${cmd}`);
  }
});

test("Мастер Игры / ГМ (1431759694179074162) has exact GM permissions and purge offtop", () => {
  const gmMember = createMemberWithRole(ROLE_GM);
  assert.equal(isAdmin(gmMember), false);

  const allowed = [
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

  for (const cmd of allowed) {
    assert.equal(hasCommandPermission(gmMember, cmd), true, `GM must have permission for ${cmd}`);
  }

  const forbidden = [
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
    "announce",
    "create-org",
    "delete-user",
    "delete-style",
    "add-style",
    "train-channel-block",
  ];

  for (const cmd of forbidden) {
    assert.equal(hasCommandPermission(gmMember, cmd), false, `GM must NOT have permission for ${cmd}`);
  }
});

test("Главный ГМ (1438987072026185808) inherits GM permissions and has /set commands", () => {
  const headGmMember = createMemberWithRole(ROLE_HEAD_GM);
  assert.equal(isAdmin(headGmMember), false);

  const allowed = [
    // GM base commands
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
    // Head GM /set and management commands
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
    "logs",
  ];

  for (const cmd of allowed) {
    assert.equal(hasCommandPermission(headGmMember, cmd), true, `Head GM must have permission for ${cmd}`);
  }

  const forbidden = [
    "send-json",
    "render-ui",
    "create-org",
    "delete-user",
    "delete-style",
    "add-style",
    "train-channel-block",
  ];

  for (const cmd of forbidden) {
    assert.equal(hasCommandPermission(headGmMember, cmd), false, `Head GM must NOT have permission for ${cmd}`);
  }
});

test("Анкетолог (1431759459528610013) has exact reviewer commands", () => {
  const anketologMember = createMemberWithRole(ROLE_ANKETOLOG);
  assert.equal(isAdmin(anketologMember), false);

  const allowed = [
    "give-style",
    "accept",
    "accept-application",
    "add-currency",
    "physical-register",
    "physical-edit",
  ];

  for (const cmd of allowed) {
    assert.equal(hasCommandPermission(anketologMember, cmd), true, `Anketolog must have permission for ${cmd}`);
  }

  const forbidden = [
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
    "send-json",
    "announce",
    "create-org",
    "delete-user",
    "delete-style",
    "add-style",
    "train-channel-block",
  ];

  for (const cmd of forbidden) {
    assert.equal(hasCommandPermission(anketologMember, cmd), false, `Anketolog must NOT have permission for ${cmd}`);
  }
});

test("Главный Анкетолог (1438987088975626251) inherits Anketolog commands and has /set and slot overrides", () => {
  const headAnketologMember = createMemberWithRole(ROLE_HEAD_ANKETOLOG);
  assert.equal(isAdmin(headAnketologMember), false);

  const allowed = [
    // Anketolog base commands
    "give-style",
    "accept",
    "accept-application",
    "add-currency",
    "physical-register",
    "physical-edit",
    // Head Anketolog /set and slot commands
    "set-rank",
    "set-currency",
    "set-reputation",
    "deduct-currency",
    "deduct-reputation",
    "remove-player-style",
    "grant-slot",
    "set-avatar",
    "give-item",
    "remove-item",
  ];

  for (const cmd of allowed) {
    assert.equal(hasCommandPermission(headAnketologMember, cmd), true, `Head Anketolog must have permission for ${cmd}`);
  }

  const forbidden = [
    "set-ap-multiplier",
    "set-sp-multiplier",
    "set-salary-multiplier",
    "train-block",
    "train-channel-block",
    "logs",
    "send-json",
    "render-ui",
    "create-org",
    "delete-user",
    "delete-style",
    "add-style",
    "train-channel-block",
  ];

  for (const cmd of forbidden) {
    assert.equal(hasCommandPermission(headAnketologMember, cmd), false, `Head Anketolog must NOT have permission for ${cmd}`);
  }
});

test("/accept command schema and session support combat_style and initial currency", () => {
  const schema = acceptData.toJSON();
  const optionNames = schema.options.map((opt) => opt.name);

  assert.ok(optionNames.includes("combat_style"), "/accept must include combat_style option");
  assert.ok(optionNames.includes("initial_krw"), "/accept must include initial_krw option");
  assert.ok(optionNames.includes("initial_yen"), "/accept must include initial_yen option");

  const state = createAcceptApplicationState({
    target_user_id: "test-user-id",
    target_username: "test-user",
    character_name: "Пак Чон",
    combat_style: "Тхэквондо",
    initial_krw: 75000,
    initial_yen: 5000,
  });

  assert.equal(state.combat_style, "Тхэквондо");
  assert.equal(state.initial_krw, 75000);
  assert.equal(state.initial_yen, 5000);

  const embed = createAcceptApplicationPreviewEmbed(state);
  const desc = embed.data.description;

  assert.ok(desc.includes("Боевой стиль (БИ)"));
  assert.ok(desc.includes("Тхэквондо"));
  assert.ok(desc.includes("75"));
  assert.ok(desc.includes("5"));
});

test("purge-offtop command allows GM role even without Discord ManageMessages permission", async () => {
  const gmMember = createMemberWithRole(ROLE_GM);
  let replyPayload = null;

  // Simulate execution of purge-offtop where user has no ManageMessages permission
  // but has GM role.
  const fakeInteraction = {
    member: gmMember,
    user: { id: gmMember.id },
    channel: {
      messages: {
        fetch: async () => [],
      },
    },
    guild: {
      members: {
        fetch: async () => gmMember,
        me: {
          permissionsIn: () => ({ has: () => true }),
        },
      },
    },
    options: {
      getString: (name) => (name === "prefix" ? "//" : null),
      getInteger: (name) => (name === "count" ? 10 : null),
      getUser: () => null,
    },
    deferReply: async () => {},
    editReply: async (payload) => {
      replyPayload = payload;
      return payload;
    },
    reply: async (payload) => {
      replyPayload = payload;
      return payload;
    },
  };

  await purgeOfftopExecute(fakeInteraction);

  // Since GM has permission, it doesn't reject with "Доступ запрещён"
  if (replyPayload?.embeds?.[0]?.data?.title) {
    assert.notEqual(replyPayload.embeds[0].data.title, "Доступ запрещён");
  }
});
