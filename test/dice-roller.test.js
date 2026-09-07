import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRollResult,
  formatSet,
  LIMITS,
  looksLikeOptionList,
  normalizeExpression,
  parseExpression,
  parseRollInput,
  rollExpression,
  rollSpec,
} from "../utils/diceRoller.js";

/**
 * Генератор с заранее известной выдачей: без него проверить порядок применения
 * модификаторов невозможно — результат каждый раз другой.
 */
function scripted(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error("Сценарий бросков исчерпан");
    return value;
  };
}

function spec(expression) {
  const parsed = parseExpression(expression);
  assert.equal(parsed.ok, true, `не разобралось: ${expression} — ${parsed.error}`);
  return parsed.spec;
}

test("запись приводится к машинному виду без потери смысла", () => {
  // Пробелы не значат ничего: игрок не должен помнить, где они обязательны.
  assert.equal(normalizeExpression("4d6 dl1 +2"), "4d6dl1+2");
  assert.equal(normalizeExpression("2D6"), "2d6");
  assert.equal(normalizeExpression("d%"), "d100");
  assert.equal(normalizeExpression("2д6"), "2d6");
  // Длинное тире из мобильной автозамены не должно ломать бросок.
  assert.equal(normalizeExpression("2d6 — 1"), "2d6-1");

  // А вот `к` и `х` НЕ заменяются: они калечат русские слова в сообщениях.
  assert.equal(normalizeExpression("кепка"), "кепка");
});

test("буква d однозначна: кубик отдельно, отбрасывание отдельно", () => {
  // Главная болячка Dice Maiden: там `4d6 d1` — это «отбросить худший», и та же
  // буква обозначает кубик. Здесь отбор всегда двухбуквенный.
  const dropped = spec("4d6dl1");
  assert.equal(dropped.terms.length, 1, "dl1 не должен стать вторым кубиком");
  assert.deepEqual(
    { count: dropped.terms[0].count, sides: dropped.terms[0].sides },
    { count: 4, sides: 6 },
  );
  assert.deepEqual(dropped.terms[0].select, { mode: "dl", count: 1 });

  // А вот настоящий второй кубик разбирается как слагаемое.
  const added = spec("2d6+1d4");
  assert.equal(added.terms.length, 2);
  assert.equal(added.terms[1].kind, "dice");
  assert.equal(added.terms[1].sides, 4);
  assert.equal(added.terms[1].sign, 1);

  // Вычитание кубиков тоже работает.
  assert.equal(spec("2d6-1d4").terms[1].sign, -1);

  // Многобуквенные модификаторы не должны съедаться однобуквенными:
  // rr обязан выиграть у r, kh/kl/dh/dl — у самих себя.
  assert.deepEqual(spec("4d6rr1").terms[0].reroll, { threshold: 1, repeat: true });
  assert.deepEqual(spec("4d6r1").terms[0].reroll, { threshold: 1, repeat: false });
  assert.equal(spec("4d6kh3").terms[0].select.mode, "kh");
  assert.equal(spec("4d6kl3").terms[0].select.mode, "kl");
  assert.equal(spec("4d6dh1").terms[0].select.mode, "dh");
});

test("порядок применения модификаторов зафиксирован", () => {
  // Переброс заменяет значение кубика, и отбор работает уже по новому значению.
  const reroll = rollSpec(spec("3d6r2kh1"), scripted([1, 6, 3, 5]));
  //  кубик 1: 1 → ≤2 → переброс 6
  //  кубик 2: 3 — порог не задет, переброса нет
  //  кубик 3: 5
  assert.deepEqual(reroll.rolls[0].dice.map((die) => die.value), [6, 3, 5]);
  assert.equal(reroll.rolls[0].dice[0].rerolled, true);
  // kh1 оставил переброшенную шестёрку, а не исходную единицу.
  assert.deepEqual(reroll.rolls[0].dice.map((die) => die.dropped), [false, true, true]);
  assert.equal(reroll.total, 6);
});

