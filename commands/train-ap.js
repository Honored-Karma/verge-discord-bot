import { SlashCommandBuilder } from "discord.js";
import {
  getPlayer,
  addAP,
  getEffectiveAPMultiplier,
} from "../utils/dataManager.js";
import {
  checkCooldown,
  validateTrainingText,
  checkGlobalCooldown,
  autoDeleteMessageShort,
  autoDeleteMessageLong,
} from "../utils/cooldowns.js";
import {
  createTrainEmbed,
  createErrorEmbed,
  createCooldownEmbed,
} from "../utils/embeds.js";
import { progressBar, getAPProgress } from "../utils/progressBar.js";
import { logCommand } from "../utils/logs.js";
import { makePlayerKey } from "../utils/playerKey.js";

const TRAIN_COOLDOWN = 5 * 60 * 60 * 1000; // 5 часов
const TRAIN_AP_REWARD = 10;

export const data = new SlashCommandBuilder()
  .setName("train-ap")
  .setDescription(
    "Физическая тренировка — получить AP (мин. 800 символов, кулдаун 5 часов)",
  )
  .addStringOption((option) =>
    option
      .setName("text")
      .setDescription("Текст тренировки (минимум 800 символов)")
      .setRequired(true)
      .setMaxLength(4000),
  );

export async function execute(interaction) {
  // Глобальный кулдаун (анти-спам 3с)
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    const msg = await interaction.reply({
      embeds: [createCooldownEmbed("Тренировка AP", retryAt)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const userId = interaction.user.id;
  const { getActiveSlot } = await import("../utils/dataManager.js");
  const activeSlot = await getActiveSlot(userId);
  const playerId = makePlayerKey(userId, activeSlot);
  const username = interaction.user.username;
  const trainingText = interaction.options.getString("text");

  // Логируем команду
  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: playerId,
    userTag: username,
    command: "train-ap",
    extra: { text: trainingText },
  });

  // Проверяем наличие персонажа
  const player = await getPlayer(playerId);
  if (!player) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Пустой слот",
          "В этом слоте нет персонажа. Используйте `/register`, чтобы создать нового персонажа.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  // Валидация текста тренировки (мин. 800 символов, не спам)
  const validation = validateTrainingText(trainingText);
  if (!validation.valid) {
    const msg = await interaction.reply({
      embeds: [createErrorEmbed("Текст не прошёл проверку", validation.reason)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  // Проверяем кулдаун тренировки AP
  const cooldownCheck = checkCooldown(
    player.last_train_timestamp,
    TRAIN_COOLDOWN,
  );
  if (cooldownCheck.onCooldown) {
    const retryAt =
      Math.floor(Date.now() / 1000) + Math.ceil(cooldownCheck.remaining / 1000);
    const msg = await interaction.reply({
      embeds: [createCooldownEmbed("Тренировка AP", retryAt)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  // Вычисляем эффективный множитель ДО начисления (те же данные, что использует addAP)
  // Важно: не обратное вычисление — оно даёт неверный результат из-за Math.round в addAP
  const multiplier = getEffectiveAPMultiplier(player);

  // Начисляем AP
  const newAP = await addAP(playerId, TRAIN_AP_REWARD, "train");
  if (newAP === false) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed("Ошибка", "Не удалось добавить AP. Попробуйте снова."),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const actualAPGained = Math.max(0, newAP - (player.ap || 0));

  const apProgress = getAPProgress(newAP);
  const progressText = progressBar(apProgress.current, apProgress.max, 20);

  // Обрезаем текст тренировки для embed (макс. 1000 символов)
  const truncatedText =
    trainingText.length > 1000
      ? trainingText.slice(0, 1000) + "..."
      : trainingText;

  const embed = createTrainEmbed(
    "Тренировка AP завершена!",
    `**<:AP28112025:1443994380670337245> Получено AP:**\n` +
      `Базовое значение: **${TRAIN_AP_REWARD} AP**\n` +
      `Множитель: **${multiplier}%**\n` +
      `Итого получено: **+${actualAPGained} AP**\n\n` +
      `**Всего AP:** ${newAP}\n` +
      `**Следующая тренировка AP:** <t:${Math.floor((Date.now() + TRAIN_COOLDOWN) / 1000)}:R>\n\n` +
      `**Прогресс AP:**\n${progressText}`,
  );

  embed.addFields({ name: "📝 Текст тренировки", value: truncatedText });

  if (newAP >= 1000) {
    embed.setDescription(
      embed.data.description + "\n\n🌟 **Олицетворение достигнуто!**",
    );
  }

  const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
  autoDeleteMessageLong(msg);
}
