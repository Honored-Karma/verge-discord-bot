import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { data, autocomplete, execute } from "../commands/create-org.js";
import {
  getAllOrganizations,
  findOrganization,
} from "../utils/organizationMissionSettings.js";
import {
  createCustomOrg,
  deleteCustomOrg,
  listCustomOrgs,
  setCustomOrg,
  removeCustomOrg,
  createPlayer,
  getPlayer,
  setActiveSlot,
} from "../utils/dataManager.js";
import {
  initializeOrgRoles,
  listOrgRoles,
  setOrgRole,
  syncOrgRoles,
  DEFAULT_ORG_ROLES,
} from "../utils/orgRoles.js";
import { setDB } from "../utils/db.js";
import { sweepGlobalCooldowns } from "../utils/cooldowns.js";

function fakeMember(id, roleIds, log) {
  const held = new Set(roleIds);
  return {
    id,
    roles: {
      cache: {
        has: (roleId) => held.has(roleId),
        get: (roleId) => (held.has(roleId) ? { id: roleId, name: `Role_${roleId}` } : null),
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

function fakeGuild({ members = {}, canManage = true, botPosition = 100 } = {}) {
  const log = [];
  const built = new Map(
    Object.entries(members).map(([id, roleIds]) => [id, fakeMember(id, roleIds, log)])
  );

  return {
    log,
    members: {
      me: {
        permissions: { has: (flag) => canManage && flag === PermissionFlagsBits.ManageRoles },
        roles: { highest: { position: botPosition } },
      },
      async fetch(userId) {
        if (userId === undefined) return built;
        const found = built.get(userId);
        if (!found) throw new Error("Unknown Member");
        return found;
      },
      get: (id) => built.get(id),
    },
    roles: {
      cache: {
        get: (roleId) => ({ id: roleId, name: `Role_${roleId}` }),
      },
      async fetch(roleId) {
        return { id: roleId, name: `Role_${roleId}` };
      },
    },
  };
}

function createMemoryDb(initial = {}) {
  const collections = {
    custom_orgs: initial.custom_orgs || [],
    org_roles: initial.org_roles || [],
    players: initial.players || [],
    user_settings: initial.user_settings || [],
    admin_actions: initial.admin_actions || [],
    organization_mission_settings: initial.organization_mission_settings || [],
  };

  return {
    collection(name) {
      if (!collections[name]) collections[name] = [];
      const list = collections[name];

      return {
        createIndex: async () => {},
        find(query = {}) {
          let docs = list.filter((doc) => {
            if (query.$or) {
              return query.$or.some((subQuery) => {
                for (const [k, v] of Object.entries(subQuery)) {
                  if (v && v.$ne !== undefined) {
                    if (doc[k] === null || doc[k] === undefined) return false;
                  } else if (doc[k] !== v) {
                    return false;
                  }
                }
                return true;
              });
            }
            for (const [k, v] of Object.entries(query)) {
              if (v && v.$ne !== undefined) {
                if (doc[k] === null || doc[k] === undefined) return false;
              } else if (doc[k] !== v) {
                return false;
              }
            }
            return true;
          });

          const cursor = {
            sort(sortObj = {}) {
              const [key, dir] = Object.entries(sortObj)[0] || [];
              if (key) {
                docs.sort((a, b) => {
                  const valA = a[key] || "";
                  const valB = b[key] || "";
                  return dir === -1 ? String(valB).localeCompare(String(valA)) : String(valA).localeCompare(String(valB));
                });
              }
              return cursor;
            },
            limit(lim) {
              docs = docs.slice(0, lim);
              return cursor;
            },
            project() {
              return cursor;
            },
            toArray: async () => [...docs],
          };
          return cursor;
        },
        async findOne(query) {
          return (
            list.find((doc) => {
              for (const [k, v] of Object.entries(query)) {
                if (v && v.$regex) {
                  if (!v.$regex.test(doc[k])) return false;
                } else if (doc[k] !== v) {
                  return false;
                }
              }
              return true;
            }) || null
          );
        },
        async insertOne(doc) {
          const inserted = { _id: String(list.length + 1), ...doc };
          list.push(inserted);
          return { acknowledged: true, insertedId: inserted._id };
        },
        async updateOne(filter, update, options = {}) {
          const idx = list.findIndex((doc) => {
            for (const [k, v] of Object.entries(filter)) {
              if (doc[k] !== v) return false;
            }
            return true;
          });

          if (idx !== -1) {
            if (update.$set) Object.assign(list[idx], update.$set);
            if (update.$unset) {
              for (const k of Object.keys(update.$unset)) {
                delete list[idx][k];
              }
            }
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
          }

          if (options.upsert) {
            const newDoc = {
              _id: String(list.length + 1),
              ...filter,
              ...(update.$setOnInsert || {}),
              ...(update.$set || {}),
            };
            list.push(newDoc);
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
          }

          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        },
        async findOneAndUpdate(filter, update, options = {}) {
          const doc = list.find((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k] !== v) return false;
            }
            return true;
          });
          if (doc) {
            if (update.$set) Object.assign(doc, update.$set);
            if (update.$unset) {
              for (const k of Object.keys(update.$unset)) {
                delete doc[k];
              }
            }
            return { value: doc };
          }
          return { value: null };
        },
        async deleteOne(filter) {
          const idx = list.findIndex((doc) => {
            for (const [k, v] of Object.entries(filter)) {
              if (v && v.$regex) {
                if (!v.$regex.test(doc[k])) return false;
              } else if (doc[k] !== v) {
                return false;
              }
            }
            return true;
          });
          if (idx !== -1) {
            list.splice(idx, 1);
            return { deletedCount: 1 };
          }
          return { deletedCount: 0 };
        },
      };
    },
  };
}

test("SlashCommandBuilder data: параметры name имеют autocomplete: true", () => {
  const json = data.toJSON();
  assert.equal(json.name, "org");

  const findOpt = (subName, optName, groupName = null) => {
    let sub;
    if (groupName) {
      const group = json.options.find((o) => o.name === groupName);
      sub = group?.options?.find((o) => o.name === subName);
    } else {
      sub = json.options.find((o) => o.name === subName);
    }
    return sub?.options?.find((o) => o.name === optName);
  };

  const deleteNameOpt = findOpt("delete", "name");
  assert.equal(deleteNameOpt?.autocomplete, true, "delete name must have autocomplete");

  const assignNameOpt = findOpt("assign", "name");
  assert.equal(assignNameOpt?.autocomplete, true, "assign name must have autocomplete");

  const roleSetNameOpt = findOpt("set", "name", "role");
  assert.equal(roleSetNameOpt?.autocomplete, true, "role set name must have autocomplete");

  const roleUnsetNameOpt = findOpt("unset", "name", "role");
  assert.equal(roleUnsetNameOpt?.autocomplete, true, "role unset name must have autocomplete");
});

test("findOrganization находит канонические и кастомные организации", async () => {
  const db = createMemoryDb();
  setDB(db);
  await initializeOrgRoles(db);
  await createCustomOrg("Мрачный Блеск", "admin_1");
  await createCustomOrg("Синдикат Рассвет", "admin_1");

  // Каноническая
  const tenryu = await findOrganization("TENRYU", db);
  assert.ok(tenryu, "должен найти TENRYU");
  assert.equal(tenryu.key, "tenryu");

  const tenryuRu = await findOrganization("Тенрю", db);
  assert.ok(tenryuRu, "должен найти Тенрю по-русски");
  assert.equal(tenryuRu.key, "tenryu");

  // Кастомная
  const eclipse = await findOrganization("Мрачный Блеск", db);
  assert.ok(eclipse, "должен найти Мрачный Блеск");
  assert.equal(eclipse.name, "Мрачный Блеск");

  // Будущая организация
  const dawn = await findOrganization("синдикат рассвет", db);
  assert.ok(dawn, "должен найти Синдикат Рассвет независимо от регистра");
  assert.equal(dawn.name, "Синдикат Рассвет");

  // Несуществующая
  const notFound = await findOrganization("Несуществующая Орг 123", db);
  assert.equal(notFound, null);
});

test("autocomplete динамически предлагает все организации из базы данных, включая будущие", async () => {
  const db = createMemoryDb();
  setDB(db);
  await initializeOrgRoles(db);

  // 1. Проверяем autocomplete для assign ДО создания новой организации
  let responded = [];
  const makeInteraction = (sub, query, group = null) => ({
    options: {
      getFocused: () => ({ name: "name", value: query }),
      getSubcommandGroup: () => group,
      getSubcommand: () => sub,
    },
    respond: async (choices) => {
      responded = choices;
    },
  });

  await autocomplete(makeInteraction("assign", ""));
  const initialNames = responded.map((c) => c.name);
  assert.ok(initialNames.some((n) => n.toLowerCase().includes("tenryū") || n.toLowerCase().includes("tenryu")));
  assert.ok(initialNames.some((n) => n.toLowerCase().includes("стражи")));

  // 2. Создаём новую кастомную организацию прямо в базе (будущая организация)
  await createCustomOrg("Орден Феникса", "admin_1");

  // 3. Сразу вызываем autocomplete - новая организация должна моментально появиться в подсказках
  await autocomplete(makeInteraction("assign", "феникс"));
  assert.equal(responded.length, 1);
  assert.equal(responded[0].value, "Орден Феникса");

  // 4. Autocomplete для delete - предлагает только кастомные
  await autocomplete(makeInteraction("delete", ""));
  const deleteChoices = responded.map((c) => c.value);
  assert.ok(deleteChoices.includes("Орден Феникса"));
  assert.ok(!deleteChoices.includes("Tenryū"), "каноничные организации нельзя удалять через delete");

  // 5. Autocomplete для role unset - предлагает только организации с привязанными ролями
  await autocomplete(makeInteraction("unset", "", "role"));
  const unsetChoices = responded.map((c) => c.value.toLowerCase());
  assert.ok(unsetChoices.includes("tenryu"));
  assert.ok(unsetChoices.includes("guardians"));
});

test("/org list выводит список всех организаций без пингов <@&id>", async () => {
  const db = createMemoryDb();
  setDB(db);
  await initializeOrgRoles(db);
  await createCustomOrg("Новая Фракция", "admin");

  let replyData = null;
  const fakeInteraction = {
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => "list",
    },
    guild: {
      roles: {
        cache: new Map([
          ["1537014608660004935", { id: "1537014608660004935", name: "Tenryu_Role" }],
        ]),
      },
    },
    reply: async (data) => {
      replyData = data;
      return { id: "msg_1" };
    },
  };

  await execute(fakeInteraction);

  assert.ok(replyData && replyData.embeds && replyData.embeds.length > 0);
  const desc = replyData.embeds[0].data.description;

  assert.ok(desc.includes("Tenryū") || desc.includes("TENRYU"));
  assert.ok(desc.includes("Стражи Мира") || desc.includes("GUARDIANS"));
  assert.ok(desc.includes("Новая Фракция"));

  // Проверка на отсутствие живых упоминаний ролей (<@&id>), которые пингуют всех участников
  assert.ok(!/<@&?\d+>/.test(desc), "embed не должен содержать живых упоминаний <@&id>");
});

