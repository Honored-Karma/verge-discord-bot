import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

export const LEADERBOARD_PREV_ID = "leaderboard_prev";
export const LEADERBOARD_NEXT_ID = "leaderboard_next";
export const LEADERBOARD_REFRESH_ID = "leaderboard_refresh";
export const LEADERBOARD_JUMP_ID = "leaderboard_jump";
export const LEADERBOARD_METRIC_PREFIX = "leaderboard_metric:";

/**
 * Каждая метрика несёт свой акцент дважды: цветом контейнера Components V2 и
 * кодом ANSI для таблицы, чтобы подсветка внутри блока совпадала с рамкой.
 */
export const LEADERBOARD_METRICS = {
  ap: {
    label: "AP",
    title: "Сверхъестественный AP",
    emoji: "⚡",
    suffix: "AP",
    color: 0xf59e0b,
    ansi: "33",
  },
  sp: {
    label: "SP",
    title: "Мастерство стилей",
    emoji: "🥋",
    suffix: "SP",
    color: 0x22d3ee,
    ansi: "36",
  },
  krw: {
    label: "KRW",
    title: "Баланс вон",
    emoji: "💳",
    suffix: "₩",
    color: 0x22c55e,
    ansi: "32",
  },
  yen: {
    label: "YEN",
    title: "Баланс йен",
    emoji: "💴",
    suffix: "¥",
    color: 0xef4444,
    ansi: "31",
  },
};

const PODIUM_MARKS = ["🥇", "🥈", "🥉"];
const ERROR_COLOR = 0xef4444;
const WARNING_COLOR = 0xf59e0b;
const NEUTRAL_COLOR = 0x4b5563;

const ESC = "\u001b";
const ANSI = {
  reset: `${ESC}[0m`,
  dim: `${ESC}[2;37m`,
  bright: `${ESC}[1;37m`,
  accent: (code) => `${ESC}[1;${code}m`,
};

// Ширина монospace-блока подобрана так, чтобы строка не переносилась на
// телефоне: перенос ломает выравнивание колонок и весь смысл таблицы.
const TABLE_WIDTH = 32;
const NAME_MIN = 10;
const NAME_MAX = 20;
const VALUE_MIN = 5;
const VALUE_MAX = 13;
// Неразрывный пробел: обычный пробел в разрядах числа Discord может свернуть.
const NBSP = " ";

function cleanText(value, maxLength = 80) {
  const compact = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1))}…`;
}

function markdownText(value, maxLength = 80) {
  return cleanText(value, maxLength).replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

function characterName(player) {
  return markdownText(
    player?.character_name || player?.username || "Неизвестный персонаж",
  );
}

/** Внутри код-блока markdown не работает, поэтому экранировать не нужно —
 *  но нужно убрать обратные кавычки, иначе блок закроется раньше времени. */
function monoName(player) {
  return cleanText(
    String(player?.character_name || player?.username || "Неизвестный")
      .replace(/`/g, "'"),
    NAME_MAX,
  );
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "слишком много";
  if (Math.abs(number) <= Number.MAX_SAFE_INTEGER) {
    return Math.trunc(number).toLocaleString("ru-RU").replace(/\s/g, NBSP);
  }
  return number.toLocaleString("ru-RU", {
    notation: "scientific",
    maximumFractionDigits: 2,
  });
}

/**
 * Компактная запись для таблицы: «17,5 млн» вместо «17 500 000». Точное
 * значение остаётся в пьедестале и в строке «ваша позиция».
 */
function compactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.trunc(number)).replace(/\s/g, NBSP);
}

function formatValue(player, metric) {
  return `${formatNumber(player?.leaderboard_value)} ${LEADERBOARD_METRICS[metric].suffix}`;
}

function positionMark(position) {
  const place = Number(position);
  return PODIUM_MARKS[place - 1] || "•";
}

/**
 * Считает, сколько видимых участников делят каждое место. Ранжирование
 * спортивное, поэтому одинаковое значение метрики даёт одинаковое место, и без
 * пометки два одинаковых номера подряд выглядят как ошибка.
 */
