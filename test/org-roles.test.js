import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import {
  DEFAULT_ORG_ROLES,
  orgRoleKey,
  playerOrgName,
} from "../utils/orgRoles.js";

/**
 * Роли организаций.
 *
 * Чистую часть — нормализацию ключей и выбор организации персонажа — проверяем
 * без базы. Саму выдачу ролей проверяем на живом mongod и на поддельной гильдии,
 * которая ведёт журнал вызовов: важен не только итоговый набор ролей, но и
 * порядок операций и то, чего бот НЕ тронул.
 */

test("ключ реестра сводит написания организации к одному значению", () => {
  // Каноничные организации: ключ определяется той же нормализацией, что в /set-rank.
  for (const variant of ["TENRYU", "tenryu", "  Tenryu  ", "ТЕНРЮ", "тенрю"]) {
    assert.equal(orgRoleKey(variant), "tenryu", `не свёлся: ${variant}`);
  }
  for (const variant of ["GUARDIANS", "guardians", "Стражи", "СТРАЖИ"]) {
    assert.equal(orgRoleKey(variant), "guardians", `не свёлся: ${variant}`);
  }

  // Кастомные: ключ по названию, регистр и лишние пробелы значения не имеют.
  assert.equal(orgRoleKey("Мрачный Блеск"), "мрачный блеск");
  assert.equal(orgRoleKey("мрачный   блеск"), "мрачный блеск");
  assert.equal(orgRoleKey("  Затмение "), "затмение");

  // Разные организации не должны слипаться в один ключ.
  assert.notEqual(orgRoleKey("Затмение"), orgRoleKey("Мрачный Блеск"));

  for (const empty of [null, undefined, "", "   "]) {
    assert.equal(orgRoleKey(empty), null);
  }

  // Начальные значения обязаны быть согласованы с нормализацией, иначе запись
  // в реестре никогда не найдётся по названию организации.
  for (const entry of DEFAULT_ORG_ROLES) {
    assert.equal(orgRoleKey(entry.label), entry.org_key, `рассинхрон: ${entry.label}`);
    assert.match(entry.role_id, /^\d{17,20}$/, `не похоже на id роли: ${entry.role_id}`);
  }
  assert.equal(
    new Set(DEFAULT_ORG_ROLES.map((entry) => entry.role_id)).size,
    DEFAULT_ORG_ROLES.length,
    "одна роль не может обслуживать две организации",
  );
});

test("организация персонажа берётся в том же порядке, что на карточке", () => {
  assert.equal(playerOrgName({ organization: "TENRYU" }), "TENRYU");
  assert.equal(playerOrgName({ custom_org: "Затмение" }), "Затмение");
  // Ранговая организация важнее кастомной, если заполнены обе.
  assert.equal(playerOrgName({ organization: "GUARDIANS", custom_org: "Затмение" }), "GUARDIANS");
  assert.equal(playerOrgName({ organization: null, custom_org: null }), null);
  assert.equal(playerOrgName({ custom_org: "   " }), null);
  assert.equal(playerOrgName(null), null);
});

test("ответы про роли не содержат живых упоминаний", async () => {
  const { describeOrgSync, ORG_SYNC } = await import("../utils/orgRoles.js");

  const samples = [
    {
      status: ORG_SYNC.applied,
      addedLabel: "GUARDIANS",
      removedLabels: ["TENRYU", "Затмение"],
      added: "1537014611075928094",
      removed: ["1537014608660004935"],
    },
    { status: ORG_SYNC.unchanged },
    { status: ORG_SYNC.unmapped, orgName: "Гильдия Пепла" },
    { status: ORG_SYNC.memberNotFound },
    { status: ORG_SYNC.missingPermission },
    { status: ORG_SYNC.roleTooHigh },
    { status: ORG_SYNC.roleNotFound },
    { status: ORG_SYNC.failed },
    { status: ORG_SYNC.noGuild },
    undefined,
  ];

  for (const sample of samples) {
    const text = describeOrgSync(sample);
    // `<@&id>` в Components V2 — живой пинг: выдача ранга дёрнула бы всю фракцию.
    assert.ok(!/<@&?\d+>/.test(text), `есть упоминание: ${text}`);
    assert.ok(!text.includes("@everyone") && !text.includes("@here"), `массовый пинг: ${text}`);
  }

  // Осмысленный текст обязателен там, где админу нужно что-то сделать.
  assert.match(describeOrgSync(samples[0]), /GUARDIANS/);
  assert.match(describeOrgSync(samples[2]), /Гильдия Пепла/);
  assert.match(describeOrgSync({ status: ORG_SYNC.missingPermission }), /Управление ролями/);
  assert.equal(describeOrgSync({ status: ORG_SYNC.noGuild }), "");
});

