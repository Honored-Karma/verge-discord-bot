import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRankRequirement,
  isRankSufficient,
  isValidRankForOrganization,
  normalizeOrganization,
  normalizeRank,
  ORGANIZATIONS,
  RANK_METADATA,
  RANK_REQUIREMENT_OPTIONS,
  RANK_SETS,
  RANK_TIERS,
} from "../utils/rankSystem.js";

test("normalizeRank cleans prefixes, unicode numerals and whitespace", () => {
  assert.equal(normalizeRank("IV"), "IV");
  assert.equal(normalizeRank("  iv  "), "IV");
  assert.equal(normalizeRank("Ранг IV"), "IV");
  assert.equal(normalizeRank("ранг: B"), "B");
  assert.equal(normalizeRank("Rank-S"), "S");
  assert.equal(normalizeRank("Ⅰ"), "I");
  assert.equal(normalizeRank("Ⅱ"), "II");
  assert.equal(normalizeRank("Ⅲ"), "III");
  assert.equal(normalizeRank("Ⅳ"), "IV");
  assert.equal(normalizeRank("Ⅴ"), "V");
  assert.equal(normalizeRank("Ⅵ"), "VI");
  assert.equal(normalizeRank(""), "");
  assert.equal(normalizeRank(null), "");
});

test("RANK_REQUIREMENT_OPTIONS lists Korean ranks first, then Japanese ranks", () => {
  assert.equal(RANK_REQUIREMENT_OPTIONS[0].value, "none");

  // Корейские ранги от VI до I
  assert.equal(RANK_REQUIREMENT_OPTIONS[1].value, "VI");
  assert.equal(RANK_REQUIREMENT_OPTIONS[2].value, "V");
  assert.equal(RANK_REQUIREMENT_OPTIONS[3].value, "IV");
  assert.equal(RANK_REQUIREMENT_OPTIONS[4].value, "III");
  assert.equal(RANK_REQUIREMENT_OPTIONS[5].value, "II");
  assert.equal(RANK_REQUIREMENT_OPTIONS[6].value, "I");
  assert.ok(RANK_REQUIREMENT_OPTIONS[1].label.includes("Корея"));

  // Японские ранги от F до S
  assert.equal(RANK_REQUIREMENT_OPTIONS[7].value, "F");
  assert.equal(RANK_REQUIREMENT_OPTIONS[8].value, "E");
  assert.equal(RANK_REQUIREMENT_OPTIONS[9].value, "D");
  assert.equal(RANK_REQUIREMENT_OPTIONS[10].value, "C");
  assert.equal(RANK_REQUIREMENT_OPTIONS[11].value, "B");
  assert.equal(RANK_REQUIREMENT_OPTIONS[12].value, "A");
  assert.equal(RANK_REQUIREMENT_OPTIONS[13].value, "S");
  assert.ok(RANK_REQUIREMENT_OPTIONS[7].label.includes("Япония"));
});

test("isRankSufficient correctly evaluates Korean ranks hierarchy (VI lowest -> I highest)", () => {
  // Порог IV
  assert.equal(isRankSufficient("VI", "IV"), false);
  assert.equal(isRankSufficient("V", "IV"), false);
  assert.equal(isRankSufficient("IV", "IV"), true);
  assert.equal(isRankSufficient("III", "IV"), true);
  assert.equal(isRankSufficient("II", "IV"), true);
  assert.equal(isRankSufficient("I", "IV"), true);

  // Порог I
  assert.equal(isRankSufficient("II", "I"), false);
  assert.equal(isRankSufficient("I", "I"), true);
});

test("isRankSufficient correctly evaluates Japanese ranks hierarchy (F lowest -> S highest)", () => {
  // Порог C
  assert.equal(isRankSufficient("F", "C"), false);
  assert.equal(isRankSufficient("E", "C"), false);
  assert.equal(isRankSufficient("D", "C"), false);
  assert.equal(isRankSufficient("C", "C"), true);
  assert.equal(isRankSufficient("B", "C"), true);
  assert.equal(isRankSufficient("A", "C"), true);
  assert.equal(isRankSufficient("S", "C"), true);

  // Порог S
  assert.equal(isRankSufficient("A", "S"), false);
  assert.equal(isRankSufficient("S", "S"), true);
});

test("isRankSufficient handles cross-system comparison by canonical tier levels", () => {
  // Корейский ранг I (высший тир 7) удовлетворяет японскому рангу S (тир 7)
  assert.equal(isRankSufficient("I", "S"), true);
  assert.equal(isRankSufficient("S", "I"), true);

  // Корейский ранг II (тир 5) удовлетворяет японскому рангу C (тир 4), но не B (тир 5) или A (тир 6)
  assert.equal(isRankSufficient("II", "C"), true);
  assert.equal(isRankSufficient("II", "B"), true);
  assert.equal(isRankSufficient("II", "A"), false);

  // Персонаж без ранга не проходит
  assert.equal(isRankSufficient(null, "IV"), false);
  assert.equal(isRankSufficient("", "B"), false);

  // Если порог не задан (none / null) — проходит любой
  assert.equal(isRankSufficient(null, null), true);
  assert.equal(isRankSufficient(null, "none"), true);
  assert.equal(isRankSufficient("F", null), true);
});

test("formatRankRequirement returns proper display strings with flags", () => {
  assert.equal(formatRankRequirement(null), "🌐 Любой ранг");
  assert.equal(formatRankRequirement("none"), "🌐 Любой ранг");
  assert.ok(formatRankRequirement("IV").includes("🇰🇷"));
  assert.ok(formatRankRequirement("IV").includes("Ранг IV"));
  assert.ok(formatRankRequirement("B").includes("🇯🇵"));
  assert.ok(formatRankRequirement("B").includes("Ранг B"));
});
