import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getActiveSlot } from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import {
  createLeaderboardCooldownComponents,
  createLeaderboardEmptyComponents,
  createLeaderboardErrorComponents,
} from "../utils/leaderboardComponents.js";
import { makePlayerKey } from "../utils/playerKey.js";
import {
  createLeaderboardSessionState,
  LEADERBOARD_NAMESPACE,
  LEADERBOARD_SESSION_TTL_MS,
  loadLeaderboardSnapshot,
  renderLeaderboardComponents,
} from "../interactions/leaderboardSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Открыть интерактивный рейтинг персонажей")
  .addStringOption((option) => option
    .setName("sort_by")
    .setDescription("Какая вкладка откроется первой")
    .setRequired(false)
    .addChoices(
      { name: "AP — сверхъестественный прогресс", value: "ap" },
      { name: "SP — мастерство стилей", value: "sp" },
      { name: "KRW — баланс вон", value: "krw" },
      { name: "YEN — баланс йен", value: "yen" },
    ))
  .addIntegerOption((option) => option
    .setName("limit")
    .setDescription("Персонажей на странице — от 5 до 15")
    .setMinValue(5)
    .setMaxValue(15)
    .setRequired(false));

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    return interaction.reply({
      components: createLeaderboardCooldownComponents(retryAt),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const activeSlot = await getActiveSlot(interaction.user.id);
  const state = createLeaderboardSessionState({
    metric: interaction.options.getString("sort_by") || "ap",
    pageSize: interaction.options.getInteger("limit") || 10,
    playerId: makePlayerKey(interaction.user.id, activeSlot),
  });

  const { snapshot, page } = await loadLeaderboardSnapshot(state);
  state.page = page;

  if (snapshot.error) {
    return interaction.reply({
      components: createLeaderboardErrorComponents(),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (snapshot.total === 0) {
    return interaction.reply({
      components: createLeaderboardEmptyComponents(),
      flags: MessageFlags.IsComponentsV2,
    });
  }

  const response = await interaction.reply({
    components: renderLeaderboardComponents(snapshot, state),
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });

  const messageId = response?.id || (await interaction.fetchReply()).id;

  const created = await createInteractionSession({
    messageId,
    namespace: LEADERBOARD_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: LEADERBOARD_SESSION_TTL_MS,
  });

  // Панель без сессии осталась бы нерабочей — честнее сказать об этом сразу.
  if (!created.success) {
    await interaction.editReply({
      components: createLeaderboardErrorComponents(),
    }).catch(() => {});
  }

  return response;
}