// ── Поддельная гильдия ───────────────────────────────────────────────────────

const TENRYU_ROLE = "1537014608660004935";
const GUARDIANS_ROLE = "1537014611075928094";
const ECLIPSE_ROLE = "1537014613168750612";
const COSMETIC_ROLE = "900000000000000001";

function fakeMember(id, roleIds, log) {
  const held = new Set(roleIds);
  return {
    id,
    roles: {
      cache: {
        has: (roleId) => held.has(roleId),
      },
      async add(role, reason) {
        const roleId = typeof role === "string" ? role : role.id;
        log.push(["add", id, roleId, reason]);
        held.add(roleId);
      },
      async remove(role, reason) {
        const roleId = typeof role === "string" ? role : role.id;
        log.push(["remove", id, roleId, reason]);
        held.delete(roleId);
      },
    },
    held,
  };
}

function fakeGuild({
  members = {},
  canManage = true,
  botPosition = 100,
  rolePositions = {},
  memberCount = 10,
} = {}) {
  const log = [];
  const built = new Map(
    Object.entries(members).map(([id, roleIds]) => [id, fakeMember(id, roleIds, log)]),
  );

  const roleFor = (roleId) => ({ id: roleId, position: rolePositions[roleId] ?? 1 });

  return {
    log,
    members: {
      me: {
        permissions: { has: (flag) => canManage && flag === PermissionFlagsBits.ManageRoles },
        roles: { highest: { position: botPosition } },
      },
      // С аргументом — один участник, без аргумента — весь список.
      async fetch(userId) {
        if (userId === undefined) return built;
        const found = built.get(userId);
        if (!found) throw new Error("Unknown Member");
        return found;
      },
      get: (id) => built.get(id),
    },
    memberCount,
    roles: {
      cache: { get: (roleId) => (roleId in rolePositions ? roleFor(roleId) : roleFor(roleId)) },
      async fetch(roleId) { return roleFor(roleId); },
    },
  };
}

async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch {
    return null;
  }
}

