import assert from "node:assert/strict";
import test from "node:test";

/**
 * Интеграционный тест на настоящем mongod: агрегация рейтинга падала на
 * Location5371602 ("$documentNumber must be specified with a top level sortBy
 * expression with exactly one element"), и поймать это моками невозможно —
 * поэтому здесь поднимается реальный сервер.
 *
 * Если бинарник mongod недоступен (нет сети в CI), тест не падает, а
 * пропускается: он не должен блокировать пайплайн из-за инфраструктуры.
 */
async function startMongo() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return await MongoMemoryServer.create();
  } catch (error) {
    return null;
  }
}

const SEED = [
  { id: "p1", username: "u1", character_name: "Аяко", ap: 500, krw: 10, yen: 0 },
  { id: "p2", username: "u2", character_name: "Борис", ap: 300, krw: 0, yen: 0 },
  { id: "p3", username: "u3", character_name: "Виктор", ap: 300, krw: 0, yen: 0 },
  { id: "p4", username: "u4", character_name: "Гэн", ap: 300, krw: 0, yen: 0 },
  { id: "p5", username: "u5", character_name: "Дайки", ap: 100, krw: 0, yen: 0 },
  { id: "p6", username: "u6", character_name: "Ёсида", ap: 0, krw: 0, yen: 0 },
  { id: "p7", username: "u7", character_name: "Жанна", ap: 0, krw: 0, yen: 0 },
];

test("рейтинг считается на живой базе и делит одинаковые места", async (t) => {
  const server = await startMongo();
  if (!server) {
    t.skip("mongod недоступен в этой среде");
    return;
  }

  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, getDB, closeDatabase } = await import("../utils/db.js");
  const { getLeaderboardPage } = await import("../utils/dataManager.js");
  const { createLeaderboardComponents } = await import("../utils/leaderboardComponents.js");

  try {
    await connectDatabase();
    await getDB().collection("players").insertMany(SEED);

    const snapshot = await getLeaderboardPage("ap", "p4", 0, 10);

    // Главное: агрегация вообще выполняется.
    assert.equal(snapshot.error, undefined);
    assert.equal(snapshot.total, 7);
    assert.equal(snapshot.totalPages, 1);

    // Спортивное ранжирование: 500 → 1; три по 300 → 2; 100 → 5; два нуля → 6.
    assert.deepEqual(
      snapshot.rows.map((row) => [row.character_name, row.leaderboard_position]),
      [
        ["Аяко", 1],
        ["Борис", 2],
        ["Виктор", 2],
        ["Гэн", 2],
        ["Дайки", 5],
        ["Ёсида", 6],
        ["Жанна", 6],
      ],
    );

    // Номер строки монотонный и отличается от места — по нему режутся страницы.
    assert.deepEqual(snapshot.rows.map((row) => row.leaderboard_row), [1, 2, 3, 4, 5, 6, 7]);

    // Позиция текущего персонажа берётся из того же ранжирования.
    assert.equal(snapshot.currentPlayer.character_name, "Гэн");
    assert.equal(snapshot.currentPlayer.leaderboard_position, 2);

    // Персонаж, делящий место с пьедесталом, не исчезает: он вне первых трёх
    // строк, значит попадает в общий список.
    assert.equal(snapshot.podium.length, 3);
    const visible = createLeaderboardComponents({ snapshot, playerId: "p4" })
      .map((container) => JSON.stringify(container.toJSON()))
      .join(" ");
    assert.ok(visible.includes("Гэн"), "Гэн должен быть виден в рейтинге");
    assert.ok(visible.includes("делит место"), "делённое место должно быть помечено");

    // Когда у всех метрика нулевая, все делят первое место, а не выстраиваются
    // в произвольном порядке.
    const krw = await getLeaderboardPage("yen", "p4", 0, 10);
    assert.deepEqual(new Set(krw.rows.map((row) => row.leaderboard_position)), new Set([1]));

    // Пагинация: вторая страница продолжает нумерацию, а не начинает заново.
    const firstPage = await getLeaderboardPage("ap", "p4", 0, 5);
    const secondPage = await getLeaderboardPage("ap", "p4", 1, 5);
    assert.equal(firstPage.totalPages, 2);
    assert.deepEqual(firstPage.rows.map((row) => row.leaderboard_row), [1, 2, 3, 4, 5]);
    assert.deepEqual(secondPage.rows.map((row) => row.leaderboard_row), [6, 7]);

    // Запрос за пределами диапазона не ломается.
    const beyond = await getLeaderboardPage("ap", "p4", 99, 5);
    assert.equal(beyond.error, undefined);
    assert.equal(beyond.rows.length, 0);

    // SP считается через player_sp, а не по полю персонажа.
    await getDB().collection("player_sp").insertMany([
      { player_id: "p5", style_id: 1, sp: 900 },
      { player_id: "p5", style_id: 2, sp: 100 },
      { player_id: "p2", style_id: 1, sp: 400 },
    ]);
    const sp = await getLeaderboardPage("sp", "p5", 0, 10);
    assert.equal(sp.rows[0].character_name, "Дайки");
    assert.equal(sp.rows[0].leaderboard_value, 1000);
    assert.equal(sp.rows[1].character_name, "Борис");
    assert.equal(sp.rows[1].leaderboard_value, 400);

    // getPlayerLeaderboardRank возвращает точную позицию персонажа
    const { getPlayerLeaderboardRank } = await import("../utils/dataManager.js");
    const p4Rank = await getPlayerLeaderboardRank("p4", "ap");
    assert.deepEqual(p4Rank, {
      position: 2,
      row: 4,
      total: 7,
      value: 300,
    });

    const missingRank = await getPlayerLeaderboardRank("unknown_id", "ap");
    assert.equal(missingRank, null);
  } finally {
    await closeDatabase().catch(() => {});
    await server.stop().catch(() => {});
  }
});