test("взрывающиеся кубики отключены и объясняют это прямо", () => {
  // Модификатор успел побывать в шпаргалке, поэтому общее «не понимаю запись»
  // выглядело бы поломкой бота.
  for (const input of ["3d6!", "3d6!5", "4d6dl1!", "2d6! + 1"]) {
    const parsed = parseExpression(input);
    assert.equal(parsed.ok, false, `должно было отказать: ${input}`);
    assert.match(parsed.error, /Взрывающиеся кубики отключены/, `неясный текст для ${input}`);
  }

  // Значение кубика больше не может превысить число граней.
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const set = rollSpec(spec("3d6"));
    for (const die of set.rolls[0].dice) {
      assert.ok(die.value >= 1 && die.value <= 6, `значение вне d6: ${die.value}`);
    }
  }
});

test("r перебрасывает один раз, rr — пока не перестанет", () => {
  // Прямая правка поведения Dice Maiden: там `r` уходил в бесконечный переброс,
  // что ломало системы, разрешающие ровно один переброс кубика.
  const once = rollSpec(spec("1d6r2"), scripted([1, 2]));
  assert.equal(once.rolls[0].dice[0].value, 2, "второй бросок обязан остаться, даже если он тоже ≤2");

  const many = rollSpec(spec("1d6rr2"), scripted([1, 2, 1, 5]));
  assert.equal(many.rolls[0].dice[0].value, 5);
});

test("keep и drop отбирают именно те кубики, что заявлены", () => {
  const dice = [4, 1, 6, 3];

  const kh2 = rollSpec(spec("4d6kh2"), scripted(dice));
  assert.deepEqual(kh2.rolls[0].dice.filter((die) => !die.dropped).map((die) => die.value), [4, 6]);
  assert.equal(kh2.total, 10);

  const kl2 = rollSpec(spec("4d6kl2"), scripted(dice));
  assert.deepEqual(kl2.rolls[0].dice.filter((die) => !die.dropped).map((die) => die.value), [1, 3]);

  const dh1 = rollSpec(spec("4d6dh1"), scripted(dice));
  assert.deepEqual(dh1.rolls[0].dice.filter((die) => !die.dropped).map((die) => die.value), [4, 1, 3]);

  const dl1 = rollSpec(spec("4d6dl1"), scripted(dice));
  assert.deepEqual(dl1.rolls[0].dice.filter((die) => !die.dropped).map((die) => die.value), [4, 6, 3]);

  // Преимущество и помеха — просто частный случай отбора.
  assert.equal(rollSpec(spec("2d20kh1"), scripted([7, 19])).total, 19);
  assert.equal(rollSpec(spec("2d20kl1"), scripted([7, 19])).total, 7);
});

test("успехи и провалы считаются по оставшимся кубикам", () => {
  const counted = rollSpec(spec("5d10t8f1"), scripted([10, 8, 7, 1, 2]));
  assert.equal(counted.counting.successes, 2);
  assert.equal(counted.counting.failures, 1);
  assert.equal(counted.total, 1, "успехи минус провалы");

  const onlySuccess = rollSpec(spec("5d10t8"), scripted([10, 8, 7, 1, 2]));
  assert.equal(onlySuccess.counting.failures, 0);
  assert.equal(onlySuccess.total, 2);

  // Отброшенный кубик не участвует в подсчёте.
  const withDrop = rollSpec(spec("3d10kh2t8"), scripted([10, 9, 1]));
  assert.equal(withDrop.counting.successes, 2);
});

test("арифметика складывает и кубики, и числа", () => {
  const mixed = rollSpec(spec("2d6+1d4+3"), scripted([5, 5, 4]));
  assert.equal(mixed.total, 5 + 5 + 4 + 3);

  const negative = rollSpec(spec("2d6-1"), scripted([5, 5]));
  assert.equal(negative.total, 9);

  const subtractDice = rollSpec(spec("2d6-1d4"), scripted([5, 5, 3]));
  assert.equal(subtractDice.total, 7);
});

