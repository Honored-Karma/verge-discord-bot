import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  createMission,
  MISSION_ACCESS,
  MISSION_EMOJIS,
  MISSION_TYPES,
  parseOptionEmoji,
  resolveCustomEmoji,
  setMissionMessageId,
  setMissionThreadId,
  TYPE_FALLBACK_ICONS,
  TYPE_ICONS,
  TYPE_LABELS,
} from "../utils/missionStore.js";
import {
  createMissionActionRows,
  createMissionCardEmbed,
} from "../utils/missionComponents.js";
import {
  isGMOrAdmin,
  MISSION_NAMESPACE,
  MISSION_SESSION_TTL_MS,
} from "./missionSession.js";
import {
  getAllOrganizations,
  getOrganizationByKey,
  getOrganizationMissionChannel,
  verifyChannelPermissions,
} from "../utils/organizationMissionSettings.js";
import {
  closeInteractionSession,
  createInteractionSession,
  getInteractionSession,
  releaseInteractionSession,
} from "../utils/interactionSessions.js";
import { buildModalCustomId } from "../utils/interactionRouter.js";
import {
  formatRankRequirement,
  normalizeRank,
  RANK_REQUIREMENT_OPTIONS,
} from "../utils/rankSystem.js";

export const MISSION_BUILDER_NAMESPACE = "mission_builder";
export const MISSION_BUILDER_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа

// Custom IDs компонентов
export const MB_SELECT_TYPE = "mb_select_type";
export const MB_SELECT_RANK = "mb_select_rank";
export const MB_SELECT_ACCESS = "mb_select_access";
export const MB_SELECT_ORG = "mb_select_org";
export const MB_SELECT_CHANNEL = "mb_select_channel";

export const MB_BTN_MAIN = "mb_btn_main";
export const MB_BTN_REWARDS = "mb_btn_rewards";
export const MB_BTN_MEDIA = "mb_btn_media";
export const MB_BTN_PUBLISH = "mb_btn_publish";
export const MB_BTN_CANCEL = "mb_btn_cancel";

// Custom IDs полей ввода модалок
export const MB_INPUT_TITLE = "mb_input_title";
export const MB_INPUT_PLAYERS = "mb_input_players";
export const MB_INPUT_CHANNEL = "mb_input_channel";
export const MB_INPUT_DESC = "mb_input_desc";

export const MB_INPUT_AP = "mb_input_ap";
export const MB_INPUT_SP = "mb_input_sp";
export const MB_INPUT_REP = "mb_input_rep";
export const MB_INPUT_ITEM = "mb_input_item";
export const MB_INPUT_QTY = "mb_input_qty";

export const MB_INPUT_IMAGE = "mb_input_image";
export const MB_INPUT_THUMBNAIL = "mb_input_thumbnail";

export const ACCESS_LABELS = {
  [MISSION_ACCESS.open]: "🌐 Открытая для всех",
  [MISSION_ACCESS.organization]: "🏢 Только организация",
  [MISSION_ACCESS.invited]: "✉️ Приглашённые",
};

export function formatAccess(access) {
  return ACCESS_LABELS[access] || ACCESS_LABELS[MISSION_ACCESS.open];
}

/**
 * Создаёт начальное состояние черновика миссии
 */
export function createDraftState({
  title = "",
  description = "",
  type = MISSION_TYPES.well,
  access = MISSION_ACCESS.open,
  min_rank = null,
  max_players = 5,
  organization_key = null,
  organization_name = null,
  channel_id = null,
  reward = null,
  image_url = null,
  thumbnail_url = null,
} = {}) {
  return {
    title: String(title || "").slice(0, 100),
    description: String(description || "").slice(0, 1000),
    type: Object.values(MISSION_TYPES).includes(type) ? type : MISSION_TYPES.well,
    access: Object.values(MISSION_ACCESS).includes(access) ? access : MISSION_ACCESS.open,
    min_rank: min_rank && String(min_rank).toLowerCase() !== "none" ? normalizeRank(min_rank) : null,
    max_players: Math.max(1, Math.min(50, Number(max_players) || 5)),
    organization_key: organization_key ? String(organization_key) : null,
    organization_name: organization_name ? String(organization_name) : null,
    channel_id: channel_id ? String(channel_id) : null,
    image_url: image_url ? String(image_url).trim().slice(0, 500) : null,
    thumbnail_url: thumbnail_url ? String(thumbnail_url).trim().slice(0, 500) : null,
    reward: {
      ap: Math.max(0, Number(reward?.ap) || 0),
      sp: Math.max(0, Number(reward?.sp) || 0),
      reputation: Math.max(0, Number(reward?.reputation) || 0),
      item_name: String(reward?.item_name || "").slice(0, 100),
      item_qty: Math.max(1, Number(reward?.item_qty) || 1),
    },
  };
}

