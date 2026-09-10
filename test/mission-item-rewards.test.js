import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraftState,
  createRewardsModal,
  formatRewardItemsForModal,
  MB_INPUT_AP,
  MB_INPUT_DISTRIBUTION,
  MB_INPUT_ITEM,
  MB_INPUT_QTY,
  MB_INPUT_REP,
  MB_INPUT_SP,
  missionBuilderInteractionHandler,
  parseDistributionMode,
  parseRewardItems,
} from "../interactions/missionBuilderSession.js";
import {
  createMission,
  deliverMissionRewards,
  joinMission,
  startMission,
} from "../utils/missionStore.js";
import {
  createCompletionConfirmationEmbed,
  createMissionCardEmbed,
  createRewardReportEmbed,
} from "../utils/missionComponents.js";
import { setDB } from "../utils/db.js";
import { registerInteractionHandlers } from "../interactions/index.js";

registerInteractionHandlers();

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
              if (k === "_id" && String(doc._id) === String(v)) continue;
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

test("1. parseDistributionMode correctly identifies all vs random", () => {
  assert.equal(parseDistributionMode("каждому"), "all");
  assert.equal(parseDistributionMode("всем"), "all");
  assert.equal(parseDistributionMode("all"), "all");
  assert.equal(parseDistributionMode(""), "all");
  assert.equal(parseDistributionMode(null), "all");

  assert.equal(parseDistributionMode("рандом"), "random");
  assert.equal(parseDistributionMode("рандомно"), "random");
  assert.equal(parseDistributionMode("случайно"), "random");
  assert.equal(parseDistributionMode("случайному"), "random");
  assert.equal(parseDistributionMode("random"), "random");
});

test("2. parseRewardItems parses multiple items, quantities, and distribution tags", () => {
  const input = `
    Малое зелье исцеления x2
    Свиток молнии (рандомно)
    Редкий клинок x1 [random]
    Золотые монеты 50 шт
    Зелье маны (3 шт) (каждому)
  `;

  const items = parseRewardItems(input, "all");
  assert.equal(items.length, 5);

  assert.deepEqual(items[0], {
    item_id: "Малое зелье исцеления",
    item_name: "Малое зелье исцеления",
    quantity: 2,
    distribution: "all",
  });

  assert.deepEqual(items[1], {
    item_id: "Свиток молнии",
    item_name: "Свиток молнии",
    quantity: 1,
    distribution: "random",
  });

  assert.deepEqual(items[2], {
    item_id: "Редкий клинок",
    item_name: "Редкий клинок",
    quantity: 1,
    distribution: "random",
  });

  assert.deepEqual(items[3], {
    item_id: "Золотые монеты",
    item_name: "Золотые монеты",
    quantity: 50,
    distribution: "all",
  });

  assert.deepEqual(items[4], {
    item_id: "Зелье маны",
    item_name: "Зелье маны",
    quantity: 3,
    distribution: "all",
  });
});

test("3. parseRewardItems supports global random distribution default", () => {
  const input = "Сундук сокровищ\nКлюч от врат x2";
  const items = parseRewardItems(input, "random");

  assert.equal(items.length, 2);
  assert.equal(items[0].distribution, "random");
  assert.equal(items[1].distribution, "random");
  assert.equal(items[1].quantity, 2);
});

test("4. formatRewardItemsForModal round-trips correctly", () => {
  const original = [
    { item_name: "Зелье здоровья", quantity: 3, distribution: "all" },
    { item_name: "Магический свиток", quantity: 1, distribution: "random" },
  ];

  const formatted = formatRewardItemsForModal(original);
  assert.ok(formatted.includes("Зелье здоровья x3"));
  assert.ok(formatted.includes("Магический свиток (рандомно)"));

  const reparsed = parseRewardItems(formatted, "all");
  assert.equal(reparsed.length, 2);
  assert.equal(reparsed[0].item_name, "Зелье здоровья");
  assert.equal(reparsed[0].quantity, 3);
  assert.equal(reparsed[0].distribution, "all");
  assert.equal(reparsed[1].item_name, "Магический свиток");
  assert.equal(reparsed[1].quantity, 1);
  assert.equal(reparsed[1].distribution, "random");
});

test("5. createDraftState and createRewardsModal maintain items and distribution", () => {
  const state = createDraftState({
    reward: {
      ap: 50,
      items: [
        { item_name: "Зелье", quantity: 2, distribution: "all" },
        { item_name: "Топор", quantity: 1, distribution: "random" },
      ],
      item_distribution: "all",
    },
  });

  assert.equal(state.reward.items.length, 2);
  assert.equal(state.reward.item_name, "Зелье");
  assert.equal(state.reward.item_qty, 2);

  const modal = createRewardsModal(state, "msg_test");
  assert.equal(modal.data.title, "Награды за миссию");
  assert.equal(modal.components.length, 5); // 5 rows maximum for Discord
});

