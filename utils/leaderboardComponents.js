import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

export const LEADERBOARD_PREV_ID = "leaderboard_prev";
export const LEADERBOARD_NEXT_ID = "leaderboard_next";
export const LEADERBOARD_REFRESH_ID = "leaderboard_refresh";
export const LEADERBOARD_METRIC_PREFIX = "leaderboard_metric:";

export const LEADERBOARD_METRICS = {
  ap: {
    label: "AP",
    title: "Сверхъестественный AP",
    emoji: "⚡",
    suffix: "AP",
    color: 0xf59e0b,
  },
  sp: {
    label: "SP",
    title: "Общий SP",
    emoji: "🥋",
    suffix: "SP",
    color: 0x22d3ee,
  },
  krw: {
    label: "KRW",
    title: "Баланс KRW",
    emoji: "💳",
    suffix: "₩",
    color: 0x22c55e,
  },
  yen: {
    label: "YEN",
    title: "Баланс YEN",
    emoji: "💴",
    suffix: "¥",
    color: 0xef4444,
  },
};

const PODIUM_MARKS = ["🥇", "🥈", "🥉"];
const ERROR_COLOR = 0xef4444;
const WARNING_COLOR = 0xf59e0b;

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

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "слишком много";
  if (Math.abs(number) <= Number.MAX_SAFE_INTEGER) {
    return Math.trunc(number).toLocaleString("ru-RU");
  }
  return number.toLocaleString("ru-RU", {
    notation: "scientific",
    maximumFractionDigits: 2,
  });
}

function formatValue(player, metric) {
  return `${formatNumber(player?.leaderboard_value)} ${LEADERBOARD_METRICS[metric].suffix}`;
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
  for (const entry of entries) {
    const place = Number(entry?.leaderboard_position);
    if (!Number.isFinite(place)) continue;
    counts.set(place, (counts.get(place) || 0) + 1);
  }
  return counts;
}

export function createLeaderboardComponents({ snapshot, playerId, disabled = false }) {
  const metric = LEADERBOARD_METRICS[snapshot.metric]
    ? snapshot.metric
    : "ap";
  const config = LEADERBOARD_METRICS[metric];
  const shared = sharedPlaces([...snapshot.podium, ...snapshot.rows]);
  const sharedNote = (player) =>
    (shared.get(Number(player?.leaderboard_position)) || 0) > 1 ? " · делит место" : "";

  const podium = snapshot.podium.map((player) =>
    `${positionMark(player.leaderboard_position)} **${formatNumber(player.leaderboard_position)} место · ${characterName(player)}**${sharedNote(player)}\n-# ${formatValue(player, metric)}`,
  ).join("\n\n");
  const rows = snapshot.rows
    // Нарезка идёт по номеру строки, а не по месту: при делённом третьем месте
    // фильтр по месту прятал участника и из пьедестала, и из общего списка.
    .filter((player) => Number(player.leaderboard_row ?? player.leaderboard_position) > 3)
    .map((player) => {
      const isCurrent = player.id === playerId;
      const marker = isCurrent ? "➜" : "•";
      const you = isCurrent ? " · вы" : "";
      return `${marker} **#${formatNumber(player.leaderboard_position)} · ${characterName(player)}**${you}${sharedNote(player)}\n-# ${formatValue(player, metric)}`;
    })
    .join("\n\n");
  const current = snapshot.currentPlayer;
  const currentPosition = current
    ? `**Ваша позиция:** #${formatNumber(current.leaderboard_position)} из ${formatNumber(snapshot.total)} · ${formatValue(current, metric)}`
    : "**Ваша позиция:** активный персонаж не участвует в рейтинге";

  const container = new ContainerBuilder()
    .setAccentColor(config.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${config.emoji} Рейтинг · ${config.title}\n` +
        `${currentPosition}\n` +
        `-# Данные обновляются при переключении вкладки, страницы или вручную.`,
      ),
    )
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

  if (rows) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Общий рейтинг\n${rows}`),
      );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Страница ${snapshot.page + 1} из ${snapshot.totalPages} · участников: ${formatNumber(snapshot.total)}`,
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

export function createLeaderboardEmptyComponents() {
  return [
    new ContainerBuilder()
      .setAccentColor(LEADERBOARD_METRICS.ap.color)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## Рейтинг пока пуст\nЗарегистрируйте первого персонажа через `/register`, чтобы открыть соревнование.",
        ),
      ),
  ];
}

export function createLeaderboardErrorComponents() {
  return [
    new ContainerBuilder()
      .setAccentColor(ERROR_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## Не удалось загрузить рейтинг\nПроверьте соединение и запустите `/leaderboard` ещё раз.",
        ),
      ),
  ];
}

export function createLeaderboardCooldownComponents(retryAt) {
  return [
    new ContainerBuilder()
      .setAccentColor(WARNING_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Подождите перед открытием рейтинга\nПопробуйте снова <t:${retryAt}:R>.`,
        ),
      ),
  ];
}