/**
 * Генерирует Embed превью черновика миссии
 */
export function createMissionBuilderEmbed(state, client = null) {
  const rawTypeIcon = TYPE_ICONS[state.type] || "🌀";
  const typeIcon = resolveCustomEmoji(rawTypeIcon, client);
  const typeLabel = TYPE_LABELS[state.type] || state.type;
  const partyIcon = resolveCustomEmoji(MISSION_EMOJIS.party, client);
  const rewardIcon = resolveCustomEmoji(MISSION_EMOJIS.rewards, client);

  const orgText = state.organization_name
    ? `**${state.organization_name}**`
    : "*Без организации (открытая)*";
  const channelText = state.channel_id
    ? `<#${state.channel_id}>`
    : "*Текущий канал*";

  const rewards = [];
  if (state.reward?.ap > 0) rewards.push(`⚡ AP: **+${state.reward.ap}**`);
  if (state.reward?.sp > 0) rewards.push(`💠 SP: **+${state.reward.sp}**`);
  if (state.reward?.reputation > 0) rewards.push(`🎖️ Репутация: **+${state.reward.reputation}**`);
  if (state.reward?.item_name) {
    rewards.push(`📦 Предмет: **${state.reward.item_name}** × ${state.reward.item_qty || 1} шт.`);
  }
  const rewardText = rewards.length > 0 ? rewards.join("\n") : "*Награды не назначены*";

  const descriptionText = state.description?.trim()
    ? state.description.trim()
    : "*(Описание не заполнено — нажмите кнопку 【📝 Основное】 ниже)*";

  const mediaLines = [];
  if (state.image_url) mediaLines.push(`• Баннер: [Открыть арт](${state.image_url})`);
  if (state.thumbnail_url) mediaLines.push(`• Значок: [Открыть лого](${state.thumbnail_url})`);
  const mediaText = mediaLines.length > 0 ? mediaLines.join("\n") : "*Не заданы (кнопка 【🖼️ Обложка】)*";

  const rankRequirementText = formatRankRequirement(state.min_rank);

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("🛠️ Мастер создания миссии · Черновик")
    .setDescription(
      `Заполните параметры миссии с помощью выпадающих списков и модальных окон ввода, затем нажмите **【🚀 Опубликовать】**.\n\n` +
      `**📌 Название:** ${state.title ? `**${state.title}**` : "*(не указано — заполните через 【📝 Основное】)*"}\n` +
      `**Тип миссии:** ${typeIcon} ${typeLabel}\n` +
      `**🎖️ Требуемый ранг:** **${rankRequirementText}**\n` +
      `**🌐 Доступ:** ${formatAccess(state.access)}\n` +
      `**🏢 Организация:** ${orgText}\n` +
      `**📢 Канал публикации:** ${channelText}\n` +
      `**${partyIcon} Лимит участников:** ${state.max_players} чел.\n\n` +
      `**📜 Описание и вводная:**\n${descriptionText}\n\n` +
      `**${rewardIcon} Награды:**\n${rewardText}\n\n` +
      `**🖼️ Изображения / Арт:**\n${mediaText}`
    )
    .setFooter({
      text: "Кнопки 【📝 Основное】, 【🎁 Награды】 и 【🖼️ Обложка】 вызывают всплывающие окна ввода текста.",
    });

  if (state.image_url?.trim()) {
    try {
      new URL(state.image_url.trim());
      embed.setImage(state.image_url.trim());
    } catch {}
  }

  if (state.thumbnail_url?.trim()) {
    try {
      new URL(state.thumbnail_url.trim());
      embed.setThumbnail(state.thumbnail_url.trim());
    } catch {}
  }

  return embed;
}

