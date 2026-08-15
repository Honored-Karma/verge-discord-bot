import assert from "node:assert/strict";
import test from "node:test";
import { getSPMastery, didMasteryRankChange } from "../utils/spMastery.js";
import {
  checkGlobalCooldown,
  globalCooldownSize,
  sweepGlobalCooldowns,
} from "../utils/cooldowns.js";

test("SP mastery thresholds have a single source of truth", () => {
  // Пороги раньше были продублированы в четырёх местах. Тест фиксирует их,
  // чтобы расхождение сразу падало.
  const cases = [
    [0, "Новичок"],
    [349, "Новичок"],
    [350, "Владелец"],
    [999, "Владелец"],
    [1000, "Эксперт"],
    [2499, "Эксперт"],
    [2500, "Мастер"],
    [999_999, "Мастер"],
  ];

  for (const [sp, rank] of cases) {
    assert.equal(getSPMastery(sp).rank, rank, `SP ${sp}`);
  }

  assert.equal(getSPMastery(-50).sp, 0);
  assert.equal(getSPMastery(2500).isMax, true);
  assert.equal(getSPMastery(2500).nextThreshold, 2500);
  assert.equal(getSPMastery(0).nextThreshold, 350);
  assert.equal(didMasteryRankChange(349, 350).after.rank, "Владелец");
  assert.equal(didMasteryRankChange(350, 400), null);
});

test("global cooldown sweeps its own map instead of growing forever", () => {
  sweepGlobalCooldowns(Date.now() + 60_000);
  assert.equal(globalCooldownSize(), 0);

  for (let i = 0; i < 600; i += 1) {
    assert.equal(checkGlobalCooldown(`user-${i}`).onCooldown, false);
  }
  assert.equal(checkGlobalCooldown("user-1").onCooldown, true);

  // Записи живут три секунды, поэтому подметание по времени очищает всё.
  sweepGlobalCooldowns(Date.now() + 60_000);
  assert.equal(globalCooldownSize(), 0);
  assert.equal(checkGlobalCooldown("user-1").onCooldown, false);

  sweepGlobalCooldowns(Date.now() + 60_000);
});