test("6. handleModal parses multiple items and distribution, maintaining legacy backward compat", async () => {
  const db = createMockDatabase();
  setDB(db);
  const session = {
    message_id: "msg_session_test",
    owner_id: "gm_user_1",
    state: createDraftState(),
  };
  await db.collection("interaction_sessions").insertOne(session);

  let updatedPayload = null;
  const mockInteraction = {
    user: { id: "gm_user_1" },
    fields: {
      getTextInputValue(fieldId) {
        if (fieldId === MB_INPUT_AP) return "100";
        if (fieldId === MB_INPUT_SP) return "50";
        if (fieldId === MB_INPUT_REP) return "15";
        if (fieldId === MB_INPUT_ITEM) return "Большое зелье x2\nЛегендарный лук x1 (рандомно)";
        if (fieldId === MB_INPUT_DISTRIBUTION) return "каждому";
        return "";
      },
    },
    update: async (payload) => {
      updatedPayload = payload;
    },
  };

  await missionBuilderInteractionHandler.handleModal({
    interaction: mockInteraction,
    session,
    action: "rewards",
  });

  const updatedSession = await db.collection("interaction_sessions").findOne({ message_id: "msg_session_test" });
  assert.ok(updatedSession);
  assert.equal(updatedSession.state.reward.ap, 100);
  assert.equal(updatedSession.state.reward.items.length, 2);
  assert.equal(updatedSession.state.reward.items[0].item_name, "Большое зелье");
  assert.equal(updatedSession.state.reward.items[0].quantity, 2);
  assert.equal(updatedSession.state.reward.items[0].distribution, "all");
  assert.equal(updatedSession.state.reward.items[1].item_name, "Легендарный лук");
  assert.equal(updatedSession.state.reward.items[1].distribution, "random");

  // Check backward compatibility fields
  assert.equal(updatedSession.state.reward.item_name, "Большое зелье");
  assert.equal(updatedSession.state.reward.item_qty, 2);

  // Check embed preview includes both items and random tag
  const description = updatedPayload.embeds[0].data.description;
  assert.ok(description.includes("Большое зелье"));
  assert.ok(description.includes("Легендарный лук"));
  assert.ok(description.includes("случайному"));
});

test("7. deliverMissionRewards correctly distributes 'all' to everyone and 'random' to one winner", async () => {
  const db = createMockDatabase();
  setDB(db);

  const p1 = "p_item_1";
  const p2 = "p_item_2";
  const p3 = "p_item_3";

  db._store.players.push(
    { id: p1, character_name: "Персонаж 1", ap: 10 },
    { id: p2, character_name: "Персонаж 2", ap: 10 },
    { id: p3, character_name: "Персонаж 3", ap: 10 }
  );

  const mission = await createMission({
    guildId: "guild_1",
    channelId: "chan_1",
    title: "Охота на дракона",
    reward: {
      ap: 20,
      items: [
        { item_name: "Зелье защиты", quantity: 2, distribution: "all" },
        { item_name: "Чешуя дракона", quantity: 1, distribution: "random" },
      ],
    },
    createdBy: { user_id: "gm_1", username: "GameMaster" },
    db,
  });

  await joinMission({ publicId: mission.public_id, playerId: p1, userId: "u1", characterName: "Персонаж 1", db });
  await joinMission({ publicId: mission.public_id, playerId: p2, userId: "u2", characterName: "Персонаж 2", db });
  await joinMission({ publicId: mission.public_id, playerId: p3, userId: "u3", characterName: "Персонаж 3", db });

  await startMission({ publicId: mission.public_id, actorId: "gm_1", actorUsername: "GameMaster", db });

  // Deliver rewards
  const result = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GameMaster",
    db,
  });

  assert.equal(result.success, true);
  assert.equal(result.allDelivered, true);
  assert.equal(result.mission.status, "completed");

  // Check inventory for 'all' item: all 3 players should have Зелье защиты x2
  const invP1Potion = db._store.inventory.find((i) => i.player_id === p1 && i.item_name === "Зелье защиты");
  const invP2Potion = db._store.inventory.find((i) => i.player_id === p2 && i.item_name === "Зелье защиты");
  const invP3Potion = db._store.inventory.find((i) => i.player_id === p3 && i.item_name === "Зелье защиты");

  assert.ok(invP1Potion && invP1Potion.qty === 2, "P1 got potion");
  assert.ok(invP2Potion && invP2Potion.qty === 2, "P2 got potion");
  assert.ok(invP3Potion && invP3Potion.qty === 2, "P3 got potion");

  // Check inventory for 'random' item: exactly ONE player should have Чешуя дракона
  const dragonScaleHolders = db._store.inventory.filter((i) => i.item_name === "Чешуя дракона");
  assert.equal(dragonScaleHolders.length, 1, "Exactly one winner for random item");
  assert.equal(dragonScaleHolders[0].qty, 1);

  const winnerPlayerId = dragonScaleHolders[0].player_id;
  assert.ok([p1, p2, p3].includes(winnerPlayerId));

  // Check embed display includes winner
  const cardEmbed = createMissionCardEmbed(result.mission);
  const completionField = cardEmbed.data.fields.find((f) => f.name.includes("Завершение"));
  assert.ok(completionField);
  assert.ok(completionField.value.includes("Чешуя дракона"));
  assert.ok(completionField.value.includes("достался"));

  // Check idempotent second execution
  const result2 = await deliverMissionRewards({
    publicId: mission.public_id,
    actorId: "gm_1",
    actorUsername: "GameMaster",
    db,
  });

  assert.equal(result2.success, true);
  assert.equal(result2.alreadyCompleted, true);

  // Verify inventory hasn't changed
  const allScaleHoldersAfter = db._store.inventory.filter((i) => i.item_name === "Чешуя дракона");
  assert.equal(allScaleHoldersAfter.length, 1, "Still exactly one dragon scale item in database");
  assert.equal(allScaleHoldersAfter[0].player_id, winnerPlayerId, "Winner preserved");
});
