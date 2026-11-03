import { RESPONSE_COLORS } from "./responseStyle.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureCardFont, FONT_BOLD, FONT_REGULAR } from "./cardFont.js";

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
  accent: `#${RESPONSE_COLORS.brand.toString(16).padStart(6, "0")}`,
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

const CARD = { width: 720, height: 360, pad: T.space(7) };
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
  const measure = (value) => letterSpacing
    ? [...value].reduce((sum, char) => sum + ctx.measureText(char).width + letterSpacing, 0) - letterSpacing
    : ctx.measureText(value).width;
  if (maxWidth) {
    if (measure(output) > maxWidth) {
      while (output.length > 1 && measure(`${output}…`) > maxWidth) output = output.slice(0, -1);
      output = `${output}…`;
    }
    const clipX = align === "right" ? x - maxWidth : align === "center" ? x - maxWidth / 2 : x;
    ctx.beginPath();
    ctx.rect(clipX, 0, maxWidth, Math.max(CARD.height, PHYSICAL.height));
    ctx.clip();
  }

  if (!letterSpacing) {
    if (maxWidth) ctx.fillText(output, x, y, maxWidth);
    else ctx.fillText(output, x, y);
    const width = measure(output);
    ctx.restore();
    return width;
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

function label(ctx, value, x, y, { align = "left", color = T.textFaint, maxWidth } = {}) {
  return text(ctx, String(value).toUpperCase(), x, y, {
    font: bold(T.size.micro),
    color,
    align,
    letterSpacing: 0.8,
    maxWidth,
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
/**
 * URL аватара задаёт сам игрок через `/set-avatar`, а у loadImage нет
 * собственного таймаута: медленный или подвисший хост задержал бы рендер
 * карточки на десятки секунд. Ждём ограниченное время и рисуем инициал.
 */
export const AVATAR_TIMEOUT_MS = 2500;

function loadAvatarImage(url, timeoutMs = AVATAR_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    loadImage(url).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("avatar_timeout")), timeoutMs);
      // Таймер не должен держать процесс живым сам по себе.
      timer.unref?.();
    }),
  ]);
}

async function drawAvatar(ctx, x, y, size, { avatarBuffer, avatarUrl, fallbackAvatarUrl, name }) {
  ctx.save();
  roundRect(ctx, x, y, size, size, T.radius.md);
  ctx.clip();

  ctx.fillStyle = T.surfaceRaised;
  ctx.fillRect(x, y, size, size);

  let drawn = false;

  // 1. Прямой буфер из постоянного хранилища (без сети, мгновенно, никогда не истекает)
  if (avatarBuffer) {
    try {
      const image = await loadImage(avatarBuffer);
      ctx.drawImage(image, x, y, size, size);
      drawn = true;
    } catch (err) {
      console.warn("Failed to load avatar from buffer:", err.message);
    }
  }

  // 2. URL аватара персонажа, если буфера нет
  if (!drawn && avatarUrl) {
    try {
      const image = await loadAvatarImage(avatarUrl);
      ctx.drawImage(image, x, y, size, size);
      drawn = true;
    } catch {}
  }

  // 3. Личный аватар пользователя Discord используется ТОЛЬКО если персонаж не имеет своего аватара
  if (!drawn && !avatarUrl && !avatarBuffer && fallbackAvatarUrl) {
    try {
      const image = await loadAvatarImage(fallbackAvatarUrl);
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
  const { characterName = "Без имени", avatarBuffer, avatarUrl, fallbackAvatarUrl,
    attributeName, styles = [], ap = 0, totalSP = 0, krw = 0, yen = 0, reputation = 0,
    reputationTier = "", orgName, orgRank, slot = 1, leaderboardRank = null } = data;
  const { canvas, ctx } = createSurface(CARD.width, CARD.height);
  const pad = CARD.pad;
  label(ctx, "досье / verge", pad, 36, { color: T.accent });
  const org = orgName ? `${orgName}${orgRank ? ` · ${orgRank}` : ""}` : "Без организации";
  label(ctx, org, CARD.width - pad, 36, { align: "right", color: T.textMuted, maxWidth: 390 });
  ctx.fillStyle = T.hairline;
  ctx.fillRect(pad, 52, CARD.width - pad * 2, 1);

  const leftWidth = 190;
  await drawAvatar(ctx, pad, 72, 104, { avatarBuffer, avatarUrl, fallbackAvatarUrl, name: characterName });
  const nameLines = wrap(ctx, characterName || "Без имени", leftWidth, bold(22));
  nameLines.slice(0, 2).forEach((line, index) => text(ctx, line, pad, 210 + index * 28, {
    font: bold(22), maxWidth: leftWidth,
  }));
  if (attributeName) text(ctx, attributeName, pad, 270, {
    font: regular(16), color: T.textMuted, maxWidth: leftWidth,
  });
  label(ctx, `слот ${slot}`, pad, CARD.height - pad, { color: T.textMuted });

  const rightX = pad + leftWidth + 24;
  const rightWidth = CARD.width - pad - rightX;
  const cells = [
    { caption: "AP", value: compact(ap) },
    { caption: "SP всего", value: compact(totalSP) },
    { caption: "Воны · ₩", value: compact(krw) },
    { caption: "Йены · ¥", value: compact(yen) },
  ];
  cells.forEach((cell, index) => {
    const x = rightX + index % 2 * rightWidth / 2;
    const y = 87 + Math.floor(index / 2) * 79;
    text(ctx, cell.caption, x, y, { font: regular(16), color: T.textMuted });
    text(ctx, cell.value, x, y + 36, { font: bold(30), maxWidth: rightWidth / 2 - 16 });
  });
  ctx.fillStyle = T.hairline;
  ctx.fillRect(rightX, 224, rightWidth, 1);
  text(ctx, `Репутация: ${compact(reputation)}${reputationTier ? ` · ${reputationTier}` : ""}`, rightX, 252, {
    font: regular(16), color: T.textMuted, maxWidth: rightWidth,
  });
  const rank = typeof leaderboardRank === "object" ? leaderboardRank?.position : leaderboardRank;
  const styleText = styles.length ? `Боевые стили: ${styles.length} · ${[...styles].sort((a, b) => Number(b.sp) - Number(a.sp))[0].name}` : "Боевые стили ещё не изучены";
  text(ctx, styleText, rightX, 281, { font: regular(16), color: T.textMuted, maxWidth: rightWidth });
  text(ctx, rank ? `Место в рейтинге: #${formatNumber(rank)}` : "Полные данные — «Показать текст»", rightX, 332, {
    font: regular(14), color: T.textMuted, maxWidth: rightWidth,
  });
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
