import { MessageFlags } from "discord.js";
import { EXCHANGE_RATE } from "../utils/banking.js";
import { createBankStatusComponents, createExchangeReceiptComponents,
  EXCHANGE_CANCEL_ID, EXCHANGE_CONFIRM_ID, insufficientFundsText } from "../utils/bankingComponents.js";
import { exchangeCurrency } from "../utils/dataManager.js";
import { claimInteractionSession, closeInteractionSession, releaseInteractionSession, SESSION_STATUS } from "../utils/interactionSessions.js";
import { getOperationResult } from "../utils/operations.js";
import { logCommand } from "../utils/logs.js";

export const EXCHANGE_NAMESPACE = "exchange";
export const EXCHANGE_CONFIRM_WINDOW_MS = 90 * 1000;
export const EXCHANGE_SESSION_TTL_MS = 60 * 60 * 1000;
const PRIVATE = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

export function createExchangeSessionState({ playerId, currency, amount, characterName, avatarUrl, now = Date.now() }) {
  return { player_id: playerId, currency, amount, character_name: characterName,
    avatar_url: avatarUrl, deadline_at: now + EXCHANGE_CONFIRM_WINDOW_MS };
}

function receipt(state, result) {
  return createExchangeReceiptComponents({ characterName: state.character_name, avatarUrl: state.avatar_url, result });
}

async function notice(interaction, title, message, state = "warning") {
  const body = { components: createBankStatusComponents(title, message, state), flags: PRIVATE };
  return interaction.deferred || interaction.replied ? interaction.followUp(body) : interaction.reply(body);
}

async function handleComponent({ interaction, session }) {
  if (session.status === SESSION_STATUS.working) return notice(interaction, "Обмен обрабатывается", "Дождитесь квитанции.");
  if (![EXCHANGE_CANCEL_ID, EXCHANGE_CONFIRM_ID].includes(interaction.customId)) return interaction.deferUpdate();
  if (session.state.operation_pending && interaction.customId === EXCHANGE_CANCEL_ID) {
    return notice(interaction, "Результат проверяется", "Повторите подтверждение в этой квитанции, чтобы проверить тот же обмен.");
  }
  const confirming = interaction.customId === EXCHANGE_CONFIRM_ID;
  const claimed = await claimInteractionSession(session.message_id, session.revision, {
    state: { ...session.state, operation_pending: confirming },
  });
  if (!claimed) return notice(interaction, "Квитанция изменилась", "Дождитесь обновления панели.");
  const state = claimed.state;
  const claimOptions = { claimToken: claimed.claim_token };
  if (!confirming) {
    await closeInteractionSession(session.message_id, claimOptions);
    return interaction.update({ components: createBankStatusComponents("Обмен отменён", "Валюты остались на балансе.", "closed") });
  }
  await interaction.deferUpdate();
  let completedResult;
  try {
    const result = await exchangeCurrency(state.player_id, state.currency, state.amount, `exchange:${session.message_id}`);
    if (!result.success) {
      if (result.reason === "error") {
        await releaseInteractionSession(session.message_id, state, claimOptions);
        return notice(interaction, "Результат обмена не подтверждён",
          "Повторите подтверждение в этой квитанции. Оно проверит ту же операцию без повторного списания.");
      }
      await closeInteractionSession(session.message_id, claimOptions);
      const message = result.reason === "insufficient_funds"
        ? `${insufficientFundsText(state.amount, result.available, state.currency)} Откройте /exchange с меньшей суммой.`
        : "Обмен не проведён. Проверьте персонажа и баланс, затем откройте `/exchange` ещё раз.";
      return interaction.editReply({ components: createBankStatusComponents("Обмен не выполнен", message, "error") });
    }
    completedResult = result;
    await closeInteractionSession(session.message_id, claimOptions);
    await interaction.editReply({ components: receipt(state, result) });
    await logCommand({ client: interaction.client, guildId: interaction.guildId,
      channelId: interaction.channelId, userId: state.player_id, userTag: interaction.user.tag,
      command: "exchange", extra: { from: result.sourceCurrency, to: result.targetCurrency,
        spent: result.spent, received: result.received, rate: EXCHANGE_RATE } })
      .catch((error) => console.error("Error logging exchange:", error));
  } catch (error) {
    console.error("Exchange confirmation error:", error);
    if (completedResult) return notice(interaction, "Обмен выполнен",
      "Не удалось обновить квитанцию. Проверьте баланс перед новым обменом.");
    await releaseInteractionSession(session.message_id, state, claimOptions);
    return notice(interaction, "Результат обмена не подтверждён",
      "Повторите подтверждение в этой квитанции, чтобы проверить ту же операцию.");
  }
}

async function renderExpired({ interaction, session }) {
  if (session?.state) {
    const result = await getOperationResult(`exchange:${session.message_id}`);
    if (result?.success) return interaction.reply({ components: receipt(session.state, result), flags: PRIVATE });
  }
  return notice(interaction, "Сессия обмена завершена",
    "Проверьте баланс и откройте `/exchange` для нового расчёта. Открытие команды не списывает валюту.", "expired");
}

export const exchangeInteractionHandler = {
  namespace: EXCHANGE_NAMESPACE, handleComponent, renderExpired,
  renderForeign: ({ interaction }) => notice(interaction, "Это чужая квитанция", "Откройте свой обмен командой `/exchange`.", "unavailable"),
};
