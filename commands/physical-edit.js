import { SlashCommandBuilder } from "discord.js";
import {
  editPhysicalStats,
  getActiveSlot,
  getPlayer,
} from "../utils/dataManager.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { createErrorEmbed, createSuccessEmbed } from "../utils/embeds.js";
import {
  checkGlobalCooldown,
  autoDeleteMessageShort,
} from "../utils/cooldowns.js";
import { logCommand } from "../utils/logs.js";
import {
  getPhysicalStatsFromInteraction,
  isValidCharacterUrl,
  makeTargetPlayerId,
  physicalStatsSummary,
} from "../utils/physicalStats.js";

export const data = new SlashCommandBuilder()
  .setName("physical-edit")
  .setDescription("[ПЕРСОНАЛ] Изменить физические показатели персонажа")
  .addUserOption((option) =>
    option.setName("user").setDescription("Игрок").setRequired(true),
  )
  .addNumberOption((option) =>
    option
      .setName("punch_kg")
      .setDescription("Новая сила удара в килограммах")
      .setMinValue(0)
      .setRequired(false),
  )
  .addNumberOption((option) =>
    option
      .setName("lift_kg")
      .setDescription("Новая сила на подъём в килограммах")
      .setMinValue(0)
      .setRequired(false),
  )
  .addNumberOption((option) =>
    option
      .setName("speed_kmh")
      .setDescription("Новая скорость в км/ч")
      .setMinValue(0)
      .setRequired(false),
  )
  .addNumberOption((option) =>
    option
      .setName("stamina_percent")
      .setDescription("Новая стамина в процентах")
      .setMinValue(0)
      .setRequired(false),
  )
  .addNumberOption((option) =>
    option
      .setName("reaction_ms")
      .setDescription("Новая скорость реакции в миллисекундах")
      .setMinValue(0.001)
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("character_url")
      .setDescription("Новая ссылка на анкету или страницу персонажа")
      .setMaxLength(500)
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName("slot")
      .setDescription("Слот персонажа; по умолчанию — активный")
      .setRequired(false)
      .addChoices({ name: "Слот 1", value: 1 }, { name: "Слот 2", value: 2 }),
  );

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!hasCommandPermission(member, "physical-edit")) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Команда доступна анкетологам, модераторам, ГМам и администраторам.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const msg = await interaction.reply({
      content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой.`,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const updates = getPhysicalStatsFromInteraction(interaction);
  if (Object.keys(updates).length === 0) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Нечего изменять",
          "Укажите хотя бы один новый показатель или ссылку на персонажа.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  if (
    Object.hasOwn(updates, "character_url") &&
    !isValidCharacterUrl(updates.character_url)
  ) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Неверная ссылка",
          "Укажите полную ссылку, начинающуюся с `https://` или `http://`.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const requestedSlot = interaction.options.getInteger("slot");
  const slot = requestedSlot ?? (await getActiveSlot(targetUser.id));
  const playerId = makeTargetPlayerId(targetUser.id, slot);
  const player = await getPlayer(playerId);

  if (!player) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Персонаж не найден",
          `В слоте **${slot}** нет персонажа. Сначала зарегистрируйте его через \`/register\`.`,
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const result = await editPhysicalStats(playerId, updates, interaction.user.id);
  if (!result.success) {
    const description =
      result.reason === "not_registered"
        ? "Сначала зарегистрируйте все показатели через `/physical-register`."
        : "Не удалось обновить показатели. Попробуйте снова.";
    const msg = await interaction.reply({
      embeds: [createErrorEmbed("Показатели не обновлены", description)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const updatedPlayer = await getPlayer(playerId);
  const name = player.character_name || player.username;
  const stats = updatedPlayer.physical_stats;
  const msg = await interaction.reply({
    embeds: [
      createSuccessEmbed(
        "Физические показатели обновлены",
        `**${name}** • слот ${slot}\n\n${physicalStatsSummary(stats)}\n\n**Анкета персонажа:** ${stats.character_url}`,
      ),
    ],
    fetchReply: true,
  });
  autoDeleteMessageShort(msg);

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    command: "physical-edit",
    targetId: playerId,
    targetTag: `${name} (слот ${slot}) <@${targetUser.id}>`,
    extra: updates,
  });
}
