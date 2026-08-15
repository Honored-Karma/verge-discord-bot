import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureCardFont, FONT_BOLD, FONT_REGULAR } from "./profileHtml.js";
import { getAdaptiveProgressScale } from "./progressScale.js";
import { getSPMastery } from "./spMastery.js";

/**
 * Карточка персонажа: плоская поверхность, один акцент, выровненная сетка.
 *
 * Прежний рендер строился на тройном градиенте с фиолетовым свечением и
 * подсветкой полос — это язык 2021 года, и он расходился с интерфейсом остальных
 * панелей. Здесь нет ни градиентных фонов, ни свечения: работает типографика,
 * шаг сетки и единственный акцентный цвет.
 *
 * Все значения цвета, размера и отступа берутся из T — литералы в разметке
 * запрещены, иначе палитра снова разъедется, как разъехалась между embed-ами
 * (#b209d4) и старым канвасом (#8b5cf6).
 */
const T = {
  // Поверхности
  surface: "#0d0d11",
  surfaceRaised: "#15151b",
  hairline: "rgba(255,255,255,0.08)",
  hairlineStrong: "rgba(255,255,255,0.14)",

  // Единственный акцент — фирменный, тот же, что в embed-ах.
  accent: "#b209d4",
  accentSoft: "rgba(178,9,212,0.16)",
  // Вторичные акценты только для смысловых различий (SP, деньги).
  sp: "#22d3ee",
  money: "#22c55e",
  moneyAlt: "#f59e0b",

  // Текст
  text: "#f4f4f5",
  textMuted: "#a1a1aa",
  textFaint: "#6b6b76",

  // Шкала кегля
  size: { micro: 11, caption: 12, body: 14, lead: 17, stat: 26, title: 30 },
  // Шаг сетки 4px
  space: (n) => n * 4,
  radius: { sm: 6, md: 10, lg: 16 },
};

const CARD = { width: 900, height: 300, pad: T.space(7) };
const PHYSICAL = { width: 900, height: 180, pad: T.space(7) };
const SCALE = 2; // рендерим в двойном разрешении — на retina текст не мылится

// Неразрывный пробел задаём кодом: в исходнике он визуально неотличим от
// обычного, и разделитель разрядов уже однажды оказался обычным пробелом.
const NBSP = String.fromCharCode(160);

const bold = (size) => `${size}px ${FONT_BOLD}`;
const regular = (size) => `${size}px ${FONT_REGULAR}`;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function createSurface(width, height) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = T.surface;
  roundRect(ctx, 0, 0, width, height, T.radius.lg);
  ctx.fill();

  ctx.strokeStyle = T.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, width - 1, height - 1, T.radius.lg);
  ctx.stroke();

  return { canvas, ctx };
}

function text(ctx, value, x, y, {
  font = regular(T.size.body),
  color = T.text,
  align = "left",
  maxWidth,
  letterSpacing = 0,
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = letterSpacing ? "left" : align;
  ctx.textBaseline = "alphabetic";

  let output = String(value ?? "");
  if (maxWidth) {
    while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
      output = output.slice(0, -1);
    }
    if (output !== String(value ?? "")) output = `${output.slice(0, -1)}…`;
  }

  if (!letterSpacing) {
    ctx.fillText(output, x, y);
    ctx.restore();
    return ctx.measureText(output).width;
  }

  // Трекинг для микрозаголовков: canvas не умеет letter-spacing сам.
  const totalWidth = [...output]
    .reduce((sum, char) => sum + ctx.measureText(char).width + letterSpacing, 0) - letterSpacing;
  let cursor = align === "right" ? x - totalWidth : align === "center" ? x - totalWidth / 2 : x;
  for (const char of output) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + letterSpacing;
  }
  ctx.restore();
  return totalWidth;
}

function label(ctx, value, x, y, { align = "left", color = T.textFaint } = {}) {
  return text(ctx, String(value).toUpperCase(), x, y, {
    font: bold(T.size.micro),
    color,
    align,
    letterSpacing: 0.8,
  });
}

/**
 * NaN нельзя пропускать через `value || 0`: NaN ложно, поэтому битое значение
 * молча превращалось в честный ноль. Отсутствие значения — это 0, а испорченное
 * значение должно быть видно как «—».
 */
function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "0";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Math.trunc(number).toLocaleString("ru-RU").replace(/\s/g, NBSP);
}

function compact(value) {
  if (value === null || value === undefined || value === "") return "0";
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return "—";
  if (Math.abs(number) < 100_000) return formatNumber(number);
  return new Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number).replace(/\s/g, NBSP);
}

