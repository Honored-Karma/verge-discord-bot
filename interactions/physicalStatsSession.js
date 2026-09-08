import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  editPhysicalStats,
  getPlayer,
  registerPhysicalStats,
} from "../utils/dataManager.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import {
  isValidCharacterUrl,
  physicalStatsSummary,
} from "../utils/physicalStats.js";
import {
  closeInteractionSession,
  createInteractionSession,
  getInteractionSession,
  releaseInteractionSession,
} from "../utils/interactionSessions.js";
import { buildModalCustomId } from "../utils/interactionRouter.js";
import { logCommand } from "../utils/logs.js";
import { createErrorEmbed, createSuccessEmbed } from "../utils/embeds.js";

export const PHYSICAL_STATS_NAMESPACE = "physical_stats";
export const PHYSICAL_STATS_TTL_MS = 2 * 60 * 60 * 1000;

export const PS_BTN_STATS = "ps_btn_stats";
export const PS_BTN_URL = "ps_btn_url";
export const PS_BTN_SAVE = "ps_btn_save";
export const PS_BTN_CANCEL = "ps_btn_cancel";

export const PS_INPUT_PUNCH = "ps_input_punch";
export const PS_INPUT_LIFT = "ps_input_lift";
export const PS_INPUT_SPEED = "ps_input_speed";
export const PS_INPUT_STAMINA = "ps_input_stamina";
export const PS_INPUT_REACTION = "ps_input_reaction";
export const PS_INPUT_URL = "ps_input_url";

function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function createPhysicalStatsState({
  mode = "register",
  target_user_id,
  target_username = "",
  slot = 1,
  player_id,
  character_name = "",
  character_avatar = null,
  stats = {},
} = {}) {
  return {
    mode,
    target_user_id,
    target_username,
    slot,
    player_id,
    character_name,
    character_avatar,
    stats: {
      punch_strength_kg: stats?.punch_strength_kg ?? null,
      lifting_strength_kg: stats?.lifting_strength_kg ?? null,
      speed_kmh: stats?.speed_kmh ?? null,
      stamina_percent: stats?.stamina_percent ?? null,
      reaction_ms: stats?.reaction_ms ?? null,
      character_url: stats?.character_url ?? null,
    },
  };
}

export function createPhysicalStatsEmbed(state) {
  const stats = state.stats || {};
  const isRegister = state.mode === "register";

  const lines = [
    `**Персонаж:** **${state.character_name || state.target_username}** • слот ${state.slot} (<@${state.target_user_id}>)\n`,
    `🔹 **Сила удара:** ${stats.punch_strength_kg !== null ? `**[${formatNumber(stats.punch_strength_kg)} кг]**` : "*(не задано)*"}`,
    `🔹 **Сила на подъём:** ${stats.lifting_strength_kg !== null ? `**[${formatNumber(stats.lifting_strength_kg)} кг]**` : "*(не задано)*"}`,
    `🔹 **Скорость:** ${stats.speed_kmh !== null ? `**[${formatNumber(stats.speed_kmh)} км/ч]**` : "*(не задано)*"}`,
    `🔹 **Стамина:** ${stats.stamina_percent !== null ? `**[${formatNumber(stats.stamina_percent)}%]**` : "*(не задано)*"}`,
    `🔹 **Реакция:** ${stats.reaction_ms !== null ? `**[${formatNumber(stats.reaction_ms)} мс]**` : "*(не задано)*"}\n`,
    `🔗 **Анкета персонажа:** ${stats.character_url ? `[Открыть анкету](${stats.character_url})` : "*(не указана)*"}`,
  ];

  const embed = new EmbedBuilder()
    .setColor(isRegister ? 0x3b82f6 : 0xf59e0b)
    .setTitle(
      isRegister
        ? "🥊 Регистрация физических показателей"
        : "✏️ Изменение физических показателей"
    )
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "Нажмите 【🥊 Показатели】 или 【🔗 Анкета】 для ввода значений через окна ввода.",
    });

  if (state.character_avatar) {
    embed.setThumbnail(state.character_avatar);
  }

  return embed;
}

export function createPhysicalStatsComponents(state, disabled = false) {
  const isRegister = state.mode === "register";

  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PS_BTN_STATS)
      .setLabel("Показатели")
      .setEmoji("🥊")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(PS_BTN_URL)
      .setLabel("Анкета")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(PS_BTN_SAVE)
      .setLabel(isRegister ? "Зарегистрировать" : "Сохранить")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(PS_BTN_CANCEL)
      .setLabel("Отмена")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  return [buttonsRow];
}

