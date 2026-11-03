import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { isAdmin } from "../utils/adminCheck.js";
import {
  ANNOUNCE_BUILDER_NAMESPACE,
  ANNOUNCE_BUILDER_TTL_MS,
  createAnnounceComponents,
  createAnnouncePreviewEmbed,
  createAnnounceState,
} from "../interactions/announceSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

export const data = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("Открыть мастер создания и рассылки объявлений")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Получатель в ЛС (необязательно; можно выбрать в мастере)")
      .setRequired(false),
  );

export async function execute(interaction) {
  if (
    !isAdmin(interaction.member) &&
    !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: "❌ У вас нет прав для использования этой команды!",
      flags: MessageFlags.Ephemeral,
    });
  }

  const user = interaction.options.getUser("user");
  const state = createAnnounceState({
    target: user ? "single" : "channel",
    target_user_id: user ? user.id : null,
    target_channel_id: interaction.channelId,
    footer: interaction.guild?.name || "Сервер",
  });

  const embed = createAnnouncePreviewEmbed(state, interaction.guild?.name);
  const components = createAnnounceComponents(state);

  await interaction.reply({
    embeds: [embed],
    components,
    flags: MessageFlags.Ephemeral,
  });

  const response = await interaction.fetchReply();

  await createInteractionSession({
    messageId: response.id,
    namespace: ANNOUNCE_BUILDER_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: ANNOUNCE_BUILDER_TTL_MS,
  });
}