test("наборы и несколько выражений разбираются раздельно", () => {
  const sets = rollExpression(spec("3#2d6"), scripted([1, 1, 2, 2, 3, 3]));
  assert.equal(sets.sets.length, 3);
  assert.deepEqual(sets.sets.map((set) => set.total), [2, 4, 6]);

  const multi = parseRollInput("1d20+5; 2d6");
  assert.equal(multi.ok, true);
  assert.equal(multi.specs.length, 2);

  // Пустые части между «;» не считаются выражением.
  const trailing = parseRollInput("1d20;");
  assert.equal(trailing.ok, true);
  assert.equal(trailing.specs.length, 1);
});

test("границы заданы и объясняются человеческим языком", () => {
  const cases = [
    ["", /Пустое выражение/],
    ["abc", /Не понимаю эту запись/],
    ["5", /нет ни одного кубика/],
    ["1d1", /минимум 2 грани/],
    [`1d${LIMITS.maxSides + 1}`, /Слишком много граней/],
    [`${LIMITS.maxDice + 1}d6`, /Слишком много кубиков/],
    [`${LIMITS.maxRepeat + 1}#2d6`, /Слишком много наборов/],
    ["4d6dl9", /кубиков всего 4/],
    ["4d6kh4", /кубиков всего 4/],
    ["2d6rr6", /без остановки/],
    ["2d6r0", /не меньше 1/],
    ["5d10t11", /вне диапазона/],
    ["2d6+", /Между слагаемыми|Не понимаю/],
    ["4d6kh2kl1", /Отбор кубиков указан дважды/],
    ["4d6r1rr2", /Переброс указан дважды/],
    ["5d10t8+1d4", /нельзя смешивать/],
  ];

  for (const [input, pattern] of cases) {
    const parsed = parseExpression(input);
    assert.equal(parsed.ok, false, `должно было отказать: «${input}»`);
    assert.match(parsed.error, pattern, `неожиданный текст для «${input}»: ${parsed.error}`);
    // Текст ошибки идёт игроку как есть — он не должен быть отладочным.
    assert.ok(parsed.error.length > 10, `слишком короткое объяснение: ${parsed.error}`);
  }

  const tooLong = parseRollInput("1d6+".repeat(80) + "1d6");
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /Слишком длинная запись|Слишком длинное выражение/);

  assert.match(parseRollInput("1d6;1d6;1d6;1d6;1d6").error, /Слишком много выражений/);
});

test("бесконечный переброс упирается в потолок", () => {
  const alwaysOne = () => 1;
  const rerolled = rollSpec(spec("1d6rr1"), alwaysOne);
  assert.equal(rerolled.rolls[0].dice[0].value, 1, "переброс сдаётся и оставляет последнее значение");
});