function sharedPlaces(entries) {
  const counts = new Map();
  // Пьедестал и первая страница пересекаются по одним и тем же персонажам,
  // поэтому считаем уникальных: иначе каждое место из топ-3 выглядело бы
  // делённым.
  const seen = new Set();
  for (const entry of entries) {
    const place = Number(entry?.leaderboard_position);
    if (!Number.isFinite(place)) continue;
    const key = String(entry?.id ?? `${place}:${entry?.leaderboard_row}`);
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(place, (counts.get(place) || 0) + 1);
  }
  return counts;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pad(text, width) {
  return text.length >= width ? text : text.padEnd(width);
}

function truncate(text, width) {
  return text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`;
}

/**
 * Собирает выровненную таблицу в ANSI-блоке. Колонки считаются по фактическому
 * содержимому страницы: у баланса в вонах и у AP разный порядок величин, и
 * фиксированная ширина либо рвала бы строку, либо оставляла дыру.
 */
function createTable(rows, metric, playerId) {
  if (rows.length === 0) return "";
  const config = LEADERBOARD_METRICS[metric];
  let values = rows.map((row) => formatNumber(row.leaderboard_value));
  const places = rows.map((row) => String(formatNumber(row.leaderboard_position)));

  // Если хотя бы одно значение не влезает в колонку, на компактную запись
  // переходит вся колонка: разная запись в одном столбце читается хуже, чем
  // округление, а строка шире остальных ломает выравнивание целиком.
  if (values.some((value) => value.length > VALUE_MAX)) {
    values = rows.map((row) => compactNumber(row.leaderboard_value));
  }

  const placeWidth = Math.max(2, ...places.map((place) => place.length));
  const valueWidth = clamp(
    Math.max(config.suffix.length, ...values.map((value) => value.length)),
    VALUE_MIN,
    VALUE_MAX,
  );
  const nameWidth = clamp(
    TABLE_WIDTH - (placeWidth + 1 + 2 + valueWidth),
    NAME_MIN,
    NAME_MAX,
  );

  const header = `${" ".repeat(placeWidth + 1)}${NBSP}${NBSP}${pad("Персонаж", nameWidth)}${config.suffix.padStart(valueWidth)}`;
  const lines = [`${ANSI.dim}${header}${ANSI.reset}`];

  rows.forEach((row, index) => {
    const isCurrent = row.id === playerId;
    const marker = isCurrent ? "›" : " ";
    // На один символ короче колонки — иначе обрезанное имя упирается в число.
    const name = truncate(monoName(row), nameWidth - 1);
    const line = `${marker}${places[index].padStart(placeWidth)}${NBSP}${NBSP}${pad(name, nameWidth)}${values[index].padStart(valueWidth)}`;
    lines.push(
      isCurrent
        ? `${ANSI.accent(config.ansi)}${line}${ANSI.reset}`
        : `${ANSI.bright}${line}${ANSI.reset}`,
    );
  });

  return ["```ansi", ...lines, "```"].join("\n");
}

function createHeader(config, snapshot) {
  const updatedAt = Math.floor(Date.now() / 1000);
  return new TextDisplayBuilder().setContent(
    `## ${config.emoji} Рейтинг · ${config.title}\n` +
    `-# ${formatNumber(snapshot.total)} участников · данные на <t:${updatedAt}:T>`,
  );
}

function createMetricButtons(metric, disabled) {
  return new ActionRowBuilder().addComponents(
    Object.entries(LEADERBOARD_METRICS).map(([id, config]) =>
      new ButtonBuilder()
        .setCustomId(`${LEADERBOARD_METRIC_PREFIX}${id}`)
        .setLabel(config.label)
        .setEmoji(config.emoji)
        .setStyle(id === metric ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled || id === metric),
    ),
  );
}

/**
 * Блок «ваша позиция» — Section с кнопкой-аксессуаром: на больших серверах
 * искать себя листанием бессмысленно, поэтому кнопка сразу открывает нужную
 * страницу.
 */
