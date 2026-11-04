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
import { getDB } from "../utils/db.js";
import { getPlayer, setActiveSlot, getStyleByName, setSP } from "../utils/dataManager.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import {
  isValidCharacterUrl,
  makeTargetPlayerId,
  physicalStatsSummary,
} from "../utils/physicalStats.js";
import {
  closeInteractionSession,
  getInteractionSession,
  releaseInteractionSession,
} from "../utils/interactionSessions.js";
import { buildModalCustomId } from "../utils/interactionRouter.js";
import { logCommand } from "../utils/logs.js";
import { createErrorEmbed, createSuccessEmbed } from "../utils/embeds.js";
import { slugifyCharacterName, generatePublicId } from "../services/playerService.js";
import { describeOrgSync, syncOrgRoles } from "../utils/orgRoles.js";

export const ACCEPT_APPLICATION_NAMESPACE = "accept_application";
export const ACCEPT_APPLICATION_TTL_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_PLAYER_ROLE_ID =
  process.env.PLAYER_ROLE_ID || "1431761095319879892";
export const DEFAULT_UNVERIFIED_ROLE_ID =
  process.env.UNVERIFIED_ROLE_ID || "1431758535905120266";

export const ACC_BTN_INFO = "acc_btn_info";
export const ACC_BTN_STATS = "acc_btn_stats";
export const ACC_BTN_URL = "acc_btn_url";
export const ACC_BTN_CONFIRM = "acc_btn_confirm";
export const ACC_BTN_CANCEL = "acc_btn_cancel";

export const ACC_INPUT_CHAR_NAME = "acc_input_char_name";
export const ACC_INPUT_ATTR_NAME = "acc_input_attr_name";
export const ACC_INPUT_ORG = "acc_input_org";
export const ACC_INPUT_RANK = "acc_input_rank";
export const ACC_INPUT_AVATAR_URL = "acc_input_avatar_url";

export const ACC_INPUT_PUNCH = "acc_input_punch";
export const ACC_INPUT_LIFT = "acc_input_lift";
export const ACC_INPUT_SPEED = "acc_input_speed";
export const ACC_INPUT_STAMINA = "acc_input_stamina";
export const ACC_INPUT_REACTION = "acc_input_reaction";

export const ACC_INPUT_URL = "acc_input_url";

function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function createAcceptApplicationState({
  target_user_id,
  target_username = "",
  slot = 1,
  player_id,
  character_name = "",
  attribute_name = "",
  organization = "",
  rank = "",
  character_avatar = null,
  character_url = "",
  combat_style = "",
  initial_krw = 0,
  initial_yen = 0,
  stats = {},
} = {}) {
  const pId = player_id || makeTargetPlayerId(target_user_id, slot);
  return {
    target_user_id,
    target_username,
    slot: Number(slot) || 1,
    player_id: pId,
    character_name: character_name || "",
    attribute_name: attribute_name || "",
    organization: organization || "",
    rank: rank || "",
    character_avatar: character_avatar || null,
    character_url: character_url || "",
    combat_style: combat_style ? combat_style.trim() : "",
    initial_krw: Number.isFinite(initial_krw) && initial_krw >= 0 ? Math.floor(initial_krw) : 0,
    initial_yen: Number.isFinite(initial_yen) && initial_yen >= 0 ? Math.floor(initial_yen) : 0,
    stats: {
      punch_strength_kg: stats?.punch_strength_kg ?? null,
      lifting_strength_kg: stats?.lifting_strength_kg ?? null,
      speed_kmh: stats?.speed_kmh ?? null,
      stamina_percent: stats?.stamina_percent ?? null,
      reaction_ms: stats?.reaction_ms ?? null,
      character_url: character_url || stats?.character_url || "",
    },
  };
}