export function createStatsInputModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(PHYSICAL_STATS_NAMESPACE, "stats", messageId))
    .setTitle("Физические показатели");

  const s = state.stats || {};

  const punch = new TextInputBuilder()
    .setCustomId(PS_INPUT_PUNCH)
    .setLabel("Сила удара (в кг)")
    .setStyle(TextInputStyle.Short)
    .setRequired(state.mode === "register")
    .setPlaceholder("Например: 120.5");

  if (s.punch_strength_kg !== null && s.punch_strength_kg !== undefined) {
    punch.setValue(String(s.punch_strength_kg));
  }

  const lift = new TextInputBuilder()
    .setCustomId(PS_INPUT_LIFT)
    .setLabel("Сила на подъём (в кг)")
    .setStyle(TextInputStyle.Short)
    .setRequired(state.mode === "register")
    .setPlaceholder("Например: 250");

  if (s.lifting_strength_kg !== null && s.lifting_strength_kg !== undefined) {
    lift.setValue(String(s.lifting_strength_kg));
  }

  const speed = new TextInputBuilder()
    .setCustomId(PS_INPUT_SPEED)
    .setLabel("Скорость (в км/ч)")
    .setStyle(TextInputStyle.Short)
    .setRequired(state.mode === "register")
    .setPlaceholder("Например: 35");

  if (s.speed_kmh !== null && s.speed_kmh !== undefined) {
    speed.setValue(String(s.speed_kmh));
  }

  const stamina = new TextInputBuilder()
    .setCustomId(PS_INPUT_STAMINA)
    .setLabel("Стамина (в %)")
    .setStyle(TextInputStyle.Short)
    .setRequired(state.mode === "register")
    .setPlaceholder("Например: 85");

  if (s.stamina_percent !== null && s.stamina_percent !== undefined) {
    stamina.setValue(String(s.stamina_percent));
  }

  const reaction = new TextInputBuilder()
    .setCustomId(PS_INPUT_REACTION)
    .setLabel("Скорость реакции (в мс)")
    .setStyle(TextInputStyle.Short)
    .setRequired(state.mode === "register")
    .setPlaceholder("Например: 150");

  if (s.reaction_ms !== null && s.reaction_ms !== undefined) {
    reaction.setValue(String(s.reaction_ms));
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(punch),
    new ActionRowBuilder().addComponents(lift),
    new ActionRowBuilder().addComponents(speed),
    new ActionRowBuilder().addComponents(stamina),
    new ActionRowBuilder().addComponents(reaction)
  );

  return modal;
}

export function createUrlInputModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(PHYSICAL_STATS_NAMESPACE, "url", messageId))
    .setTitle("Ссылка на анкету персонажа");

  const urlInput = new TextInputBuilder()
    .setCustomId(PS_INPUT_URL)
    .setLabel("URL анкеты (начинается с http/https)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder("https://example.com/character-sheet");

  if (state.stats?.character_url && state.stats.character_url.trim()) {
    urlInput.setValue(state.stats.character_url.trim());
  }

  modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
  return modal;
}