test("вывод скромный: одна строка, запись броска и судьба каждого кубика", () => {
  const dropped = formatRollResult([rollExpression(spec("4d6dl1"), scripted([4, 1, 6, 3]))]);
  assert.match(dropped, /~~1~~/, "отброшенный кубик обязан быть зачёркнут");
  assert.match(dropped, /= \*\*13\*\*/, "итог выделяется");
  assert.match(dropped, /`4d6dl1`/, "видно, что именно бросали");
  // Ровно одна строка: броски в отыгрыше идут пачками, лишние переводы строки
  // раздувают канал.
  assert.equal(dropped.split("\n").length, 1, `ожидалась одна строка: ${dropped}`);

  // Подпись терма внутри строки не дублируется — запись уже показана в начале.
  assert.equal((dropped.match(/4d6dl1/g) || []).length, 1);

  const rerolled = formatRollResult([rollExpression(spec("1d6r2"), scripted([1, 5]))]);
  assert.match(rerolled, /5↻/, "переброшенный кубик помечается");

  // Слагаемые выражения разделены знаками, а не свалены в один список.
  const mixed = formatRollResult([rollExpression(spec("2d6+1d4+3"), scripted([5, 5, 4]))]);
  assert.match(mixed, /\[5, 5\] \+ \[4\] \+ 3 = \*\*17\*\*/);

  const negative = formatRollResult([rollExpression(spec("2d6-1d4"), scripted([5, 5, 3]))]);
  assert.match(negative, /\[5, 5\] − \[3\] = \*\*7\*\*/);

  // Успехи читаются словами, а не голым числом.
  assert.match(
    formatRollResult([rollExpression(spec("5d10t8"), scripted([10, 8, 7, 1, 2]))]),
    /= успехов \*\*2\*\*/,
  );
  assert.match(
    formatRollResult([rollExpression(spec("5d10t8f1"), scripted([10, 8, 7, 1, 2]))]),
    /= \*\*1\*\* \(успехов 2, провалов 1\)/,
  );

  // Большой пул не выливается в чат целиком.
  const huge = formatSet(rollSpec(spec("60d6"), () => 3));
  assert.match(huge, /…ещё 40/);
  assert.ok(huge.length < 500, `слишком длинный вывод: ${huge.length}`);

  // Наборы подписаны номерами, запись показана один раз, снизу общий итог.
  const sets = formatRollResult([rollExpression(spec("3#1d6"), scripted([1, 2, 3]))]);
  const lines = sets.split("\n");
  assert.equal(lines[0], "`3#1d6` ×3");
  assert.match(lines[1], /^\*\*1\.\*\* \[1\] = \*\*1\*\*$/);
  assert.equal(lines.at(-1), "Всего: **6**");

  // Несколько выражений — по строке на каждое, без пустых разделителей.
  const multi = parseRollInput("1d20+5; 2d6");
  const both = formatRollResult(multi.specs.map((item) => rollExpression(item, () => 3)));
  assert.equal(both.split("\n").length, 2, `ожидались две строки: ${both}`);

  // Никаких сносок-легенд: зачёркивание и стрелка читаются сами.
  assert.ok(!dropped.includes("-#"), `лишняя сноска: ${dropped}`);
  assert.ok(!rerolled.includes("-#"));
});

test("список вариантов в броске подсказывает нужную команду", () => {
  // Привычка из UnbelievaBoat, где кубик и выбор жили в одной команде.
  assert.equal(looksLikeOptionList("пупсик пупсик дино кепка"), true);
  assert.equal(looksLikeOptionList("красная сумка, синий плащ"), true);
  assert.equal(looksLikeOptionList("а|б"), true);

  // А настоящие броски за список приниматься не должны.
  for (const expression of ["2d6+3", "4d6dl1", "6#4d6", "1d20; 2d6", "d%"]) {
    assert.equal(looksLikeOptionList(expression), false, `спутано с списком: ${expression}`);
  }
});

test("кубик честный: все грани достижимы и перекос не выходит за разумное", () => {
  // Бросок опирается на crypto.randomInt, а не на Math.random: на ролевом
  // сервере от кубика зависят конфликты, и предсказуемая последовательность тут
  // не нужна. Проверяем свойства выдачи, а не реализацию.
  const counts = new Map();
  const rolls = 12000;
  const sides = 6;
  for (let index = 0; index < rolls; index += 1) {
    const value = rollSpec(spec("1d6")).total;
    assert.ok(value >= 1 && value <= sides, `значение вне диапазона: ${value}`);
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  assert.equal(counts.size, sides, "не все грани выпали ни разу за 12000 бросков");
  const expected = rolls / sides;
  for (const [value, count] of counts) {
    // Порог нарочно широкий: тест проверяет отсутствие грубого перекоса, а не
    // качество ГПСЧ, и не должен мигать от прогона к прогону.
    assert.ok(
      count > expected * 0.8 && count < expected * 1.2,
      `грань ${value} выпала ${count} раз при ожидании ~${expected}`,
    );
  }
});
