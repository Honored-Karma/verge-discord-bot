import { MessageFlags } from "discord.js";
import { calculateTransfer, CURRENCIES } from "../utils/banking.js";
import {
  createBankStatusComponents,
  createPayPreviewComponents,
  createPayReceiptComponents,
  PAY_CANCEL_ID,
  PAY_CONFIRM_ID,
} from "../utils/bankingComponents.js";
import { getPlayer, transferCurrency } from "../utils/dataManager.js";
import {
  claimInteractionSession,
  closeInteractionSession,
  releaseInteractionSession,
  SESSION_STATUS,
} from "../utils/interactionSessions.js";
import { logCommand } from "../utils/logs.js";

export const PAY_NAMESPACE = "pay";

/**
 * The old flow gave 90 seconds because the confirmation lived in a collector.
 * The window is now stored, so it can be generous without becoming unsafe: the
 * balance is re-checked atomically inside transferCurrency at confirm time.
 */
export const PAY_CONFIRM_WINDOW_MS = 15 * 60 * 1000;
export const PAY_SESSION_TTL_MS = 60 * 60 * 1000;

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export function createPaySessionState({
  senderId,
  recipientId,
  recipientSlot,
  senderName,
  recipientName,
  senderAvatarUrl,
  currency,
  amount,
  now = Date.now(),
}) {
  return {
    sender_id: senderId,
    recipient_id: recipientId,
    recipient_slot: recipientSlot,
    sender_name: senderName,
    recipient_name: recipientName,
    sender_avatar_url: senderAvatarUrl,
    currency,
    amount,
    deadline_at: now + PAY_CONFIRM_WINDOW_MS,
  };
}

export function transferError(result, currency) {
  const symbol = CURRENCIES[currency].symbol;
  switch (result.reason) {
    case "insufficient_funds":
      return `На балансе доступно только **${Number(result.available || 0).toLocaleString("ru-RU")} ${symbol}**. Укажите меньшую сумму.`;
    case "recipient_not_found":
      return "Персонаж получателя больше не существует. Перевод не выполнен.";
    case "sender_not_found":
      return "Активный персонаж отправителя больше не существует. Перевод не выполнен.";
    case "below_minimum":
      return "После налога получатель должен получить хотя бы одну единицу валюты.";
    case "unsafe_balance":
      return "Баланс слишком велик для безопасной операции. Обратитесь к администратору.";
    case "balance_changed":
      return "Баланс изменился во время подтверждения. Проверьте сумму и повторите перевод.";
    case "rollback_failed":
      return "Перевод остановлен из-за ошибки синхронизации. Обратитесь к администратору для проверки баланса.";
    default:
      return "Не удалось провести перевод. Балансы не изменены — попробуйте ещё раз.";
  }
}

export function previewPayload(state, senderBalance) {
  return createPayPreviewComponents({
    senderName: state.sender_name,
    senderAvatarUrl: state.sender_avatar_url,
    recipientName: state.recipient_name,
    recipientSlot: state.recipient_slot,
    currency: state.currency,
    calculation: calculateTransfer(state.amount),
    senderBalance,
  });
}

export async function renderPayComponents(state) {
  const sender = await getPlayer(state.sender_id);
  const balance = Number(sender?.[state.currency] || 0);
  return previewPayload(state, balance);
}

async function handleCancel({ interaction, session }) {
  await closeInteractionSession(session.message_id);
  return interaction.update({
    components: createBankStatusComponents(
      "Перевод отменён",
      "Деньги остались на вашем балансе.",
      "neutral",
    ),
  }).catch(() => {});
}

