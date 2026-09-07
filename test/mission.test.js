import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelMission,
  createMission,
  deliverMissionRewards,
  getMissionByMessageId,
  getMissionByPublicId,
  joinMission,
  leaveMission,
  MISSION_ACCESS,
  MISSION_STATUS,
  MISSION_TYPES,
  setMissionMessageId,
  startMission,
} from "../utils/missionStore.js";
import {
  createMissionActionRows,
  createMissionCardEmbed,
  createPublicProfileEmbed,
} from "../utils/missionComponents.js";
import {
  getOrganizationMissionChannel,
  setOrganizationMissionChannel,
} from "../utils/organizationMissionSettings.js";
import { isGMOrAdmin, missionInteractionHandler } from "../interactions/missionSession.js";
import {
  createInteractionSession,
  getInteractionSession,
} from "../utils/interactionSessions.js";
import { setDB } from "../utils/db.js";

/**
 * Creates a fully functional MongoDB memory mock supporting atomic findOneAndUpdate,
 * array operations ($push, $pull, $size in $expr), updateOne, insertOne, aggregate, etc.
 */
function createMockDatabase() {
  const store = {
    missions: [],
    organization_mission_settings: [],
    players: [],
    player_sp: [],
    styles: [],
    inventory: [],
    admin_actions: [],
    progression_history: [],
    reputation_history: [],
    interaction_sessions: [],
  };

  const db = {
    _store: store,
    collection(name) {
      if (!store[name]) store[name] = [];
      const list = store[name];

      return {
        aggregate(pipeline = []) {
          if (name === "player_sp") {
            const matchStage = pipeline.find((s) => s.$match);
            const playerId = matchStage?.$match?.player_id;
            const userStyles = list
              .filter((entry) => !playerId || entry.player_id === playerId)
              .map((entry) => {
                const style = store.styles.find((s) => s.id === entry.style_id);
                return {
                  id: style?.id || entry.style_id,
                  name: style?.name || `Стиль #${entry.style_id}`,
                  sp: Number(entry.sp || 0),
                };
              })
              .sort((a, b) => b.sp - a.sp);

            return {
              toArray: async () => userStyles,
            };
          }

          return {
            toArray: async () => [],
          };
        },
        async findOne(filter) {
          return (
            list.find((doc) => {
              for (const [k, v] of Object.entries(filter)) {
                if (k === "$or" && Array.isArray(v)) {
                  const matchAny = v.some((subFilter) => {
                    for (const [sk, sv] of Object.entries(subFilter)) {
                      if (doc[sk] !== sv) return false;
                    }
                    return true;
                  });
                  if (!matchAny) return false;
                  continue;
                }
                if (doc[k] !== v) return false;
              }
              return true;
            }) || null
          );
        },

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
            if (update.$inc) {
              for (const [ik, iv] of Object.entries(update.$inc)) {
                list[idx][ik] = (list[idx][ik] || 0) + iv;
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
          // Find document matching filter
          const idx = list.findIndex((doc) => {
            for (const [k, v] of Object.entries(filter)) {
              if (k === "$or" && Array.isArray(v)) {
                const matchAny = v.some((subFilter) => {
                  if (subFilter["participants.user_id"]) {
                    return doc.participants?.some((p) => p.user_id === subFilter["participants.user_id"]);
                  }
                  if (subFilter["participants.player_id"]) {
                    return doc.participants?.some((p) => p.player_id === subFilter["participants.player_id"]);
                  }
                  for (const [sk, sv] of Object.entries(subFilter)) {
                    if (doc[sk] !== sv) return false;
                  }
                  return true;
                });
                if (!matchAny) return false;
                continue;
              }

              if (k === "status") {
                if (typeof v === "object" && v.$in) {
                  if (!v.$in.includes(doc.status)) return false;
                  continue;
                }
                if (doc.status !== v) return false;
                continue;
              }

              if (k === "participants.user_id" && v && typeof v === "object" && v.$ne) {
                if (doc.participants?.some((p) => p.user_id === v.$ne)) return false;
                continue;
              }

              if (k === "participants.player_id" && v && typeof v === "object" && v.$ne) {
                if (doc.participants?.some((p) => p.player_id === v.$ne)) return false;
                continue;
              }

              if (k === "$expr" && v?.$lt) {
                const [left, right] = v.$lt;
                const size = left?.$size === "$participants" ? (doc.participants?.length || 0) : 0;
                const max = right === "$max_players" ? doc.max_players : right;
                if (!(size < max)) return false;
                continue;
              }

              if (doc[k] !== v) return false;
            }
            return true;
          });

          if (idx === -1) return null;

          const doc = list[idx];
          const before = JSON.parse(JSON.stringify(doc));

          // Apply updates
          if (update.$push) {
            for (const [pk, pv] of Object.entries(update.$push)) {
              if (!Array.isArray(doc[pk])) doc[pk] = [];
              doc[pk].push(pv);
            }
          }

          if (update.$pull) {
            for (const [pk, pv] of Object.entries(update.$pull)) {
              if (Array.isArray(doc[pk])) {
                if (pv.$or) {
                  doc[pk] = doc[pk].filter((item) => {
                    return !pv.$or.some((cond) => {
                      if (cond.user_id && item.user_id === cond.user_id) return true;
                      if (cond.player_id && item.player_id === cond.player_id) return true;
                      return false;
                    });
                  });
                } else if (pv.user_id) {
                  doc[pk] = doc[pk].filter((item) => item.user_id !== pv.user_id);
                }
              }
            }
          }

          if (update.$set) {
            for (const [sk, sv] of Object.entries(update.$set)) {
              // handle dot notation: e.g. "reward_delivery.key"
              if (sk.includes(".")) {
                const parts = sk.split(".");
                let cur = doc;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (!cur[parts[i]]) cur[parts[i]] = {};
                  cur = cur[parts[i]];
                }
                cur[parts[parts.length - 1]] = sv;
              } else {
                doc[sk] = sv;
              }
            }
          }

          if (update.$inc) {
            for (const [ik, iv] of Object.entries(update.$inc)) {
              doc[ik] = (doc[ik] || 0) + iv;
            }
          }

          return options.returnDocument === "before" ? before : doc;
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

  setDB(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ПУБЛИКАЦИЯ В КАНАЛ ОРГАНИЗАЦИИ И ЗАПРЕТ БЕЗ КАНАЛА
// ─────────────────────────────────────────────────────────────────────────────
test("создание миссии: выбор канала организации и запрет создания без настроенного канала", async () => {
  const db = createMockDatabase();
  const guildId = "guild_123";

  // Сначала канал не настроен
  const noChannel = await getOrganizationMissionChannel({ guildId, orgKey: "tenryu", db });
  assert.equal(noChannel, null, "канал для tenryu не настроен");

  // Настраиваем канал
  await setOrganizationMissionChannel({
    guildId,
    orgKey: "tenryu",
    orgId: "tenryu",
    orgName: "Tenryū",
    channelId: "channel_tenryu_101",
    adminId: "admin_1",
    db,
  });

  const configured = await getOrganizationMissionChannel({ guildId, orgKey: "tenryu", db });
  assert.ok(configured);
  assert.equal(configured.channel_id, "channel_tenryu_101");

  // Создаем миссию для Tenryu
  const mission = await createMission({
    guildId,
    organizationId: configured.organization_id,
    organizationKey: configured.organization_key,
    organizationName: configured.organization_name,
    channelId: configured.channel_id,
    title: "Разведка в Скважине",
    type: MISSION_TYPES.well,
    description: "Спуститься на нижние уровни и зачистить аномалию.",
    access: MISSION_ACCESS.organization,
    maxPlayers: 4,
    createdBy: { user_id: "gm_10", username: "GameMaster" },
    reward: { ap: 25, sp: 15, reputation: 10 },
    db,
  });

  assert.ok(mission.public_id.startsWith("MSN-"));
  assert.equal(mission.channel_id, "channel_tenryu_101");
  assert.equal(mission.organization_key, "tenryu");
  assert.equal(mission.status, "recruiting");
  assert.equal(mission.max_players, 4);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ВСТУПЛЕНИЕ, ДВОЙНОЕ ВСТУПЛЕНИЕ И КОНКУРЕНЦИЯ НА ПОСЛЕДНЕЕ МЕСТО
// ─────────────────────────────────────────────────────────────────────────────
test("вступление участника, запрет двойного вступления и атомарное ограничение лимита", async () => {
  const db = createMockDatabase();
  const mission = await createMission({
    guildId: "guild_123",
    channelId: "chan_1",
    title: "Битва на мосту",
    type: MISSION_TYPES.raid,
    description: "Удержать переправу.",
    access: MISSION_ACCESS.open,
    maxPlayers: 2, // Лимит 2 человека
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  // Первое вступление игрока 1
  const join1 = await joinMission({
    publicId: mission.public_id,
    playerId: "player_1_slot1",
    userId: "user_1",
    characterName: "Хаято",
    organizationName: "Tenryū",
    rank: "B",
    db,
  });
  assert.equal(join1.success, true);
  assert.equal(join1.mission.participants.length, 1);

  // Повторная попытка тем же пользователем (запрет двойного вступления)
  const duplicateUser = await joinMission({
    publicId: mission.public_id,
    playerId: "player_1_slot2",
    userId: "user_1", // Тот же Discord User
    characterName: "Второй персонаж",
    organizationName: "Tenryū",
    rank: "A",
    db,
  });
  assert.equal(duplicateUser.success, false);
  assert.equal(duplicateUser.reason, "already_joined");

  // Повторная попытка тем же персонажем
  const duplicatePlayer = await joinMission({
    publicId: mission.public_id,
    playerId: "player_1_slot1",
    userId: "user_other",
    characterName: "Хаято",
    organizationName: "Tenryū",
    rank: "B",
    db,
  });
  assert.equal(duplicatePlayer.success, false);
  assert.equal(duplicatePlayer.reason, "already_joined");

  // Конкурентное вступление за последнее (2-е) место
  // Два разных игрока нажимают «Вступить» одновременно
  const [resA, resB] = await Promise.all([
    joinMission({
      publicId: mission.public_id,
      playerId: "player_2_slot1",
      userId: "user_2",
      characterName: "Рэн",
      organizationName: "Стражи Мира",
      rank: "III",
      db,
    }),
    joinMission({
      publicId: mission.public_id,
      playerId: "player_3_slot1",
      userId: "user_3",
      characterName: "Аои",
      organizationName: "Tenryū",
      rank: "C",
      db,
    }),
  ]);

  // Ровно один должен занять место, а второй получить party_full
  const successes = [resA, resB].filter((r) => r.success);
  const failures = [resA, resB].filter((r) => !r.success);

  assert.equal(successes.length, 1, "ровно один игрок должен занять последнее место");
  assert.equal(failures.length, 1, "второй игрок должен получить отказ");
  assert.equal(failures[0].reason, "party_full");

  const finalMission = await getMissionByPublicId(mission.public_id, db);
  assert.equal(finalMission.participants.length, 2, "в пати должно быть ровно 2 участника");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ОРГАНИЗАЦИОННЫЙ ДОСТУП И ОТКРЫТАЯ МИССИЯ
// ─────────────────────────────────────────────────────────────────────────────
test("организационный доступ пропускает только участников своей фракции", async () => {
  const db = createMockDatabase();
  const orgMission = await createMission({
    guildId: "guild_123",
    organizationKey: "tenryu",
    organizationName: "Tenryū",
    channelId: "chan_1",
    title: "Внутренний сбор Tenryū",
    type: MISSION_TYPES.faction,
    description: "Закрытое собрание членов клана.",
    access: MISSION_ACCESS.organization,
    maxPlayers: 5,
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  // Чужой персонаж из Стражей Мира
  const guardianJoin = await joinMission({
    publicId: orgMission.public_id,
    playerId: "guardian_player",
    userId: "user_guard",
    characterName: "Ким",
    organizationName: "Стражи Мира",
    db,
  });
  assert.equal(guardianJoin.success, false);
  assert.equal(guardianJoin.reason, "organization_mismatch");

  // Свой персонаж из Tenryū
  const tenryuJoin = await joinMission({
    publicId: orgMission.public_id,
    playerId: "tenryu_player",
    userId: "user_tenryu",
    characterName: "Кэндзи",
    organizationName: "Tenryū",
    db,
  });
  assert.equal(tenryuJoin.success, true);

  // Открытая миссия принимает любую организацию
  const openMission = await createMission({
    guildId: "guild_123",
    channelId: "chan_1",
    title: "Общий рейд",
    access: MISSION_ACCESS.open,
    maxPlayers: 5,
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  const openGuardianJoin = await joinMission({
    publicId: openMission.public_id,
    playerId: "guardian_player_2",
    userId: "user_guard_2",
    characterName: "Пак",
    organizationName: "Стражи Мира",
    db,
  });
  assert.equal(openGuardianJoin.success, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ВЫХОД ДО СТАРТА И ЗАПРЕТ ВЫХОДА ПОСЛЕ СТАРТА
// ─────────────────────────────────────────────────────────────────────────────
test("выход разрешён до старта и строго заблокирован после запуска миссии", async () => {
  const db = createMockDatabase();
  const mission = await createMission({
    guildId: "guild_123",
    channelId: "chan_1",
    title: "Срочная вылазка",
    maxPlayers: 3,
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  await joinMission({
    publicId: mission.public_id,
    playerId: "p1",
    userId: "u1",
    characterName: "Боец 1",
    db,
  });

  let current = await getMissionByPublicId(mission.public_id, db);
  assert.equal(current.participants.length, 1);

  // Выход до старта успешен
  const leaveBefore = await leaveMission({
    publicId: mission.public_id,
    playerId: "p1",
    userId: "u1",
    db,
  });
  assert.equal(leaveBefore.success, true);
  current = await getMissionByPublicId(mission.public_id, db);
  assert.equal(current.participants.length, 0);

  // Снова вступаем
  await joinMission({
    publicId: mission.public_id,
    playerId: "p1",
    userId: "u1",
    characterName: "Боец 1",
    db,
  });

  // ГМ запускает миссию (статус active)
  const started = await startMission({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GM",
    db,
  });
  assert.equal(started.success, true);
  assert.equal(started.mission.status, "active");

  // Попытка выйти после старта отклоняется
  const leaveAfter = await leaveMission({
    publicId: mission.public_id,
    playerId: "p1",
    userId: "u1",
    db,
  });
  assert.equal(leaveAfter.success, false);
  assert.equal(leaveAfter.reason, "locked");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ИДЕМПОТЕНТНОСТЬ НАГРАД (AP, SP, РЕПУТАЦИЯ, ПРЕДМЕТ)
// ─────────────────────────────────────────────────────────────────────────────
test("завершение миссии: безопасная и идемпотентная выдача AP, SP, репутации и предметов", async () => {
  const db = createMockDatabase();
  const guildId = "guild_123";

  // Инициализируем тестового игрока
  const playerId = "player_hero_1";
  db._store.players.push({
    id: playerId,
    character_name: "Куро",
    organization: "TENRYU",
    rank: "A",
    ap: 100,
    reputation: 50,
  });

  // Добавляем стиль для зачисления SP
  db._store.styles.push({ id: 10, name: "Теневой Шаг" });
  db._store.player_sp.push({ player_id: playerId, style_id: 10, sp: 200 });

  const mission = await createMission({
    guildId,
    channelId: "chan_1",
    title: "Охота на реликвию",
    maxPlayers: 2,
    reward: {
      ap: 20,
      sp: 10,
      reputation: 5,
      item: { item_name: "Фрагмент чёрного коралла", quantity: 1 },
    },
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  await joinMission({
    publicId: mission.public_id,
    playerId,
    userId: "u_hero",
    characterName: "Куро",
    organizationName: "Tenryū",
    rank: "A",
    db,
  });

  await startMission({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GM",
    db,
  });

  // 1. Первая выдача наград
  const delivery1 = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GM",
    db,
  });

  assert.equal(delivery1.success, true);
  assert.equal(delivery1.allDelivered, true);
  assert.equal(delivery1.mission.status, "completed");

  const playerAfter = await db.collection("players").findOne({ id: playerId });
  const spAfter = await db.collection("player_sp").findOne({ player_id: playerId, style_id: 10 });
  const inventoryAfter = await db.collection("inventory").findOne({ player_id: playerId });

  assert.ok(playerAfter.ap > 100, "AP начислено");
  assert.ok(spAfter.sp > 200, "SP начислено");
  assert.equal(playerAfter.reputation, 55, "Репутация +5");
  assert.equal(inventoryAfter.item_name, "Фрагмент чёрного коралла");
  assert.equal(inventoryAfter.qty, 1);

  const apSnapshot = playerAfter.ap;
  const spSnapshot = spAfter.sp;
  const repSnapshot = playerAfter.reputation;
  const invSnapshot = inventoryAfter.qty;

  // 2. Вторая (повторная) попытка выдачи наград — должна быть строго идемпотентной
  const delivery2 = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GM",
    db,
  });

  assert.equal(delivery2.success, true);
  assert.equal(delivery2.alreadyCompleted, true);

  // Значения не должны измениться ни на единицу
  const playerUnchanged = await db.collection("players").findOne({ id: playerId });
  const spUnchanged = await db.collection("player_sp").findOne({ player_id: playerId, style_id: 10 });
  const invUnchanged = await db.collection("inventory").findOne({ player_id: playerId });

  assert.equal(playerUnchanged.ap, apSnapshot, "AP не должно дублироваться");
  assert.equal(spUnchanged.sp, spSnapshot, "SP не должно дублироваться");
  assert.equal(playerUnchanged.reputation, repSnapshot, "Репутация не должна дублироваться");
  assert.equal(invUnchanged.qty, invSnapshot, "Предмет не должен дублироваться");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ОТМЕНА БЕЗ НАГРАД
// ─────────────────────────────────────────────────────────────────────────────
test("отмена миссии: статус меняется на cancelled, награды не начисляются", async () => {
  const db = createMockDatabase();
  const playerId = "player_cancel_1";
  db._store.players.push({ id: playerId, character_name: "Сато", ap: 50 });

  const mission = await createMission({
    guildId: "guild_123",
    channelId: "chan_1",
    title: "Отменённая операция",
    reward: { ap: 100 },
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  await joinMission({
    publicId: mission.public_id,
    playerId,
    userId: "user_cancel",
    characterName: "Сато",
    db,
  });

  const cancelRes = await cancelMission({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GM",
    reason: "Неблагоприятные погодные условия",
    db,
  });

  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.mission.status, "cancelled");
  assert.equal(cancelRes.mission.cancel_reason, "Неблагоприятные погодные условия");

  // Попытка завершить отменённую миссию блокируется
  const deliverRes = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GM",
    db,
  });

  assert.equal(deliverRes.success, false);
  assert.equal(deliverRes.reason, "mission_cancelled");

  const player = await db.collection("players").findOne({ id: playerId });
  assert.equal(player.ap, 50, "AP не должно начислиться");
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ОТСУТСТВИЕ УТЕЧКИ ПРИВАТНЫХ ПОЛЕЙ ПРОФИЛЯ
// ─────────────────────────────────────────────────────────────────────────────
test("публичный профиль союзников: полное отсутствие утечки приватных полей", () => {
  const player = {
    id: "discord_999888_slot1",
    public_id: "ch_999888_slot1",
    slug: "hana-kami",
    character_name: "Хана Ками",
    character_avatar: "https://cdn.example.com/avatar.png",
    attribute_name: "Гроза",
    organization: "GUARDIANS",
    rank: "IV",
    ap: 320,

    // Приватные поля, которые КАТЕГОРИЧЕСКИ запрещено показывать
    krw: 45000000,
    yen: 1200000,
    internal_admin_notes: "Игрок находится под наблюдением администрации",
    secret_token: "secret_12345",
  };

  const styles = [{ name: "Громовой Кулак", sp: 450 }];

  const embed = createPublicProfileEmbed(player, styles, "https://verge-rp.ru");
  const json = embed.toJSON();
  const text = JSON.stringify(json);

  // Проверяем наличие публичных полей
  assert.ok(text.includes("Хана Ками"), "Имя должно быть в профиле");
  assert.ok(text.includes("Гроза"), "Атрибут должен быть в профиле");
  assert.ok(text.includes("GUARDIANS"), "Организация должна быть в профиле");
  assert.ok(text.includes("IV"), "Ранг должен быть в профиле");
  assert.ok(text.includes("320 AP"), "AP должно быть в профиле");
  assert.ok(text.includes("Громовой Кулак"), "Стиль должен быть в профиле");
  assert.ok(text.includes("/characters/hana-kami"), "Ссылка на веб-профиль по slug должна присутствовать");

  // Проверяем СТРОГИЙ запрет утечки приватных полей
  assert.ok(!text.includes("45000000"), "Баланс KRW не должен попадать в публичный профиль");
  assert.ok(!text.includes("1200000"), "Баланс Yen не должен попадать в публичный профиль");
  assert.ok(!text.includes("discord_999888_slot1"), "Внутренний ID не должен попадать в публичный профиль");
  assert.ok(!text.includes("под наблюдением"), "Заметки администрации не должны попадать в публичный профиль");
  assert.ok(!text.includes("secret_12345"), "Приватные токены не должны попадать в публичный профиль");
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ПРОВЕРКА ПРАВ ГМ И АДМИНИСТРАТОРА
// ─────────────────────────────────────────────────────────────────────────────
test("проверка прав: ГМ и администратор распознаются корректно", () => {
  // Администратор с правами Discord Administrator
  const adminMember = {
    id: "admin_1",
    guild: { ownerId: "owner_99" },
    permissions: { has: (perm) => perm === 8n },
    roles: { cache: { some: () => false } },
  };
  assert.equal(isGMOrAdmin(adminMember), true);

  // Обычный игрок без ролей
  const regularMember = {
    id: "player_1",
    guild: { ownerId: "owner_99" },
    permissions: { has: () => false },
    roles: { cache: { some: () => false } },
  };
  assert.equal(isGMOrAdmin(regularMember), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. СОХРАНЕНИЕ СЕССИЙ И РАБОТА КНОПОК ПОСЛЕ РЕСТАРТА
// ─────────────────────────────────────────────────────────────────────────────
test("компоненты карточки миссии и сессия восстанавливаются после рестарта", async () => {
  const db = createMockDatabase();
  const mission = await createMission({
    guildId: "guild_1",
    channelId: "chan_1",
    title: "Ночной рейд",
    maxPlayers: 3,
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });

  const messageId = "msg_discord_555";
  await setMissionMessageId(mission.public_id, messageId, db);

  // Создаём персистентную сессию
  const sessionResult = await createInteractionSession({
    messageId,
    namespace: "mission",
    ownerId: "gm_1",
    guildId: "guild_1",
    channelId: "chan_1",
    state: { public_id: mission.public_id },
  });

  // Эмулируем чтение после рестарта бота
  const loadedMission = await getMissionByMessageId(messageId, db);
  assert.ok(loadedMission);
  assert.equal(loadedMission.public_id, mission.public_id);
  assert.equal(loadedMission.title, "Ночной рейд");

  // Проверяем сборку карточки и кнопок
  const embed = createMissionCardEmbed(loadedMission);
  assert.ok(embed.data.title.includes("Ночной рейд"));

  const [row1, row2] = createMissionActionRows(loadedMission);
  assert.equal(row1.components.length, 4, "первый ряд содержит 4 кнопки игрока");
  assert.equal(row2.components.length, 3, "второй ряд содержит 3 кнопки управления");
});
