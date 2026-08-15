import assert from "node:assert/strict";
import test from "node:test";
import {
  createLeaderboardComponents,
  __testables,
} from "../utils/leaderboardComponents.js";

const { createTable, TABLE_WIDTH } = __testables;

// ANSI-коды невидимы в Discord, поэтому при подсчёте ширины их надо убрать.
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const visibleLines = (table) => table
  .split("\n")
  .slice(1, -1)
  .map((line) => line.replace(ANSI_PATTERN, ""));

test("таблица рейтинга выровнена при любом порядке величин", () => {
  const build = (values) => values.map((value, index) => ({
    id: `p${index}`,
    character_name: index === 1 ? "Александра Волкова-Мидзуки" : `Игрок ${index}`,
    leaderboard_value: value,
    leaderboard_position: index + 4,
    leaderboard_row: index + 4,
  }));

  const cases = [
    ["ap", [10, 250, 9100]],
    ["krw", [0, 17500000, 123456789]],
    ["yen", [1, 1000000000000]],
    ["sp", [2500, 350]],
  ];

  for (const [metric, values] of cases) {
    const lines = visibleLines(createTable(build(values), metric, "p0"));

    const widths = new Set(lines.map((line) => line.length));
    assert.equal(widths.size, 1, `${metric}: строки разной ширины ${[...widths]}`);

    const width = [...widths][0];
    assert.ok(width <= TABLE_WIDTH + 2, `${metric}: ширина ${width} слишком велика`);

    // Между именем и числом всегда есть отбивка: обрезанное имя не должно
    // упираться в значение. Разряды и компактная запись используют неразрывный
    // пробел, поэтому значение — это последний токен без обычных пробелов.
    for (const line of lines.slice(1)) {
      assert.match(
        line,
        /(?: |…)[^ ]+$/,
        `${metric}: нет отбивки перед значением: "${line}"`,
      );
    }
  }
});

test("маркер текущего игрока стоит только у его строки", () => {
  const rows = [4, 5, 6].map((position) => ({
    id: `p${position}`,
    character_name: `Игрок ${position}`,
    leaderboard_value: 100 * position,
    leaderboard_position: position,
    leaderboard_row: position,
  }));

  const lines = visibleLines(createTable(rows, "ap", "p5"));
  const marked = lines.filter((line) => line.startsWith("›"));
  assert.equal(marked.length, 1);
  assert.ok(marked[0].includes("Игрок 5"));
});

test("пустая страница не рисует блок таблицы", () => {
  assert.equal(createTable([], "ap", "p0"), "");
});

test("делённое место помечается один раз, а не из-за пересечения с пьедесталом", () => {
  const rows = [
    { id: "a", character_name: "Аяко", leaderboard_value: 500, leaderboard_position: 1, leaderboard_row: 1 },
    { id: "b", character_name: "Борис", leaderboard_value: 300, leaderboard_position: 2, leaderboard_row: 2 },
    { id: "c", character_name: "Виктор", leaderboard_value: 300, leaderboard_position: 2, leaderboard_row: 3 },
    { id: "d", character_name: "Дайки", leaderboard_value: 100, leaderboard_position: 4, leaderboard_row: 4 },
  ];

  // Пьедестал и строки первой страницы содержат одних и тех же персонажей —
  // именно это раньше давало ложную пометку на всём топ-3.
  const snapshot = {
    metric: "ap",
    page: 0,
    pageSize: 10,
    total: 4,
    totalPages: 1,
    podium: rows.slice(0, 3),
    rows,
    currentPlayer: rows[3],
  };

  const text = createLeaderboardComponents({ snapshot, playerId: "d" })
    .map((container) => JSON.stringify(container.toJSON()))
    .join(" ");

  assert.ok(!/Аяко[^]*?500 AP · делит/.test(text), "одиночное место не помечается");
  assert.ok(text.includes("Борис"), "участник делённого места виден");
  assert.equal((text.match(/делит место/g) || []).length, 2, "помечены оба делящих место");
  assert.ok(!text.includes("делите место"), "текущий игрок один на своём месте");
});

test("кнопка «Ко мне» выключена, когда игрок уже на своей странице", () => {
  const make = (row, page) => ({
    metric: "ap",
    page,
    pageSize: 5,
    total: 20,
    totalPages: 4,
    podium: [],
    rows: [],
    currentPlayer: {
      id: "me",
      character_name: "Я",
      leaderboard_value: 10,
      leaderboard_position: row,
      leaderboard_row: row,
    },
  });

  const jumpButton = (snapshot) => {
    const json = createLeaderboardComponents({ snapshot, playerId: "me" })[0].toJSON();
    const section = json.components.find((component) => component.type === 9);
    return section.accessory;
  };

  // Строка 7 при странице по 5 — это вторая страница (индекс 1).
  assert.equal(jumpButton(make(7, 1)).disabled, true, "уже на своей странице");
  assert.equal(jumpButton(make(7, 0)).disabled, false, "на чужой странице кнопка активна");

  // Персонажа нет в рейтинге — прыгать некуда.
  const absent = { ...make(7, 0), currentPlayer: null };
  assert.equal(jumpButton(absent).disabled, true);
});