/** Плоская полоса прогресса: трек и заливка, без свечения и градиента. */
function bar(ctx, x, y, width, ratio, color) {
  const height = 6;
  ctx.fillStyle = T.hairline;
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fill();

  const filled = Math.max(0, Math.min(1, ratio)) * width;
  if (filled < 1) return;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, filled, height, height / 2);
  ctx.fill();
}

/**
 * Ячейка показателя: микрозаголовок сверху, крупное значение снизу.
 * Цветом помечается подпись, а не число: четыре разноцветных крупных числа
 * перетягивали внимание и мешали сравнивать значения между собой.
 */
function statCell(ctx, x, y, width, { caption, value, captionColor = T.textFaint }) {
  label(ctx, caption, x, y, { color: captionColor });
  text(ctx, value, x, y + T.space(7), {
    font: bold(T.size.stat),
    color: T.text,
    maxWidth: width,
  });
}

function chip(ctx, x, y, { title, value }) {
  ctx.font = bold(T.size.caption);
  const titleWidth = ctx.measureText(title).width;
  ctx.font = regular(T.size.caption);
  const valueWidth = ctx.measureText(value).width;
  const width = titleWidth + valueWidth + T.space(6);
  const height = T.space(7);

  ctx.fillStyle = T.surfaceRaised;
  roundRect(ctx, x, y, width, height, T.radius.sm);
  ctx.fill();
  ctx.strokeStyle = T.hairline;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, T.radius.sm);
  ctx.stroke();

  text(ctx, title, x + T.space(2), y + height - T.space(2.4), {
    font: bold(T.size.caption),
    color: T.text,
  });
  text(ctx, value, x + T.space(2) + titleWidth + T.space(2), y + height - T.space(2.4), {
    font: regular(T.size.caption),
    color: T.textMuted,
  });
  return width;
}

async function drawAvatar(ctx, x, y, size, { avatarUrl, fallbackAvatarUrl, name }) {
  ctx.save();
  roundRect(ctx, x, y, size, size, T.radius.md);
  ctx.clip();

  ctx.fillStyle = T.surfaceRaised;
  ctx.fillRect(x, y, size, size);

  let drawn = false;
  for (const url of [avatarUrl, fallbackAvatarUrl]) {
    if (!url || drawn) continue;
    try {
      const image = await loadImage(url);
      ctx.drawImage(image, x, y, size, size);
      drawn = true;
    } catch {}
  }

  if (!drawn) {
    // Инициал вместо картинки — читается лучше, чем вопросительный знак.
    const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
    text(ctx, initial, x + size / 2, y + size / 2 + T.space(4), {
      font: bold(T.size.title + 8),
      color: T.textFaint,
      align: "center",
    });
  }
  ctx.restore();

  ctx.strokeStyle = T.hairlineStrong;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, T.radius.md);
  ctx.stroke();
}

/**
 * Основная карточка. Слева — личность персонажа, справа — числа и прогресс.
 * Множители показываются только когда они не равны 100%: постоянные «100%» в
 * прежней версии занимали треть карточки и не сообщали ничего.
 */