test("роли организаций приводятся к активному персонажу", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase, getDB } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const {
    initializeOrgRoles,
    listOrgRoles,
    setOrgRole,
    syncAllOrgRoles,
    syncOrgRoles,
    ORG_SYNC,
  } = await import("../utils/orgRoles.js");

  try {
    await connectDatabase();
    const seeded = await initializeOrgRoles(getDB());
    assert.equal(seeded.seeded, DEFAULT_ORG_ROLES.length);

    // Повторный старт не должен ничего добавлять и не должен перетирать правки.
    await setOrgRole("Затмение", "555000000000000555", "admin");
    const again = await initializeOrgRoles(getDB());
    assert.equal(again.seeded, 0, "сидирование обязано быть однократным");
    let registry = await listOrgRoles();
    assert.equal(
      registry.find((row) => row.org_key === "затмение").role_id,
      "555000000000000555",
      "$setOnInsert не должен трогать существующую запись",
    );
    // Возвращаем начальное значение, дальше тест опирается на него.
    await setOrgRole("Затмение", ECLIPSE_ROLE, "admin");

    await dm.createPlayer("p1", "player1", "Аяко", null, 1, null);
    await dm.updatePlayer("p1", { organization: "TENRYU", rank: "F" });

    // ── Выдача по активному слоту ────────────────────────────────────────────
    let guild = fakeGuild({ members: { p1: [COSMETIC_ROLE] } });
    let result = await syncOrgRoles({ guild, userId: "p1", actorId: "admin" });

    assert.equal(result.status, ORG_SYNC.applied);
    assert.equal(result.added, TENRYU_ROLE);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(guild.log.map(([kind, , roleId]) => [kind, roleId]), [["add", TENRYU_ROLE]]);
    // Косметическая роль не наша забота и должна остаться.
    assert.ok(guild.members.get("p1").held.has(COSMETIC_ROLE));

    // Повторный вызов ничего не делает — синхронизация идемпотентна.
    guild = fakeGuild({ members: { p1: [TENRYU_ROLE, COSMETIC_ROLE] } });
    result = await syncOrgRoles({ guild, userId: "p1" });
    assert.equal(result.status, ORG_SYNC.unchanged);
    assert.equal(guild.log.length, 0);

    // ── Перевод в другую организацию ─────────────────────────────────────────
    await dm.updatePlayer("p1", { organization: "GUARDIANS", rank: "VI" });
    guild = fakeGuild({ members: { p1: [TENRYU_ROLE, COSMETIC_ROLE] } });
    result = await syncOrgRoles({ guild, userId: "p1" });

    assert.equal(result.added, GUARDIANS_ROLE);
    assert.deepEqual(result.removed, [TENRYU_ROLE]);
    // Порядок важен: сначала выдать новую, потом снять прежнюю, иначе между
    // двумя запросами игрок остаётся вообще без организации.
    assert.deepEqual(
      guild.log.map(([kind, , roleId]) => [kind, roleId]),
      [["add", GUARDIANS_ROLE], ["remove", TENRYU_ROLE]],
    );

    // ── Организация снята — роль уходит ──────────────────────────────────────
    await dm.updatePlayer("p1", { organization: null, rank: null });
    guild = fakeGuild({ members: { p1: [GUARDIANS_ROLE, COSMETIC_ROLE] } });
    result = await syncOrgRoles({ guild, userId: "p1" });

    assert.equal(result.added, null);
    assert.deepEqual(result.removed, [GUARDIANS_ROLE]);
    assert.ok(guild.members.get("p1").held.has(COSMETIC_ROLE), "лишнего не сняли");

    // ── Второй слот: роль показывает активного персонажа ─────────────────────
    await dm.createPlayer("p1", "player1", "Борис", null, 2, null);
    await dm.setCustomOrg("p1_2", "Затмение", "admin");
    await dm.updatePlayer("p1", { organization: "TENRYU", rank: "F" });

    // Активен слот 1 — организация второго слота роли не даёт.
    await dm.setActiveSlot("p1", 1);
    guild = fakeGuild({ members: { p1: [] } });
    result = await syncOrgRoles({ guild, userId: "p1" });
    assert.equal(result.added, TENRYU_ROLE, "должна быть организация первого слота");

    // Переключились на слот 2 — роль меняется на его организацию.
    await dm.setActiveSlot("p1", 2);
    guild = fakeGuild({ members: { p1: [TENRYU_ROLE] } });
    result = await syncOrgRoles({ guild, userId: "p1" });
    assert.equal(result.added, ECLIPSE_ROLE);
    assert.deepEqual(result.removed, [TENRYU_ROLE], "две враждующие роли одновременно недопустимы");
    await dm.setActiveSlot("p1", 1);

    // ── Организация без привязанной роли ─────────────────────────────────────
    await dm.createPlayer("p2", "player2", "Хару", null, 1, null);
    await dm.setCustomOrg("p2", "Гильдия Пепла", "admin");
    guild = fakeGuild({ members: { p2: [TENRYU_ROLE] } });
    result = await syncOrgRoles({ guild, userId: "p2" });

    assert.equal(result.status, ORG_SYNC.unmapped);
    assert.equal(result.orgName, "Гильдия Пепла");
    // Роль прежней организации при этом всё равно должна уйти.
    assert.deepEqual(result.removed, [TENRYU_ROLE]);

    // ── Отказы окружения ─────────────────────────────────────────────────────
    await dm.updatePlayer("p2", { organization: "TENRYU", rank: "F" });

    result = await syncOrgRoles({ guild: null, userId: "p2" });
    assert.equal(result.status, ORG_SYNC.noGuild);

    result = await syncOrgRoles({ guild: fakeGuild({ members: {} }), userId: "p2" });
    assert.equal(result.status, ORG_SYNC.memberNotFound);

    result = await syncOrgRoles({
      guild: fakeGuild({ members: { p2: [] }, canManage: false }),
      userId: "p2",
    });
    assert.equal(result.status, ORG_SYNC.missingPermission);

    // Роль выше роли бота — Discord такое запретит, поэтому не пытаемся.
    result = await syncOrgRoles({
      guild: fakeGuild({
        members: { p2: [] },
        botPosition: 5,
        rolePositions: { [TENRYU_ROLE]: 50 },
      }),
      userId: "p2",
    });
    assert.equal(result.status, ORG_SYNC.roleTooHigh);

    // ── Массовая пересинхронизация ───────────────────────────────────────────
    // p1 — организация есть, роли нет (надо выдать).
    // p3 — организации нет, но роль висит (надо снять).
    const bulkGuild = fakeGuild({
      members: { p1: [], p2: [], p3: [GUARDIANS_ROLE] },
    });
    const bulk = await syncAllOrgRoles({ guild: bulkGuild, actorId: "admin" });

    assert.ok(bulk.processed >= 3, `обработано слишком мало: ${bulk.processed}`);
    assert.ok(bulk.counts[ORG_SYNC.applied] >= 3, "должно быть не меньше трёх изменений");
    assert.ok(bulkGuild.members.get("p1").held.has(TENRYU_ROLE));
    assert.ok(
      !bulkGuild.members.get("p3").held.has(GUARDIANS_ROLE),
      "у игрока без персонажа роль организации должна быть снята",
    );
  } finally {
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});
