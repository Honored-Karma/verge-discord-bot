import { createInteractionSession } from "../utils/interactionSessions.js";
import { createExchangeSessionState, EXCHANGE_NAMESPACE, EXCHANGE_SESSION_TTL_MS } from "../interactions/exchangeSession.js";
import { insufficientFundsText } from "../utils/bankingComponents.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { calculateExchange, EXCHANGE_RATE } from "../utils/banking.js";
import {
  createBankStatusComponents,
  createExchangePreviewComponents,
} from "../utils/bankingComponents.js";
import {
  getActiveSlot,
  getPlayer,
} from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { makePlayerKey } from "../utils/playerKey.js";


function avatarUrl(player, user) {
  const custom = String(player.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
}

export const data = new SlashCommandBuilder()
  .setName("exchange")
  .setDescription(`Обменять валюту по курсу 1 YEN = ${EXCHANGE_RATE} KRW`)
  .addStringOption((option) => option
    .setName("currency")
    .setDescription("Какую валюту отдать")
    .setRequired(true)
    .addChoices(
      { name: "KRW → YEN", value: "krw" },
      { name: "YEN → KRW", value: "yen" },
    ))
  .addIntegerOption((option) => option
    .setName("amount")
    .setDescription("Сколько валюты отдать")
    .setMinValue(1)
    .setMaxValue(Number.MAX_SAFE_INTEGER)
    .setRequired(true));

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + cooldown.remaining) / 1000);
    return interaction.reply({
      components: createBankStatusComponents(
        "Подождите перед обменом",
        `Попробуйте снова <t:${retryAt}:R>.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const slot = await getActiveSlot(interaction.user.id);
  const playerId = makePlayerKey(interaction.user.id, slot);
  const currency = interaction.options.getString("currency");
  const calculation = calculateExchange(
    currency,
    interaction.options.getInteger("amount"),
  );
  const player = await getPlayer(playerId);

  if (!player || !calculation.valid) {
    const message = !player
      ? "Создайте персонажа в активном слоте через `/register`."
      : `Для обмена KRW на YEN нужно не меньше **${Math.ceil(EXCHANGE_RATE)} ₩**.`;
    return interaction.reply({
      components: createBankStatusComponents("Обмен недоступен", message),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const sourceBalance = Number(player[currency] || 0);
  if (!Number.isSafeInteger(sourceBalance)) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Обмен недоступен",
        "Баланс имеет некорректное значение. Обратитесь к администратору.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (sourceBalance < calculation.spent) {
    return interaction.reply({
      components: createBankStatusComponents(
        "Недостаточно средств",
        `${insufficientFundsText(calculation.spent, sourceBalance, currency)} Укажите меньшую сумму в /exchange.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const characterName = player.character_name || player.username;
  const characterAvatarUrl = avatarUrl(player, interaction.user);
  const state = createExchangeSessionState({ playerId, currency, amount: calculation.spent, characterName, avatarUrl: characterAvatarUrl });
  const response = await interaction.reply({
    components: createExchangePreviewComponents({
      characterName,
      avatarUrl: characterAvatarUrl,
      calculation,
      sourceBalance,
    }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });
  const messageId = response?.id || (await interaction.fetchReply()).id;
  const created = await createInteractionSession({ messageId, namespace: EXCHANGE_NAMESPACE,
    ownerId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId,
    state, ttlMs: EXCHANGE_SESSION_TTL_MS });
  if (!created.success) await interaction.editReply({ components: createBankStatusComponents(
    "Обмен не подготовлен", "Не удалось сохранить квитанцию. Деньги не списаны. Откройте `/exchange` ещё раз.") });

  return response;
}