export async function renderProfileCard(data) {
  await ensureCardFont();
  const {
    characterName,
    avatarUrl,
    fallbackAvatarUrl,
    attributeName,
    styles = [],
    ap = 0,
    totalSP = 0,
    apMultiplier = 100,
    spMultiplier = 100,
    salaryMultiplier = 100,
    krw = 0,
    yen = 0,
    reputation = 0,
    reputationTier = "",
    orgName,
    orgRank,
    slot = 1,
    playerId = "",
  } = data;

  const { canvas, ctx } = createSurface(CARD.width, CARD.height);
  const pad = CARD.pad;

  // ── Верхняя строка: принадлежность персонажа ────────────────────────────
  const org = orgName ? `${orgName}${orgRank ? ` · ${orgRank}` : ""}` : "БЕЗ ОРГАНИЗАЦИИ";
  label(ctx, "профиль", pad, pad + T.space(2), { color: T.accent });
  label(ctx, org, CARD.width - pad, pad + T.space(2), { align: "right", color: T.textMuted });

  const headerY = pad + T.space(5);
  ctx.fillStyle = T.hairline;
  ctx.fillRect(pad, headerY, CARD.width - pad * 2, 1);

  // ── Левая колонка: аватар, имя, атрибут ─────────────────────────────────
  const colX = pad;
  const colWidth = T.space(46);
  const avatarSize = T.space(22);
  const avatarY = headerY + T.space(5);
  await drawAvatar(ctx, colX, avatarY, avatarSize, {
    avatarUrl,
    fallbackAvatarUrl,
    name: characterName,
  });

  let cursorY = avatarY + avatarSize + T.space(6);
  const nameLines = wrap(ctx, characterName || "Без имени", colWidth, bold(T.size.lead));
  for (const line of nameLines.slice(0, 2)) {
    text(ctx, line, colX, cursorY, { font: bold(T.size.lead), color: T.text });
    cursorY += T.space(5.5);
  }

  if (attributeName) {
    cursorY += T.space(0.5);
    const badgeHeight = T.space(6);
    ctx.font = bold(T.size.caption);
    const badgeWidth = Math.min(colWidth, ctx.measureText(attributeName).width + T.space(5));
    ctx.fillStyle = T.accentSoft;
    roundRect(ctx, colX, cursorY, badgeWidth, badgeHeight, T.radius.sm);
    ctx.fill();
    text(ctx, attributeName, colX + T.space(2.5), cursorY + badgeHeight - T.space(2), {
      font: bold(T.size.caption),
      color: T.accent,
      maxWidth: badgeWidth - T.space(5),
    });
    cursorY += badgeHeight + T.space(3);
  }

  label(ctx, `слот ${slot}`, colX, CARD.height - pad + T.space(1), { color: T.textFaint });

  // ── Правая колонка ──────────────────────────────────────────────────────
  const rightX = colX + colWidth + T.space(8);
  const rightWidth = CARD.width - pad - rightX;

  // Четыре показателя в один ряд: сравнивать удобнее, чем вразнобой.
  const cellWidth = rightWidth / 4;
  const statsY = headerY + T.space(6);
  statCell(ctx, rightX, statsY, cellWidth - T.space(3), {
    caption: "AP", value: formatNumber(ap),
  });
  statCell(ctx, rightX + cellWidth, statsY, cellWidth - T.space(3), {
    caption: "SP", value: formatNumber(totalSP),
  });
  statCell(ctx, rightX + cellWidth * 2, statsY, cellWidth - T.space(3), {
    caption: "воны", value: compact(krw), captionColor: T.money,
  });
  statCell(ctx, rightX + cellWidth * 3, statsY, cellWidth - T.space(3), {
    caption: "йены", value: compact(yen), captionColor: T.moneyAlt,
  });

  // Прогресс: AP до следующей круглой отметки, SP до следующего ранга мастерства.
  const apScale = getAdaptiveProgressScale(ap);
  const mastery = getSPMastery(totalSP);
  let progressY = statsY + T.space(12);

  /**
   * Подпись состоит из двух частей: код метрики капсом и пояснение обычным
   * регистром. Иначе название ранга попадало под общий капс и получалось
   * «ДО МАСТЕР» вместо «до Мастера».
   */
  const progressRow = (code, note, right, ratio, color) => {
    const codeWidth = label(ctx, code, rightX, progressY, { color: T.textMuted });
    text(ctx, note, rightX + codeWidth + T.space(2), progressY, {
      font: regular(T.size.caption),
      color: T.textFaint,
    });
    text(ctx, right, CARD.width - pad, progressY, {
      font: regular(T.size.caption),
      color: T.textFaint,
      align: "right",
    });
    bar(ctx, rightX, progressY + T.space(2), rightWidth, ratio, color);
    progressY += T.space(9);
  };

  progressRow(
    "AP",
    `до ${formatNumber(apScale.next)}`,
    `${formatNumber(ap)} / ${formatNumber(apScale.next)}`,
    apScale.ratio,
    T.accent,
  );
  progressRow(
    "SP",
    mastery.isMax ? `ранг «${mastery.rank}» — максимум` : `до ранга «${mastery.nextRank}»`,
    mastery.isMax
      ? formatNumber(totalSP)
      : `${formatNumber(totalSP)} / ${formatNumber(mastery.nextThreshold)}`,
    mastery.ratio,
    T.sp,
  );

  // Репутация и множители — одной строкой чипов, без пустых значений.
  let chipX = rightX;
  const chipY = progressY - T.space(3);
  const chips = [{ title: "Репутация", value: `${formatNumber(reputation)}${reputationTier ? ` · ${reputationTier}` : ""}` }];
  if (Number(apMultiplier) !== 100) chips.push({ title: "AP", value: `×${apMultiplier}%` });
  if (Number(spMultiplier) !== 100) chips.push({ title: "SP", value: `×${spMultiplier}%` });
  if (Number(salaryMultiplier) !== 100) chips.push({ title: "Зарплата", value: `×${salaryMultiplier}%` });

  for (const item of chips) {
    if (chipX > CARD.width - pad - T.space(20)) break;
    chipX += chip(ctx, chipX, chipY, item) + T.space(2);
  }

  // Стили — самое нижнее, потому что их может не быть вовсе.
  const stylesY = chipY + T.space(11.5);
  const topStyles = [...styles]
    .sort((a, b) => Number(b.sp || 0) - Number(a.sp || 0))
    .slice(0, 3);

  if (topStyles.length > 0) {
    label(ctx, "стили", rightX, stylesY, { color: T.textFaint });
    let styleX = rightX;
    const styleY = stylesY + T.space(2);
    for (const style of topStyles) {
      if (styleX > CARD.width - pad - T.space(20)) break;
      styleX += chip(ctx, styleX, styleY, {
        title: style.name,
        value: formatNumber(style.sp),
      }) + T.space(2);
    }
  } else {
    label(ctx, "стили ещё не изучены", rightX, stylesY, { color: T.textFaint });
  }

  if (playerId) {
    label(ctx, `id ${playerId}`, CARD.width - pad, CARD.height - pad + T.space(1), {
      align: "right",
      color: T.textFaint,
    });
  }

  return canvas.encode("png");
}