export function createAcceptApplicationPreviewEmbed(state) {
  const s = state.stats || {};
  const playerRoleId = DEFAULT_PLAYER_ROLE_ID;
  const unverifiedRoleId = DEFAULT_UNVERIFIED_ROLE_ID;

  const punchText =
    s.punch_strength_kg !== null ? `**[${formatNumber(s.punch_strength_kg)} кг]**` : "*(не задано)*";
  const liftText =
    s.lifting_strength_kg !== null ? `**[${formatNumber(s.lifting_strength_kg)} кг]**` : "*(не задано)*";
  const speedText =
    s.speed_kmh !== null ? `**[${formatNumber(s.speed_kmh)} км/ч]**` : "*(не задано)*";
  const staminaText =
    s.stamina_percent !== null ? `**[${formatNumber(s.stamina_percent)}%]**` : "*(не задано)*";
  const reactionText =
    s.reaction_ms !== null ? `**[${formatNumber(s.reaction_ms)} мс]**` : "*(не задано)*";

  const lines = [
    `👤 **Игрок:** <@${state.target_user_id}> (${state.target_username})`,
    `📁 **Слот:** Слот ${state.slot}`,
    `🏷️ **Имя персонажа:** ${state.character_name ? `**${state.character_name}**` : "*(не указано — заполните перед принятием)*"}`,
    `✨ **Атрибут:** ${state.attribute_name ? `**${state.attribute_name}**` : "*(не указан)*"}`,
    `🏛️ **Организация:** **${state.organization || "Не состоит"}**`,
    `🎖️ **Ранг:** **${state.rank || "—"}**`,
    `🥋 **Боевой стиль (БИ):** ${state.combat_style ? `**${state.combat_style}**` : "*(не выбран)*"}`,
    `💰 **Стартовый баланс:** ${(state.initial_krw > 0 || state.initial_yen > 0) ? `${formatNumber(state.initial_krw)} ₩ / ${formatNumber(state.initial_yen)} ¥` : "0 ₩ / 0 ¥"}`,
    `🖼️ **Аватар:** ${state.character_avatar ? "[Установлен]" : "*(не прикреплен)*"}`,
    "",
    "**Физические показатели:**",
    `🔹 Сила удара: ${punchText}`,
    `🔹 Сила на подъём: ${liftText}`,
    `🔹 Скорость: ${speedText}`,
    `🔹 Стамина: ${staminaText}`,
    `🔹 Реакция: ${reactionText}`,
    "",
    `🔗 **Анкета:** ${state.character_url ? `[Открыть анкету](${state.character_url})` : "*(не указана)*"}`,
    "",
    "**Действия с ролями:**",
    `➕ Будет выдана роль: <@&${playerRoleId}>`,
  ];

  const embed = new EmbedBuilder()
    .setColor(0x27ff5d)
    .setTitle("📋 Принятие анкеты и регистрация персонажа")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "Используйте кнопки ниже для ввода данных персонажа и подтверждения принятия.",
    });

  if (state.character_avatar) {
    embed.setThumbnail(state.character_avatar);
  }

  return embed;
}

export function createAcceptApplicationComponents(disabled = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ACC_BTN_INFO)
      .setLabel("Данные персонажа")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ACC_BTN_STATS)
      .setLabel("Физические статы")
      .setEmoji("🥊")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ACC_BTN_URL)
      .setLabel("Ссылка на анкету")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ACC_BTN_CONFIRM)
      .setLabel("Принять и выдать роль")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ACC_BTN_CANCEL)
      .setLabel("Отмена")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  return [row1, row2];
}

export function createCharacterInfoModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(ACCEPT_APPLICATION_NAMESPACE, "info", messageId))
    .setTitle("Данные персонажа");

  const nameInput = new TextInputBuilder()
    .setCustomId(ACC_INPUT_CHAR_NAME)
    .setLabel("Имя персонажа (обязательно)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(32)
    .setPlaceholder("Например: Хана Ками");
  if (state.character_name) nameInput.setValue(state.character_name);

  const attrInput = new TextInputBuilder()
    .setCustomId(ACC_INPUT_ATTR_NAME)
    .setLabel("Название атрибута")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50)
    .setPlaceholder("Например: Пепел, Гром, Тень, Ангел");
  if (state.attribute_name) attrInput.setValue(state.attribute_name);

  const orgInput = new TextInputBuilder()
    .setCustomId(ACC_INPUT_ORG)
    .setLabel("Организация")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50)
    .setPlaceholder("Например: TENRYU (по умолчанию: Не состоит)");
  if (state.organization) orgInput.setValue(state.organization);

  const rankInput = new TextInputBuilder()
    .setCustomId(ACC_INPUT_RANK)
    .setLabel("Ранг персонажа")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setPlaceholder("Например: E, D, C, B, A, S (по умолчанию: —)");
  if (state.rank) rankInput.setValue(state.rank);

  const avatarInput = new TextInputBuilder()
    .setCustomId(ACC_INPUT_AVATAR_URL)
    .setLabel("URL аватара (если не прикреплен файл)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder("https://...");
  if (state.character_avatar && typeof state.character_avatar === "string" && state.character_avatar.startsWith("http")) {
    avatarInput.setValue(state.character_avatar);
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(attrInput),
    new ActionRowBuilder().addComponents(orgInput),
    new ActionRowBuilder().addComponents(rankInput),
    new ActionRowBuilder().addComponents(avatarInput)
  );

  return modal;
}