/**
 * Создаёт компоненты интерфейса мастера (до 5 Action Rows)
 */
export function createMissionBuilderComponents(state, orgs = [], messageId = null, disabled = false, client = null) {
  // Row 1: Выбор типа миссии
  const typeMenu = new StringSelectMenuBuilder()
    .setCustomId(MB_SELECT_TYPE)
    .setPlaceholder("Тип миссии")
    .setDisabled(disabled)
    .addOptions(
      Object.entries(MISSION_TYPES).map(([k, val]) => ({
        label: TYPE_LABELS[val] || val,
        value: val,
        emoji: parseOptionEmoji(resolveCustomEmoji(TYPE_ICONS[val], client), TYPE_FALLBACK_ICONS[val]),
        default: state.type === val,
      }))
    );

  // Row 2: Выбор минимального ранга для входа (сначала корейские, затем японские)
  const currentRank = state.min_rank ? normalizeRank(state.min_rank) : "none";
  const rankMenu = new StringSelectMenuBuilder()
    .setCustomId(MB_SELECT_RANK)
    .setPlaceholder("Минимальный ранг для входа")
    .setDisabled(disabled)
    .addOptions(
      RANK_REQUIREMENT_OPTIONS.map((opt) => ({
        label: opt.label,
        value: opt.value,
        emoji: opt.emoji,
        description: opt.description,
        default: opt.value === currentRank,
      }))
    );

  // Row 3: Выбор доступа
  const accessMenu = new StringSelectMenuBuilder()
    .setCustomId(MB_SELECT_ACCESS)
    .setPlaceholder("Доступ к миссии")
    .setDisabled(disabled)
    .addOptions([
      {
        label: "Открытая для всех",
        value: MISSION_ACCESS.open,
        emoji: "🌐",
        description: "Участвовать может любой персонаж",
        default: state.access === MISSION_ACCESS.open,
      },
      {
        label: "Только организация",
        value: MISSION_ACCESS.organization,
        emoji: "🏢",
        description: "Участвовать могут только члены организации",
        default: state.access === MISSION_ACCESS.organization,
      },
      {
        label: "Приглашённые",
        value: MISSION_ACCESS.invited,
        emoji: "✉️",
        description: "Вход по приглашению создателя",
        default: state.access === MISSION_ACCESS.invited,
      },
    ]);

  // Row 4: Выбор организации
  const orgOptions = [
    {
      label: "Без организации",
      value: "none",
      emoji: "🌐",
      description: "Общая или нейтральная миссия",
      default: !state.organization_key,
    },
  ];

  for (const org of orgs.slice(0, 24)) {
    orgOptions.push({
      label: org.name.slice(0, 100),
      value: org.key,
      emoji: "🏢",
      default: state.organization_key === org.key,
    });
  }

  const orgMenu = new StringSelectMenuBuilder()
    .setCustomId(MB_SELECT_ORG)
    .setPlaceholder("Привязка к организации")
    .setDisabled(disabled)
    .addOptions(orgOptions);

  // Row 5: Кнопки действий
  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MB_BTN_MAIN)
      .setLabel("Основное")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MB_BTN_REWARDS)
      .setLabel("Награды")
      .setEmoji("🎁")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MB_BTN_MEDIA)
      .setLabel("Обложка")
      .setEmoji("🖼️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MB_BTN_PUBLISH)
      .setLabel("Опубликовать")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MB_BTN_CANCEL)
      .setLabel("Отмена")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  return [
    new ActionRowBuilder().addComponents(typeMenu),
    new ActionRowBuilder().addComponents(rankMenu),
    new ActionRowBuilder().addComponents(accessMenu),
    new ActionRowBuilder().addComponents(orgMenu),
    buttonsRow,
  ];
}

/**
 * Создаёт модалку ввода основной информации (название, лимит, описание)
 */
