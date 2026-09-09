import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { isAdmin } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { createErrorEmbed, createInfoEmbed, createSuccessEmbed } from "../utils/embeds.js";
import { listCatalogItems } from "../utils/itemSystem.js";
import {
  getAllOrganizations,
  getOrganizationByChannelId,
  getOrganizationByKey,
  getOrganizationMissionChannel,
  listOrganizationMissionSettings,
  removeOrganizationMissionChannel,
  setOrganizationMissionChannel,
  verifyChannelPermissions,
} from "../utils/organizationMissionSettings.js";
import {
  createMission,
  getMissionByPublicId,
  listMissions,
  MISSION_ACCESS,
  MISSION_STATUS,
  MISSION_TYPES,
  resolveCustomEmoji,
  setMissionMessageId,
  STATUS_ICONS,
  STATUS_LABELS,
  TYPE_ICONS,
  TYPE_LABELS,
} from "../utils/missionStore.js";
import {
  createCompletionActionRows,
  createCompletionConfirmationEmbed,
  createMissionActionRows,
  createMissionCardEmbed,
} from "../utils/missionComponents.js";
import { isGMOrAdmin, MISSION_NAMESPACE, MISSION_SESSION_TTL_MS } from "../interactions/missionSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";
import { orgRoleKey } from "../utils/orgRoles.js";
import {
  createDraftState,
  createMissionBuilderComponents,
  createMissionBuilderEmbed,
  MISSION_BUILDER_NAMESPACE,
  MISSION_BUILDER_TTL_MS,
} from "../interactions/missionBuilderSession.js";