export function createAcceptStatsModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(ACCEPT_APPLICATION_NAMESPACE, "stats", messageId))
    .setTitle("Физические показатели");

  const s = state.stats || {};

  const punch = new TextInputBuilder()
    .setCustomId(ACC_INPUT_PUNCH)
    .setLabel("Сила удара (в кг)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Например: 120.5");
  if (s.punch_strength_kg !== null && s.punch_strength_kg !== undefined) {
    punch.setValue(String(s.punch_strength_kg));
  }

  const lift = new TextInputBuilder()
    .setCustomId(ACC_INPUT_LIFT)
    .setLabel("Сила на подъём (в кг)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Например: 250");
  if (s.lifting_strength_kg !== null && s.lifting_strength_kg !== undefined) {
    lift.setValue(String(s.lifting_strength_kg));
  }

  const speed = new TextInputBuilder()
    .setCustomId(ACC_INPUT_SPEED)
    .setLabel("Скорость (в км/ч)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Например: 35");
  if (s.speed_kmh !== null && s.speed_kmh !== undefined) {
    speed.setValue(String(s.speed_kmh));
  }

  const stamina = new TextInputBuilder()
    .setCustomId(ACC_INPUT_STAMINA)
    .setLabel("Стамина (в %)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Например: 100");
  if (s.stamina_percent !== null && s.stamina_percent !== undefined) {
    stamina.setValue(String(s.stamina_percent));
  }

  const reaction = new TextInputBuilder()
    .setCustomId(ACC_INPUT_REACTION)
    .setLabel("Скорость реакции (в мс)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
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

export function createAcceptUrlModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(ACCEPT_APPLICATION_NAMESPACE, "url", messageId))
    .setTitle("Ссылка на анкету персонажа");

  const urlInput = new TextInputBuilder()
    .setCustomId(ACC_INPUT_URL)
    .setLabel("URL анкеты (начинается с http/https)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder("https://discord.com/channels/... или ссылка на документ");

  if (state.character_url) {
    urlInput.setValue(state.character_url);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
  return modal;
}

export function createJuniperAcceptanceEmbed(state) {
  const characterName = state.character_name || "Персонаж";

  const description = [
    "# > ₊˚.༄ ೃ - ПРИНЯТИЕ АНКЕТЫ!",
    `> ***: ̗̀➛ Ваша анкета прошла проверку. Теперь вы являетесь полноправным __игроком__ на проекте. Если вам потребуется помощь по ролевой, то большая  просьба обращаться к __Мастерам Игры__ либо же к __Администрации__. Ваш профиль персонажа **${characterName}** успешно настроен! Используйте команду \`/profile\` через нашего бота Verge для просмотра своего профиля.***`,
    "",
    "**```ansi",
    "\u001b[2;32mПомните! Наш сервер всегда рад новым игрокам. Не стоит стесняться спрашивать или узнавать. Мы надеемся на ваш актив в ролевой. И знайте, мы относимся к вам с уважением и надеемся на то, что вы будете уважать как сервер, так и наш персонал.\u001b[0m",
    "```**",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(0x27ff5d)
    .setTitle("╔════ ☒-☒-☒-☒-☒-□ ════╗")
    .setDescription(description)
    .setImage("https://c.tenor.com/G-tCLZtt-U8AAAAC/tenor.gif")
    .setFooter({
      text: "<-✧ —□— —□— ✦✧✦ —□— —□— ✧ -><-✧ —□— —□— ✦✧✦ -",
    });
}

export function createJuniperPublicMessage(state) {
  const content = `<@${state.target_user_id}>\n- ***Дорогой анкетолог, не забудьте отправить эту анкету в __архив__! А также создать отчёт.***`;
  const embed = createJuniperAcceptanceEmbed(state);
  return { content, embeds: [embed] };
}

async function confirmAcceptApplication({ interaction, session }) {
  const state = session.state;

  if (!state.character_name || state.character_name.trim().length < 2) {
    return interaction.reply({
      content:
        "❌ Укажите корректное имя персонажа (кнопка 【👤 Данные персонажа】) перед принятием.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  const db = getDB();
  const now = new Date();
  const playerId = state.player_id;
  const slot = Number(state.slot) || 1;
  const targetUserId = state.target_user_id;

  const physicalStats = {
    punch_strength_kg: state.stats?.punch_strength_kg ?? null,
    lifting_strength_kg: state.stats?.lifting_strength_kg ?? null,
    speed_kmh: state.stats?.speed_kmh ?? null,
    stamina_percent: state.stats?.stamina_percent ?? null,
    reaction_ms: state.stats?.reaction_ms ?? null,
    character_url: state.character_url || state.stats?.character_url || null,
    is_registered: true,
    created_at: now,
    updated_at: now,
    updated_by: interaction.user.id,
  };

  const hasPhysicalStats =
    physicalStats.punch_strength_kg !== null ||
    physicalStats.lifting_strength_kg !== null ||
    physicalStats.speed_kmh !== null ||
    physicalStats.stamina_percent !== null ||
    physicalStats.reaction_ms !== null;

  // 1. Sync / Save Player Document
  if (db) {
    const existingPlayer = await db.collection("players").findOne({ id: playerId });

    if (existingPlayer) {
      await closeInteractionSession(session.message_id).catch(() => {});
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Слот занят",
            `В слоте **${slot}** у пользователя <@${targetUserId}> уже зарегистрирован персонаж (**${existingPlayer.character_name || existingPlayer.username}**).\n\nПринятие отменено во избежание перезаписи существующего персонажа.`
          ),
        ],
        components: [],
      });
      return;
    }

    try {
      await db.collection("players").insertOne({
        id: playerId,
        username: state.target_username,
        character_name: state.character_name.trim(),
        character_avatar: state.character_avatar || null,
        attribute_name: state.attribute_name ? state.attribute_name.trim() : null,
        organization: state.organization ? state.organization.trim() : null,
        rank: state.rank ? state.rank.trim() : null,
        krw: state.initial_krw || 0,
        yen: state.initial_yen || 0,
        ap: 0,
        reputation: 20,
        last_train_timestamp: 0,
        last_socialrp_timestamp: 0,
        last_sp_train_timestamp: 0,
        unlocked_avatar: 0,
        ap_multiplier: 100.0,
        sp_multiplier: 100.0,
        ap_multiplier_expires_at: 0,
        sp_multiplier_expires_at: 0,
        last_ap_change_at: 0,
        last_sp_change_at: 0,
        physical_stats: hasPhysicalStats ? physicalStats : undefined,
        physical_stats_registered: hasPhysicalStats,
        created_at: now,
        updated_at: now,
      });
      await setActiveSlot(targetUserId, slot);

      if (state.combat_style) {
        try {
          const style = await getStyleByName(state.combat_style);
          const sName = style ? style.name : state.combat_style.trim();
          await setSP(playerId, sName, 1);
        } catch (styleErr) {
          console.warn("Failed to set combat style on accept:", styleErr);
        }
      }
    } catch (insertErr) {
      if (insertErr?.code === 11000) {
        await closeInteractionSession(session.message_id).catch(() => {});
        await interaction.editReply({
          embeds: [
            createErrorEmbed(
              "Слот уже занят",
              `В слоте **${slot}** у пользователя <@${targetUserId}> уже существует персонаж.\n\nПовторная регистрация отменена.`
            ),
          ],
          components: [],
        });
        return;
      }
      throw insertErr;
    }

    // 2. Sync / Save in applications collection (Web Portal integration)
    try {
      const publicId = generatePublicId(playerId, slot);
      const slug = slugifyCharacterName(state.character_name);

      await db.collection("applications").updateOne(
        { player_id: playerId },
        {
          $set: {
            id: `app_${publicId}`,
            public_id: publicId,
            slug: `${slug}-${slot}`,
            player_id: playerId,
            slot,
            character_name: state.character_name.trim(),
            character_avatar: state.character_avatar || null,
            attribute_name: state.attribute_name || null,
            organization: state.organization || "Не состоит",
            rank: state.rank || "—",
            reputation: 20,
            status: "accepted",
            moderator_notes: `Принято анкетологом <@${interaction.user.id}> через Discord бота`,
            author_discord_id: targetUserId,
            author_username: state.target_username,
            physical_stats: {
              punch_kg: physicalStats.punch_strength_kg,
              lifting_kg: physicalStats.lifting_strength_kg,
              speed_kmh: physicalStats.speed_kmh,
              stamina_percent: physicalStats.stamina_percent,
              reaction_ms: physicalStats.reaction_ms,
              is_registered: hasPhysicalStats,
            },
            source: {
              type: "discord_message",
              url: state.character_url || null,
            },
            updated_at: now.toISOString(),
          },
          $setOnInsert: {
            created_at: now.toISOString(),
          },
        },
        { upsert: true }
      );
    } catch (appSyncErr) {
      console.warn("Failed to sync applications collection:", appSyncErr);
    }
  }

  // 3. Manage Discord Roles
  const playerRoleId = DEFAULT_PLAYER_ROLE_ID;
  let roleStatus = { added: false, orgSync: null, error: null };

  if (interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (member) {
        if (playerRoleId) {
          await member.roles.add(playerRoleId).catch((err) => {
            roleStatus.error = `Не удалось выдать роль <@&${playerRoleId}>: ${err.message}`;
          });
          roleStatus.added = true;
        }
      }

      // Sync organization role if an organization is specified for this character
      if (state.organization) {
        const syncRes = await syncOrgRoles({
          guild: interaction.guild,
          userId: targetUserId,
          actorId: interaction.user.id,
        }).catch((err) => {
          console.warn("Could not sync org roles on accept:", err);
          return null;
        });
        roleStatus.orgSync = syncRes;
      }
    } catch (roleErr) {
      console.error("Error managing member roles on accept:", roleErr);
      roleStatus.error = roleErr.message;
    }
  }

  // 4. Send Public Announcement Message in Channel
  const publicMsg = createJuniperPublicMessage(state);
  await interaction.channel.send(publicMsg).catch((sendErr) => {
    console.error("Failed to send public accept message in channel:", sendErr);
  });

  // 5. Close session and notify anketolog
  await closeInteractionSession(session.message_id);

  const orgNote = roleStatus.orgSync ? describeOrgSync(roleStatus.orgSync) : "";

  let successDesc =
    `Анкета игрока <@${targetUserId}> успешно принята!\n\n` +
    `• **Персонаж:** **${state.character_name}** (Слот ${state.slot})\n` +
    `• **Роль игрока:** <@&${playerRoleId}> ${roleStatus.added ? "✅ выдана" : "⚠️ ошибка выдачи"}\n` +
    (orgNote ? `• **Организация:** ${orgNote}\n` : "") +
    (state.combat_style ? `• **Боевой стиль (БИ):** **${state.combat_style}** (1 SP)\n` : "") +
    (state.initial_krw > 0 || state.initial_yen > 0 ? `• **Стартовый баланс:** ${formatNumber(state.initial_krw)} ₩ / ${formatNumber(state.initial_yen)} ¥\n` : "") +
    `\nСообщение о принятии опубликовано в <#${interaction.channelId}>.`;

  if (roleStatus.error) {
    successDesc += `\n\n⚠️ Предупреждение по ролям: ${roleStatus.error}`;
  }

  await interaction.editReply({
    embeds: [createSuccessEmbed("Анкета успешно принята", successDesc)],
    components: [],
  });

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    command: "accept",
    targetId: playerId,
    targetTag: `${state.character_name} (Слот ${slot}) <@${targetUserId}>`,
    extra: {
      character_name: state.character_name,
      attribute_name: state.attribute_name,
      organization: state.organization,
      rank: state.rank,
      physical_stats: physicalStats,
      role_status: roleStatus,
    },
  }).catch((err) => console.error("Error logging accept application:", err));
}

