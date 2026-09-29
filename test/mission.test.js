import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelMission,
  createMission,
  deliverMissionRewards,
  getMissionByMessageId,
  getMissionByPublicId,
  joinMission,
  kickParticipantFromMission,
  leaveMission,
  MISSION_ACCESS,
  MISSION_STATUS,
  MISSION_TYPES,
  setMissionMessageId,
  startMission,
  unkickParticipantFromMission,
} from "../utils/missionStore.js";
import {
  createKickMemberSelectRow,
  createMemberProfileSelectRow,
  createMissionActionRows,
  createMissionCardEmbed,
  createPartyListEmbed,
  createPublicProfileEmbed,
  createRetryDeliveryActionRow,
  createRewardReportEmbed,
  createUnkickMemberSelectRow,
  MISSION_BTN_CONFIRM_FINISH,
  MISSION_BTN_KICK,
  MISSION_BTN_RETRY_REWARDS,
  MISSION_SELECT_KICK,
  MISSION_SELECT_UNKICK,
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
                    if (sv && typeof sv === "object") {
                      if (sv.$exists === false) {
                        if (Object.hasOwn(doc, sk) && doc[sk] !== undefined) return false;
                        continue;
                      }
                      if (sv.$lte !== undefined) {
                        if ((Number(doc[sk]) || 0) > sv.$lte) return false;
                        continue;
                      }
                      if (sv.$gte !== undefined) {
                        if ((Number(doc[sk]) || 0) < sv.$gte) return false;
                        continue;
                      }
                    }
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

              if (k === "kicked_user_ids" && v && typeof v === "object" && v.$ne) {
                if (doc.kicked_user_ids?.includes(v.$ne)) return false;
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
          if (update.$addToSet) {
            for (const [ak, av] of Object.entries(update.$addToSet)) {
              if (!Array.isArray(doc[ak])) doc[ak] = [];
              if (!doc[ak].includes(av)) doc[ak].push(av);
            }
          }

          if (update.$push) {
            for (const [pk, pv] of Object.entries(update.$push)) {
              if (!Array.isArray(doc[pk])) doc[pk] = [];
              doc[pk].push(pv);
            }
          }

          if (update.$pull) {
            for (const [pk, pv] of Object.entries(update.$pull)) {
              if (Array.isArray(doc[pk])) {
                if (typeof pv === "string") {
                  doc[pk] = doc[pk].filter((item) => item !== pv);
                } else if (pv.$or) {
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

test("проверка минимального ранга для входа в миссию (корейские и японские ранги)", async () => {
  const db = createMockDatabase();

  // 1. Миссия с требованием корейского ранга IV
  const koreanMission = await createMission({
    guildId: "guild_123",
    channelId: "chan_1",
    title: "Операция в Сеуле",
    access: MISSION_ACCESS.open,
    minRank: "IV",
    maxPlayers: 5,
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });
  assert.equal(koreanMission.min_rank, "IV");

  // Персонаж без ранга не может зайти
  const noRankJoin = await joinMission({
    publicId: koreanMission.public_id,
    playerId: "player_no_rank",
    userId: "user_no_rank",
    characterName: "Новичок Без Ранга",
    rank: null,
    db,
  });
  assert.equal(noRankJoin.success, false);
  assert.equal(noRankJoin.reason, "rank_required");

  // Персонаж с корейским рангом VI (новобранец < IV) не может зайти
  const lowRankJoin = await joinMission({
    publicId: koreanMission.public_id,
    playerId: "player_vi",
    userId: "user_vi",
    characterName: "Сержант VI",
    rank: "VI",
    db,
  });
  assert.equal(lowRankJoin.success, false);
  assert.equal(lowRankJoin.reason, "rank_too_low");

  // Персонаж с корейским рангом IV (точное совпадение) может зайти
  const exactRankJoin = await joinMission({
    publicId: koreanMission.public_id,
    playerId: "player_iv",
    userId: "user_iv",
    characterName: "Командир IV",
    rank: "IV",
    db,
  });
  assert.equal(exactRankJoin.success, true);

  // Персонаж с корейским рангом II (выше IV) может зайти
  const highRankJoin = await joinMission({
    publicId: koreanMission.public_id,
    playerId: "player_ii",
    userId: "user_ii",
    characterName: "Спецназ II",
    rank: "II",
    db,
  });
  assert.equal(highRankJoin.success, true);

  // 2. Миссия с требованием японского ранга B
  const japaneseMission = await createMission({
    guildId: "guild_123",
    channelId: "chan_1",
    title: "Вылазка на Цусиму",
    access: MISSION_ACCESS.open,
    minRank: "B",
    maxPlayers: 5,
    createdBy: { user_id: "gm_1", username: "GM" },
    db,
  });
  assert.equal(japaneseMission.min_rank, "B");

  // Персонаж с японским рангом D (< B) не может зайти
  const lowJpJoin = await joinMission({
    publicId: japaneseMission.public_id,
    playerId: "player_jp_d",
    userId: "user_jp_d",
    characterName: "Герой D",
    rank: "D",
    db,
  });
  assert.equal(lowJpJoin.success, false);
  assert.equal(lowJpJoin.reason, "rank_too_low");

  // Персонаж с японским рангом S (> B) может зайти
  const highJpJoin = await joinMission({
    publicId: japaneseMission.public_id,
    playerId: "player_jp_s",
    userId: "user_jp_s",
    characterName: "Хана Ками S",
    rank: "S",
    db,
  });
  assert.equal(highJpJoin.success, true);

  // 3. Кросс-ранговая проверка (эквивалентные ранговые тиры)
  // Японская миссия с порогом B (тир 5) - корейский ранг I (тир 7) может зайти
  const crossJoinPass = await joinMission({
    publicId: japaneseMission.public_id,
    playerId: "player_kr_i",
    userId: "user_kr_i",
    characterName: "Ми Бом Сок I",
    rank: "I",
    db,
  });
  assert.equal(crossJoinPass.success, true);

  // Корейская миссия с порогом IV (тир 3) - японский ранг F (тир 1 < 3) не может зайти
  const crossJoinFail = await joinMission({
    publicId: koreanMission.public_id,
    playerId: "player_jp_f",
    userId: "user_jp_f",
    characterName: "Новичок F",
    rank: "F",
    db,
  });
  assert.equal(crossJoinFail.success, false);
  assert.equal(crossJoinFail.reason, "rank_too_low");
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
      krw: 50000,
      yen: 2500,
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
  const inventoryAfter = await db.collection("inventory").find({ player_id: playerId }).toArray();

  assert.equal(playerAfter.krw, 50000, "KRW начислено на баланс игрока");
  assert.equal(playerAfter.yen, 2500, "YEN начислено на баланс игрока");
  assert.ok(playerAfter.ap > 100, "AP начислено");
  assert.ok(spAfter.sp > 200, "SP начислено");
  assert.equal(playerAfter.reputation, 55, "Репутация +5");
  // В инвентаре ТОЛЬКО 1 предмет — фрагмент коралла, и НИКАКИХ денег!
  assert.equal(inventoryAfter.length, 1, "В инвентаре только реальный предмет, деньги на балансе");
  assert.equal(inventoryAfter[0].item_name, "Фрагмент чёрного коралла");
  assert.equal(inventoryAfter[0].qty, 1);

  const krwSnapshot = playerAfter.krw;
  const yenSnapshot = playerAfter.yen;
  const apSnapshot = playerAfter.ap;
  const spSnapshot = spAfter.sp;
  const repSnapshot = playerAfter.reputation;
  const invSnapshot = inventoryAfter[0].qty;

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
  const invUnchanged = await db.collection("inventory").find({ player_id: playerId }).toArray();

  assert.equal(playerUnchanged.krw, krwSnapshot, "KRW не должно дублироваться");
  assert.equal(playerUnchanged.yen, yenSnapshot, "YEN не должно дублироваться");
  assert.equal(playerUnchanged.ap, apSnapshot, "AP не должно дублироваться");
  assert.equal(spUnchanged.sp, spSnapshot, "SP не должно дублироваться");
  assert.equal(playerUnchanged.reputation, repSnapshot, "Репутация не должна дублироваться");
  assert.equal(invUnchanged.length, 1, "Количество предметов в инвентаре не изменилось");
  assert.equal(invUnchanged[0].qty, invSnapshot, "Предмет не должен дублироваться");
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
  assert.ok(text.includes("Репутация:"), "Репутация должна быть в профиле");
  assert.ok(text.includes("20 Rtg"), "Дефолтная репутация должна быть в профиле");
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
  assert.equal(row2.components.length, 4, "второй ряд содержит 4 кнопки управления");
});

test("диалог завершения миссии (CONFIRM_FINISH и ABORT_FINISH) корректно работает даже при 0 участников", async () => {
  const db = createMockDatabase();
  setDB(db);

  const mission = await createMission({
    guildId: "guild_finish_1",
    channelId: "chan_finish_1",
    title: "Зачистка аномальной скважины",
    maxPlayers: 5,
    createdBy: { user_id: "gm_finisher", username: "GameMaster" },
    reward: { ap: 45, sp: 3, reputation: 345 },
    db,
  });

  const publicCardMsgId = "msg_public_card_777";
  await setMissionMessageId(mission.public_id, publicCardMsgId, db);

  // 1. Открытие диалога завершения (MISSION_BTN_FINISH)
  let finishReplyPayload = null;
  const finishInteraction = {
    customId: "mission_finish",
    user: { id: "gm_finisher", username: "GameMaster" },
    guildId: "guild_finish_1",
    channelId: "chan_finish_1",
    member: {
      id: "gm_finisher",
      permissions: { has: () => true },
      roles: { cache: { some: () => true } },
    },
    async reply(payload) {
      finishReplyPayload = payload;
      return { resource: { message: { id: "msg_ephemeral_confirm_888" } } };
    },
  };

  const cardSession = {
    message_id: publicCardMsgId,
    state: { public_id: mission.public_id },
  };

  await missionInteractionHandler.handleComponent({
    interaction: finishInteraction,
    session: cardSession,
  });

  assert.ok(finishReplyPayload);
  assert.ok(finishReplyPayload.embeds);

  // Проверяем, что в БД зарегистрировалась сессия для эфемера
  const ephemeralSession = await db.collection("interaction_sessions").findOne({
    message_id: "msg_ephemeral_confirm_888",
  });
  assert.ok(ephemeralSession, "сессия для эфемерного окна подтверждения должна быть создана");
  assert.equal(ephemeralSession.state.public_id, mission.public_id);

  // 2. Нажатие «Подтвердить и выдать награды» (MISSION_BTN_CONFIRM_FINISH)
  let publicCardEdited = false;
  const mockPublicCard = {
    id: publicCardMsgId,
    async edit() {
      publicCardEdited = true;
    },
  };

  let editReplyPayload = null;
  const confirmInteraction = {
    customId: "mission_finish_confirm",
    user: { id: "gm_finisher", username: "GameMaster" },
    guildId: "guild_finish_1",
    channelId: "chan_finish_1",
    message: { id: "msg_ephemeral_confirm_888" },
    client: {
      channels: {
        async fetch(chId) {
          if (chId === "chan_finish_1") {
            return {
              messages: {
                async fetch(mId) {
                  if (mId === publicCardMsgId) return mockPublicCard;
                  return null;
                },
              },
            };
          }
          return null;
        },
      },
    },
    member: {
      id: "gm_finisher",
      permissions: { has: () => true },
      roles: { cache: { some: () => true } },
    },
    async deferUpdate() {},
    async editReply(payload) {
      editReplyPayload = payload;
    },
  };

  await missionInteractionHandler.handleComponent({
    interaction: confirmInteraction,
    session: ephemeralSession,
  });

  // Проверяем, что миссия перешла в статус completed даже при 0 участников
  const completedMission = await getMissionByPublicId(mission.public_id, db);
  assert.equal(completedMission.status, "completed");
  assert.ok(publicCardEdited, "публичная карточка миссии должна быть обновлена в канале");
  assert.ok(editReplyPayload);
  assert.ok(editReplyPayload.embeds[0].data.title.includes("Награды успешно выданы"));

  // Сессия подтверждения закрыта
  const closedSession = await db.collection("interaction_sessions").findOne({
    message_id: "msg_ephemeral_confirm_888",
  });
  assert.equal(closedSession.status, "closed");
});

test("интерактивные кнопки: старт с переиспользованием ветки, просмотр пати и досье участников", async () => {
  const db = createMockDatabase();
  setDB(db);

  // Добавляем тестового игрока
  await db.collection("players").insertOne({
    id: "user_party_1_1",
    user_id: "user_party_1",
    slot: 1,
    character_name: "Тестовый Ниндзя",
    organization: "Сопротивление",
    rank: "Ветеран",
    ap: 50,
  });

  const mission = await createMission(
    {
      guildId: "guild_audit_1",
      channelId: "chan_audit_1",
      title: "Операция в порту",
      type: MISSION_TYPES.anomaly,
      description: "Зачистка порта",
      access: MISSION_ACCESS.open,
      maxPlayers: 4,
      createdBy: { user_id: "gm_auditor", username: "Master" },
      reward: { ap: 10, sp: 5, reputation: 1 },
    },
    db
  );

  // Игрок вступает в миссию
  await joinMission(
    {
      publicId: mission.public_id,
      playerId: "user_party_1_1",
      userId: "user_party_1",
      characterName: "Тестовый Ниндзя",
    },
    db
  );

  const cardSession = {
    message_id: "msg_card_audit_999",
    state: { public_id: mission.public_id },
  };

  // 1. Проверка кнопки «Состав пати» (MISSION_BTN_PARTY)
  let partyEditPayload = null;
  const partyInteraction = {
    customId: "mission_party",
    user: { id: "user_party_1" },
    async deferReply() {},
    async editReply(payload) {
      partyEditPayload = payload;
    },
  };

  await missionInteractionHandler.handleComponent({
    interaction: partyInteraction,
    session: cardSession,
  });

  assert.ok(partyEditPayload, "просмотр состава пати должен вернуть embed");
  assert.ok(partyEditPayload.embeds[0].data.title.includes("Состав пати"));

  // 2. Проверка выбора участника из селекта (MISSION_SELECT_MEMBER)
  let memberProfilePayload = null;
  const memberSelectInteraction = {
    customId: "mission_member_select",
    user: { id: "user_party_1" },
    values: ["user_party_1_1"],
    async deferUpdate() {},
    async editReply(payload) {
      memberProfilePayload = payload;
    },
  };

  await missionInteractionHandler.handleComponent({
    interaction: memberSelectInteraction,
    session: cardSession,
  });

  assert.ok(memberProfilePayload, "просмотр досье участника должен вернуть обновлённое сообщение");
  assert.ok(memberProfilePayload.embeds[0].data.title.includes("Тестовый Ниндзя"));

  // 3. Проверка запуска миссии (MISSION_BTN_START) с уже существующей веткой
  let threadMessageSent = false;
  const existingThread = {
    id: "thread_rp_existing_123",
    async send(text) {
      threadMessageSent = true;
    },
  };

  let startNotice = null;
  const startInteraction = {
    customId: "mission_start",
    user: { id: "gm_auditor", username: "Master" },
    guildId: "guild_audit_1",
    channelId: "chan_audit_1",
    message: {
      id: "msg_card_audit_999",
      thread: existingThread,
      hasThread: true,
      async edit() {},
    },
    member: {
      id: "gm_auditor",
      permissions: { has: () => true },
      roles: { cache: { some: () => true } },
    },
    deferred: true,
    async deferReply() {},
    async editReply(payload) {
      startNotice = payload;
    },
  };

  await missionInteractionHandler.handleComponent({
    interaction: startInteraction,
    session: cardSession,
  });

  assert.ok(threadMessageSent, "бот должен отправить сообщение в существующую ветку");
  const startedMission = await getMissionByPublicId(mission.public_id, db);
  assert.equal(startedMission.status, "active");
  assert.equal(startedMission.thread_id, "thread_rp_existing_123");
  assert.ok(startNotice.content.includes("успешно запущена"));
  assert.ok(!startNotice.content.includes("не удалось создать"), "не должно быть ложного предупреждения о правах на ветку");
});

test("кастомные эмодзи миссий: правильные теги, знак скважины, состав пати, цель и награды", () => {
  const wellMission = {
    public_id: "MSN-TEST01",
    title: "Тестовая скважина",
    type: "well",
    status: "recruiting",
    description: "Исследовать аномалию глубины",
    participants: [],
    max_players: 4,
    reward: { ap: 100, sp: 20 },
    created_by: { username: "GM_Master" },
  };

  const embed = createMissionCardEmbed(wellMission);
  const desc = embed.data.description;
  const title = embed.data.title;

  // Проверяем знак скважины
  assert.ok(title.includes(":63borehole:"), "Заголовок скважины должен содержать :63borehole:");

  // Проверяем секцию цели
  assert.ok(desc.includes(":19warning:"), "Секция цели должна содержать :19warning:");
  assert.ok(desc.includes("Краткая цель:"), "Секция должна содержать 'Краткая цель:'");

  // Проверяем секцию состава пати
  assert.ok(desc.includes(":25user:"), "Секция пати должна содержать :25user:");
  assert.ok(desc.includes("Состав пати:"), "Секция должна содержать 'Состав пати:'");

  // Проверяем награды
  assert.ok(desc.includes("<:45lootbox:1499585857995411576>"), "Секция наград должна содержать лутбокс");
  assert.ok(desc.includes("Награды каждому завершившему миссию:"), "Секция должна содержать 'Награды каждому завершившему миссию:'");

  // Проверяем набег с фиолетовой молнией
  const raidMission = {
    ...wellMission,
    type: "raid",
    title: "Ночной штурм",
  };
  const raidEmbed = createMissionCardEmbed(raidMission);
  assert.ok(raidEmbed.data.title.includes("<:14LightningPurple:1494708639473074277>"), "Набег должен содержать <:14LightningPurple:1494708639473074277>");

  // Проверяем динамическое разрешение через кэш Discord-клиента
  const mockClient = {
    emojis: {
      cache: [
        { name: "25user", toString: () => "<:25user:1494708705759989760>" },
        { name: "19warning", toString: () => "<:19warning:1494708207300509887>" },
        { name: "63borehole", toString: () => "<:63borehole:1494708149951660042>" },
      ],
    },
  };

  const dynamicEmbed = createMissionCardEmbed(wellMission, mockClient);
  assert.ok(dynamicEmbed.data.title.includes("<:63borehole:1494708149951660042>"), "Должен подставить ID скважины из клиента");
  assert.ok(dynamicEmbed.data.description.includes("<:25user:1494708705759989760>"), "Должен подставить ID пати из клиента");
  assert.ok(dynamicEmbed.data.description.includes("<:19warning:1494708207300509887>"), "Должен подставить ID warning из клиента");
});

test("вступление в лобби миссии (MISSION_BTN_JOIN): пинг участника в ветке, добавление в тред и ссылка на ветку", async () => {
  const db = createMockDatabase();
  setDB(db);

  await db.collection("players").insertOne({
    id: "lobby_user_1",
    user_id: "lobby_user_1",
    slot: 1,
    character_name: "Инари",
    organization: "Сопротивление",
    rank: "Ветеран",
    ap: 100,
  });

  const mission = await createMission(
    {
      guildId: "guild_lobby_1",
      channelId: "chan_lobby_1",
      title: "Рейд на склад",
      type: MISSION_TYPES.raid,
      description: "Освободить груз",
      access: MISSION_ACCESS.open,
      maxPlayers: 5,
      createdBy: { user_id: "gm_host", username: "GM Host" },
      reward: { ap: 20 },
    },
    db
  );

  const addedMembers = [];
  const sentThreadMessages = [];
  const mockThread = {
    id: "thread_mission_lobby_999",
    archived: false,
    members: {
      async add(uid) {
        addedMembers.push(uid);
      },
    },
    async send(content) {
      sentThreadMessages.push(content);
    },
  };

  let replyNotice = null;
  const joinInteraction = {
    customId: "mission_join",
    user: { id: "lobby_user_1", username: "InariPlayer" },
    guildId: "guild_lobby_1",
    channelId: "chan_lobby_1",
    message: {
      id: "msg_mission_card_111",
      thread: mockThread,
      hasThread: true,
      async edit() {},
    },
    deferred: true,
    async deferReply() {},
    async editReply(payload) {
      replyNotice = payload;
    },
  };

  const cardSession = {
    message_id: "msg_mission_card_111",
    state: { public_id: mission.public_id },
  };

  await missionInteractionHandler.handleComponent({
    interaction: joinInteraction,
    session: cardSession,
  });

  // 1. Проверяем добавление пользователя в ветку Discord
  assert.ok(
    addedMembers.includes("lobby_user_1"),
    "участник должен быть добавлен в members ветки"
  );

  // 2. Проверяем пинг участника в ветке
  assert.ok(
    sentThreadMessages.some(
      (msg) => msg.includes("<@lobby_user_1>") && msg.includes("Инари")
    ),
    "в ветку должно быть отправлено сообщение с пингом <@lobby_user_1> и именем персонажа"
  );

  // 3. Проверяем уведомление игроку со ссылкой на ветку
  assert.ok(replyNotice, "игрок должен получить ответ");
  assert.ok(replyNotice.content.includes("✅ Вы успешно вступили в миссию"));
  assert.ok(replyNotice.content.includes("Ветка обсуждения: <#thread_mission_lobby_999>"));

  // 4. Проверяем обновление участников в базе данных
  const updatedMission = await getMissionByPublicId(mission.public_id, db);
  assert.equal(updatedMission.participants.length, 1);
  assert.equal(updatedMission.participants[0].user_id, "lobby_user_1");
  assert.equal(updatedMission.participants[0].character_name, "Инари");
});

test("вступление в лобби без ветки: автоматическое создание ветки на сообщении карточки и сохранение thread_id", async () => {
  const db = createMockDatabase();
  setDB(db);

  await db.collection("players").insertOne({
    id: "lobby_user_2",
    user_id: "lobby_user_2",
    slot: 1,
    character_name: "Самурай",
    organization: "Сопротивление",
    rank: "Новичок",
    ap: 50,
  });

  const mission = await createMission(
    {
      guildId: "guild_lobby_2",
      channelId: "chan_lobby_2",
      title: "Патруль сектора",
      type: MISSION_TYPES.investigation,
      description: "Проверить сектор 4",
      access: MISSION_ACCESS.open,
      maxPlayers: 3,
      createdBy: { user_id: "gm_host", username: "GM Host" },
    },
    db
  );

  let threadCreated = false;
  const mockNewThread = {
    id: "thread_auto_created_777",
    archived: false,
    members: {
      async add() {},
    },
    async send() {},
  };

  const joinInteraction = {
    customId: "mission_join",
    user: { id: "lobby_user_2", username: "SamuraiPlayer" },
    guildId: "guild_lobby_2",
    channelId: "chan_lobby_2",
    message: {
      id: "msg_card_auto_create",
      thread: null,
      hasThread: false,
      async startThread(opts) {
        threadCreated = true;
        return mockNewThread;
      },
      async edit() {},
    },
    deferred: true,
    async deferReply() {},
    async editReply() {},
  };

  const cardSession = {
    message_id: "msg_card_auto_create",
    state: { public_id: mission.public_id },
  };

  await missionInteractionHandler.handleComponent({
    interaction: joinInteraction,
    session: cardSession,
  });

  assert.ok(threadCreated, "должна быть вызвана функция startThread");
  const updatedMission = await getMissionByPublicId(mission.public_id, db);
  assert.equal(
    updatedMission.thread_id,
    "thread_auto_created_777",
    "созданный ID ветки должен быть сохранён в базе данных миссии"
  );
});

test("startMission сохраняет существующий thread_id, если threadId не передан", async () => {
  const db = createMockDatabase();
  setDB(db);

  const mission = await createMission(
    {
      guildId: "guild_start_test",
      channelId: "chan_start_test",
      title: "Миссия с существующим тредом",
      type: MISSION_TYPES.social,
      description: "Переговоры",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_start", username: "GM Start" },
    },
    db
  );

  // Сохраняем существующий thread_id
  await db.collection("missions").updateOne(
    { public_id: mission.public_id },
    { $set: { thread_id: "existing_thread_persistent_999" } }
  );

  // Запуск миссии без явной передачи threadId
  const result = await startMission(
    {
      publicId: mission.public_id,
      actorId: "gm_start",
      actorUsername: "GM Start",
    },
    db
  );

  assert.ok(result.success);
  assert.equal(
    result.mission.thread_id,
    "existing_thread_persistent_999",
    "старт миссии не должен обнулять ранее созданный thread_id"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. ИСКЛЮЧЕНИЕ УЧАСТНИКОВ (КИК) И ЗАЩИТА ОТ ПОВТОРНОГО ВХОДА
// ─────────────────────────────────────────────────────────────────────────────
test("kickParticipantFromMission: исключение участника, занесение в kicked_user_ids и блокировка повторного входа", async () => {
  const db = createMockDatabase();

  const mission = await createMission(
    {
      guildId: "guild_kick_1",
      channelId: "chan_kick_1",
      title: "Миссия с исключением",
      type: MISSION_TYPES.investigation,
      description: "Тест кика",
      access: MISSION_ACCESS.open,
      maxPlayers: 3,
      createdBy: { user_id: "gm_lead", username: "GM Lead" },
    },
    db
  );

  // Игроки вступают в пати
  const join1 = await joinMission({
    publicId: mission.public_id,
    playerId: "p_good",
    userId: "u_good",
    characterName: "Хороший боец",
    db,
  });
  assert.ok(join1.success);

  const join2 = await joinMission({
    publicId: mission.public_id,
    playerId: "p_bad",
    userId: "u_bad",
    characterName: "Нежелательный игрок",
    db,
  });
  assert.ok(join2.success);

  let fresh = await getMissionByPublicId(mission.public_id, db);
  assert.equal(fresh.participants.length, 2);

  // Проверка кнопок карточки: кнопка "Исключить" должна присутствовать и быть активной
  const rows = createMissionActionRows(fresh);
  const row2 = rows[1];
  const kickBtn = row2.components.find((c) => c.data.custom_id === MISSION_BTN_KICK);
  assert.ok(kickBtn, "Кнопка 'Исключить' должна присутствовать во 2-й строке");
  assert.equal(kickBtn.data.disabled, false, "Кнопка 'Исключить' должна быть активной при наличии участников");

  // Проверка генерации меню выбора для кика
  const kickSelectRow = createKickMemberSelectRow(fresh);
  assert.ok(kickSelectRow);
  const selectMenu = kickSelectRow.components[0];
  assert.equal(selectMenu.data.custom_id, MISSION_SELECT_KICK);
  assert.equal(selectMenu.options.length, 2);
  assert.equal(selectMenu.options[1].data.value, "p_bad");

  // Организатор исключает игрока p_bad
  const kickResult = await kickParticipantFromMission({
    publicId: mission.public_id,
    targetPlayerId: "p_bad",
    actorId: "gm_lead",
    actorUsername: "GM Lead",
    db,
  });

  assert.ok(kickResult.success);
  assert.equal(kickResult.kickedParticipant.player_id, "p_bad");
  assert.equal(kickResult.mission.participants.length, 1);
  assert.equal(kickResult.mission.participants[0].player_id, "p_good");
  assert.ok(kickResult.mission.kicked_user_ids.includes("u_bad"));

  // Попытка исключенного игрока вступить повторно отклоняется
  const rejoinAttempt = await joinMission({
    publicId: mission.public_id,
    playerId: "p_bad",
    userId: "u_bad",
    characterName: "Нежелательный игрок",
    db,
  });
  assert.equal(rejoinAttempt.success, false);
  assert.equal(rejoinAttempt.reason, "kicked");

  // Другой игрок может спокойно вступить
  const join3 = await joinMission({
    publicId: mission.public_id,
    playerId: "p_another",
    userId: "u_another",
    characterName: "Другой боец",
    db,
  });
  assert.ok(join3.success);

  // Проверка меню разблокировки (unkick)
  fresh = await getMissionByPublicId(mission.public_id, db);
  const unkickSelectRow = createUnkickMemberSelectRow(fresh);
  assert.ok(unkickSelectRow);
  assert.equal(unkickSelectRow.components[0].data.custom_id, MISSION_SELECT_UNKICK);

  // Организатор снимает блокировку с u_bad
  const unkickResult = await unkickParticipantFromMission({
    publicId: mission.public_id,
    targetUserId: "u_bad",
    actorId: "gm_lead",
    actorUsername: "GM Lead",
    db,
  });
  assert.ok(unkickResult.success);
  assert.ok(!unkickResult.mission.kicked_user_ids.includes("u_bad"));

  // Теперь u_bad снова может вступить
  const joinAgain = await joinMission({
    publicId: mission.public_id,
    playerId: "p_bad",
    userId: "u_bad",
    characterName: "Нежелательный игрок",
    db,
  });
  assert.ok(joinAgain.success);
});

test("kickParticipantFromMission: нельзя исключать участников после старта или завершения", async () => {
  const db = createMockDatabase();

  const mission = await createMission(
    {
      guildId: "guild_kick_2",
      channelId: "chan_kick_2",
      title: "Миссия после старта",
      type: MISSION_TYPES.combat,
      description: "Тест запрета кика",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_lead", username: "GM Lead" },
    },
    db
  );

  await joinMission({
    publicId: mission.public_id,
    playerId: "p1",
    userId: "u1",
    characterName: "Боец",
    db,
  });

  await startMission({
    publicId: mission.public_id,
    actorId: "gm_lead",
    actorUsername: "GM Lead",
    db,
  });

  const kickAttempt = await kickParticipantFromMission({
    publicId: mission.public_id,
    targetPlayerId: "p1",
    actorId: "gm_lead",
    actorUsername: "GM Lead",
    db,
  });

  assert.equal(kickAttempt.success, false);
  assert.equal(kickAttempt.reason, "invalid_status");
});

test("отображение репутации в меню 'Состав пати' и селекте 'Профили участников'", async () => {
  const db = createMockDatabase();

  const mockMission = {
    public_id: "MSN-REP-TEST",
    title: "Тестовая операция",
    max_players: 4,
    status: MISSION_STATUS.recruiting,
    participants: [
      {
        player_id: "player_urban",
        user_id: "user_urban",
        character_name: "Городской Герой",
        organization_name: "Синдикат",
        rank: "III",
        reputation: 1500,
        joined_at: new Date(),
      },
      {
        player_id: "player_district",
        user_id: "user_district",
        character_name: "Районный Воин",
        organization_name: null,
        rank: null,
        reputation: 850,
        joined_at: new Date(),
      },
    ],
  };

  // 1. Проверка createPartyListEmbed
  const partyEmbed = createPartyListEmbed(mockMission);
  const partyDesc = partyEmbed.data.description;
  assert.ok(partyDesc.includes("1500 Rtg"), "Состав пати должен содержать 1500 Rtg");
  assert.ok(partyDesc.includes("Городской"), "Состав пати должен содержать тир Городской");
  assert.ok(partyDesc.includes("🏙️"), "Состав пати должен содержать эмодзи городского тира");
  assert.ok(partyDesc.includes("850 Rtg"), "Состав пати должен содержать 850 Rtg");
  assert.ok(partyDesc.includes("Район"), "Состав пати должен содержать тир Район");
  assert.ok(partyDesc.includes("🏘️"), "Состав пати должен содержать эмодзи района");

  // 2. Проверка createMemberProfileSelectRow
  const selectRow = createMemberProfileSelectRow(mockMission);
  assert.ok(selectRow, "Селект участников должен быть создан");
  const options = selectRow.components[0].options;
  assert.equal(options.length, 2);

  assert.equal(options[0].data.label, "1. Городской Герой");
  assert.ok(options[0].data.description.includes("1500 Rtg (Городской)"));
  assert.equal(options[0].data.emoji.name, "🏙️");

  assert.equal(options[1].data.label, "2. Районный Воин");
  assert.ok(options[1].data.description.includes("850 Rtg (Район)"));
  assert.equal(options[1].data.emoji.name, "🏘️");

  // 3. Проверка createPublicProfileEmbed с кастомной репутацией
  const heroPlayer = {
    id: "player_world",
    public_id: "world-hero",
    character_name: "Мировой Защитник",
    organization: "GUARDIANS",
    rank: "I",
    ap: 999,
    reputation: 5200,
  };
  const profileEmbed = createPublicProfileEmbed(heroPlayer, []);
  const profileDesc = profileEmbed.data.description;
  assert.ok(profileDesc.includes("5200 Rtg"), "Публичный профиль должен содержать 5200 Rtg");
  assert.ok(profileDesc.includes("Мировой"), "Публичный профиль должен содержать тир Мировой");
  assert.ok(profileDesc.includes("🌍"), "Публичный профиль должен содержать эмодзи мирового тира");

  // 4. Проверка сохранения репутации в joinMission
  const newMission = await createMission(
    {
      title: "Миссия с репутацией",
      description: "Тест",
      access: MISSION_ACCESS.open,
      maxPlayers: 3,
      createdBy: { user_id: "gm_1", username: "GM" },
      reward: { ap: 5, sp: 5, reputation: 1 },
    },
    db
  );

  const joinRes = await joinMission({
    publicId: newMission.public_id,
    playerId: "p_rep_test",
    userId: "u_rep_test",
    characterName: "Новичок",
    reputation: 350,
    db,
  });
  assert.equal(joinRes.success, true);

  const savedMission = await getMissionByPublicId(newMission.public_id, db);
  const joinedPart = savedMission.participants.find((p) => p.player_id === "p_rep_test");
  assert.ok(joinedPart, "Участник должен быть сохранён в миссии");
  assert.equal(joinedPart.reputation, 350, "Репутация участника должна быть сохранена в БД");
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. УЧАСТНИК БЕЗ БОЕВЫХ СТИЛЕЙ: МИССИЯ ЗАВЕРШАЕТСЯ, SP SKIPPED, НАГРАДЫ ВЫДАЮТСЯ
// ─────────────────────────────────────────────────────────────────────────────
test("завершение миссии с участником без боевых стилей: статус completed, SP skipped, AP и репутация начислены", async () => {
  const db = createMockDatabase();
  setDB(db);

  const playerId = "player_unstyled_1";
  await db.collection("players").insertOne({
    id: playerId,
    user_id: "user_unstyled_1",
    character_name: "Необученный Боец",
    organization: "GUARDIANS",
    rank: "IV",
    ap: 40,
    reputation: 20,
  });

  // В коллекции player_sp НЕТ записей для этого персонажа!

  const mission = await createMission(
    {
      guildId: "guild_unstyled_1",
      channelId: "chan_unstyled_1",
      title: "Обучающая миссия",
      type: MISSION_TYPES.faction,
      description: "Первое задание без изученных стилей",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_master_1", username: "GM_Master" },
      reward: {
        ap: 25,
        sp: 15,
        reputation: 10,
        item: { item_name: "Базовый стимулятор", quantity: 2 },
      },
    },
    db
  );

  await joinMission(
    {
      publicId: mission.public_id,
      playerId,
      userId: "user_unstyled_1",
      characterName: "Необученный Боец",
    },
    db
  );

  await startMission({
    publicId: mission.public_id,
    actorId: "gm_master_1",
    actorUsername: "GM_Master",
    db,
  });

  // Завершение миссии и выдача наград
  const result = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_master_1",
    actorUsername: "GM_Master",
    db,
  });

  assert.equal(result.success, true);
  assert.equal(result.allDelivered, true, "allDelivered должно быть true несмотря на пропущенный SP");
  assert.equal(result.hasFailures, false, "отсутствие стиля не должно считаться ошибкой доставки");
  assert.equal(result.mission.status, MISSION_STATUS.completed, "миссия обязана завершиться");

  // Проверяем, что в БД статус действительно completed
  const inDb = await getMissionByPublicId(mission.public_id, db);
  assert.equal(inDb.status, MISSION_STATUS.completed);
  assert.ok(inDb.completed_at);
  assert.equal(inDb.completed_by.user_id, "gm_master_1");

  // Проверяем начисление AP, репутации и предмета
  const player = await db.collection("players").findOne({ id: playerId });
  assert.equal(player.ap, 65, "AP должно увеличиться на 25");
  assert.equal(player.reputation, 30, "Репутация должна увеличиться на 10");

  const inventory = await db.collection("inventory").findOne({ player_id: playerId });
  assert.ok(inventory, "Предмет должен быть выдан в инвентарь");
  assert.equal(inventory.item_name, "Базовый стимулятор");
  assert.equal(inventory.qty, 2);

  // Проверяем статус SP в отчёте доставки
  const partReport = result.deliveryReport[0];
  assert.equal(partReport.rewards.sp.status, "skipped");
  assert.equal(partReport.rewards.sp.error, "У персонажа нет изученных боевых стилей");

  // Проверяем форматирование embed отчёта
  const reportEmbed = createRewardReportEmbed(inDb, result);
  assert.ok(reportEmbed.data.title.includes("✅ Награды успешно выданы"));
  assert.ok(reportEmbed.data.description.includes("SP: ⚠️ У персонажа нет изученных боевых стилей"));
  assert.ok(!reportEmbed.data.description.includes("undefined"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. МЬЮТЕКС И ЗАЩИТА ОТ КОНКУРЕНТНОЙ ВЫДАЧИ НАГРАД
// ─────────────────────────────────────────────────────────────────────────────
test("защита от конкурентной выдачи наград (concurrency mutex lock)", async () => {
  const db = createMockDatabase();
  setDB(db);

  const playerId = "player_conc_1";
  await db.collection("players").insertOne({
    id: playerId,
    user_id: "user_conc_1",
    character_name: "Спринтер",
    organization: "TENRYU",
    rank: "B",
    ap: 100,
    reputation: 50,
  });

  const mission = await createMission(
    {
      guildId: "guild_conc_1",
      channelId: "chan_conc_1",
      title: "Параллельная выдача",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_conc_1", username: "GM_Conc" },
      reward: { ap: 30, sp: 0, reputation: 15 },
    },
    db
  );

  await joinMission({
    publicId: mission.public_id,
    playerId,
    userId: "user_conc_1",
    characterName: "Спринтер",
    db,
  });

  await startMission({
    publicId: mission.public_id,
    actorId: "gm_conc_1",
    actorUsername: "GM_Conc",
    db,
  });

  // Запускаем два параллельных вызова deliverMissionRewards
  const [resA, resB] = await Promise.all([
    deliverMissionRewards({
      publicId: mission.public_id,
      actorId: "gm_conc_1",
      actorUsername: "GM_Conc",
      db,
    }),
    deliverMissionRewards({
      publicId: mission.public_id,
      actorId: "gm_conc_1",
      actorUsername: "GM_Conc",
      db,
    }),
  ]);

  // Один вызов обязан завершиться успехом, а второй — быть отклонён мьютексом
  const successResult = resA.success ? resA : resB;
  const lockedResult = !resA.success ? resA : resB;

  assert.equal(successResult.success, true);
  assert.equal(lockedResult.success, false);
  assert.equal(lockedResult.reason, "already_delivering");

  // AP и репутация начислены СТРОГО 1 раз, не 2 раза!
  const player = await db.collection("players").findOne({ id: playerId });
  assert.equal(player.ap, 133, "AP должно увеличиться ровно 1 раз (100 + 33 = 133 с учётом ранга B)");
  assert.equal(player.reputation, 65, "Репутация должна увеличиться ровно 1 раз (50 + 15 = 65)");
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. ПОВТОРНЫЙ ВЫЗОВ НА ЗАВЕРШЁННОЙ МИССИИ (ALREADY COMPLETED) И ОБНОВЛЕНИЕ КАРТОЧКИ
// ─────────────────────────────────────────────────────────────────────────────
test("повторный вызов deliverMissionRewards на завершённой миссии (alreadyCompleted) идемпотентен", async () => {
  const db = createMockDatabase();
  setDB(db);

  const playerId = "player_idemp_1";
  await db.collection("players").insertOne({
    id: playerId,
    user_id: "user_idemp_1",
    character_name: "Идемпотент",
    organization: "TENRYU",
    rank: "A",
    ap: 100,
    reputation: 50,
  });

  const mission = await createMission(
    {
      guildId: "guild_idemp_1",
      channelId: "chan_idemp_1",
      title: "Идемпотентная миссия",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_idemp_1", username: "GM_Idemp" },
      reward: { ap: 20, sp: 0, reputation: 10 },
    },
    db
  );

  await joinMission({
    publicId: mission.public_id,
    playerId,
    userId: "user_idemp_1",
    characterName: "Идемпотент",
    db,
  });

  await startMission({
    publicId: mission.public_id,
    actorId: "gm_idemp_1",
    actorUsername: "GM_Idemp",
    db,
  });

  // Первое завершение
  const firstRes = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_idemp_1",
    actorUsername: "GM_Idemp",
    db,
  });
  assert.equal(firstRes.success, true);
  assert.equal(firstRes.mission.status, MISSION_STATUS.completed);

  const apAfterFirst = (await db.collection("players").findOne({ id: playerId })).ap;
  assert.equal(apAfterFirst, 123, "AP после первого завершения 123 (100 + 20*1.15)");

  // Второе завершение
  const secondRes = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_idemp_1",
    actorUsername: "GM_Idemp",
    db,
  });
  assert.equal(secondRes.success, true);
  assert.equal(secondRes.alreadyCompleted, true);
  assert.equal(secondRes.allDelivered, true);

  // Награды не продублировались
  const player = await db.collection("players").findOne({ id: playerId });
  assert.equal(player.ap, apAfterFirst, "AP не должно дублироваться");
  assert.equal(player.reputation, 60);

  // Проверяем обработку в missionInteractionHandler для MISSION_BTN_CONFIRM_FINISH на завершённой миссии
  await setMissionMessageId(mission.public_id, "msg_card_idemp_1", db);

  let publicCardUpdated = false;
  const mockPublicCard = {
    id: "msg_card_idemp_1",
    async edit() {
      publicCardUpdated = true;
    },
  };

  const session = {
    message_id: "msg_ephem_idemp_1",
    state: { public_id: mission.public_id },
  };
  await createInteractionSession({
    messageId: session.message_id,
    namespace: "mission",
    ownerId: "gm_idemp_1",
    guildId: "guild_idemp_1",
    channelId: "chan_idemp_1",
    state: session.state,
  });

  let editReplyContent = null;
  const finishConfirmInteraction = {
    customId: MISSION_BTN_CONFIRM_FINISH,
    user: { id: "gm_idemp_1", username: "GM_Idemp" },
    guildId: "guild_idemp_1",
    channelId: "chan_idemp_1",
    message: { id: session.message_id },
    client: {
      channels: {
        async fetch() {
          return {
            messages: {
              async fetch() {
                return mockPublicCard;
              },
            },
          };
        },
      },
    },
    member: {
      id: "gm_idemp_1",
      permissions: { has: () => true },
      roles: { cache: { some: () => true } },
    },
    async update() {},
    async editReply(payload) {
      editReplyContent = payload.content;
    },
  };

  await missionInteractionHandler.handleComponent({
    interaction: finishConfirmInteraction,
    session,
  });

  assert.ok(editReplyContent.includes("уже была успешно завершена"), "должно уведомить, что миссия уже завершена");
  assert.ok(publicCardUpdated, "публичная карточка должна быть обновлена");
});

// ─────────────────────────────────────────────────────────────────────────────
// 23. КНОПКА ПОДТВЕРЖДЕНИЯ СРАЗУ УДАЛЯЕТ КНОПКИ ДЛЯ ЗАЩИТЫ ОТ ДВОЙНОГО КЛИКА
// ─────────────────────────────────────────────────────────────────────────────
test("кнопка подтверждения завершения немедленно убирает кнопки для защиты от двойного клика", async () => {
  const db = createMockDatabase();
  setDB(db);

  const mission = await createMission(
    {
      guildId: "guild_btn_1",
      channelId: "chan_btn_1",
      title: "Быстрый клик",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_btn_1", username: "GM_Btn" },
      reward: { ap: 10, sp: 0, reputation: 5 },
    },
    db
  );

  await startMission({
    publicId: mission.public_id,
    actorId: "gm_btn_1",
    actorUsername: "GM_Btn",
    db,
  });

  let updatePayload = null;
  const confirmInteraction = {
    customId: MISSION_BTN_CONFIRM_FINISH,
    user: { id: "gm_btn_1", username: "GM_Btn" },
    guildId: "guild_btn_1",
    channelId: "chan_btn_1",
    message: { id: "msg_ephem_btn_1" },
    member: {
      id: "gm_btn_1",
      permissions: { has: () => true },
      roles: { cache: { some: () => true } },
    },
    async update(payload) {
      updatePayload = payload;
    },
    async editReply() {},
  };

  const session = {
    message_id: "msg_ephem_btn_1",
    state: { public_id: mission.public_id },
  };

  await missionInteractionHandler.handleComponent({
    interaction: confirmInteraction,
    session,
  });

  assert.ok(updatePayload, "interaction.update должен быть вызван немедленно");
  assert.deepEqual(updatePayload.components, [], "компоненты (кнопки) должны быть немедленно очищены");
  assert.ok(updatePayload.content.includes("Выдача наград"), "сообщение должно показать статус ожидания");
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. ЧАСТИЧНАЯ ОШИБКА ВЫДАЧИ И ПОВТОР (RETRY) ДОЗАВЕРШАЕТ ТОЛЬКО НЕВЫДАННОЕ
// ─────────────────────────────────────────────────────────────────────────────
test("частичная ошибка выдачи и повтор (retry) дозавершает только невыданную награду", async () => {
  const db = createMockDatabase();
  setDB(db);

  const playerId1 = "player_retry_ok";
  const playerId2 = "player_retry_fail";

  await db.collection("players").insertOne({
    id: playerId1,
    user_id: "u_ok",
    character_name: "Успешный",
    organization: "TENRYU",
    rank: "B",
    ap: 50,
    reputation: 10,
  });

  // playerId2 намеренно отсутствует в коллекции players на первом этапе, чтобы giveItem вернул player_not_found!

  const mission = await createMission(
    {
      guildId: "guild_retry_1",
      channelId: "chan_retry_1",
      title: "Миссия с повтором",
      access: MISSION_ACCESS.open,
      maxPlayers: 2,
      createdBy: { user_id: "gm_retry_1", username: "GM_Retry" },
      reward: {
        ap: 10,
        sp: 0,
        reputation: 5,
        item: { item_name: "Артефакт", quantity: 1 },
      },
    },
    db
  );

  // Напрямую добавляем участников
  mission.participants = [
    { player_id: playerId1, user_id: "u_ok", character_name: "Успешный" },
    { player_id: playerId2, user_id: "u_fail", character_name: "Отстающий" },
  ];
  await db.collection("missions").updateOne(
    { public_id: mission.public_id },
    { $set: { participants: mission.participants, status: MISSION_STATUS.active } }
  );

  // 1. Первая попытка выдачи наград
  const res1 = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_retry_1",
    actorUsername: "GM_Retry",
    db,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.hasFailures, true, "должна быть ошибка из-за отсутствия второго игрока");
  assert.equal(res1.allDelivered, false);
  assert.equal(res1.mission.status, MISSION_STATUS.completed, "миссия всё равно переводится в completed");

  // Игрок 1 получил свои награды
  const p1After = await db.collection("players").findOne({ id: playerId1 });
  assert.equal(p1After.ap, 61, "AP с учётом ранга B: 50 + 11 = 61");
  assert.equal(p1After.reputation, 15);
  const inv1 = await db.collection("inventory").findOne({ player_id: playerId1 });
  assert.equal(inv1.qty, 1);

  // Теперь добавляем игрока 2 в базу (исправляем причину ошибки)
  await db.collection("players").insertOne({
    id: playerId2,
    user_id: "u_fail",
    character_name: "Отстающий",
    organization: "TENRYU",
    rank: "C",
    ap: 20,
    reputation: 5,
  });

  // 2. Повторная выдача наград (retry)
  const res2 = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_retry_1",
    actorUsername: "GM_Retry",
    db,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.allDelivered, true, "после повтора все награды выданы");
  assert.equal(res2.hasFailures, false);

  // Игрок 1 НЕ получил повторных наград (строгая защита от дублей)
  const p1Final = await db.collection("players").findOne({ id: playerId1 });
  assert.equal(p1Final.ap, 61, "AP первого игрока не должно увеличиться снова");
  assert.equal(p1Final.reputation, 15, "Репутация первого игрока не должна увеличиться снова");
  const inv1Final = await db.collection("inventory").find({ player_id: playerId1 }).toArray?.() || [inv1];
  assert.equal(inv1.qty, 1, "Количество предметов первого игрока не должно увеличиться");

  // Игрок 2 теперь получил свою награду
  const inv2 = await db.collection("inventory").findOne({ player_id: playerId2 });
  assert.ok(inv2, "Игрок 2 должен получить предмет при повторе");
  assert.equal(inv2.qty, 1);
});



