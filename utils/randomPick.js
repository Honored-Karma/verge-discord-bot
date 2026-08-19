import { randomInt } from "node:crypto";

/**
 * Случайный выбор из вариантов.
 *
 * UnbelievaBoat принимает варианты ТОЛЬКО через запятую (`!roll пицца, ещё
 * пицца, ананас`) и той же командой бросает кубик, различая случаи по наличию
 * запятой. Из-за этого привычная запись через пробелы у них попросту не
 * работает, а «пицца, пепперони» нельзя передать как один вариант.
 *
 * Здесь разделитель определяется сам, по приоритету: `|`, затем `;`, затем `,`,
 * и лишь в самом конце пробел. Поэтому работают все три привычки:
 *   `пупсик пупсик дино кепка`            → четыре варианта по пробелам
 *   `красная сумка, синий плащ, нож`      → три многословных варианта
 *   `вариант с, запятой | второй`         → запятая внутри варианта уцелела
 * Выбранный разделитель возвращается наружу, чтобы показать игроку, как именно
 * бот понял его список — молчаливая эвристика хуже явной.
 */

export const PICK_LIMITS = {
  inputLength: 1000,
  maxOptions: 50,
  maxOptionLength: 100,
  maxDraw: 10,
};

const SEPARATORS = [
  { char: "|", name: "черта" },
  { char: ";", name: "точка с запятой" },
  { char: ",", name: "запятая" },
];

export function splitOptions(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "Список вариантов пуст." };
  if (raw.length > PICK_LIMITS.inputLength) {
    return { ok: false, error: `Слишком длинный список: максимум ${PICK_LIMITS.inputLength} символов.` };
  }

  let parts;
  let separator = "пробел";
  const found = SEPARATORS.find((candidate) => raw.includes(candidate.char));
  if (found) {
    parts = raw.split(found.char);
    separator = found.name;
  } else {
    parts = raw.split(/\s+/);
  }

  const options = parts
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  if (options.length < 2) {
    return {
      ok: false,
      error: "Нужно минимум два варианта. Разделите их пробелом, запятой или чертой `|`.",
    };
  }
  if (options.length > PICK_LIMITS.maxOptions) {
    return { ok: false, error: `Слишком много вариантов: максимум ${PICK_LIMITS.maxOptions}.` };
  }

  const tooLong = options.find((option) => option.length > PICK_LIMITS.maxOptionLength);
  if (tooLong) {
    return {
      ok: false,
      error: `Вариант длиннее ${PICK_LIMITS.maxOptionLength} символов: «${tooLong.slice(0, 30)}…».`,
    };
  }

  return { ok: true, options, separator };
}

/**
 * Выбирает `draw` вариантов.
 *
 * Дубликаты сознательно НЕ склеиваются: повтор — это способ задать вес, и в
 * примере `пупсик пупсик дино кепка` у пупсика честные два шанса из четырёх.
 * Но факт повтора возвращается наружу, чтобы игрок не думал, что бот ошибся.
 *
 * При выборе нескольких вариантов одна и та же позиция списка второй раз не
 * достаётся — иначе «выбери двоих» могло бы выдать одного человека дважды.
 */
export function pickOptions(options, draw = 1, rng = null) {
  const total = options.length;
  const take = Math.min(Math.max(1, Number(draw) || 1), Math.min(total, PICK_LIMITS.maxDraw));

  const pool = options.map((value, index) => ({ value, index }));
  const chosen = [];
  for (let step = 0; step < take; step += 1) {
    const position = rng ? rng(pool.length) : randomInt(0, pool.length);
    chosen.push(pool[position]);
    pool.splice(position, 1);
  }

  const unique = new Set(options).size;
  return {
    chosen: chosen.map((entry) => entry.value),
    total,
    hasDuplicates: unique !== total,
    uniqueCount: unique,
  };
}
