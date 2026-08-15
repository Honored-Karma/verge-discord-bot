import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { isAdmin } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { resolveShopOrder } from "../utils/shopStore.js";
import {
  claimInteractionSession,
  closeInteractionSession,
  releaseInteractionSession,
} from "../utils/interactionSessions.js";
import { buildModalCustomId } from "../utils/interactionRouter.js";
import { logCommand } from "../utils/logs.js";

export const SHOP_ORDER_NAMESPACE = "shop_order";

// Заявка ждёт решения столько, сколько нужно: сессия не должна истекать раньше,
// чем администратор до неё дойдёт.
export const SHOP_ORDER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ORDER_APPROVE_ID = "shop_order_approve";
export const ORDER_REJECT_ID = "shop_order_reject";
const REJECT_REASON_FIELD = "reason";

const COLOR_PENDING = 0xf59e0b;
const COLOR_APPROVED = 0x22c55e;
const COLOR_REJECTED = 0xef4444;

function money(value, currency) {
  const amount = Number(value || 0).toLocaleString("ru-RU")
    .replace(/\s/g, String.fromCharCode(160));
  return `${amount} ${currency === "krw" ? "₩" : "¥"}`;
}

function clean(value, maxLength = 100) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .replace(/([\\`*_{}[\]()<>#+\-.!|~])/g, "\\$1");
}

export function createOrderSessionState({
  publicId,
  itemName,
  playerId,
  characterName,
  userId,
  price,
  currency,
  delivery,
}) {
  return {
    public_id: publicId,
    item_name: itemName,
    player_id: playerId,
    character_name: characterName,
    user_id: userId,
    price,
    currency,
    delivery,
  };
}

function orderSummary(state) {
  return [
    `## 🧾 Заявка ${clean(state.public_id, 20)}`,
    `**${clean(state.item_name)}** — ${money(state.price, state.currency)}`,
    "",
    `**Покупатель:** <@${state.user_id}> · ${clean(state.character_name || "без имени")}`,
    `-# Персонаж \`${clean(state.player_id, 60)}\` · ${clean(state.delivery || "ручная выдача", 60)}`,
  ].join("\n");
}

/**
 * Панель заявки для админского канала: краткая карточка и две кнопки.
 * Отклонение спрашивает причину — игрок должен понимать, за что вернули деньги.
 */
export function createOrderReviewComponents(state, { messageId = null, disabled = false } = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_PENDING)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(orderSummary(state)))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "-# Деньги уже списаны и вернутся игроку при отказе. Решение может принять любой администратор.",
    ))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(ORDER_APPROVE_ID)
          .setLabel("Выдать")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(ORDER_REJECT_ID)
          .setLabel("Отклонить")
          .setEmoji("✖️")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  // messageId нужен только для сборки customId модалки при повторном рендере.
  void messageId;
  return [container];
}

function createResolutionComponents(state, { result, adminId, reason }) {
  const rejected = result.status === "rejected";
  const decidedAt = Math.floor(Date.now() / 1000);

  const lines = [
    `## ${rejected ? "✖️ Заявка отклонена" : "✅ Заявка выдана"} · ${clean(state.public_id, 20)}`,
    `**${clean(state.item_name)}** — ${money(state.price, state.currency)}`,
    "",
    `**Покупатель:** <@${state.user_id}> · ${clean(state.character_name || "без имени")}`,
    `**Решение:** <@${adminId}> · <t:${decidedAt}:f>`,
  ];

  if (rejected) {
    lines.push(
      "",
      `Игроку возвращено **${money(result.price ?? state.price, result.currency ?? state.currency)}**.`,
      `**Причина:** ${clean(reason, 400)}`,
    );
  } else {
    lines.push("", "Оплата сохранена. У игрока в разделе заявок статус «Выдано».");
  }

  return [
    new ContainerBuilder()
      .setAccentColor(rejected ? COLOR_REJECTED : COLOR_APPROVED)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n"))),
  ];
}

function failureMessage(reason) {
  switch (reason) {
    case "order_not_found":
      return "Заявка не найдена. Возможно, её уже обработали другой командой.";
    case "already_resolved":
      return "Заявка уже обработана — решение принято раньше.";
    case "refund_failed":
      return "Не удалось вернуть деньги игроку. Проверьте баланс вручную и не повторяйте отказ.";
    case "invalid_resolution":
      return "Некорректные данные заявки. Разберите её командой `/shop-order`.";
    default:
      return "Не удалось обработать заявку. Попробуйте ещё раз или используйте `/shop-order`.";
  }
}

/** Право решать — у любого администратора, а не только у автора сообщения. */
async function authorize({ interaction }) {
  const member = await resolveMember(interaction).catch(() => null);
  return isAdmin(member);
}

async function finish({ interaction, session, action, reason }) {
  const claimed = await claimInteractionSession(session.message_id, session.revision);
  if (!claimed) {
    return interaction.reply({
      content: "Заявку уже обрабатывает другой администратор — подождите секунду.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }

  const state = claimed.state;
  const result = await resolveShopOrder({
    publicId: state.public_id,
    action,
    adminId: interaction.user.id,
    reason,
  });

  if (!result.success) {
    await releaseInteractionSession(session.message_id, state);
    return interaction.followUp({
      content: failureMessage(result.reason),
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }

  await closeInteractionSession(session.message_id);

  await interaction.editReply({
    components: createResolutionComponents(state, {
      result,
      adminId: interaction.user.id,
      reason,
    }),
  }).catch((error) => console.error("Order panel update error:", error));

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    command: "shop-order",
    targetId: state.player_id,
    targetTag: state.character_name,
    extra: {
      order: state.public_id,
      action: result.status,
      item: state.item_name,
      reason: action === "reject" ? reason : undefined,
    },
  }).catch((error) => console.error("Error logging order decision:", error));
}

async function handleComponent({ interaction, session }) {
  if (interaction.customId === ORDER_APPROVE_ID) {
    await interaction.deferUpdate();
    return finish({ interaction, session, action: "fulfill", reason: "Выдано администратором" });
  }

  if (interaction.customId === ORDER_REJECT_ID) {
    // Модалка обязана быть первым ответом на нажатие: отложить и потом показать
    // форму нельзя, поэтому здесь нет deferUpdate.
    const modal = new ModalBuilder()
      .setCustomId(buildModalCustomId(SHOP_ORDER_NAMESPACE, "reject", session.message_id))
      .setTitle(`Отказ по заявке ${String(session.state.public_id || "").slice(0, 20)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(REJECT_REASON_FIELD)
            .setLabel("Причина отказа для игрока")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(3)
            .setMaxLength(400)
            .setRequired(true)
            .setPlaceholder("Например: нет сюжетного основания, оформите через анкету"),
        ),
      );
    return interaction.showModal(modal).catch((error) => {
      console.error("Order reject modal error:", error);
    });
  }

  return interaction.deferUpdate().catch(() => {});
}

async function handleModal({ interaction, session, action }) {
  if (action !== "reject") return;

  const reason = interaction.fields.getTextInputValue(REJECT_REASON_FIELD);
  // Правим то самое сообщение с кнопками, а не отвечаем новым.
  await interaction.deferUpdate();
  return finish({ interaction, session, action: "reject", reason });
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    content: "Решение по заявкам принимают только администраторы.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    content: "Эта заявка уже обработана. Актуальный список — `/shop-order`.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

export const shopOrderInteractionHandler = {
  namespace: SHOP_ORDER_NAMESPACE,
  authorize,
  handleComponent,
  handleModal,
  renderForeign,
  renderExpired,
};

export const __testables = { failureMessage, orderSummary, createResolutionComponents };
