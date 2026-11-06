import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  blockTrainingChannels,
  extractChannelIds,
  getBlockedTrainingChannels,
  unblockTrainingChannels,
} from "../utils/trainingChannelBlocks.js";
import {
  createErrorEmbed,
} from "../utils/embeds.js";
import { isAdmin } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { logCommand } from "../utils/logs.js";
import { autoDeleteMessageShort } from "../utils/cooldowns.js";

export const data = new SlashCommandBuilder()
  .setName("train-channel-block")
  .setDefaultMemberPermissions(null)
  .setDMPermission(false)
  .setDescription("[АДМИН] Управление запретом тренировок в каналах")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("block")
      .setDescription("Запретить тренировки в одном или нескольких каналах")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Один канал для запрета (выбор из списка)")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("channels")
          .setDescription(
            "Несколько каналов (упоминания через #канал, ID или ссылки через пробел/запятую)",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Причина запрета тренировок")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unblock")
      .setDescription("Снять запрет тренировок с одного или нескольких каналов")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Один канал для снятия запрета")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("channels")
          .setDescription(
            "Несколько каналов (упоминания через #канал, ID или ссылки через пробел/запятую)",
          )
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName("all")
          .setDescription("Снять запрет со ВСЕХ каналов на сервере")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("Список каналов, в которых запрещены тренировки"),
  );

function formatChannelListField(mentions, totalCount) {
  const full = mentions.join("\n");
  if (full.length <= 1024) return full;
  const cutoff = full.lastIndexOf("\n", 950);
  const shown = cutoff > 0 ? full.slice(0, cutoff) : full.slice(0, 950);
  const shownCount = shown.split("\n").length;
  return `${shown}\n*...и ещё ${totalCount - shownCount} каналов.*`;
}