test("/org assign назначает организацию и выдаёт роль Discord в активном слоте", async () => {
  const db = createMemoryDb();
  setDB(db);
  await initializeOrgRoles(db);

  // Создаём игрока в слоте 1
  const userId = "user_42";
  await createPlayer(userId, "Gamer", "Хана", null, 1, "Пепел");
  await setActiveSlot(userId, 1);

  const guild = fakeGuild({ members: { [userId]: [] } });

  let replyData = null;
  const fakeInteraction = {
    user: { id: "admin_id", username: "Admin" },
    member: { id: "admin_id", permissions: { has: () => true }, guild: { ownerId: "admin_id" } },
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => "assign",
      getUser: () => ({ id: userId, username: "Gamer" }),
      getString: (opt) => (opt === "name" ? "TENRYU" : null),
      getInteger: (opt) => (opt === "slot" ? 1 : null),
    },
    guild,
    reply: async (data) => {
      replyData = data;
      return { id: "msg_2" };
    },
  };

  await execute(fakeInteraction);

  // 1. Проверяем обновление игрока в базе данных
  const player = await getPlayer(userId);
  assert.equal(player.organization, "TENRYU");
  assert.equal(player.custom_org, "TENRYU");

  // 2. Проверяем выдачу роли Discord
  const tenryuRoleId = DEFAULT_ORG_ROLES.find((r) => r.org_key === "tenryu").role_id;
  assert.ok(guild.members.get(userId).held.has(tenryuRoleId), "роль TENRYU должна быть выдана");
  assert.ok(guild.log.some(([action, target, role]) => action === "add" && target === userId && role === tenryuRoleId));

  // 3. Перевод в организацию Затмение
  await createCustomOrg("Затмение", "admin");
  const fakeInteraction2 = {
    ...fakeInteraction,
    user: { id: "admin_id_2", username: "Admin" },
    member: { id: "admin_id_2", permissions: { has: () => true }, guild: { ownerId: "admin_id_2" } },
    options: {
      ...fakeInteraction.options,
      getString: (opt) => (opt === "name" ? "Затмение" : null),
    },
  };

  await sweepGlobalCooldowns();
  await execute(fakeInteraction2);

  const updatedPlayer = await getPlayer(userId);
  assert.equal(updatedPlayer.organization, "Затмение");
  assert.equal(updatedPlayer.custom_org, "Затмение");

  const eclipseRoleId = DEFAULT_ORG_ROLES.find((r) => r.org_key === "затмение").role_id;
  assert.ok(guild.members.get(userId).held.has(eclipseRoleId), "роль Затмение должна быть выдана");
  assert.ok(!guild.members.get(userId).held.has(tenryuRoleId), "роль TENRYU должна быть снята");

  // 4. Удаление организации через /org remove
  const fakeInteractionRemove = {
    ...fakeInteraction,
    user: { id: "admin_id_3", username: "Admin" },
    member: { id: "admin_id_3", permissions: { has: () => true }, guild: { ownerId: "admin_id_3" } },
    options: {
      ...fakeInteraction.options,
      getSubcommand: () => "remove",
    },
  };

  await sweepGlobalCooldowns();
  await execute(fakeInteractionRemove);

  const clearedPlayer = await getPlayer(userId);
  assert.equal(clearedPlayer.organization, null);
  assert.equal(clearedPlayer.custom_org, null);
  assert.ok(!guild.members.get(userId).held.has(eclipseRoleId), "роль Затмение должна быть снята");
});