export const data = new SlashCommandBuilder()
  .setName("mission")
  .setDescription("Управление миссиями и ивентами организаций")
  // ── /mission create ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("[ГМ/АДМИН] Открыть интерактивный мастер создания миссии")
  )
  // ── /mission list ────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Список текущих миссий сервера")
      .addStringOption((opt) =>
        opt
          .setName("organization")
          .setDescription("Фильтр по организации")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("Фильтр по статусу")
          .setRequired(false)
          .addChoices(
            { name: "🟢 Набор", value: MISSION_STATUS.recruiting },
            { name: "⚔️ В процессе", value: MISSION_STATUS.active },
            { name: "🏆 Завершена", value: MISSION_STATUS.completed },
            { name: "❌ Отменена", value: MISSION_STATUS.cancelled }
          )
      )
  )
  // ── /mission info ────────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Подробная информация о миссии")
      .addStringOption((opt) =>
        opt
          .setName("mission_id")
          .setDescription("Публичный ID миссии (например, MSN-A4K9D2)")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  // ── /mission manage ──────────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName("manage")
      .setDescription("[ГМ/АДМИН] Управление миссией")
      .addStringOption((opt) =>
        opt
          .setName("mission_id")
          .setDescription("Публичный ID миссии (например, MSN-A4K9D2)")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  // ── /mission channel (group) ─────────────────────────────────────────────────
  .addSubcommandGroup((group) =>
    group
      .setName("channel")
      .setDescription("[АДМИН] Настройка каналов миссий организаций")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("[АДМИН] Назначить канал миссий для организации")
          .addStringOption((opt) =>
            opt
              .setName("organization")
              .setDescription("Организация из базы данных")
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("Текстовый канал для карточек миссий")
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("[АДМИН] Удалить привязку канала у организации")
          .addStringOption((opt) =>
            opt
              .setName("organization")
              .setDescription("Организация из базы данных")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("[АДМИН] Список всех организаций и привязанных к ним каналов")
      )
  );

/**
 * Autocomplete dispatcher for /mission options.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value || "").trim().toLowerCase();

  // 1. Organization Autocomplete
  if (focused.name === "organization") {
    try {
      const orgs = await getAllOrganizations();
      const filtered = orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(query) ||
          o.key.toLowerCase().includes(query) ||
          o.label.toLowerCase().includes(query)
      );
      return interaction.respond(
        filtered.slice(0, 25).map((o) => ({
          name: o.label || o.name,
          value: o.key,
        }))
      );
    } catch (error) {
      console.error("Error autocompleting organization:", error);
      return interaction.respond([]);
    }
  }

  // 2. Reward Item Autocomplete
  if (focused.name === "reward_item") {
    try {
      const items = listCatalogItems();
      const filtered = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query)
      );
      return interaction.respond(
        filtered.slice(0, 25).map((item) => ({
          name: item.name,
          value: item.name,
        }))
      );
    } catch (error) {
      console.error("Error autocompleting reward item:", error);
      return interaction.respond([]);
    }
  }

  // 3. Mission ID Autocomplete
  if (focused.name === "mission_id") {
    try {
      const missions = await listMissions({
        guildId: interaction.guildId,
        limit: 25,
      });
      const filtered = missions.filter(
        (m) =>
          m.public_id.toLowerCase().includes(query) ||
          m.title.toLowerCase().includes(query)
      );
      return interaction.respond(
        filtered.slice(0, 25).map((m) => ({
          name: `[${m.public_id}] ${m.title}`.slice(0, 100),
          value: m.public_id,
        }))
      );
    } catch (error) {
      console.error("Error autocompleting mission ID:", error);
      return interaction.respond([]);
    }
  }

  return interaction.respond([]);
}

/**
 * Main execution handler for /mission.
 */
export async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const member = await resolveMember(interaction);

  if (group === "channel") {
    return handleChannelGroup(interaction, sub, member);
  }

  if (sub === "create") {
    return handleMissionCreate(interaction, member);
  }

  if (sub === "list") {
    return handleMissionList(interaction);
  }

  if (sub === "info") {
    return handleMissionInfo(interaction);
  }

  if (sub === "manage") {
    return handleMissionManage(interaction, member);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. /mission channel (set, remove, list)
// ─────────────────────────────────────────────────────────────────────────────
async function handleChannelGroup(interaction, sub, member) {
  if (!isAdmin(member)) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Настройка каналов миссий доступна только администраторам."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === "list") {
    const [allOrgs, settings] = await Promise.all([
      getAllOrganizations(),
      listOrganizationMissionSettings({ guildId: interaction.guildId }),
    ]);

    const settingsMap = new Map(settings.map((s) => [s.organization_key, s.channel_id]));

    const lines = allOrgs.map((org) => {
      const channelId = settingsMap.get(org.key);
      const channelText = channelId ? `<#${channelId}>` : "*Канал не назначен*";
      return `• **${org.name}** (\`${org.key}\`) → ${channelText}`;
    });

    return interaction.reply({
      embeds: [
        createInfoEmbed(
          "🏢 Каналы миссий организаций",
          lines.length > 0
            ? lines.join("\n")
            : "В базе данных пока нет зарегистрированных организаций."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === "set") {
    const rawOrg = interaction.options.getString("organization");
    const channel = interaction.options.getChannel("channel");

    const org = await getOrganizationByKey(rawOrg);
    if (!org) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Организация не найдена",
            `Организация **【${rawOrg}】** не найдена в базе данных.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (channel.guildId !== interaction.guildId) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Некорректный канал",
            "Выбранный канал должен находиться на этом же сервере."
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const me = interaction.guild?.members?.me;
    const permCheck = verifyChannelPermissions(channel, me);
    if (!permCheck.ok) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Недостаточно прав у бота",
            `Бот не может использовать канал <#${channel.id}>. Отсутствуют права:\n` +
            permCheck.missing.map((m) => `• ${m}`).join("\n")
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const result = await setOrganizationMissionChannel({
      guildId: interaction.guildId,
      orgKey: org.key,
      orgId: org.id,
      orgName: org.name,
      channelId: channel.id,
      adminId: interaction.user.id,
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [createErrorEmbed("Ошибка базы данных", "Не удалось сохранить привязку канала.")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const threadNotice = permCheck.canCreateThreads
      ? "✅ Право создания публичных веток (threads) проверено."
      : "⚠️ У бота нет права создания веток — миссии будут запускаться без автоматической ветки обсуждения.";

    return interaction.reply({
      embeds: [
        createSuccessEmbed(
          "Канал миссий назначен",
          `Для организации **${org.name}** установлен канал миссий <#${channel.id}>.\n\n${threadNotice}`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === "remove") {
    const rawOrg = interaction.options.getString("organization");
    const org = await getOrganizationByKey(rawOrg);
    const orgKey = org ? org.key : orgRoleKey(rawOrg);

    const result = await removeOrganizationMissionChannel({
      guildId: interaction.guildId,
      orgKey,
      adminId: interaction.user.id,
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Не найдено",
            `Для организации **【${rawOrg}】** не был назначен канал миссий.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [
        createSuccessEmbed(
          "Привязка удалена",
          `Канал миссий для организации **${org?.name || rawOrg}** успешно сброшен.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. /mission create (Интерактивный мастер создания миссии)
// ─────────────────────────────────────────────────────────────────────────────
async function handleMissionCreate(interaction, member) {
  if (!isGMOrAdmin(member)) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Создание миссий доступно только ГМам и администраторам."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Проверяем, привязан ли текущий канал к какой-то организации
  let defaultOrgKey = null;
  let defaultOrgName = null;
  let defaultChannelId = interaction.channelId;
  let defaultAccess = MISSION_ACCESS.open;

  const channelOrgSetting = await getOrganizationByChannelId({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  });

  if (channelOrgSetting) {
    const org = await getOrganizationByKey(channelOrgSetting.organization_key);
    if (org) {
      defaultOrgKey = org.key;
      defaultOrgName = org.name;
      defaultChannelId = channelOrgSetting.channel_id;
      defaultAccess = MISSION_ACCESS.organization;
    }
  }

  const draftState = createDraftState({
    channel_id: defaultChannelId,
    organization_key: defaultOrgKey,
    organization_name: defaultOrgName,
    access: defaultAccess,
  });

  const orgs = await getAllOrganizations();
  const embed = createMissionBuilderEmbed(draftState, interaction.client);

  await interaction.reply({
    embeds: [embed],
    components: createMissionBuilderComponents(draftState, orgs, null, false, interaction.client),
    flags: MessageFlags.Ephemeral,
  });

  const response = await interaction.fetchReply();

  await createInteractionSession({
    messageId: response.id,
    namespace: MISSION_BUILDER_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state: draftState,
    ttlMs: MISSION_BUILDER_TTL_MS,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. /mission list
// ─────────────────────────────────────────────────────────────────────────────
async function handleMissionList(interaction) {
  const rawOrg = interaction.options.getString("organization");
  const status = interaction.options.getString("status");

  const missions = await listMissions({
    guildId: interaction.guildId,
    organizationKey: rawOrg ? orgRoleKey(rawOrg) : null,
    status,
    limit: 20,
  });

  if (missions.length === 0) {
    return interaction.reply({
      embeds: [createInfoEmbed("Миссии", "По заданным критериям миссий не найдено.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = missions.map((m, idx) => {
    const icon = resolveCustomEmoji(TYPE_ICONS[m.type] || "📜", interaction.client);
    const statusIcon = STATUS_ICONS[m.status] || "ℹ️";
    const org = m.organization_name || "Открытая";
    const party = `${m.participants?.length || 0}/${m.max_players}`;
    return `**${idx + 1}.** ${icon} **${m.title}** [\`${m.public_id}\`]\n` +
      `• Организация: ${org} | Статус: ${statusIcon} ${STATUS_LABELS[m.status] || m.status} | Пати: ${party}\n` +
      `• Канал: <#${m.channel_id}>`;
  });

  return interaction.reply({
    embeds: [createInfoEmbed("📋 Миссии сервера", lines.join("\n\n"))],
    flags: MessageFlags.Ephemeral,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. /mission info
// ─────────────────────────────────────────────────────────────────────────────
async function handleMissionInfo(interaction) {
  const publicId = interaction.options.getString("mission_id").trim();
  const mission = await getMissionByPublicId(publicId);

  if (!mission || mission.guild_id !== interaction.guildId) {
    return interaction.reply({
      embeds: [createErrorEmbed("Не найдено", `Миссия с ID \`${publicId}\` не найдена.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = createMissionCardEmbed(mission, interaction.client);
  if (mission.message_id) {
    embed.addFields({
      name: "🔗 Ссылка",
      value: `https://discord.com/channels/${interaction.guildId}/${mission.channel_id}/${mission.message_id}`,
      inline: false,
    });
  }

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. /mission manage
// ─────────────────────────────────────────────────────────────────────────────
async function handleMissionManage(interaction, member) {
  const publicId = interaction.options.getString("mission_id").trim();
  const mission = await getMissionByPublicId(publicId);

  if (!mission || mission.guild_id !== interaction.guildId) {
    return interaction.reply({
      embeds: [createErrorEmbed("Не найдено", `Миссия с ID \`${publicId}\` не найдена.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const isCreator = mission.created_by?.user_id === interaction.user.id;
  if (!isCreator && !isGMOrAdmin(member)) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Управлять этой миссией может только её создатель (ГМ) или администратор."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (mission.status === MISSION_STATUS.completed) {
    return interaction.reply({
      embeds: [createInfoEmbed("Миссия завершена", `Миссия **【${mission.title}】** уже завершена, все награды начислены.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (mission.status === MISSION_STATUS.cancelled) {
    return interaction.reply({
      embeds: [createInfoEmbed("Миссия отменена", `Миссия **【${mission.title}】** была отменена.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Opens GM completion dialog or status review
  const reply = await interaction.reply({
    embeds: [createCompletionConfirmationEmbed(mission)],
    components: createCompletionActionRows(),
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });
  const message = reply?.resource?.message || (await interaction.fetchReply().catch(() => null));

  if (message?.id) {
    await createInteractionSession({
      messageId: message.id,
      namespace: MISSION_NAMESPACE,
      ownerId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      state: {
        public_id: mission.public_id,
        mission_id: mission._id?.toString?.() || mission.public_id,
      },
      ttlMs: MISSION_SESSION_TTL_MS,
    });
  }

  return reply;
}
