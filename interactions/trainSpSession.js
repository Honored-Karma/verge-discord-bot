import { MessageFlags } from "discord.js";
import { getLearnedPlayerStyles, getPlayer } from "../utils/dataManager.js";
import {
  createSPStyleSelectionComponents,
  createSPTrainingErrorComponents,
  createSPTrainingModal,
  getSPStylePageCount,
  SP_STYLE_NEXT_ID,
  SP_STYLE_PREV_ID,
  SP_STYLE_SELECT_ID,
} from "../utils/spTrainingComponents.js";
import { saveInteractionSession } from "../utils/interactionSessions.js";

export const TRAIN_SP_NAMESPACE = "train_sp";

/**
 * Выбор стиля перед тренировкой.
 *
 * Раньше список стилей жил в замыкании коллектора на три минуты: после
 * рестарта бота кнопки листания умирали, а сам список мог устареть — стиль
 * могли отобрать, пока меню открыто. Теперь состояние хранится, а стили
 * читаются заново на каждый показ.
 */
export const TRAIN_SP_SESSION_TTL_MS = 60 * 60 * 1000;

export function createTrainSpSessionState({ playerId, slot, characterName }) {
  return {
    player_id: playerId,
    slot,
    character_name: characterName,
    page: 0,
  };
}

export async function renderStylePicker(state, { disabled = false } = {}) {
  const styles = await getLearnedPlayerStyles(state.player_id);
  if (styles.length === 0) {
    return {
      components: createSPTrainingErrorComponents(
        "Нет изученных стилей",
        "Сначала получите боевой стиль у ответственного за развитие персонажей.",
      ),
      styles,
    };
  }

  const pageCount = getSPStylePageCount(styles);
  const page = Math.min(Math.max(0, Number(state.page || 0)), pageCount - 1);

  return {
    components: createSPStyleSelectionComponents({
      characterName: state.character_name,
      styles,
      page,
      disabled,
    }),
    styles,
  };
}

async function handleComponent({ interaction, session }) {
  const state = { ...session.state };
  const styles = await getLearnedPlayerStyles(state.player_id);
  const pageCount = getSPStylePageCount(styles);

  if (interaction.customId === SP_STYLE_SELECT_ID && interaction.isStringSelectMenu()) {
    const styleId = Number(interaction.values[0]);
    const style = styles.find((candidate) => Number(candidate.id) === styleId);
    if (!style) {
      return interaction.reply({
        content: "Стиль больше недоступен. Запустите `/train-sp` ещё раз.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    const player = await getPlayer(state.player_id);
    if (!player) {
      return interaction.reply({
        content: `В слоте ${state.slot} больше нет персонажа.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    // Модалка обязана быть первым ответом на нажатие, поэтому здесь нет
    // deferUpdate. Сессию НЕ закрываем: если игрок закроет форму не отправив,
    // он сможет выбрать стиль снова. От двойной тренировки защищает атомарный
    // захват кулдауна внутри completeSPTraining, а не эта панель.
    return interaction.showModal(createSPTrainingModal(state.slot, style))
      .catch((error) => console.error("SP training modal error:", error));
  }

  let nextPage = Number(state.page || 0);
  if (interaction.customId === SP_STYLE_PREV_ID) {
    nextPage = Math.max(0, nextPage - 1);
  } else if (interaction.customId === SP_STYLE_NEXT_ID) {
    nextPage = Math.min(pageCount - 1, nextPage + 1);
  } else {
    return interaction.deferUpdate().catch(() => {});
  }

  if (nextPage === Number(state.page || 0)) {
    return interaction.deferUpdate().catch(() => {});
  }

  state.page = nextPage;
  const saved = await saveInteractionSession(
    session.message_id,
    session.revision,
    state,
    { ttlMs: TRAIN_SP_SESSION_TTL_MS },
  );
  const effective = saved.success ? saved.session.state : (saved.session?.state || state);
  const view = await renderStylePicker(effective);

  return interaction.update({ components: view.components }).catch(() => {});
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    content: "Это меню выбора стиля открыто для другого игрока.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    content: "Меню выбора стиля больше не активно. Запустите `/train-sp` ещё раз.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

export const trainSpInteractionHandler = {
  namespace: TRAIN_SP_NAMESPACE,
  handleComponent,
  renderForeign,
  renderExpired,
};
