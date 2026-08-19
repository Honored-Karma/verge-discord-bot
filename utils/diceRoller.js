import { randomInt } from "node:crypto";

/**
 * Броски кубиков.
 *
 * Нотация писалась с оглядкой на Dice Maiden, но три его известные болячки
 * вылечены осознанно:
 *
 * 1. У Dice Maiden буква `d` означает и кубик, и «drop lowest» (`4d6 d1`).
 *    Разработчик сам пометил это в коде как «prefix-matching hazard»: порядок
 *    матчинга модификаторов завязан на длину префикса. Здесь все модификаторы
 *    отбора двухбуквенные — `kh`, `kl`, `dh`, `dl` — поэтому одинокая `d`
 *    встречается только как обозначение кубика, и грамматика однозначна.
 *
 * 2. Там неочевидно, что отбор применяется после взрывов, и «что же именно
 *    отбрасывает d1» — живой открытый вопрос в их трекере. Здесь принята одна
 *    модель: взрыв наращивает значение ТОГО ЖЕ кубика, поэтому у каждого кубика
 *    ровно одно итоговое значение, и отбор идёт по этим значениям.
 *
 * 3. Там `r` перебрасывал до бесконечности, что ломало правила систем с одним
 *    перебросом. Здесь `r` — строго один переброс, а бесконечный — отдельный `rr`.
 *
 * Порядок применения фиксирован и всегда один: бросок → перебросы → взрывы →
 * отбор keep/drop → сумма с арифметикой (или подсчёт успехов).
 */

export const LIMITS = {
  inputLength: 200,
  maxExpressions: 4,
  maxRepeat: 10,
  maxTerms: 10,
  maxDice: 100,
  minSides: 2,
  maxSides: 1000,
  maxExplosions: 50,
  maxRerolls: 50,
  shownDice: 20,
};

const MOD_PATTERN = /^(?:(kh|kl|dh|dl|rr|r|t|f)(\d+)|(!)(\d*))/;

/**
 * Приводит запись к машинному виду. Пробелы удаляются целиком, поэтому
 * `4d6 dl1 +2` и `4d6dl1+2` — одно и то же: заставлять игрока помнить, где
 * пробел обязателен, а где запрещён, незачем.
 *
 * Русская `д` принимается как `d`: «2д6» на русскоязычном сервере набирают
 * чаще, чем кажется. Заменять при этом `к`→`k` и `х`→`h` — плохая идея: они
 * калечат обычные русские слова, а в записи кубика почти не встречаются.
 */
export function normalizeExpression(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/д/g, "d")
    .replace(/[–—−]/g, "-")
    .replace(/d%/g, "d100");
}

function fail(message) {
  return { ok: false, error: message };
}

function parseModifiers(source, cursor, term) {
  let pos = cursor;
  while (pos < source.length) {
    const rest = source.slice(pos);
    const match = rest.match(MOD_PATTERN);
    if (!match) break;

    const [whole, word, wordValue, bang, bangValue] = match;

    if (bang) {
      const threshold = bangValue ? Number(bangValue) : term.sides;
      if (threshold < 2) return fail("Взрыв на 1 никогда не остановится — укажите порог больше 1.");
      if (threshold > term.sides) {
        return fail(`Взрыв на ${threshold} невозможен: у d${term.sides} нет такой грани.`);
      }
      term.explodeAt = threshold;
    } else {
      const value = Number(wordValue);
      switch (word) {
        case "kh": case "kl": case "dh": case "dl":
          if (term.select) return fail("Отбор кубиков указан дважды — оставьте один из kh/kl/dh/dl.");
          if (value < 1) return fail("Отбирать нужно хотя бы один кубик.");
          if (value >= term.count) {
            return fail(`${word}${value} бессмысленно: кубиков всего ${term.count}.`);
          }
          term.select = { mode: word, count: value };
          break;
        case "r": case "rr":
          if (term.reroll) return fail("Переброс указан дважды — оставьте один из r/rr.");
          if (value >= term.sides) {
            return fail(`${word}${value} перебрасывал бы все грани d${term.sides} без остановки.`);
          }
          if (value < 1) return fail("Порог переброса должен быть не меньше 1.");
          term.reroll = { threshold: value, repeat: word === "rr" };
          break;
        case "t":
          if (value < 1 || value > term.sides) {
            return fail(`Порог успеха ${value} вне диапазона d${term.sides}.`);
          }
          term.success = value;
          break;
        case "f":
          if (value < 1 || value > term.sides) {
            return fail(`Порог провала ${value} вне диапазона d${term.sides}.`);
          }
          term.failure = value;
          break;
        default:
          return fail(`Непонятный модификатор: ${whole}`);
      }
    }

    pos += whole.length;
  }

  return { ok: true, cursor: pos };
}