function wrap(ctx, value, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines.length > 0 ? lines : [""];
}

/**
 * Порядок и подписи физических показателей.
 *
 * Полос прогресса здесь сознательно нет. В игре не задан максимум ни для силы
 * удара, ни для скорости, ни для реакции — прежний рендер брал шкалу «на глаз»,
 * то есть полоса сообщала выдуманный потолок. Показываем числа с единицами:
 * ровно то, что реально известно.
 */
const PHYSICAL_ROWS = [
  { key: "punch_strength_kg", title: "Сила удара", unit: "кг" },
  { key: "lifting_strength_kg", title: "Подъём", unit: "кг" },
  { key: "speed_kmh", title: "Скорость", unit: "км/ч" },
  { key: "stamina_percent", title: "Стамина", unit: "%", tight: true },
  { key: "reaction_ms", title: "Реакция", unit: "мс", note: "меньше — лучше" },
];

function physicalValue(row, stats) {
  const raw = Number(stats?.[row.key]);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  // Процент по-русски пишется без отбивки, остальные единицы — с пробелом.
  return row.tight
    ? `${formatNumber(raw)}${row.unit}`
    : `${formatNumber(raw)} ${row.unit}`;
}

/**
 * Физические показатели: пять значений в одном ряду. Величины несопоставимы
 * между собой (килограммы, км/ч, миллисекунды), поэтому сравнивать их полосами
 * нельзя — сетка из подписей и чисел честнее и читается быстрее.
 */
export async function renderPhysicalCard(data) {
  await ensureCardFont();
  const { characterName, stats = {}, slot = 1, playerId = "" } = data;
  const { canvas, ctx } = createSurface(PHYSICAL.width, PHYSICAL.height);
  const pad = PHYSICAL.pad;

  label(ctx, "физические показатели", pad, pad + T.space(2), { color: T.accent });
  label(ctx, characterName || "", PHYSICAL.width - pad, pad + T.space(2), {
    align: "right",
    color: T.textMuted,
  });

  const headerY = pad + T.space(5);
  ctx.fillStyle = T.hairline;
  ctx.fillRect(pad, headerY, PHYSICAL.width - pad * 2, 1);

  const gridWidth = PHYSICAL.width - pad * 2;
  const cellWidth = gridWidth / PHYSICAL_ROWS.length;
  const gridY = headerY + T.space(8);
  const filled = PHYSICAL_ROWS.filter((row) => physicalValue(row, stats)).length;

  PHYSICAL_ROWS.forEach((row, index) => {
    const x = pad + cellWidth * index;
    const value = physicalValue(row, stats);

    if (index > 0) {
      // Волосяная линия вместо рамок: отделяет колонки, не добавляя шума.
      ctx.fillStyle = T.hairline;
      ctx.fillRect(x - T.space(2.5), gridY - T.space(4), 1, T.space(15));
    }

    label(ctx, row.title, x, gridY, { color: T.textMuted });
    text(ctx, value ?? "—", x, gridY + T.space(8), {
      font: bold(T.size.stat - 4),
      color: value ? T.text : T.textFaint,
      maxWidth: cellWidth - T.space(5),
    });
    if (row.note && value) {
      label(ctx, row.note, x, gridY + T.space(12), { color: T.textFaint });
    }
  });

  if (filled === 0) {
    text(ctx, "Показатели ещё не зарегистрированы — обратитесь к анкетологу.", pad, PHYSICAL.height - pad - T.space(7), {
      font: regular(T.size.body),
      color: T.textFaint,
    });
  }

  label(ctx, `слот ${slot}`, pad, PHYSICAL.height - pad, { color: T.textFaint });
  if (playerId) {
    label(ctx, `id ${playerId}`, PHYSICAL.width - pad, PHYSICAL.height - pad, {
      align: "right",
      color: T.textFaint,
    });
  }

  return canvas.encode("png");
}

export const __testables = { T, formatNumber, compact, wrap, PHYSICAL_ROWS };
