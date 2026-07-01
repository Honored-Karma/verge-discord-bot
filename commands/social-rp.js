import { SlashCommandBuilder } from "discord.js";
import {
  getPlayer,
  addAP,
  getEffectiveAPMultiplier,
} from "../utils/dataManager.js";
import {
  checkCooldown,
  checkGlobalCooldown,
  autoDeleteMessageShort,
  autoDeleteMessageLong,
} from "../utils/cooldowns.js";
import {
  createSocialRPEmbed,
  createErrorEmbed,
  createCooldownEmbed,
} from "../utils/embeds.js";
import { progressBar, getAPProgress } from "../utils/progressBar.js";
import { logCommand } from "../utils/logs.js";
import { makePlayerKey } from "../utils/playerKey.js";

const SOCIALRP_COOLDOWN = 12 * 60 * 60 * 1000;
const SOCIALRP_AP_REWARD = 10;

export const data = new SlashCommandBuilder()
  .setName("social-rp")
  .setDescription(
    "Социальное взаимодействие для получения AP (10 AP, кулдаун 12 часов)",
  )
  .addStringOption((option) =>
    option
      .setName("text")
      .setDescription("Текст взаимодействия")
      .setRequired(true),
  );

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    const msg = await interaction.reply({
      embeds: [createCooldownEmbed("Социальное RP", retryAt)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const userId = interaction.user.id;
  const { getActiveSlot } = await import("../utils/dataManager.js");
  const activeSlot = await getActiveSlot(userId);
  const playerId = makePlayerKey(userId, activeSlot);
  const rpText = interaction.options.getString("text");
  // Логирование текста социалки
  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: playerId,
    userTag: interaction.user.username,
    command: "social-rp",
    extra: { text: rpText },
  });
  let player = await getPlayer(playerId);
  if (!player) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Пустой слот",
          "В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  if (rpText.length < 50) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Текст слишком короткий",
          "Текст должен содержать минимум 50 символов.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const cooldownCheck = checkCooldown(
    player.last_socialrp_timestamp,
    SOCIALRP_COOLDOWN,
  );
  if (cooldownCheck.onCooldown) {
    const retryAt =
      Math.floor(Date.now() / 1000) + Math.ceil(cooldownCheck.remaining / 1000);
    const msg = await interaction.reply({
      embeds: [createCooldownEmbed("Социальное RP", retryAt)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  // Вычисляем множитель ДО начисления — точный, без погрешности Math.round
  const multiplier = getEffectiveAPMultiplier(player);

  const newAP = await addAP(playerId, SOCIALRP_AP_REWARD, "socialrp");

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

  const truncatedText =
    rpText.length > 900 ? rpText.slice(0, 900) + "..." : rpText;

  const embed = createSocialRPEmbed(
    "Взаимодействие завершено!",
    `**📊 Получено AP:**\n` +
      `Базовое значение: **${SOCIALRP_AP_REWARD} AP**\n` +
      `Множитель: **${multiplier}%**\n` +
      `Итого получено: **+${actualAPGained} AP**\n\n` +
      `**Всего AP:** ${newAP}\n` +
      `**Следующее взаимодействие:** <t:${Math.floor((Date.now() + SOCIALRP_COOLDOWN) / 1000)}:R>\n\n` +
      `**Прогресс AP:**\n${progressText}`,
  );
  embed.addFields({ name: "📝 Текст взаимодействия", value: truncatedText });

  if (newAP >= 1000) {
    embed.setDescription(
      embed.data.description + "\n\n🌟 **Олицетворение достигнуто!**",
    );
  }

  const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
  autoDeleteMessageLong(msg);
}
