import { MessageFlags } from "discord.js";
import { getLeaderboardPage } from "../utils/dataManager.js";
import {
  createLeaderboardComponents,
  createLeaderboardEmptyComponents,
  createLeaderboardErrorComponents,
  LEADERBOARD_METRIC_PREFIX,
  LEADERBOARD_METRICS,
  LEADERBOARD_NEXT_ID,
  LEADERBOARD_PREV_ID,
  LEADERBOARD_REFRESH_ID,
} from "../utils/leaderboardComponents.js";
import { saveInteractionSession } from "../utils/interactionSessions.js";

export const LEADERBOARD_NAMESPACE = "leaderboard";

/**
 * Рейтинг — публичное сообщение, которое живёт в канале долго, поэтому панель
 * держится сутки вместо трёхминутного коллектора: кнопки продолжают работать и
 * после рестарта бота.
 */
export const LEADERBOARD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createLeaderboardSessionState({ metric, pageSize, playerId }) {
  return {
    player_id: playerId,
    metric: LEADERBOARD_METRICS[metric] ? metric : "ap",
    page: 0,
    page_size: pageSize,
  };
}

/**
 * Загружает страницу и подтягивает номер страницы назад, если участников стало
 * меньше, пока панель была открыта.
 */
export async function loadLeaderboardSnapshot(state) {
  let page = Number(state.page || 0);
  let snapshot = await getLeaderboardPage(
    state.metric,
    state.player_id,
    page,
    state.page_size,
  );
  if (!snapshot.error && snapshot.total > 0 && page >= snapshot.totalPages) {
    page = snapshot.totalPages - 1;
    snapshot = await getLeaderboardPage(
      state.metric,
      state.player_id,
      page,
      state.page_size,
    );
  }
  return { snapshot, page };
}

export function renderLeaderboardComponents(snapshot, state) {
  if (snapshot.error) return createLeaderboardErrorComponents();
  if (snapshot.total === 0) return createLeaderboardEmptyComponents();
  return createLeaderboardComponents({ snapshot, playerId: state.player_id });
}

function applyAction(customId, state, snapshot) {
  if (customId.startsWith(LEADERBOARD_METRIC_PREFIX)) {
    const requested = customId.slice(LEADERBOARD_METRIC_PREFIX.length);
    if (!LEADERBOARD_METRICS[requested]) return false;
    if (requested === state.metric) return false;
    state.metric = requested;
    state.page = 0;
    return true;
  }
  if (customId === LEADERBOARD_PREV_ID) {
    const next = Math.max(0, Number(state.page || 0) - 1);
    if (next === state.page) return false;
    state.page = next;
    return true;
  }
  if (customId === LEADERBOARD_NEXT_ID) {
    const lastPage = Math.max(0, Number(snapshot?.totalPages || 1) - 1);
    const next = Math.min(lastPage, Number(state.page || 0) + 1);
    if (next === state.page) return false;
    state.page = next;
    return true;
  }
  // Обновление не меняет состояние, но перечитывает данные.
  return customId === LEADERBOARD_REFRESH_ID;
}

async function handleComponent({ interaction, session }) {
  const state = { ...session.state };
  const previous = await loadLeaderboardSnapshot(state);

  if (!applyAction(interaction.customId, state, previous.snapshot)) {
    return interaction.deferUpdate().catch(() => {});
  }

  await interaction.deferUpdate();
  const { snapshot, page } = await loadLeaderboardSnapshot(state);
  state.page = page;

  await saveInteractionSession(
    session.message_id,
    session.revision,
    state,
    { ttlMs: LEADERBOARD_SESSION_TTL_MS },
  );

  await interaction.editReply({
    components: renderLeaderboardComponents(snapshot, state),
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    components: createLeaderboardErrorComponents(),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    content: "Это меню рейтинга открыто для другого игрока. Запустите `/leaderboard` — он покажет вашу позицию.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

export const leaderboardInteractionHandler = {
  namespace: LEADERBOARD_NAMESPACE,
  handleComponent,
  renderExpired,
  renderForeign,
};

export const __testables = { applyAction };