function createSelfSection(snapshot, metric, disabled, sharedCounts) {
  const current = snapshot.currentPlayer;
  // Соседей по месту считаем только по видимым строкам: отдельный запрос к базе
  // ради подписи не оправдан, а отсутствие пометки ничего не утверждает.
  const shared = (sharedCounts.get(Number(current?.leaderboard_position)) || 0) > 1;

  const text = current
    ? `**Ваша позиция — ${formatNumber(current.leaderboard_position)} место** из ${formatNumber(snapshot.total)}` +
      `${shared ? " · делите место" : ""}\n-# ${formatValue(current, metric)}`
    : "**Вас нет в этом рейтинге**\n-# Активный персонаж не участвует — проверьте слот через `/slot`.";

  const targetPage = current
    ? Math.floor((Number(current.leaderboard_row || 1) - 1) / snapshot.pageSize)
    : null;
  const alreadyHere = targetPage === null || targetPage === snapshot.page;

  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_JUMP_ID)
        .setLabel("Ко мне")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || alreadyHere),
    );
}

export function createLeaderboardComponents({ snapshot, playerId, disabled = false }) {
  const metric = LEADERBOARD_METRICS[snapshot.metric] ? snapshot.metric : "ap";
  const config = LEADERBOARD_METRICS[metric];
  const shared = sharedPlaces([...snapshot.podium, ...snapshot.rows]);
  const sharedNote = (player) =>
    (shared.get(Number(player?.leaderboard_position)) || 0) > 1 ? " · делит место" : "";

  const podium = snapshot.podium
    .map((player) =>
      `${positionMark(player.leaderboard_position)} **${characterName(player)}** — ${formatValue(player, metric)}${sharedNote(player)}`)
    .join("\n");

  // Нарезка идёт по номеру строки, а не по месту: при делённом третьем месте
  // фильтр по месту прятал участника и из пьедестала, и из общего списка.
  const tableRows = snapshot.rows.filter(
    (player) => Number(player.leaderboard_row ?? player.leaderboard_position) > 3,
  );
  const table = createTable(tableRows, metric, playerId);

  const container = new ContainerBuilder()
    .setAccentColor(config.color)
    .addTextDisplayComponents(createHeader(config, snapshot))
    .addSectionComponents(createSelfSection(snapshot, metric, disabled, shared))
    .addActionRowComponents(createMetricButtons(metric, disabled));

  if (podium) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Пьедестал\n${podium}`),
      );
  }

  if (table) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(table));
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Страница ${snapshot.page + 1} из ${snapshot.totalPages}` +
        `${disabled ? " · панель закрыта, откройте `/leaderboard`" : " · листает тот, кто открыл рейтинг"}`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(LEADERBOARD_PREV_ID)
          .setLabel("Назад")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || snapshot.page <= 0),
        new ButtonBuilder()
          .setCustomId(LEADERBOARD_REFRESH_ID)
          .setLabel("Обновить")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(LEADERBOARD_NEXT_ID)
          .setLabel("Вперёд")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || snapshot.page >= snapshot.totalPages - 1),
      ),
    );

  return [container];
}

function createStateComponents(color, title, message) {
  return [
    new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}\n${message}`),
      ),
  ];
}

export function createLeaderboardEmptyComponents() {
  return createStateComponents(
    NEUTRAL_COLOR,
    "Рейтинг пока пуст",
    "Зарегистрируйте первого персонажа через `/register`, чтобы открыть соревнование.",
  );
}

export function createLeaderboardErrorComponents() {
  return createStateComponents(
    ERROR_COLOR,
    "Не удалось загрузить рейтинг",
    "Данные не пришли из базы. Попробуйте `/leaderboard` ещё раз — если повторяется, сообщите администратору.",
  );
}

export function createLeaderboardCooldownComponents(retryAt) {
  return createStateComponents(
    WARNING_COLOR,
    "Подождите перед открытием рейтинга",
    `Попробуйте снова <t:${retryAt}:R>.`,
  );
}

export const __testables = { createTable, TABLE_WIDTH };