async function handleConfirm({ interaction, session }) {
  const claimed = await claimInteractionSession(session.message_id, session.revision);
  if (!claimed) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Перевод уже обрабатывается",
        "Дождитесь результата текущей операции.",
        "warning",
      ),
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }

  const state = claimed.state;
  const calculation = calculateTransfer(state.amount);
  if (!calculation.valid) {
    await closeInteractionSession(session.message_id);
    return interaction.update({
      components: createBankStatusComponents(
        "Перевод недоступен",
        "После налога получатель должен получить хотя бы одну единицу валюты.",
      ),
    }).catch(() => {});
  }

  await interaction.deferUpdate();

  let transferCompleted = false;
  try {
    const result = await transferCurrency(
      state.sender_id,
      state.recipient_id,
      state.currency,
      calculation.sent,
    );

    if (!result.success) {
      await releaseInteractionSession(session.message_id, state);
      const freshSender = await getPlayer(state.sender_id);
      const freshBalance = Number(freshSender?.[state.currency] || 0);
      const retryable = Number.isSafeInteger(freshBalance)
        && freshBalance >= calculation.sent;
      await interaction.editReply({
        components: retryable
          ? previewPayload(state, freshBalance)
          : createBankStatusComponents(
            "Перевод не выполнен",
            transferError(result, state.currency),
          ),
      });
      await interaction.followUp({
        components: createBankStatusComponents(
          "Перевод не выполнен",
          transferError(result, state.currency),
        ),
        flags: EPHEMERAL_V2,
      }).catch(() => {});
      return;
    }

    transferCompleted = true;
    await closeInteractionSession(session.message_id);
    await interaction.editReply({
      components: createPayReceiptComponents({
        senderName: state.sender_name,
        senderAvatarUrl: state.sender_avatar_url,
        recipientName: state.recipient_name,
        currency: state.currency,
        result,
      }),
    });
    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: state.sender_id,
      userTag: interaction.user.tag,
      command: "pay",
      targetId: state.recipient_id,
      targetTag: state.recipient_name,
      extra: {
        currency: state.currency,
        sent: result.sent,
        tax: result.tax,
        received: result.received,
        mode: result.mode,
      },
    }).catch((error) => console.error("Error logging pay command:", error));
  } catch (error) {
    console.error("Error handling pay confirmation:", error);
    if (transferCompleted) {
      await closeInteractionSession(session.message_id);
      await interaction.followUp({
        components: createBankStatusComponents(
          "Перевод выполнен",
          "Деньги уже переведены, но квитанцию не удалось обновить. Проверьте баланс перед новым переводом.",
          "warning",
        ),
        flags: EPHEMERAL_V2,
      }).catch(() => {});
      return;
    }
    await releaseInteractionSession(session.message_id, state);
    await interaction.editReply({
      components: await renderPayComponents(state),
    }).catch(() => {});
    await interaction.followUp({
      components: createBankStatusComponents(
        "Перевод не выполнен",
        "Не удалось связаться с хранилищем. Баланс не списан — повторите перевод.",
      ),
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }
}

async function handleComponent({ interaction, session }) {
  if (session.status === SESSION_STATUS.working) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Перевод уже обрабатывается",
        "Дождитесь результата текущей операции.",
        "warning",
      ),
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }

  if (interaction.customId === PAY_CANCEL_ID) {
    return handleCancel({ interaction, session });
  }
  if (interaction.customId === PAY_CONFIRM_ID) {
    return handleConfirm({ interaction, session });
  }
  return interaction.deferUpdate().catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    components: createBankStatusComponents(
      "Время подтверждения истекло",
      "Деньги не списаны. Запустите `/pay` ещё раз, если перевод всё ещё нужен.",
      "warning",
    ),
    flags: EPHEMERAL_V2,
  }).catch(() => {});
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    components: createBankStatusComponents(
      "Это чужая квитанция",
      "Подтвердить перевод может только тот, кто его начал.",
      "warning",
    ),
    flags: EPHEMERAL_V2,
  }).catch(() => {});
}

export const payInteractionHandler = {
  namespace: PAY_NAMESPACE,
  handleComponent,
  renderExpired,
  renderForeign,
};
