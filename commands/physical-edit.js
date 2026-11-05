import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  getActiveSlot,
  getPlayer,
} from "../utils/dataManager.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { createErrorEmbed } from "../utils/embeds.js";
import {
  checkGlobalCooldown,
} from "../utils/cooldowns.js";
import { makeTargetPlayerId } from "../utils/physicalStats.js";
import {
  createPhysicalStatsComponents,
  createPhysicalStatsEmbed,
  createPhysicalStatsState,
  PHYSICAL_STATS_NAMESPACE,
  PHYSICAL_STATS_TTL_MS,
} from "../interactions/physicalStatsSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

export const data = new SlashCommandBuilder()
  .setName("physical-edit")
  .setDefaultMemberPermissions(null)
  .setDMPermission(false)
  .setDescription("[ПЕРСОНАЛ] Изменить физические показатели персонажа")
  .addUserOption((option) =>
    option.setName("user").setDescription("Игрок").setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("slot")
      .setDescription("Слот персонажа; по умолчанию — активный")
      .setRequired(false)
      .addChoices(
        { name: "Слот 1", value: 1 },
        { name: "Слот 2", value: 2 },
        { name: "Слот 3", value: 3 },
      ),
  );

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!hasCommandPermission(member, "physical-edit")) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Команда доступна анкетологам, ГМам и администраторам.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    return interaction.reply({
      content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const targetUser = interaction.options.getUser("user", true);
  const requestedSlot = interaction.options.getInteger("slot");
  const slot = requestedSlot ?? (await getActiveSlot(targetUser.id));
  const playerId = makeTargetPlayerId(targetUser.id, slot);

  const player = await getPlayer(playerId);
  if (!player) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Персонаж не найден",
          `В слоте **${slot}** нет персонажа у <@${targetUser.id}>. Сначала зарегистрируйте его через \`/register\`.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!player.physical_stats) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Показатели не зарегистрированы",
          `У персонажа **${player.character_name || targetUser.username}** ещё не зарегистрированы физические показатели.\nИспользуйте команду \`/physical-register\`.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const existingStats = player.physical_stats || {};

  const state = createPhysicalStatsState({
    mode: "edit",
    target_user_id: targetUser.id,
    target_username: targetUser.username,
    slot,
    player_id: playerId,
    character_name: player.character_name || targetUser.username,
    character_avatar: player.character_avatar || null,
    stats: {
      punch_strength_kg: existingStats.punch_strength_kg ?? null,
      lifting_strength_kg: existingStats.lifting_strength_kg ?? null,
      speed_kmh: existingStats.speed_kmh ?? null,
      stamina_percent: existingStats.stamina_percent ?? null,
      reaction_ms: existingStats.reaction_ms ?? null,
      character_url: existingStats.character_url ?? null,
    },
  });

  const embed = createPhysicalStatsEmbed(state);
  const components = createPhysicalStatsComponents(state);

  await interaction.reply({
    embeds: [embed],
    components,
    flags: MessageFlags.Ephemeral,
  });

  const response = await interaction.fetchReply();

  await createInteractionSession({
    messageId: response.id,
    namespace: PHYSICAL_STATS_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: PHYSICAL_STATS_TTL_MS,
  });
}
