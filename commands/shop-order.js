import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { isAdmin } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { logCommand } from "../utils/logs.js";
import {
  getShopOrderDetails,
  resolveShopOrder,
} from "../utils/shopStore.js";
import {
  createShopOrderResolutionComponents,
  createShopOrderResolutionReceipt,
  createShopStatusComponents,
  SHOP_ORDER_RESOLVE_CANCEL_ID,
  SHOP_ORDER_RESOLVE_CONFIRM_ID,
} from "../utils/shopComponents.js";

const REVIEW_DURATION = 90 * 1000;

export const data = new SlashCommandBuilder()
  .setName("shop-order")
  .setDefaultMemberPermissions(null)
  .setDescription("[СОТРУДНИК] Обработать оплаченную заявку магазина")
  .setDMPermission(false)
  .addStringOption((option) => option
    .setName("order")
    .setDescription("Номер заявки из уведомления магазина")
    .setMinLength(1)
    .setMaxLength(20)
    .setRequired(true))
  .addStringOption((option) => option
    .setName("action")
    .setDescription("Результат рассмотрения")
    .setRequired(true)
    .addChoices(
      { name: "Предмет выдан", value: "fulfill" },
      { name: "Отклонить и вернуть деньги", value: "reject" },
    ))
  .addStringOption((option) => option
    .setName("reason")
    .setDescription("Комментарий для истории заявки")
    .setMaxLength(500)
    .setRequired(false));

function configuredReviewRoleIds() {
  return ["ANKETOLOG_ROLE_IDS", "ADMIN_ROLE_IDS", "GM_ROLE_IDS"]
    .flatMap((name) => String(process.env[name] || "").split(","))
    .map((id) => id.trim())
    .filter(Boolean);
}

function canReview(member) {
  if (isAdmin(member)) return true;
  const allowed = configuredReviewRoleIds();
  return allowed.length > 0
    && member?.roles?.cache?.some((role) => allowed.includes(role.id));
}

function resolutionError(result) {
  switch (result.reason) {
    case "order_not_found":
      return "Заявка с таким номером не найдена.";
    case "already_resolved":
      return `Заявка уже обработана. Текущий статус: **${result.status || "неизвестен"}**.`;
    case "refund_failed":
      return "Не удалось безопасно вернуть деньги. Статус заявки не изменён; проверьте персонажа и повторите попытку.";
    case "purchase_not_found":
      return "У заявки отсутствует связанная оплата. Перед изменением статуса нужна ручная проверка администратора.";
    default:
      return "Заявку не удалось обработать. Её статус и баланс игрока следует проверить перед повторной попыткой.";
  }
}

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!canReview(member)) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Недостаточно прав",
        "Команда доступна Главе анкетологов, анкетологам, игровым мастерам и администраторам.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const publicId = interaction.options.getString("order", true).trim().toUpperCase();
  const action = interaction.options.getString("action", true);
  const reason = interaction.options.getString("reason")?.trim() || "Причина не указана";
  const details = await getShopOrderDetails(publicId);
  if (!details) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Заявка не найдена",
        "Проверьте номер из уведомления магазина и повторите команду.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (details.status !== "pending_review") {
    return interaction.reply({
      components: createShopStatusComponents(
        "Заявка уже обработана",
        `Текущий статус заявки **${details.publicId}**: **${details.status}**.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const response = await interaction.reply({
    components: createShopOrderResolutionComponents({ details, action, reason }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });
  const collector = response.createMessageComponentCollector({ time: REVIEW_DURATION });
  let completed = false;

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (componentInteraction.customId === SHOP_ORDER_RESOLVE_CANCEL_ID) {
      completed = true;
      collector.stop("cancelled");
      await componentInteraction.update({
        components: createShopStatusComponents(
          "Изменение отменено",
          "Заявка и баланс игрока не изменились.",
          "neutral",
        ),
      });
      return;
    }
    if (componentInteraction.customId !== SHOP_ORDER_RESOLVE_CONFIRM_ID) return;

    completed = true;
    collector.stop("confirmed");
    await componentInteraction.deferUpdate();
    const result = await resolveShopOrder({
      publicId,
      action,
      adminId: interaction.user.id,
      reason,
    });
    if (!result.success) {
      await interaction.editReply({
        components: createShopStatusComponents(
          "Заявка не обработана",
          resolutionError(result),
        ),
      });
      return;
    }

    await interaction.editReply({
      components: createShopOrderResolutionReceipt({ result }),
    });
    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      command: "shop-order",
      targetId: result.userId,
      targetTag: `<@${result.userId}>`,
      extra: {
        order: result.publicId,
        action: result.status,
        item: result.itemName,
        reason,
      },
    });
  });

  collector.on("end", async () => {
    if (completed) return;
    await interaction.editReply({
      components: createShopOrderResolutionComponents({
        details,
        action,
        reason,
        disabled: true,
      }),
    }).catch(() => {});
  });

  return response;
}
