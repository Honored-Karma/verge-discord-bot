import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import {
  getAllOrganizations,
  getOrganizationByChannelId,
  getOrganizationByKey,
  getOrganizationMissionChannel,
  listOrganizationMissionSettings,
  removeOrganizationMissionChannel,
  setOrganizationMissionChannel,
  verifyChannelPermissions,
} from "../utils/organizationMissionSettings.js";

function createMemoryDb(initial = {}) {
  const collections = {
    custom_orgs: initial.custom_orgs || [],
    org_roles: initial.org_roles || [],
    organization_mission_settings: initial.organization_mission_settings || [],
    admin_actions: [],
  };

  return {
    collection(name) {
      if (!collections[name]) collections[name] = [];
      const list = collections[name];

      return {
        find(query = {}) {
          let docs = list.filter((doc) => {
            for (const [k, v] of Object.entries(query)) {
              if (doc[k] !== v) return false;
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
                  return dir === -1 ? valB.localeCompare(valA) : valA.localeCompare(valB);
                });
              }
              return cursor;
            },
            limit(lim) {
              docs = docs.slice(0, lim);
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
                if (doc[k] !== v) return false;
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
        async deleteOne(filter) {
          const idx = list.findIndex((doc) => {
            for (const [k, v] of Object.entries(filter)) {
              if (doc[k] !== v) return false;
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

test("организация, созданная существующей системой, появляется в autocomplete", async () => {
  const db = createMemoryDb({
    custom_orgs: [
      { name: "Мрачный Блеск", created_by: "admin_1", created_at: new Date() },
      { name: "Новый Рассвет", created_by: "admin_2", created_at: new Date() },
    ],
  });

  const orgs = await getAllOrganizations(db);

  // Должны присутствовать как каноничные, так и созданные кастомные организации
  const keys = orgs.map((o) => o.key);
  assert.ok(keys.includes("tenryu"), "tenryu должен быть в списке");
  assert.ok(keys.includes("guardians"), "guardians должен быть в списке");
  assert.ok(keys.includes("мрачный блеск"), "мрачный блеск должен появиться в списке");
  assert.ok(keys.includes("новый рассвет"), "новый рассвет должен появиться в списке");

  const found = await getOrganizationByKey("Мрачный Блеск", db);
  assert.ok(found);
  assert.equal(found.key, "мрачный блеск");
  assert.equal(found.name, "Мрачный Блеск");
  assert.equal(found.isCustom, true);
});

test("настройка, смена и удаление канала миссий организации", async () => {
  const db = createMemoryDb();
  const guildId = "111222333444";

  // 1. Назначение канала
  const setResult = await setOrganizationMissionChannel({
    guildId,
    orgKey: "tenryu",
    orgId: "tenryu",
    orgName: "Tenryū",
    channelId: "999111222",
    adminId: "admin_42",
    db,
  });
  assert.equal(setResult.success, true);
  assert.equal(setResult.channel_id, "999111222");

  let configured = await getOrganizationMissionChannel({ guildId, orgKey: "tenryu", db });
  assert.ok(configured);
  assert.equal(configured.channel_id, "999111222");
  assert.equal(configured.organization_name, "Tenryū");

  // 2. Поиск организации по каналу
  const byChannel = await getOrganizationByChannelId({ guildId, channelId: "999111222", db });
  assert.ok(byChannel);
  assert.equal(byChannel.organization_key, "tenryu");

  // 3. Смена канала на другой
  const updateResult = await setOrganizationMissionChannel({
    guildId,
    orgKey: "tenryu",
    orgId: "tenryu",
    orgName: "Tenryū",
    channelId: "888555666",
    adminId: "admin_42",
    db,
  });
  assert.equal(updateResult.success, true);
  configured = await getOrganizationMissionChannel({ guildId, orgKey: "tenryu", db });
  assert.equal(configured.channel_id, "888555666", "канал должен обновиться");

  // Список настроек
  const list = await listOrganizationMissionSettings({ guildId, db });
  assert.equal(list.length, 1);
  assert.equal(list[0].channel_id, "888555666");

  // 4. Удаление привязки
  const removeResult = await removeOrganizationMissionChannel({
    guildId,
    orgKey: "tenryu",
    adminId: "admin_42",
    db,
  });
  assert.equal(removeResult.success, true);

  configured = await getOrganizationMissionChannel({ guildId, orgKey: "tenryu", db });
  assert.equal(configured, null, "после удаления канал не должен возвращаться");
});

test("проверка прав бота на целевой канал миссий", () => {
  const fakeChannel = (permissionsMap) => ({
    id: "channel_1",
    permissionsFor(member) {
      if (!member) return null;
      return {
        has(bit) {
          return Boolean(permissionsMap[bit]);
        },
      };
    },
  });

  const member = { id: "bot_1" };

  // Полный набор прав
  const allPerms = fakeChannel({
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.SendMessages]: true,
    [PermissionFlagsBits.EmbedLinks]: true,
    [PermissionFlagsBits.CreatePublicThreads]: true,
    [PermissionFlagsBits.SendMessagesInThreads]: true,
  });

  const check1 = verifyChannelPermissions(allPerms, member);
  assert.equal(check1.ok, true);
  assert.equal(check1.missing.length, 0);
  assert.equal(check1.canCreateThreads, true);

  // Не хватает прав отправки сообщений и встраивания ссылок
  const missingPerms = fakeChannel({
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.SendMessages]: false,
    [PermissionFlagsBits.EmbedLinks]: false,
    [PermissionFlagsBits.CreatePublicThreads]: false,
  });

  const check2 = verifyChannelPermissions(missingPerms, member);
  assert.equal(check2.ok, false);
  assert.ok(check2.missing.length >= 2);
  assert.equal(check2.canCreateThreads, false);

  // Нет права на ветки, но основные права есть
  const noThreads = fakeChannel({
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.SendMessages]: true,
    [PermissionFlagsBits.EmbedLinks]: true,
    [PermissionFlagsBits.CreatePublicThreads]: false,
    [PermissionFlagsBits.SendMessagesInThreads]: false,
  });

  const check3 = verifyChannelPermissions(noThreads, member);
  assert.equal(check3.ok, true, "основные права есть, значит публиковать можно");
  assert.equal(check3.canCreateThreads, false, "создание веток недоступно");
});
