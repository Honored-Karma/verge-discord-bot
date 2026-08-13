import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeaderboardComponents,
  createLeaderboardCooldownComponents,
  createLeaderboardEmptyComponents,
  createLeaderboardErrorComponents,
  LEADERBOARD_METRICS,
} from "../utils/leaderboardComponents.js";

function snapshot(metric = "ap") {
  const players = Array.from({ length: 10 }, (_, index) => ({
    id: index === 4 ? "current_2" : `player_${index}`,
    character_name: `Character ${index + 1}`,
    leaderboard_value: 10_000 - index * 250,
    leaderboard_position: index + 1,
  }));
  return {
    metric,
    page: 0,
    pageSize: 10,
    total: 24,
    totalPages: 3,
    podium: players.slice(0, 3),
    rows: players,
    currentPlayer: players[4],
  };
}

test("builds valid leaderboard states for every metric", () => {
  for (const metric of Object.keys(LEADERBOARD_METRICS)) {
    const components = createLeaderboardComponents({
      snapshot: snapshot(metric),
      playerId: "current_2",
    });
    assert.doesNotThrow(() => components[0].toJSON());
  }
});

test("builds disabled, empty and error leaderboard states", () => {
  const states = [
    ...createLeaderboardComponents({
      snapshot: snapshot("sp"),
      playerId: "current_2",
      disabled: true,
    }),
    ...createLeaderboardEmptyComponents(),
    ...createLeaderboardErrorComponents(),
    ...createLeaderboardCooldownComponents(1_900_000_000),
  ];
  for (const state of states) assert.doesNotThrow(() => state.toJSON());
});
