import assert from "node:assert/strict";
import test from "node:test";
import { data as addApData } from "../commands/add-ap.js";
import { data as addSpData } from "../commands/add-sp.js";

async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch {
    return null;
  }
}

test("add-ap slash command schema contains optional multiplier choice", () => {
  const json = addApData.toJSON();
  const multiplierOption = json.options.find((opt) => opt.name === "multiplier");

  assert.ok(multiplierOption, "add-ap must have multiplier option");
  assert.equal(multiplierOption.required, false, "multiplier option must be optional");
  assert.equal(multiplierOption.type, 3, "multiplier option must be STRING type");
  
  const choices = multiplierOption.choices.map((c) => ({ name: c.name, value: c.value }));
  assert.deepEqual(choices, [
    { name: "С множителем", value: "yes" },
    { name: "Без множителя", value: "no" },
  ]);
});

test("add-sp slash command schema contains optional multiplier choice", () => {
  const json = addSpData.toJSON();
  const multiplierOption = json.options.find((opt) => opt.name === "multiplier");

  assert.ok(multiplierOption, "add-sp must have multiplier option");
  assert.equal(multiplierOption.required, false, "multiplier option must be optional");
  assert.equal(multiplierOption.type, 3, "multiplier option must be STRING type");

  const choices = multiplierOption.choices.map((c) => ({ name: c.name, value: c.value }));
  assert.deepEqual(choices, [
    { name: "С множителем", value: "yes" },
    { name: "Без множителя", value: "no" },
  ]);
});

test("multiplier option default behavior resolves correctly", () => {
  const resolveMultiplier = (choice) => choice !== "no";

  assert.equal(resolveMultiplier("yes"), true, "yes should apply multiplier");
  assert.equal(resolveMultiplier("no"), false, "no should NOT apply multiplier");
  assert.equal(resolveMultiplier(null), true, "omitted option should default to applying multiplier");
  assert.equal(resolveMultiplier(undefined), true, "undefined option should default to applying multiplier");
});

test("addAP respects applyMultiplier parameter", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("MongoMemoryServer unavailable");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase, getDB } = await import("../utils/db.js");
  const { createPlayer, addAP, getPlayer } = await import("../utils/dataManager.js");

  try {
    await connectDatabase();
    const playerId = "test_ap_player";
    await createPlayer(playerId, playerId, "Hero", null, 1, null);

    // Set player's ap_multiplier to 150%
    const db = getDB();
    await db.collection("players").updateOne(
      { id: playerId },
      { $set: { ap_multiplier: 150, ap: 0, rank: "E", messages_day: 0 } },
    );

    // Default / true: applies multiplier (100 * 1.5 = 150)
    const resultWithMultiplier = await addAP(playerId, 100, "admin", true);
    assert.equal(resultWithMultiplier, 150);

    // False: does NOT apply multiplier (exact amount: 150 + 100 = 250)
    const resultWithoutMultiplier = await addAP(playerId, 100, "admin", false);
    assert.equal(resultWithoutMultiplier, 250);

    // Default omitted: should apply multiplier (250 + 150 = 400)
    const resultDefault = await addAP(playerId, 100, "admin");
    assert.equal(resultDefault, 400);
  } finally {
    await closeDatabase();
    await server.stop();
  }
});

test("addSP respects applyMultiplier parameter", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("MongoMemoryServer unavailable");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase, getDB } = await import("../utils/db.js");
  const { createPlayer, addSP, addStyle, getSP } = await import("../utils/dataManager.js");

  try {
    await connectDatabase();
    const playerId = "test_sp_player";
    await createPlayer(playerId, playerId, "StyleMaster", null, 1, null);
    const style = await addStyle("Karate", "admin");

    const db = getDB();
    await db.collection("players").updateOne(
      { id: playerId },
      { $set: { sp_multiplier: 200, rank: "E", messages_day: 0 } },
    );

    // With multiplier: 100 * 2.0 = 200
    const spWithMultiplier = await addSP(playerId, style.id, 100, null, "add-sp", true);
    assert.equal(spWithMultiplier, 200);

    // Without multiplier: exact 100 added -> 200 + 100 = 300
    const spWithoutMultiplier = await addSP(playerId, style.id, 100, null, "add-sp", false);
    assert.equal(spWithoutMultiplier, 300);

    // Default omitted: should apply multiplier (300 + 200 = 500)
    const spDefault = await addSP(playerId, style.id, 100, null, "add-sp");
    assert.equal(spDefault, 500);
  } finally {
    await closeDatabase();
    await server.stop();
  }
});