async function savePhysicalStats({ interaction, session }) {
  const state = session.state;
  const stats = state.stats || {};
  const isRegister = state.mode === "register";

  if (isRegister) {
    if (
      stats.punch_strength_kg === null ||
      stats.lifting_strength_kg === null ||
      stats.speed_kmh === null ||
      stats.stamina_percent === null ||
      stats.reaction_ms === null
    ) {
      return interaction.reply({
        content: "❌ Заполните все 5 физических показателей (кнопка 【🥊 Показатели】).",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!stats.character_url || !isValidCharacterUrl(stats.character_url)) {
      return interaction.reply({
        content: "❌ Укажите корректную ссылку на анкету (начинается с `https://` или `http://`, кнопка 【🔗 Анкета】).",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  await interaction.deferUpdate();

  const payload = {};
  if (stats.punch_strength_kg !== null) payload.punch_strength_kg = stats.punch_strength_kg;
  if (stats.lifting_strength_kg !== null) payload.lifting_strength_kg = stats.lifting_strength_kg;
  if (stats.speed_kmh !== null) payload.speed_kmh = stats.speed_kmh;
  if (stats.stamina_percent !== null) payload.stamina_percent = stats.stamina_percent;
  if (stats.reaction_ms !== null) payload.reaction_ms = stats.reaction_ms;
  if (stats.character_url) payload.character_url = stats.character_url;

  let result;
  if (isRegister) {
    result = await registerPhysicalStats(state.player_id, payload, interaction.user.id);
  } else {
    result = await editPhysicalStats(state.player_id, payload, interaction.user.id);
  }

  if (!result.success) {
    const reasonText =
      result.reason === "already_registered"
        ? "Показатели персонажа уже зарегистрированы. Используйте команду `/physical-edit`."
        : result.reason === "not_registered"
        ? "Показатели ещё не зарегистрированы. Используйте `/physical-register`."
        : "Не удалось сохранить показатели в базе данных.";

    return interaction.followUp({
      content: `❌ ${reasonText}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await closeInteractionSession(session.message_id);

  const title = isRegister
    ? "Физические показатели зарегистрированы"
    : "Физические показатели изменены";

  const successEmbed = createSuccessEmbed(
    title,
    `**${state.character_name}** • слот ${state.slot} (<@${state.target_user_id}>)\n\n${physicalStatsSummary(payload)}\n\n**Анкета персонажа:** ${payload.character_url || stats.character_url || "*(не изменена)*"}`
  );

  // Публикуем подтверждение в канал
  await interaction.channel.send({
    embeds: [successEmbed],
  }).catch(() => {});

  // Закрываем панель черновика
  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        "Успешно сохранено",
        `Показатели для **${state.character_name}** успешно ${isRegister ? "зарегистрированы" : "обновлены"}.`
      ),
    ],
    components: [],
  });

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    command: isRegister ? "physical-register" : "physical-edit",
    targetId: state.player_id,
    targetTag: `${state.character_name} (слот ${state.slot}) <@${state.target_user_id}>`,
    extra: payload,
  }).catch((err) => console.error("Error logging physical stats:", err));
}

async function handleComponent({ interaction, session }) {
  const customId = interaction.customId;
  const state = { ...session.state };

  if (customId === PS_BTN_STATS) {
    const modal = createStatsInputModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Physical stats modal error:", err);
    });
  }

  if (customId === PS_BTN_URL) {
    const modal = createUrlInputModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Physical stats url modal error:", err);
    });
  }

  if (customId === PS_BTN_SAVE) {
    return savePhysicalStats({ interaction, session });
  }

  if (customId === PS_BTN_CANCEL) {
    await closeInteractionSession(session.message_id);
    const cancelEmbed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("✖️ Операция отменена")
      .setDescription("Панель закрыта. Показатели не были изменены.");

    return interaction.update({
      embeds: [cancelEmbed],
      components: [],
    });
  }
}

async function handleModal({ interaction, session, action }) {
  const state = { ...session.state };
  state.stats = { ...state.stats };

  if (action === "stats") {
    const rawPunch = interaction.fields.getTextInputValue(PS_INPUT_PUNCH)?.trim();
    const rawLift = interaction.fields.getTextInputValue(PS_INPUT_LIFT)?.trim();
    const rawSpeed = interaction.fields.getTextInputValue(PS_INPUT_SPEED)?.trim();
    const rawStamina = interaction.fields.getTextInputValue(PS_INPUT_STAMINA)?.trim();
    const rawReaction = interaction.fields.getTextInputValue(PS_INPUT_REACTION)?.trim();

    if (rawPunch) {
      const val = parseFloat(rawPunch.replace(",", "."));
      if (!isNaN(val) && val >= 0) state.stats.punch_strength_kg = val;
    }
    if (rawLift) {
      const val = parseFloat(rawLift.replace(",", "."));
      if (!isNaN(val) && val >= 0) state.stats.lifting_strength_kg = val;
    }
    if (rawSpeed) {
      const val = parseFloat(rawSpeed.replace(",", "."));
      if (!isNaN(val) && val >= 0) state.stats.speed_kmh = val;
    }
    if (rawStamina) {
      const val = parseFloat(rawStamina.replace(",", "."));
      if (!isNaN(val) && val >= 0) state.stats.stamina_percent = val;
    }
    if (rawReaction) {
      const val = parseFloat(rawReaction.replace(",", "."));
      if (!isNaN(val) && val >= 0.001) state.stats.reaction_ms = val;
    }
  } else if (action === "url") {
    const rawUrl = interaction.fields.getTextInputValue(PS_INPUT_URL)?.trim();
    if (rawUrl) {
      state.stats.character_url = rawUrl;
    }
  }

  await releaseInteractionSession(session.message_id, state);

  const embed = createPhysicalStatsEmbed(state);
  const components = createPhysicalStatsComponents(state);

  await interaction.update({
    embeds: [embed],
    components,
  });
}

function authorize({ interaction, session }) {
  if (session.owner_id !== interaction.user.id) return false;
  const member = interaction.member;
  return (
    hasCommandPermission(member, "physical-register") ||
    hasCommandPermission(member, "physical-edit")
  );
}

export const physicalStatsInteractionHandler = {
  authorize,
  handleComponent,
  handleModal,
  renderForeign({ interaction }) {
    return interaction.reply({
      content: "Эта панель редактируется другим администратором.",
      flags: MessageFlags.Ephemeral,
    });
  },
  renderExpired({ interaction }) {
    return interaction.reply({
      content: "Время действия панели истекло. Запустите команду заново.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