function formatListDescription(lines) {
  const full = lines.join("\n");
  if (full.length <= 4000) return full;
  const cutoff = full.lastIndexOf("\n", 3900);
  const shown = cutoff > 0 ? full.slice(0, cutoff) : full.slice(0, 3900);
  const shownCount = shown.split("\n").length;
  return `${shown}\n\n*...и ещё ${lines.length - shownCount} каналов.*`;
}

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!isAdmin(member)) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещен",
          "Эта команда доступна только администраторам.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({
      embeds: [createErrorEmbed("Ошибка", "Команда доступна только на сервере.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "block") {
    const channelOption = interaction.options.getChannel("channel");
    const channelsString = interaction.options.getString("channels");
    const reason = interaction.options.getString("reason") || null;

    const ids = extractChannelIds(channelOption, channelsString);
    if (ids.length === 0) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Не указаны каналы",
            "Укажите хотя бы один канал в параметре `channel` или перечислите каналы в `channels` (например, `#чат-1 #чат-2`, ID или ссылки через пробел/запятую).",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelsToBlock = [];
    for (const id of ids) {
      let name = null;
      if (channelOption && channelOption.id === id) {
        name = channelOption.name;
      } else {
        const cached = interaction.guild?.channels?.cache?.get(id);
        if (cached) {
          name = cached.name;
        } else if (interaction.guild?.channels?.fetch) {
          try {
            const fetched = await interaction.guild.channels.fetch(id);
            if (fetched) name = fetched.name;
          } catch (_) {}
        }
      }
      channelsToBlock.push({ id, name });
    }

    const result = await blockTrainingChannels({
      guildId,
      channels: channelsToBlock,
      adminId: interaction.user.id,
      reason,
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [createErrorEmbed("Ошибка", result.error || "Не удалось сохранить блокировку.")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelMentions = channelsToBlock.map((c) =>
      c.name ? `<#${c.id}> (\`#${c.name}\`)` : `<#${c.id}>`,
    );

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔒 Запрет тренировок установлен")
      .setDescription(
        `В указанных каналах запрещено проводить любые тренировки (\`/train-ap\`, \`/train-sp\`, \`/social-rp\`).`,
      )
      .addFields(
        {
          name: `📁 Каналы (${channelsToBlock.length})`,
          value: formatChannelListField(channelMentions, channelsToBlock.length),
        },
        {
          name: "📝 Причина",
          value: reason || "Не указана",
          inline: true,
        },
        {
          name: "👮 Администратор",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
      )
      .setTimestamp();

    if (result.updated && result.updated.length > 0 && result.blocked.length > 0) {
      embed.setFooter({
        text: `Новых запретов: ${result.blocked.length}, обновлено существующих: ${result.updated.length}`,
      });
    }

    await interaction.reply({ embeds: [embed] });

    logCommand({
      client: interaction.client,
      guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag || interaction.user.username,
      command: "train-channel-block block",
      extra: {
        channels: ids,
        reason,
        count: ids.length,
      },
    }).catch((e) => console.error("logCommand error in train-channel-block block:", e));
    return;
  }

  if (subcommand === "unblock") {
    const channelOption = interaction.options.getChannel("channel");
    const channelsString = interaction.options.getString("channels");
    const unblockAll = interaction.options.getBoolean("all") || false;

    if (unblockAll) {
      const result = await unblockTrainingChannels({ guildId, all: true });
      if (!result.success) {
        return interaction.reply({
          embeds: [createErrorEmbed("Ошибка", result.error || "Не удалось снять запрет.")],
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Запрет тренировок снят со ВСЕХ каналов")
        .setDescription(
          `Удалено блокировок: **${result.deletedCount}**. Теперь тренировки доступны во всех каналах сервера.`,
        )
        .addFields({
          name: "👮 Администратор",
          value: `<@${interaction.user.id}>`,
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      logCommand({
        client: interaction.client,
        guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag || interaction.user.username,
        command: "train-channel-block unblock all",
        extra: { unblocked_all: true, count: result.deletedCount },
      }).catch((e) => console.error("logCommand error in train-channel-block unblock all:", e));
      return;
    }

    const ids = extractChannelIds(channelOption, channelsString);
    if (ids.length === 0) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Не указаны каналы",
            "Укажите хотя бы один канал в параметре `channel` или `channels`, либо выберите `all: Истина` для снятия запрета со всех каналов.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const result = await unblockTrainingChannels({ guildId, channelIds: ids });
    if (!result.success) {
      return interaction.reply({
        embeds: [createErrorEmbed("Ошибка", result.error || "Не удалось снять запрет.")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelMentions = ids.map((id) => `<#${id}>`);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔓 Запрет тренировок снят")
      .setDescription(
        `Снято запретов: **${result.deletedCount}** из **${ids.length}** запрошенных каналов.`,
      )
      .addFields(
        {
          name: `📁 Каналы`,
          value: formatChannelListField(channelMentions, ids.length),
        },
        {
          name: "👮 Администратор",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logCommand({
      client: interaction.client,
      guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag || interaction.user.username,
      command: "train-channel-block unblock",
      extra: { channels: ids, deleted_count: result.deletedCount },
    }).catch((e) => console.error("logCommand error in train-channel-block unblock:", e));
    return;
  }

  if (subcommand === "list") {
    const list = await getBlockedTrainingChannels(guildId);

    if (list.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📋 Заблокированные каналы для тренировок")
            .setDescription("На данном сервере **нет** заблокированных каналов для тренировок.")
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const lines = list.map((item, idx) => {
      const reasonStr = item.reason ? ` — *«${item.reason}»*` : "";
      const adminStr = item.blocked_by ? ` (автор: <@${item.blocked_by}>)` : "";
      const nameStr = item.channel_name ? ` (\`#${item.channel_name}\`)` : "";
      return `**${idx + 1}.** <#${item.channel_id}>${nameStr}${reasonStr}${adminStr}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`📋 Каналы с запретом тренировок (${list.length})`)
      .setDescription(formatListDescription(lines))
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