test("принятие анкеты с организацией через /accept выдаёт роль организации в Discord", async () => {
  const db = createMemoryDb();
  setDB(db);
  await initializeOrgRoles(db);

  const {
    acceptApplicationInteractionHandler,
    ACC_BTN_CONFIRM,
    createAcceptApplicationState,
  } = await import("../interactions/acceptApplicationSession.js");

  const applicantId = "applicant_99";
  const guild = fakeGuild({ members: { [applicantId]: [] } });

  const state = createAcceptApplicationState({
    target_user_id: applicantId,
    target_username: "Applicant",
    character_name: "Шин",
    organization: "TENRYU",
    slot: 1,
  });

  const session = { message_id: "session_msg_1", state };
  let repliedEmbeds = [];

  const fakeInteraction = {
    customId: ACC_BTN_CONFIRM,
    guild,
    channel: { send: async () => ({ id: "public_msg" }) },
    channelId: "channel_app",
    user: { id: "anketolog_id", username: "Anketolog", tag: "Anketolog#1234" },
    client: { commands: new Map() },
    deferUpdate: async () => {},
    editReply: async (data) => {
      repliedEmbeds = data.embeds;
    },
  };

  await acceptApplicationInteractionHandler.handleComponent({
    interaction: fakeInteraction,
    session,
  });

  // Проверяем что выдана роль организации TENRYU
  const tenryuRoleId = DEFAULT_ORG_ROLES.find((r) => r.org_key === "tenryu").role_id;
  assert.ok(
    guild.members.get(applicantId).held.has(tenryuRoleId),
    "при принятии анкеты роль TENRYU должна быть выдана"
  );
  assert.ok(
    repliedEmbeds.length > 0 &&
      repliedEmbeds[0].data.description.includes("TENRYU")
  );
});
