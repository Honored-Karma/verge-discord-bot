import assert from "node:assert/strict";
import test from "node:test";
import { PICK_LIMITS, pickOptions, splitOptions } from "../utils/randomPick.js";

function sequence(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error("Сценарий выбора исчерпан");
    return value;
  };
}

test("разделитель определяется сам, по приоритету", () => {
  // Именно эта запись у UnbelievaBoat не работает: там варианты только через
  // запятую. Пробел должен работать, потому что так люди и пишут.
  const spaces = splitOptions("пупсик пупсик дино кепка");
  assert.equal(spaces.ok, true);
  assert.deepEqual(spaces.options, ["пупсик", "пупсик", "дино", "кепка"]);
  assert.equal(spaces.separator, "пробел");

  // Запятая позволяет многословные варианты.
  const commas = splitOptions("красная сумка, синий плащ, короткий нож");
  assert.deepEqual(commas.options, ["красная сумка", "синий плащ", "короткий нож"]);
  assert.equal(commas.separator, "запятая");

  // Черта старше запятой, поэтому запятая внутри варианта уцелеет — у
  // UnbelievaBoat такой вариант распался бы на два.
  const bars = splitOptions("вариант с, запятой | второй вариант");
  assert.deepEqual(bars.options, ["вариант с, запятой", "второй вариант"]);
  assert.equal(bars.separator, "черта");

  // Точка с запятой — привычка из кастомных команд Dyno.
  const semicolons = splitOptions("первый; второй; третий");
  assert.deepEqual(semicolons.options, ["первый", "второй", "третий"]);
  assert.equal(semicolons.separator, "точка с запятой");

  // Лишние пробелы и пустые куски не создают вариантов-призраков.
  const messy = splitOptions("  а ,, б ,  в  ");
  assert.deepEqual(messy.options, ["а", "б", "в"]);
  const inner = splitOptions("длинный    вариант | второй");
  assert.deepEqual(inner.options, ["длинный вариант", "второй"]);
});

test("список без двух вариантов и переростки отклоняются понятно", () => {
  for (const input of ["", "   ", "один"]) {
    const result = splitOptions(input);
    assert.equal(result.ok, false, `должно было отказать: «${input}»`);
    assert.ok(result.error.length > 10);
  }
  assert.match(splitOptions("один").error, /минимум два варианта/);

  const many = splitOptions(
    Array.from({ length: PICK_LIMITS.maxOptions + 1 }, (_, i) => `в${i}`).join(","),
  );
  assert.equal(many.ok, false);
  assert.match(many.error, /Слишком много вариантов/);

  const longOption = splitOptions(`${"я".repeat(PICK_LIMITS.maxOptionLength + 1)}, второй`);
  assert.equal(longOption.ok, false);
  assert.match(longOption.error, /длиннее/);

  const longInput = splitOptions("вариант,".repeat(200));
  assert.equal(longInput.ok, false);
  assert.match(longInput.error, /Слишком длинный список/);
});

test("повторы сохраняются как способ задать вес", () => {
  const options = ["пупсик", "пупсик", "дино", "кепка"];

  // Индекс 0 и 1 — оба «пупсик»: дедупликации быть не должно.
  assert.deepEqual(pickOptions(options, 1, sequence([1])).chosen, ["пупсик"]);

  const report = pickOptions(options, 1, sequence([2]));
  assert.equal(report.total, 4);
  assert.equal(report.uniqueCount, 3);
  assert.equal(report.hasDuplicates, true, "о повторе нужно сообщить, чтобы это не выглядело ошибкой");

  const clean = pickOptions(["а", "б"], 1, sequence([0]));
  assert.equal(clean.hasDuplicates, false);
});

test("несколько вариантов выбираются без повторного попадания одной позиции", () => {
  const options = ["а", "б", "в", "г"];
  // Каждый раз берётся индекс 0 из УМЕНЬШАЮЩЕГОСЯ списка — значит выбираются
  // разные позиции, а не один и тот же элемент трижды.
  const result = pickOptions(options, 3, sequence([0, 0, 0]));
  assert.deepEqual(result.chosen, ["а", "б", "в"]);

  // Просьба выбрать больше, чем есть, упирается в размер списка.
  const all = pickOptions(["а", "б"], 5, sequence([0, 0]));
  assert.equal(all.chosen.length, 2);

  // Потолок на количество соблюдается.
  const capped = pickOptions(
    Array.from({ length: 30 }, (_, i) => `в${i}`),
    99,
    () => 0,
  );
  assert.equal(capped.chosen.length, PICK_LIMITS.maxDraw);

  // Одинаковые по тексту варианты при выборе нескольких могут выпасть оба —
  // это осознанно: позиции разные, значит и шансы честные.
  const twins = pickOptions(["пупсик", "пупсик", "дино"], 2, sequence([0, 0]));
  assert.deepEqual(twins.chosen, ["пупсик", "пупсик"]);
});

test("выбор равномерный и не пропускает крайние позиции", () => {
  const options = ["а", "б", "в", "г", "д"];
  const counts = new Map();
  const draws = 10000;

  for (let index = 0; index < draws; index += 1) {
    const [choice] = pickOptions(options, 1).chosen;
    counts.set(choice, (counts.get(choice) || 0) + 1);
  }

  // Классическая ошибка реализаций на `Math.floor(Math.random()*len)` с
  // неверными границами — недобор последнего элемента; проверяем, что все на месте.
  assert.equal(counts.size, options.length, "какой-то вариант не выпал ни разу");
  const expected = draws / options.length;
  for (const [option, count] of counts) {
    assert.ok(
      count > expected * 0.8 && count < expected * 1.2,
      `вариант ${option} выпал ${count} раз при ожидании ~${expected}`,
    );
  }
});
