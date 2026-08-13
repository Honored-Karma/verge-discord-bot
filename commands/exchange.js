import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { calculateExchange, CURRENCIES, EXCHANGE_RATE } from "../utils/banking.js";
import {
  createBankStatusComponents,
  createExchangePreviewComponents,
  createExchangeReceiptComponents,
  EXCHANGE_CANCEL_ID,
  EXCHANGE_CONFIRM_ID,
} from "../utils/bankingComponents.js";
import {
  exchangeCurrency,
  getActiveSlot,
  getPlayer,
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

function exchangeError(result, currency) {
  const symbol = CURRENCIES[currency].symbol;
  switch (result.reason) {
    case "insufficient_funds":
      return `На балансе доступно только **${Number(result.available || 0).toLocaleString("ru-RU")} ${symbol}**. Укажите меньшую сумму.`;
    case "balance_changed":
      return "Баланс изменился во время подтверждения. Запустите `/exchange` ещё раз, чтобы получить новый расчёт.";
    case "unsafe_balance":
      return "Баланс слишком велик для безопасного обмена. Обратитесь к администратору.";
    default:
      return "Не удалось провести обмен. Балансы не изменены — попробуйте ещё раз.";
  }
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
        `На балансе доступно **${sourceBalance.toLocaleString("ru-RU")} ${CURRENCIES[currency].symbol}**. Укажите меньшую сумму.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const characterName = player.character_name || player.username;
  const characterAvatarUrl = avatarUrl(player, interaction.user);
  let completed = false;
  let busy = false;
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
  const collector = response.createMessageComponentCollector({
    time: CONFIRMATION_DURATION,
  });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (busy) {
      await componentInteraction.reply({
        content: "Обмен уже обрабатывается.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (componentInteraction.customId === EXCHANGE_CANCEL_ID) {
      completed = true;
      collector.stop("cancelled");
      await componentInteraction.update({
        components: createBankStatusComponents(
          "Обмен отменён",
          "Обе валюты остались на вашем балансе.",
          "neutral",
        ),
      });
      return;
    }
    if (componentInteraction.customId !== EXCHANGE_CONFIRM_ID) return;

    busy = true;
    await componentInteraction.deferUpdate();
    const result = await exchangeCurrency(playerId, currency, calculation.spent);
    completed = true;
    collector.stop(result.success ? "confirmed" : "failed");

    if (!result.success) {
      await interaction.editReply({
        components: createBankStatusComponents(
          "Обмен не выполнен",
          exchangeError(result, currency),
        ),
      });
      return;
    }

    await interaction.editReply({
      components: createExchangeReceiptComponents({
        characterName,
        avatarUrl: characterAvatarUrl,
        result,
      }),
    });
    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: playerId,
      userTag: interaction.user.tag,
      command: "exchange",
      extra: {
        from: result.sourceCurrency,
        to: result.targetCurrency,
        spent: result.spent,
        received: result.received,
        rate: EXCHANGE_RATE,
      },
    });
  });

  collector.on("end", async () => {
    if (completed) return;
    try {
      await interaction.editReply({
        components: createBankStatusComponents(
          "Время подтверждения истекло",
          "Валюты не списаны. Запустите `/exchange` ещё раз, если обмен всё ещё нужен.",
          "warning",
        ),
      });
    } catch {}
  });

  return response;
}