async function handleComponent({ interaction, session }) {
  const customId = interaction.customId;
  const state = { ...session.state };

  if (customId === ACC_BTN_INFO) {
    const modal = createCharacterInfoModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Character info modal error:", err);
    });
  }

  if (customId === ACC_BTN_STATS) {
    const modal = createAcceptStatsModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Accept stats modal error:", err);
    });
  }

  if (customId === ACC_BTN_URL) {
    const modal = createAcceptUrlModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Accept url modal error:", err);
    });
  }

  if (customId === ACC_BTN_CONFIRM) {
    return confirmAcceptApplication({ interaction, session });
  }

  if (customId === ACC_BTN_CANCEL) {
    await closeInteractionSession(session.message_id);
    const cancelEmbed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("✖️ Принятие анкеты отменено")
      .setDescription("Панель закрыта. Никакие изменения не были внесены.");

    return interaction.update({
      embeds: [cancelEmbed],
      components: [],
    });
  }
}

async function handleModal({ interaction, session, action }) {
  const state = { ...session.state };
  state.stats = { ...state.stats };

  if (action === "info") {
    const name = interaction.fields.getTextInputValue(ACC_INPUT_CHAR_NAME)?.trim();
    const attr = interaction.fields.getTextInputValue(ACC_INPUT_ATTR_NAME)?.trim();
    const org = interaction.fields.getTextInputValue(ACC_INPUT_ORG)?.trim();
    const rank = interaction.fields.getTextInputValue(ACC_INPUT_RANK)?.trim();
    const avatar = interaction.fields.getTextInputValue(ACC_INPUT_AVATAR_URL)?.trim();

    if (name) state.character_name = name;
    state.attribute_name = attr || "";
    state.organization = org || "";
    state.rank = rank || "";
    if (avatar && avatar.startsWith("http")) {
      state.character_avatar = avatar;
    }
  } else if (action === "stats") {
    const rawPunch = interaction.fields.getTextInputValue(ACC_INPUT_PUNCH)?.trim();
    const rawLift = interaction.fields.getTextInputValue(ACC_INPUT_LIFT)?.trim();
    const rawSpeed = interaction.fields.getTextInputValue(ACC_INPUT_SPEED)?.trim();
    const rawStamina = interaction.fields.getTextInputValue(ACC_INPUT_STAMINA)?.trim();
    const rawReaction = interaction.fields.getTextInputValue(ACC_INPUT_REACTION)?.trim();

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
    const rawUrl = interaction.fields.getTextInputValue(ACC_INPUT_URL)?.trim();
    if (rawUrl) {
      state.character_url = rawUrl;
      state.stats.character_url = rawUrl;
    }
  }

  await releaseInteractionSession(session.message_id, state);

  const embed = createAcceptApplicationPreviewEmbed(state);
  const components = createAcceptApplicationComponents();

  await interaction.update({
    embeds: [embed],
    components,
  });
}

function authorize({ interaction, session }) {
  if (session.owner_id !== interaction.user.id) return false;
  const member = interaction.member;
  return (
    hasCommandPermission(member, "accept") ||
    hasCommandPermission(member, "accept-application")
  );
}

export const acceptApplicationInteractionHandler = {
  authorize,
  handleComponent,
  handleModal,
  renderForeign({ interaction }) {
    return interaction.reply({
      content: "Эта панель принятия анкеты открыта другим анкетологом.",
      flags: MessageFlags.Ephemeral,
    });
  },
  renderExpired({ interaction }) {
    return interaction.reply({
      content: "Время действия панели истекло. Запустите команду /accept заново.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
