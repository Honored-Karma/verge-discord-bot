import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import {
  createHelpSessionState,
  helpPagesFor,
  HELP_NAMESPACE,
  HELP_SESSION_TTL_MS,
  renderHelp,
} from "../interactions/helpSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Полный список команд бота по разделам")
  .addStringOption((option) => option
    .setName("section")
    .setDescription("Открыть раздел сразу")
    .setRequired(false)
    .addChoices(
      { name: "🚀 Начало", value: "start" },
      { name: "⚡ Развитие", value: "growth" },
      { name: "💳 Экономика", value: "economy" },
      { name: "🛠️ Для персонала", value: "staff" },
    ));

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    return interaction.reply({
      content: `Подождите **${cooldown.remainingFormatted}** перед следующей командой.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const { pages } = helpPagesFor(interaction.client);
  const requested = interaction.options.getString("section");
  const pageId = pages.some((page) => page.id === requested)
    ? requested
    : pages[0]?.id || "start";
  const state = createHelpSessionState({ pageId });

  const response = await interaction.reply({
    components: renderHelp(interaction.client, state),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const messageId = response?.id || (await interaction.fetchReply()).id;
  const created = await createInteractionSession({
    messageId,
    namespace: HELP_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: HELP_SESSION_TTL_MS,
  });

  if (!created.success) {
    console.error("Help session was not stored:", created.reason);
  }

  return response;
}
