import assert from "node:assert/strict";
import test from "node:test";
import { cardFontReady } from "../scripts/ensure-card-font.mjs";
import { renderPhysicalCard, renderProfileCard, __testables } from "../utils/profileCard.js";
import { createProfileV2Components } from "../utils/profileComponents.js";

const { T, formatNumber, compact, wrap, PHYSICAL_ROWS } = __testables;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const PLAYER = {
  characterName: "Аяко Мидзуки-Волкова",
  avatarUrl: null,
  fallbackAvatarUrl: null,
  attributeName: "Тень Пепла",
  styles: [
    { name: "Муай Тай", sp: 1200 },
    { name: "Айкидо", sp: 480 },
    { name: "Бокс", sp: 90 },
  ],
  ap: 12480,
  totalSP: 1770,
  apMultiplier: 150,
  spMultiplier: 100,
  salaryMultiplier: 120,
  krw: 17500000,
  yen: 940000,
  reputation: 1500,
  reputationTier: "Городской",
  orgName: "TENRYU",
  orgRank: "A",
  playerId: "123456789",
  slot: 1,
};

test("числа на карточке форматируются по-русски и не переносятся", () => {
  // Разряды разделяются неразрывным пробелом, иначе число рвётся по строкам.
  const nbsp = String.fromCharCode(160);
  assert.equal(formatNumber(12480), `12${nbsp}480`);
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(Number.NaN), "—");

  // Компактная запись включается только на больших величинах.
  assert.equal(compact(9100), `9${nbsp}100`);
  assert.match(compact(17500000), /млн$/);
  assert.match(compact(1500000000), /млрд$/);
});

test("длинное имя переносится, а не обрезается в одну строку", () => {
  const ctx = {
    save() {}, restore() {},
    measureText(value) { return { width: value.length * 10 }; },
    set font(_value) {}, get font() { return ""; },
  };
  const lines = wrap(ctx, "Александра Волкова Мидзуки", 150, "17px X");
  assert.ok(lines.length >= 2, "ожидался перенос");
  assert.equal(lines.join(" "), "Александра Волкова Мидзуки");

  // Одно слово длиннее строки не должно уходить в бесконечный цикл.
  assert.deepEqual(wrap(ctx, "Тенрюканагава", 20, "17px X"), ["Тенрюканагава"]);
});

test("у физических показателей нет выдуманной шкалы", () => {
  // Полосы прогресса убраны сознательно: максимума в игре не существует.
  for (const row of PHYSICAL_ROWS) {
    assert.equal(row.max, undefined, `${row.key}: не должно быть максимума`);
    assert.ok(row.unit, `${row.key}: нужна единица измерения`);
  }
  assert.deepEqual(
    PHYSICAL_ROWS.map((row) => row.key),
    ["punch_strength_kg", "lifting_strength_kg", "speed_kmh", "stamina_percent", "reaction_ms"],
  );
});

test("палитра карточки не содержит литералов вне токенов", () => {
  // Единственный акцент совпадает с цветом embed-ов — раньше канвас и embed-ы
  // расходились (#8b5cf6 против #b209d4).
  assert.equal(T.accent, "#b209d4");
  assert.equal(T.space(4), 16, "шаг сетки 4px");
});

test("карточки рисуются в PNG с кириллицей", async (t) => {
  if (!cardFontReady()) {
    t.skip("шрифт не подготовлен: запустите npm run font");
    return;
  }

  const main = await renderProfileCard(PLAYER);
  assert.ok(main.length > 10_000, "основная карточка подозрительно мала");
  assert.ok(main.subarray(0, 4).equals(PNG_MAGIC), "это не PNG");

  const physical = await renderPhysicalCard({
    characterName: PLAYER.characterName,
    stats: {
      punch_strength_kg: 180,
      lifting_strength_kg: 240,
      speed_kmh: 38,
      stamina_percent: 82,
      reaction_ms: 120,
    },
    playerId: PLAYER.playerId,
    slot: 1,
  });
  assert.ok(physical.subarray(0, 4).equals(PNG_MAGIC));

  // Пустой персонаж не должен ронять рендер.
  const empty = await renderProfileCard({
    characterName: "",
    styles: [],
    ap: 0,
    totalSP: 0,
    krw: 0,
    yen: 0,
    reputation: 0,
  });
  assert.ok(empty.subarray(0, 4).equals(PNG_MAGIC));

  const noStats = await renderPhysicalCard({ characterName: "Ли", stats: {} });
  assert.ok(noStats.subarray(0, 4).equals(PNG_MAGIC));
});

test("текстовый вид профиля читается законченным без картинки", () => {
  const player = {
    id: "1",
    character_name: "Аяко",
    organization: "TENRYU",
    rank: "A",
    attribute_name: "Тень Пепла",
    ap: 12480,
    krw: 17500000,
    yen: 940000,
    reputation: 1500,
  };

  const json = createProfileV2Components({
    page: "main",
    player,
    user: { displayAvatarURL: () => "https://example.test/a.png" },
    slot: 1,
    totalSP: 1770,
    history: [],
    imageName: null,
  })[0].toJSON();

  const text = JSON.stringify(json);
  for (const fragment of ["Аяко", "TENRYU", "Тень Пепла", "AP", "SP", "репутация"]) {
    assert.ok(text.includes(fragment), `в текстовом виде нет «${fragment}»`);
  }
});
