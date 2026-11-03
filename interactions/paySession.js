import { MessageFlags } from "discord.js";
import { calculateTransfer, CURRENCIES } from "../utils/banking.js";
import {
  createBankStatusComponents,
  createPayPreviewComponents,
  createPayReceiptComponents,
  PAY_CANCEL_ID,
  PAY_CONFIRM_ID,
  PAY_AMOUNT_ID,
  createPayAmountModal,
} from "../utils/bankingComponents.js";
import { getPlayer, transferCurrency } from "../utils/dataManager.js";
import {
  claimInteractionSession,
  closeInteractionSession,
  releaseInteractionSession,
  SESSION_STATUS,
} from "../utils/interactionSessions.js";
import { logCommand } from "../utils/logs.js";
import { getOperationResult } from "../utils/operations.js";
import { buildModalCustomId } from "../utils/interactionRouter.js";

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
      return "Не удалось подтвердить результат перевода. Повторите подтверждение в этой квитанции: операция не будет выполнена дважды.";
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
    pending: Boolean(state.operation_pending),
  });
}

export async function renderPayComponents(state) {
  const sender = await getPlayer(state.sender_id);
  const balance = Number(sender?.[state.currency] || 0);
  return previewPayload(state, balance);
}

async function handleCancel({ interaction, session }) {
  const claimed = await claimInteractionSession(session.message_id, session.revision);
  if (!claimed) return interaction.deferUpdate();
  await closeInteractionSession(session.message_id, { claimToken: claimed.claim_token });
  return interaction.update({
    components: createBankStatusComponents(
      "Перевод отменён",
      "Деньги остались на вашем балансе.",
      "neutral",
    ),
  }).catch(() => {});
}

async function handleConfirm({ interaction, session }) {
  const claimed = await claimInteractionSession(session.message_id, session.revision, {
    state: { ...session.state, operation_pending: true },
  });
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
    await closeInteractionSession(session.message_id, { claimToken: claimed.claim_token });
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
      `pay:${session.message_id}`,
    );

    if (!result.success) {
      state.operation_pending = ["error", "operation_unknown", "rollback_failed"].includes(result.reason);
      await releaseInteractionSession(session.message_id, state, { claimToken: claimed.claim_token });
      const freshSender = await getPlayer(state.sender_id);
      const freshBalance = Number(freshSender?.[state.currency] || 0);
      await interaction.editReply({
        components: previewPayload(state, freshBalance),
      });
      await interaction.followUp({
        components: createBankStatusComponents(
          state.operation_pending ? "Результат перевода не подтверждён" : "Перевод не выполнен",
          transferError(result, state.currency),
        ),
        flags: EPHEMERAL_V2,
      }).catch(() => {});
      return;
    }

    transferCompleted = true;
    await closeInteractionSession(session.message_id, { claimToken: claimed.claim_token });
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
      await closeInteractionSession(session.message_id, { claimToken: claimed.claim_token });
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
    await releaseInteractionSession(session.message_id, state, { claimToken: claimed.claim_token });
    await interaction.editReply({
      components: await renderPayComponents(state),
    }).catch(() => {});
    await interaction.followUp({
      components: createBankStatusComponents(
        "Результат перевода не подтверждён",
        "Результат пока не подтверждён. Повторите подтверждение в этой квитанции, чтобы проверить ту же операцию.",
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

  if (session.state.operation_pending && interaction.customId !== PAY_CONFIRM_ID) {
    return interaction.reply({ components: createBankStatusComponents("Результат проверяется",
      "Повторите подтверждение в этой квитанции. Изменить или отменить перевод можно только после проверки результата.", "warning"), flags: EPHEMERAL_V2 });
  }

  if (interaction.customId === PAY_AMOUNT_ID) {
    return interaction.showModal(createPayAmountModal(
      buildModalCustomId(PAY_NAMESPACE, `amount:${session.revision}`, session.message_id),
      session.state.amount, session.state.currency));
  }

  if (interaction.customId === PAY_CANCEL_ID) {
    return handleCancel({ interaction, session });
  }
  if (interaction.customId === PAY_CONFIRM_ID) {
    // A failed Discord edit may leave the previous amount on screen. Refresh
    // that quote first; this click must not execute a different amount.
    if (session.state.quote_pending) return updateDraft({ interaction, session, amount: session.state.amount });
    return handleConfirm({ interaction, session });
  }
  return interaction.deferUpdate().catch(() => {});
}

async function handleModal({ interaction, session, action }) {
  if (action !== `amount:${session.revision}` || session.status !== SESSION_STATUS.open || session.state.operation_pending) {
    return interaction.reply({ components: createBankStatusComponents("Квитанция изменилась",
      "Закройте форму и проверьте текущую квитанцию. Если перевод обрабатывается, дождитесь результата.", "warning"), flags: EPHEMERAL_V2 });
  }
  const input = interaction.fields.getTextInputValue("amount").replace(/\s/g, "");
  const amount = /^\d+$/.test(input) ? Number(input) : NaN;
  if (!calculateTransfer(amount).valid) {
    return interaction.reply({ components: createBankStatusComponents("Проверьте сумму",
      "Введите целое число от 2 в пределах допустимого баланса. Откройте «Изменить сумму» ещё раз."), flags: EPHEMERAL_V2 });
  }
  return updateDraft({ interaction, session, amount });
}

async function updateDraft({ interaction, session, amount }) {
  const state = { ...session.state, amount, quote_pending: true };
  const claimed = await claimInteractionSession(session.message_id, session.revision, { state });
  if (!claimed) return interaction.deferUpdate();
  await interaction.deferUpdate();
  try {
    const components = await renderPayComponents(state);
    await interaction.editReply({ components });
    await releaseInteractionSession(session.message_id, { ...state, quote_pending: false }, { claimToken: claimed.claim_token });
  } catch (error) {
    await releaseInteractionSession(session.message_id, state, { claimToken: claimed.claim_token });
    throw error;
  }
}

async function renderExpired({ interaction, session }) {
  if (session?.message_id && session.state) {
    const result = await getOperationResult(`pay:${session.message_id}`);
    if (result?.success) return interaction.reply({
      components: createPayReceiptComponents({ senderName: session.state.sender_name,
        senderAvatarUrl: session.state.sender_avatar_url, recipientName: session.state.recipient_name,
        currency: session.state.currency, result }), flags: EPHEMERAL_V2,
    }).catch(() => {});
  }
  return interaction.reply({
    components: createBankStatusComponents(
      "Время подтверждения истекло",
      "Откройте новую квитанцию через `/pay`, предварительно проверив баланс и историю предыдущего перевода.",
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
  handleModal,
  renderExpired,
  renderForeign,
};
