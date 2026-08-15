import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { calculateTransfer, CURRENCIES } from "../utils/banking.js";
import { createBankStatusComponents } from "../utils/bankingComponents.js";
import { getActiveSlot, getPlayer } from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { makePlayerKey } from "../utils/playerKey.js";
import {
  createPaySessionState,
  PAY_NAMESPACE,
  PAY_SESSION_TTL_MS,
  previewPayload,
} from "../interactions/paySession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

function avatarUrl(player, user) {
  const custom = String(player.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
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
  const amount = interaction.options.getInteger("amount");
  const calculation = calculateTransfer(amount);
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

  const state = createPaySessionState({
    senderId,
    recipientId,
    recipientSlot,
    senderName: sender.character_name || sender.username,
    recipientName: recipient.character_name || recipient.username,
    senderAvatarUrl: avatarUrl(sender, interaction.user),
    currency,
    amount,
  });

  const response = await interaction.reply({
    components: previewPayload(state, senderBalance),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const messageId = response?.id || (await interaction.fetchReply()).id;

  const created = await createInteractionSession({
    messageId,
    namespace: PAY_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: PAY_SESSION_TTL_MS,
  });

  if (!created.success) {
    await interaction.editReply({
      components: createBankStatusComponents(
        "Перевод не подготовлен",
        "Не удалось сохранить черновик перевода. Деньги не списаны — повторите `/pay`.",
      ),
    }).catch(() => {});
  }

  return response;
}