/**
 * Разбирает одно выражение. Возвращает либо `{ok:true, spec}`, либо `{ok:false,
 * error}` с текстом, который можно показать игроку как есть.
 */
export function parseExpression(input) {
  const source = normalizeExpression(input);
  if (!source) return fail("Пустое выражение. Пример: `2d6+3`.");

  let cursor = 0;
  let repeat = 1;

  // Повтор набора: `6#4d6` — шесть независимых наборов. У Dice Maiden это
  // безымянное число впереди (`6 4d6`), из-за чего оно склеивалось с обычной
  // арифметикой; явная решётка такой двусмысленности не оставляет.
  const repeatMatch = source.match(/^(\d+)#/);
  if (repeatMatch) {
    repeat = Number(repeatMatch[1]);
    if (repeat < 1) return fail("Число наборов должно быть не меньше 1.");
    if (repeat > LIMITS.maxRepeat) {
      return fail(`Слишком много наборов: максимум ${LIMITS.maxRepeat}.`);
    }
    cursor = repeatMatch[0].length;
  }

  const terms = [];
  let expectSign = false;

  while (cursor < source.length) {
    let sign = 1;
    const signChar = source[cursor];
    if (signChar === "+" || signChar === "-") {
      sign = signChar === "-" ? -1 : 1;
      cursor += 1;
    } else if (expectSign) {
      return fail("Между слагаемыми нужен + или -. Например: `2d6+3`.");
    }

    const rest = source.slice(cursor);
    const diceMatch = rest.match(/^(\d*)d(\d+)/);

    if (diceMatch) {
      const count = diceMatch[1] === "" ? 1 : Number(diceMatch[1]);
      const sides = Number(diceMatch[2]);

      if (count < 1) return fail("Кубиков должно быть хотя бы один.");
      if (count > LIMITS.maxDice) {
        return fail(`Слишком много кубиков: максимум ${LIMITS.maxDice} за раз.`);
      }
      if (sides < LIMITS.minSides) return fail("У кубика должно быть минимум 2 грани.");
      if (sides > LIMITS.maxSides) {
        return fail(`Слишком много граней: максимум d${LIMITS.maxSides}.`);
      }

      const term = { kind: "dice", sign, count, sides };
      cursor += diceMatch[0].length;

      const mods = parseModifiers(source, cursor, term);
      if (!mods.ok) return mods;
      cursor = mods.cursor;
      terms.push(term);
    } else {
      const constMatch = rest.match(/^(\d+)/);
      if (!constMatch) {
        return fail("Не понимаю эту запись. Ожидалось что-то вроде `2d6+3`.");
      }
      terms.push({ kind: "const", sign, value: Number(constMatch[1]) });
      cursor += constMatch[0].length;
    }

    if (terms.length > LIMITS.maxTerms) {
      return fail(`Слишком длинное выражение: максимум ${LIMITS.maxTerms} слагаемых.`);
    }
    expectSign = true;
  }

  if (terms.length === 0) return fail("В выражении нет ни кубиков, ни чисел.");
  if (!terms.some((term) => term.kind === "dice")) {
    return fail("Здесь нет ни одного кубика — бросать нечего.");
  }

  const counting = terms.filter((term) => term.success || term.failure);
  if (counting.length > 1) {
    return fail("Подсчёт успехов поддерживается только для одного набора кубиков.");
  }
  if (counting.length === 1 && terms.filter((term) => term.kind === "dice").length > 1) {
    return fail("Подсчёт успехов нельзя смешивать с дополнительными кубиками.");
  }

  return { ok: true, spec: { repeat, terms, source } };
}

/** Несколько независимых выражений в одной строке, разделитель — `;`. */
export function parseRollInput(input) {
  const raw = String(input || "");
  if (raw.length > LIMITS.inputLength) {
    return fail(`Слишком длинная запись: максимум ${LIMITS.inputLength} символов.`);
  }

  const parts = raw.split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return fail("Пустое выражение. Пример: `2d6+3`.");
  if (parts.length > LIMITS.maxExpressions) {
    return fail(`Слишком много выражений: максимум ${LIMITS.maxExpressions} через «;».`);
  }

  const specs = [];
  for (const part of parts) {
    const parsed = parseExpression(part);
    if (!parsed.ok) return parsed;
    specs.push(parsed.spec);
  }
  return { ok: true, specs };
}

/**
 * Честный кубик: `randomInt` из crypto, а не `Math.random`.
 *
 * На ролевом сервере от броска зависят конфликты и экономика, а `Math.random`
 * даёт предсказуемую последовательность — воспроизводимость поведения ГПСЧ тут
 * нежелательна вовсе.
 */
function rollOne(sides, rng) {
  return rng ? rng(sides) : randomInt(1, sides + 1);
}

function rollTerm(term, rng) {
  const dice = [];

  for (let index = 0; index < term.count; index += 1) {
    let value = rollOne(term.sides, rng);
    const die = { value, rerolled: false, exploded: 0, dropped: false };

    // 1. Перебросы. `r` — строго один раз, `rr` — до успеха, но с потолком:
    //    без него `rr` на неудачном пороге висел бы вечно.
    if (term.reroll && value <= term.reroll.threshold) {
      let attempts = 0;
      do {
        value = rollOne(term.sides, rng);
        attempts += 1;
        die.rerolled = true;
      } while (
        term.reroll.repeat
        && value <= term.reroll.threshold
        && attempts < LIMITS.maxRerolls
      );
    }

    // 2. Взрывы наращивают значение этого же кубика, поэтому у кубика остаётся
    //    ровно одно итоговое число и отбор ниже работает предсказуемо.
    //
    //    Слагаемые запоминаются: без них игрок видит на 3d6 значение вроде 11 и
    //    не понимает, откуда оно взялось. Живой вопрос из чата, не гипотеза.
    if (term.explodeAt) {
      const parts = [value];
      let last = value;
      let bursts = 0;
      while (last >= term.explodeAt && bursts < LIMITS.maxExplosions) {
        last = rollOne(term.sides, rng);
        value += last;
        parts.push(last);
        bursts += 1;
      }
      die.exploded = bursts;
      if (bursts > 0) die.parts = parts;
    }

    die.value = value;
    dice.push(die);
  }

  // 3. Отбор по итоговым значениям кубиков.
  if (term.select) {
    const order = dice
      .map((die, index) => ({ index, value: die.value }))
      .sort((left, right) => right.value - left.value);

    const { mode, count } = term.select;
    let dropIndexes = [];
    if (mode === "kh") dropIndexes = order.slice(count).map((entry) => entry.index);
    if (mode === "kl") dropIndexes = order.slice(0, order.length - count).map((entry) => entry.index);
    if (mode === "dh") dropIndexes = order.slice(0, count).map((entry) => entry.index);
    if (mode === "dl") dropIndexes = order.slice(order.length - count).map((entry) => entry.index);
    for (const index of dropIndexes) dice[index].dropped = true;
  }

  const kept = dice.filter((die) => !die.dropped);

  if (term.success || term.failure) {
    const successes = term.success ? kept.filter((die) => die.value >= term.success).length : 0;
    const failures = term.failure ? kept.filter((die) => die.value <= term.failure).length : 0;
    return { term, dice, mode: "count", successes, failures, total: successes - failures };
  }

  const total = kept.reduce((sum, die) => sum + die.value, 0);
  return { term, dice, mode: "sum", total };
}

/** Один набор: все слагаемые выражения плюс итог. */
export function rollSpec(spec, rng = null) {
  const rolls = [];
  let total = 0;
  let counting = null;

  for (const term of spec.terms) {
    if (term.kind === "const") {
      rolls.push({ term, mode: "const", total: term.value });
      total += term.sign * term.value;
      continue;
    }
    const result = rollTerm(term, rng);
    rolls.push(result);
    if (result.mode === "count") counting = result;
    total += term.sign * result.total;
  }

  return {
    rolls,
    total,
    counting,
    source: spec.source,
  };
}

export function rollExpression(spec, rng = null) {
  const sets = [];
  for (let index = 0; index < spec.repeat; index += 1) {
    sets.push(rollSpec(spec, rng));
  }
  return { repeat: spec.repeat, source: spec.source, sets };
}

// ── Оформление ───────────────────────────────────────────────────────────────

/**
 * Один кубик в выводе.
 *
 * У взорвавшегося кубика показываются слагаемые: «11💥(6+5)». Одного значка
 * недостаточно — он сообщает, что взрыв был, но не объясняет, почему на d6
 * оказалось 11, и игрок идёт спрашивать.
 */
function formatDie(die) {
  if (die.dropped) return `~~${die.value}~~`;
  if (die.exploded > 0) {
    const parts = die.parts?.length ? `(${die.parts.join("+")})` : "";
    return `**${die.value}**💥${parts}`;
  }
  if (die.rerolled) return `${die.value}↻`;
  return String(die.value);
}

function formatDiceList(dice) {
  const shown = dice.slice(0, LIMITS.shownDice).map(formatDie);
  const hidden = dice.length - shown.length;
  const tail = hidden > 0 ? `, …ещё ${hidden}` : "";
  return `[${shown.join(", ")}${tail}]`;
}

/**
 * Легенда под броском — только для тех пометок, что реально встретились.
 * Постоянная простыня пояснений быстро становится шумом, а разовое «что это за
 * значок» стоит объяснить сразу, в том же сообщении.
 */
export function legendFor(results) {
  const dice = results
    .flatMap((result) => result.sets)
    .flatMap((set) => set.rolls)
    .flatMap((roll) => roll.dice || []);

  const notes = [];
  if (dice.some((die) => die.exploded > 0)) {
    notes.push("💥 выпал максимум — кубик бросился ещё раз, броски сложены");
  }
  if (dice.some((die) => die.rerolled)) notes.push("↻ кубик переброшен");
  if (dice.some((die) => die.dropped)) notes.push("зачёркнутые кубики отброшены");

  return notes.length > 0 ? `-# ${notes.join(" · ")}` : "";
}

function termLabel(term) {
  const parts = [`${term.count}d${term.sides}`];
  if (term.reroll) parts.push(`${term.reroll.repeat ? "rr" : "r"}${term.reroll.threshold}`);
  if (term.explodeAt) parts.push(term.explodeAt === term.sides ? "!" : `!${term.explodeAt}`);
  if (term.select) parts.push(`${term.select.mode}${term.select.count}`);
  if (term.success) parts.push(`t${term.success}`);
  if (term.failure) parts.push(`f${term.failure}`);
  return parts.join("");
}

/** Текст одного набора: раскладка по кубикам и итог. */
export function formatSet(set) {
  const pieces = [];

  for (const roll of set.rolls) {
    const sign = roll.term.sign < 0 ? "−" : "+";
    const prefix = pieces.length === 0 ? (roll.term.sign < 0 ? "−" : "") : ` ${sign} `;

    if (roll.mode === "const") {
      pieces.push(`${prefix}${roll.total}`);
      continue;
    }
    pieces.push(`${prefix}${termLabel(roll.term)} ${formatDiceList(roll.dice)}`);
  }

  const body = pieces.join("");

  if (set.counting) {
    const { successes, failures, term } = set.counting;
    if (term.failure) {
      return `${body}\n→ итог: **${set.total}** (успехов ${successes}, провалов ${failures})`;
    }
    return `${body}\n→ успехов: **${successes}**`;
  }

  return `${body}\n→ **${set.total}**`;
}

/** Полный текст результата: все выражения и все их наборы. */
export function formatRollResult(results) {
  const blocks = [];

  for (const result of results) {
    if (result.repeat === 1) {
      blocks.push(formatSet(result.sets[0]));
      continue;
    }
    const lines = result.sets.map((set, index) => {
      const label = `**${index + 1}.** `;
      return label + formatSet(set).replace("\n→ ", " → ");
    });
    const grand = result.sets.reduce((sum, set) => sum + set.total, 0);
    blocks.push(`\`${result.source}\` ×${result.repeat}\n${lines.join("\n")}\nСумма всех: **${grand}**`);
  }

  const legend = legendFor(results);
  if (legend) blocks.push(legend);

  return blocks.join("\n\n");
}

/**
 * Похоже ли, что игрок по привычке отправил в бросок список вариантов.
 *
 * UnbelievaBoat совмещает кубики и случайный выбор в одной команде и различает
 * их эвристикой «есть ли запятая». Мы команды развели, но привычка остаётся —
 * поэтому вместо сухой ошибки парсера подсказываем нужную команду.
 */
export function looksLikeOptionList(input) {
  const raw = String(input || "").trim();
  if (!raw) return false;
  if (/^[\d\s+\-*/#;dкдhх!ktfrl%]+$/i.test(raw)) return false;
  return /[,|]/.test(raw) || raw.split(/\s+/).filter(Boolean).length >= 2;
}
