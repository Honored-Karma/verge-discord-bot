import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { calculateTransfer, CURRENCIES } from "../utils/banking.js";
import {
  createBankStatusComponents,
  createPayPreviewComponents,
  createPayReceiptComponents,
  PAY_CANCEL_ID,
  PAY_CONFIRM_ID,
} from "../utils/bankingComponents.js";
import {
  getActiveSlot,
  getPlayer,
  transferCurrency,
} from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { logCommand } from "../utils/logs.js";
import { makePlayerKey } from "../utils/playerKey.js";

const CONFIRMATION_DURATION = 90 * 1000;

function avatarUrl(player, user) {
  const custom = String(player.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
}

function transferError(result, currency) {
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
    default:
      return "Не удалось провести перевод. Балансы не изменены — попробуйте ещё раз.";
  }
}

export const data = new SlashCommandBuilder()
  .setName("pay")
  .setDescription("Перевести валюту другому персонажу с налогом 2%")
  .addUserOption((option) => option
    .setName("user")
    .setDescription("Кому перевести валюту")
    .setRequired(true))
  .addStringOption((option) => option
    .setName("currency")
    .setDescription("Валюта перевода")
    .setRequired(true)
    .addChoices(
      { name: "KRW — корейские воны", value: "krw" },
      { name: "YEN — японские йены", value: "yen" },
    ))
  .addIntegerOption((option) => option
    .setName("amount")
    .setDescription("Сумма до вычета налога")
    .setMinValue(2)
    .setMaxValue(Number.MAX_SAFE_INTEGER)
    .setRequired(true))
  .addIntegerOption((option) => option
    .setName("slot")
    .setDescription("Слот получателя — по умолчанию активный")
    .setRequired(false)
    .addChoices(
      { name: "Слот 1", value: 1 },
      { name: "Слот 2", value: 2 },
    ));

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + cooldown.remaining) / 1000);
    return interaction.reply({
      components: createBankStatusComponents(
        "Подождите перед переводом",
        `Попробуйте снова <t:${retryAt}:R>.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const recipientUser = interaction.options.getUser("user");
  if (recipientUser.id === interaction.user.id) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Выберите другого получателя",
        "Между своими персонажами переводить валюту нельзя.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const [senderSlot, defaultRecipientSlot] = await Promise.all([
    getActiveSlot(interaction.user.id),
    getActiveSlot(recipientUser.id),
  ]);
  const recipientSlot = interaction.options.getInteger("slot")
    || defaultRecipientSlot;
  const senderId = makePlayerKey(interaction.user.id, senderSlot);
  const recipientId = makePlayerKey(recipientUser.id, recipientSlot);
  const currency = interaction.options.getString("currency");
  const calculation = calculateTransfer(interaction.options.getInteger("amount"));
  const [sender, recipient] = await Promise.all([
    getPlayer(senderId),
    getPlayer(recipientId),
  ]);

  if (!sender || !recipient || !calculation.valid) {
    const message = !sender
      ? "Создайте персонажа в активном слоте через `/register`."
      : !recipient
        ? `В слоте ${recipientSlot} у ${recipientUser.username} нет персонажа.`
        : "После налога получатель должен получить хотя бы одну единицу валюты.";
    return interaction.reply({
      components: createBankStatusComponents("Перевод недоступен", message),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const senderBalance = Number(sender[currency] || 0);
  if (!Number.isSafeInteger(senderBalance)) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Перевод недоступен",
        "Баланс имеет некорректное значение. Обратитесь к администратору.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (senderBalance < calculation.sent) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Недостаточно средств",
        `На балансе доступно **${senderBalance.toLocaleString("ru-RU")} ${CURRENCIES[currency].symbol}**. Укажите меньшую сумму.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const senderName = sender.character_name || sender.username;
  const recipientName = recipient.character_name || recipient.username;
  const senderAvatarUrl = avatarUrl(sender, interaction.user);
  let completed = false;
  let busy = false;
  const response = await interaction.reply({
    components: createPayPreviewComponents({
      senderName,
      senderAvatarUrl,
      recipientName,
      recipientSlot,
      currency,
      calculation,
      senderBalance,
    }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });
  const collector = response.createMessageComponentCollector({
    time: CONFIRMATION_DURATION,
  });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (busy) {
      await componentInteraction.reply({
        content: "Перевод уже обрабатывается.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (componentInteraction.customId === PAY_CANCEL_ID) {
      completed = true;
      collector.stop("cancelled");
      await componentInteraction.update({
        components: createBankStatusComponents(
          "Перевод отменён",
          "Деньги остались на вашем балансе.",
          "neutral",
        ),
      });
      return;
    }
    if (componentInteraction.customId !== PAY_CONFIRM_ID) return;

    busy = true;
    await componentInteraction.deferUpdate();
    const result = await transferCurrency(
      senderId,
      recipientId,
      currency,
      calculation.sent,
    );
    completed = true;
    collector.stop(result.success ? "confirmed" : "failed");

    if (!result.success) {
      await interaction.editReply({
        components: createBankStatusComponents(
          "Перевод не выполнен",
          transferError(result, currency),
        ),
      });
      return;
    }

    await interaction.editReply({
      components: createPayReceiptComponents({
        senderName,
        senderAvatarUrl,
        recipientName,
        currency,
        result,
      }),
    });
    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: senderId,
      userTag: interaction.user.tag,
      command: "pay",
      targetId: recipientId,
      targetTag: recipientName,
      extra: {
        currency,
        sent: result.sent,
        tax: result.tax,
        received: result.received,
      },
    });
  });

  collector.on("end", async () => {
    if (completed) return;
    try {
      await interaction.editReply({
        components: createBankStatusComponents(
          "Время подтверждения истекло",
          "Деньги не списаны. Запустите `/pay` ещё раз, если перевод всё ещё нужен.",
          "warning",
        ),
      });
    } catch {}
  });

  return response;
}
