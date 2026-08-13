import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getActiveSlot, getLeaderboardPage } from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import {
  createLeaderboardComponents,
  createLeaderboardCooldownComponents,
  createLeaderboardEmptyComponents,
  createLeaderboardErrorComponents,
  LEADERBOARD_METRIC_PREFIX,
  LEADERBOARD_METRICS,
  LEADERBOARD_NEXT_ID,
  LEADERBOARD_PREV_ID,
  LEADERBOARD_REFRESH_ID,
} from "../utils/leaderboardComponents.js";
import { makePlayerKey } from "../utils/playerKey.js";

const SESSION_DURATION = 3 * 60 * 1000;

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

  let metric = interaction.options.getString("sort_by") || "ap";
  const pageSize = interaction.options.getInteger("limit") || 10;
  const activeSlot = await getActiveSlot(interaction.user.id);
  const playerId = makePlayerKey(interaction.user.id, activeSlot);
  let page = 0;
  let snapshot;
  let finished = false;
  let busy = false;

  const loadSnapshot = async () => {
    let next = await getLeaderboardPage(metric, playerId, page, pageSize);
    if (!next.error && next.total > 0 && page >= next.totalPages) {
      page = next.totalPages - 1;
      next = await getLeaderboardPage(metric, playerId, page, pageSize);
    }
    return next;
  };

  snapshot = await loadSnapshot();
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
    components: createLeaderboardComponents({ snapshot, playerId }),
    flags: MessageFlags.IsComponentsV2,
    fetchReply: true,
  });
  const collector = response.createMessageComponentCollector({
    time: SESSION_DURATION,
  });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({
        content: "Это меню рейтинга открыто для другого игрока.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (busy) {
      await componentInteraction.reply({
        content: "Рейтинг уже обновляется.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const requestedMetric = componentInteraction.customId.startsWith(
      LEADERBOARD_METRIC_PREFIX,
    )
      ? componentInteraction.customId.slice(LEADERBOARD_METRIC_PREFIX.length)
      : null;
    if (requestedMetric && !LEADERBOARD_METRICS[requestedMetric]) return;

    if (requestedMetric) {
      metric = requestedMetric;
      page = 0;
    } else if (componentInteraction.customId === LEADERBOARD_PREV_ID) {
      page = Math.max(0, page - 1);
    } else if (componentInteraction.customId === LEADERBOARD_NEXT_ID) {
      page = Math.min(snapshot.totalPages - 1, page + 1);
    } else if (componentInteraction.customId !== LEADERBOARD_REFRESH_ID) {
      return;
    }

    busy = true;
    await componentInteraction.deferUpdate();
    snapshot = await loadSnapshot();
    busy = false;

    if (snapshot.error) {
      finished = true;
      collector.stop("error");
      await interaction.editReply({
        components: createLeaderboardErrorComponents(),
      });
      return;
    }
    if (snapshot.total === 0) {
      finished = true;
      collector.stop("empty");
      await interaction.editReply({
        components: createLeaderboardEmptyComponents(),
      });
      return;
    }

    await interaction.editReply({
      components: createLeaderboardComponents({ snapshot, playerId }),
    });
  });

  collector.on("end", async () => {
    if (finished) return;
    try {
      await interaction.editReply({
        components: createLeaderboardComponents({
          snapshot,
          playerId,
          disabled: true,
        }),
      });
    } catch {}
  });

  return response;
}