export function createMainInfoModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(MISSION_BUILDER_NAMESPACE, "main", messageId))
    .setTitle("Основная информация миссии");

  const titleInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_TITLE)
    .setLabel("Название миссии")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(true)
    .setPlaceholder("Например: Зачистка аномальной скважины");

  if (state.title && state.title.trim()) {
    titleInput.setValue(state.title.trim());
  }

  const playersInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_PLAYERS)
    .setLabel("Лимит участников (1–50)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true)
    .setPlaceholder("5")
    .setValue(String(state.max_players || 5));

  const channelInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_CHANNEL)
    .setLabel("Канал публикации (#канал, ID или пусто)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Оставьте пустым для публикации в текущем канале");

  if (state.channel_id && /^\d{17,20}$/.test(state.channel_id)) {
    channelInput.setValue(String(state.channel_id));
  }

  const descInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_DESC)
    .setLabel("Описание / Цель миссии")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(1000)
    .setRequired(true)
    .setPlaceholder("Краткая цель, условия или сюжетная вводная для участников…");

  if (state.description && state.description.trim()) {
    descInput.setValue(state.description.trim());
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(playersInput),
    new ActionRowBuilder().addComponents(channelInput),
    new ActionRowBuilder().addComponents(descInput)
  );

  return modal;
}

/**
 * Создаёт модалку ввода наград (AP, SP, Rtg, Предмет, Количество)
 */
export function createRewardsModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(MISSION_BUILDER_NAMESPACE, "rewards", messageId))
    .setTitle("Награды за миссию");

  const apInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_AP)
    .setLabel("Награда AP (0 или положительное число)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("0");

  if (state.reward?.ap !== undefined && state.reward?.ap !== null && Number(state.reward.ap) > 0) {
    apInput.setValue(String(state.reward.ap));
  }

  const spInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_SP)
    .setLabel("Награда SP (0 или положительное число)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("0");

  if (state.reward?.sp !== undefined && state.reward?.sp !== null && Number(state.reward.sp) > 0) {
    spInput.setValue(String(state.reward.sp));
  }

  const repInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_REP)
    .setLabel("Награда репутации Rtg (0 или больше)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("0");

  if (state.reward?.reputation !== undefined && state.reward?.reputation !== null && Number(state.reward.reputation) > 0) {
    repInput.setValue(String(state.reward.reputation));
  }

  const itemInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_ITEM)
    .setLabel("Предмет (название из каталога/кастом)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Например: Зелье восстановления");

  if (state.reward?.item_name && state.reward.item_name.trim()) {
    itemInput.setValue(state.reward.item_name.trim());
  }

  const qtyInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_QTY)
    .setLabel("Количество предмета")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("1");

  if (state.reward?.item_qty !== undefined && state.reward?.item_qty !== null && Number(state.reward.item_qty) > 0) {
    qtyInput.setValue(String(state.reward.item_qty));
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(apInput),
    new ActionRowBuilder().addComponents(spInput),
    new ActionRowBuilder().addComponents(repInput),
    new ActionRowBuilder().addComponents(itemInput),
    new ActionRowBuilder().addComponents(qtyInput)
  );

  return modal;
}

/**
 * Создаёт модалку ввода ссылок на изображения (баннер, миниатюра)
 */
export function createMediaModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(MISSION_BUILDER_NAMESPACE, "media", messageId))
    .setTitle("Изображения и обложка миссии");

  const imageInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_IMAGE)
    .setLabel("URL большого баннера/арта (необязательно)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder("https://example.com/art.png");

  if (state.image_url && state.image_url.trim()) {
    imageInput.setValue(state.image_url.trim());
  }

  const thumbInput = new TextInputBuilder()
    .setCustomId(MB_INPUT_THUMBNAIL)
    .setLabel("URL миниатюры/значка (необязательно)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder("https://example.com/icon.png");

  if (state.thumbnail_url && state.thumbnail_url.trim()) {
    thumbInput.setValue(state.thumbnail_url.trim());
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(imageInput),
    new ActionRowBuilder().addComponents(thumbInput)
  );

  return modal;
}

/**
 * Публикация миссии из состояния черновика
 */
async function publishMission({ interaction, session }) {
  const state = session.state;

  if (!state.title || !state.title.trim()) {
    return interaction.reply({
      content: "❌ Укажите название миссии перед публикацией (кнопка 【📝 Основное】).",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!state.description || !state.description.trim()) {
    return interaction.reply({
      content: "❌ Укажите описание миссии перед публикацией (кнопка 【📝 Основное】).",
      flags: MessageFlags.Ephemeral,
    });
  }

  // 1. Определение целевой организации и канала
  let resolvedOrg = null;
  let targetChannelId = state.channel_id;

  if (state.organization_key) {
    resolvedOrg = await getOrganizationByKey(state.organization_key);
    if (!targetChannelId && resolvedOrg) {
      const orgChannelSetting = await getOrganizationMissionChannel({
        guildId: interaction.guildId,
        orgKey: resolvedOrg.key,
      });
      if (orgChannelSetting?.channel_id) {
        targetChannelId = orgChannelSetting.channel_id;
      }
    }
  }

  if (!targetChannelId) {
    targetChannelId = interaction.channelId;
  }

  // 2. Получение канала Discord
  const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (!targetChannel) {
    return interaction.reply({
      content: `❌ Не удалось найти канал <#${targetChannelId}> для публикации миссии.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 3. Проверка прав бота в канале
  const me = interaction.guild?.members?.me;
  const permCheck = verifyChannelPermissions(targetChannel, me);
  if (!permCheck.ok) {
    return interaction.reply({
      content:
        `❌ У бота недостаточно прав для публикации миссии в канале <#${targetChannel.id}>:\n` +
        permCheck.missing.map((m) => `• ${m}`).join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  // 4. Формирование наград
  const reward = {
    ap: Math.max(0, Number(state.reward?.ap) || 0),
    sp: Math.max(0, Number(state.reward?.sp) || 0),
    reputation: Math.max(0, Number(state.reward?.reputation) || 0),
    item: state.reward?.item_name?.trim()
      ? {
          item_id: state.reward.item_name.trim(),
          item_name: state.reward.item_name.trim(),
          quantity: Math.max(1, Number(state.reward.item_qty) || 1),
        }
      : null,
  };

  // 5. Создание миссии в MongoDB
  const mission = await createMission({
    guildId: interaction.guildId,
    organizationId: resolvedOrg?.id || null,
    organizationKey: resolvedOrg?.key || null,
    organizationName: resolvedOrg?.name || null,
    channelId: targetChannel.id,
    title: state.title.trim(),
    type: state.type || MISSION_TYPES.well,
    description: state.description.trim(),
    access: state.access || MISSION_ACCESS.open,
    minRank: state.min_rank,
    maxPlayers: state.max_players || 5,
    imageUrl: state.image_url?.trim() || null,
    thumbnailUrl: state.thumbnail_url?.trim() || null,
    createdBy: {
      user_id: interaction.user.id,
      username: interaction.user.username,
    },
    reward,
  });

  // 6. Публикация карточки в канал
  let message;
  try {
    message = await targetChannel.send({
      embeds: [createMissionCardEmbed(mission, interaction.client)],
      components: createMissionActionRows(mission, interaction.client),
    });
  } catch (err) {
    console.error("Error sending mission card to channel:", err);
    return interaction.followUp({
      content: `❌ Не удалось отправить карточку миссии в канал <#${targetChannel.id}>: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 7. Привязка message_id и регистрация постоянной сессии карточки
  await Promise.all([
    setMissionMessageId(mission.public_id, message.id),
    createInteractionSession({
      messageId: message.id,
      namespace: MISSION_NAMESPACE,
      ownerId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      state: {
        public_id: mission.public_id,
        mission_id: mission._id?.toString?.() || mission.public_id,
      },
      ttlMs: MISSION_SESSION_TTL_MS,
    }),
  ]);

  // 8. Создание ветки обсуждения при наличии прав
  if (permCheck.canCreateThreads && typeof message.startThread === "function") {
    try {
      const thread = await message.startThread({
        name: `Обсуждение: ${mission.title.slice(0, 80)}`,
        autoArchiveDuration: 1440,
      });
      if (thread?.id) {
        await setMissionThreadId(mission.public_id, thread.id).catch(() => {});
        mission.thread_id = thread.id;
      }
      if (mission.created_by?.user_id && typeof thread.members?.add === "function") {
        await thread.members.add(mission.created_by.user_id).catch(() => {});
      }
      const gmLine = mission.created_by?.user_id ? `\nОрганизатор (ГМ): <@${mission.created_by.user_id}>` : "";
      await thread.send(
        `⚔️ Ветка обсуждения миссии **${mission.title}** открыта.${gmLine}\n` +
        `Участники лобби будут автоматически добавляться сюда для обсуждения деталей с ГМ.`
      );
    } catch (threadErr) {
      console.warn("Could not create mission thread:", threadErr?.message);
    }
  }

  // 9. Закрываем сессию черновика
  await closeInteractionSession(session.message_id);

  // 10. Финальное обновление карточки черновика
  const successEmbed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("✅ Миссия успешно создана и опубликована!")
    .setDescription(
      `Миссия **${mission.title}** (\`${mission.public_id}\`) опубликована в канале <#${targetChannel.id}>.\n\n` +
      `• **Тип:** ${resolveCustomEmoji(TYPE_ICONS[mission.type] || "🌀", interaction.client)} ${TYPE_LABELS[mission.type] || mission.type}\n` +
      `• **Лимит участников:** ${mission.max_players} чел.\n` +
      `• **Доступ:** ${formatAccess(mission.access)}\n` +
      (mission.organization_name ? `• **Организация:** ${mission.organization_name}\n` : "") +
      `\n[**Перейти к сообщению миссии в канале**](${message.url})`
    );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Перейти к миссии")
      .setStyle(ButtonStyle.Link)
      .setURL(message.url)
  );

  await interaction.editReply({
    embeds: [successEmbed],
    components: [actionRow],
  });
}

/**
 * Обработчик нажатий компонентов мастера создания миссии
 */
async function handleComponent({ interaction, session }) {
  const customId = interaction.customId;
  const state = { ...session.state };

  // 1. Нажатие кнопки 【Основное】 -> открыть модалку
  if (customId === MB_BTN_MAIN) {
    const modal = createMainInfoModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Mission builder main modal error:", err);
    });
  }

  // 2. Нажатие кнопки 【Награды】 -> открыть модалку
  if (customId === MB_BTN_REWARDS) {
    const modal = createRewardsModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Mission builder rewards modal error:", err);
    });
  }

  // 3. Нажатие кнопки 【Обложка】 -> открыть модалку
  if (customId === MB_BTN_MEDIA) {
    const modal = createMediaModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Mission builder media modal error:", err);
    });
  }

  // 4. Нажатие кнопки 【Опубликовать】
  if (customId === MB_BTN_PUBLISH) {
    return publishMission({ interaction, session });
  }

  // 5. Нажатие кнопки 【Отмена】
  if (customId === MB_BTN_CANCEL) {
    await closeInteractionSession(session.message_id);
    const cancelEmbed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("✖️ Создание миссии отменено")
      .setDescription("Черновик закрыт. Миссия не была опубликована.");

    return interaction.update({
      embeds: [cancelEmbed],
      components: [],
    });
  }

  // 6. Выбор типа миссии
  if (customId === MB_SELECT_TYPE && interaction.isStringSelectMenu()) {
    state.type = interaction.values[0];
  }

  // 7. Выбор минимального ранга для входа
  if (customId === MB_SELECT_RANK && interaction.isStringSelectMenu()) {
    const selectedRank = interaction.values[0];
    state.min_rank = !selectedRank || selectedRank === "none" ? null : normalizeRank(selectedRank);
  }

  // 8. Выбор доступа
  if (customId === MB_SELECT_ACCESS && interaction.isStringSelectMenu()) {
    state.access = interaction.values[0];
  }

  // 9. Выбор организации
  if (customId === MB_SELECT_ORG && interaction.isStringSelectMenu()) {
    const selectedOrg = interaction.values[0];
    if (selectedOrg === "none") {
      state.organization_key = null;
      state.organization_name = null;
    } else {
      const org = await getOrganizationByKey(selectedOrg);
      if (org) {
        state.organization_key = org.key;
        state.organization_name = org.name;
        // Автоматически подставляем канал организации, если он привязан
        const orgSetting = await getOrganizationMissionChannel({
          guildId: interaction.guildId,
          orgKey: org.key,
        });
        if (orgSetting?.channel_id) {
          state.channel_id = orgSetting.channel_id;
        }
      }
    }
  }

  // 10. Выбор канала
  if (customId === MB_SELECT_CHANNEL && interaction.isChannelSelectMenu()) {
    state.channel_id = interaction.values?.[0] || null;
  }

  // Сохраняем обновлённое состояние в MongoDB
  await releaseInteractionSession(session.message_id, state);

  // Обновляем карточку черновика
  const orgs = await getAllOrganizations();
  const embed = createMissionBuilderEmbed(state, interaction.client);
  const components = createMissionBuilderComponents(state, orgs, session.message_id, false, interaction.client);

  await interaction.update({
    embeds: [embed],
    components,
  });
}

/**
 * Обработчик отправки модалок мастера миссий
 */
async function handleModal({ interaction, session, action }) {
  const state = { ...session.state };

  if (action === "main") {
    const title = interaction.fields.getTextInputValue(MB_INPUT_TITLE)?.trim() || "";
    const rawPlayers = interaction.fields.getTextInputValue(MB_INPUT_PLAYERS)?.trim() || "5";
    const rawChannel = interaction.fields.getTextInputValue(MB_INPUT_CHANNEL)?.trim() || "";
    const desc = interaction.fields.getTextInputValue(MB_INPUT_DESC)?.trim() || "";

    let maxPlayers = parseInt(rawPlayers, 10);
    if (isNaN(maxPlayers) || maxPlayers < 1) maxPlayers = 1;
    if (maxPlayers > 50) maxPlayers = 50;

    if (rawChannel) {
      const channelMatch = rawChannel.match(/^(?:<#)?(\d{17,20})>?$/);
      if (channelMatch) {
        state.channel_id = channelMatch[1];
      }
    }

    state.title = title.slice(0, 100);
    state.max_players = maxPlayers;
    state.description = desc.slice(0, 1000);
  } else if (action === "rewards") {
    const rawAp = interaction.fields.getTextInputValue(MB_INPUT_AP)?.trim() || "0";
    const rawSp = interaction.fields.getTextInputValue(MB_INPUT_SP)?.trim() || "0";
    const rawRep = interaction.fields.getTextInputValue(MB_INPUT_REP)?.trim() || "0";
    const itemName = interaction.fields.getTextInputValue(MB_INPUT_ITEM)?.trim() || "";
    const rawQty = interaction.fields.getTextInputValue(MB_INPUT_QTY)?.trim() || "1";

    const ap = Math.max(0, parseInt(rawAp, 10) || 0);
    const sp = Math.max(0, parseInt(rawSp, 10) || 0);
    const rep = Math.max(0, parseInt(rawRep, 10) || 0);
    const qty = Math.max(1, parseInt(rawQty, 10) || 1);

    state.reward = {
      ap,
      sp,
      reputation: rep,
      item_name: itemName.slice(0, 100),
      item_qty: qty,
    };
  } else if (action === "media") {
    const rawImage = interaction.fields.getTextInputValue(MB_INPUT_IMAGE)?.trim() || "";
    const rawThumb = interaction.fields.getTextInputValue(MB_INPUT_THUMBNAIL)?.trim() || "";

    let validImage = null;
    if (rawImage) {
      try {
        new URL(rawImage);
        validImage = rawImage.slice(0, 500);
      } catch {}
    }

    let validThumb = null;
    if (rawThumb) {
      try {
        new URL(rawThumb);
        validThumb = rawThumb.slice(0, 500);
      } catch {}
    }

    state.image_url = validImage;
    state.thumbnail_url = validThumb;
  }

  // Сохраняем состояние
  await releaseInteractionSession(session.message_id, state);

  // Обновляем карточку черновика
  const orgs = await getAllOrganizations();
  const embed = createMissionBuilderEmbed(state, interaction.client);
  const components = createMissionBuilderComponents(state, orgs, session.message_id, false, interaction.client);

  await interaction.update({
    embeds: [embed],
    components,
  });
}

/**
 * Проверка прав: карточкой черновика управляет только открывший её ГМ/Администратор
 */
function authorize({ interaction, session }) {
  if (session.owner_id !== interaction.user.id) return false;
  return isGMOrAdmin(interaction.member);
}

export const missionBuilderInteractionHandler = {
  authorize,
  handleComponent,
  handleModal,
  renderForeign({ interaction }) {
    return interaction.reply({
      content: "Этот черновик миссии редактируется другим администратором. Создайте свой через `/mission create`.",
      flags: MessageFlags.Ephemeral,
    });
  },
  renderExpired({ interaction }) {
    return interaction.reply({
      content: "Время действия этого черновика истекло. Запустите `/mission create` ещё раз.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
