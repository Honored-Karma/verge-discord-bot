import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  MISSION_STATUS,
  STATUS_ICONS,
  STATUS_LABELS,
  TYPE_ICONS,
  TYPE_LABELS,
} from "./missionStore.js";
import { safeAvatarUrl } from "./avatarUrl.js";

const STATUS_COLORS = {
  [MISSION_STATUS.recruiting]: 0x22c55e, // Green
  [MISSION_STATUS.active]: 0x3b82f6,     // Blue
  [MISSION_STATUS.completed]: 0xa855f7,  // Purple
  [MISSION_STATUS.cancelled]: 0xef4444,  // Red
};

export const MISSION_BTN_JOIN = "mission_join";
export const MISSION_BTN_LEAVE = "mission_leave";
export const MISSION_BTN_PARTY = "mission_party";
export const MISSION_BTN_PROFILES = "mission_profiles";
export const MISSION_BTN_START = "mission_start";
export const MISSION_BTN_FINISH = "mission_finish";
export const MISSION_BTN_CANCEL = "mission_cancel";
export const MISSION_BTN_CONFIRM_FINISH = "mission_finish_confirm";
export const MISSION_BTN_ABORT_FINISH = "mission_cancel_finish";
export const MISSION_BTN_RETRY_REWARDS = "mission_retry_rewards";
export const MISSION_SELECT_MEMBER = "mission_member_select";

/**
 * Creates the main interactive mission card embed.
 */
export function createMissionCardEmbed(mission) {
  const typeIcon = TYPE_ICONS[mission.type] || "📜";
  const typeLabel = TYPE_LABELS[mission.type] || "Миссия";
  const statusIcon = STATUS_ICONS[mission.status] || "ℹ️";
  const statusLabel = STATUS_LABELS[mission.status] || mission.status;
  const color = STATUS_COLORS[mission.status] || 0xb209d4;

  const orgDisplay = mission.organization_name
    ? mission.organization_name
    : "Открытая миссия";

  // Format party roster
  const partyLines = [];
  if (mission.participants && mission.participants.length > 0) {
    for (const p of mission.participants) {
      const orgRank = [p.organization_name, p.rank].filter(Boolean).join(" / ");
      partyLines.push(`• **${p.character_name}** — ${orgRank || "вольный"}`);
    }
  } else {
    partyLines.push("*Пока никто не вступил в пати.*");
  }

  // Format rewards
  const rewardLines = [];
  if (mission.reward?.ap > 0) {
    rewardLines.push(`• +${mission.reward.ap} AP`);
  }
  if (mission.reward?.sp > 0) {
    rewardLines.push(`• +${mission.reward.sp} SP`);
  }
  if (mission.reward?.reputation > 0) {
    rewardLines.push(`• +${mission.reward.reputation} Rtg`);
  }
  if (mission.reward?.item?.item_name) {
    rewardLines.push(
      `• Предмет: **${mission.reward.item.item_name}** ×${mission.reward.item.quantity || 1}`
    );
  }
  if (rewardLines.length === 0) {
    rewardLines.push("• Без автоматических наград");
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${typeIcon} ${mission.title}`)
    .setDescription(
      [
        `**Организация:** ${orgDisplay}`,
        `**Тип:** ${typeLabel}`,
        `**Статус:** ${statusIcon} ${statusLabel}`,
        "",
        "### 🎯 Краткая цель:",
        mission.description,
        "",
        `### 👥 Состав пати: ${mission.participants?.length || 0} / ${mission.max_players}`,
        partyLines.join("\n"),
        "",
        "### 🎁 Награды каждому завершившему миссию:",
        rewardLines.join("\n"),
        "",
        `**ГМ:** ${mission.created_by?.username || "Не указан"}`,
      ].join("\n")
    );

  if (mission.status === MISSION_STATUS.completed) {
    embed.addFields({
      name: "🏆 Завершение",
      value: `Награды автоматически выданы всем участникам.\nЗавершил: **${mission.completed_by?.username || "ГМ"}**`,
      inline: false,
    });
  } else if (mission.status === MISSION_STATUS.cancelled) {
    embed.addFields({
      name: "❌ Отмена",
      value: `Миссия отменена.\nПричина: *${mission.cancel_reason || "не указана"}*`,
      inline: false,
    });
  }

  if (mission.image_url) {
    try {
      new URL(mission.image_url);
      embed.setImage(mission.image_url);
    } catch {}
  }

  if (mission.thumbnail_url) {
    try {
      new URL(mission.thumbnail_url);
      embed.setThumbnail(mission.thumbnail_url);
    } catch {}
  }

  embed.setFooter({ text: `ID: ${mission.public_id} • Verge RPG` });
  embed.setTimestamp(mission.created_at ? new Date(mission.created_at) : new Date());

  return embed;
}

/**
 * Creates Discord Action Rows for the mission card buttons.
 */
export function createMissionActionRows(mission) {
  const isRecruiting = mission.status === MISSION_STATUS.recruiting;
  const isCompleted = mission.status === MISSION_STATUS.completed;
  const isCancelled = mission.status === MISSION_STATUS.cancelled;
  const isFull = (mission.participants?.length || 0) >= mission.max_players;

  // Row 1: Player Actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_JOIN)
      .setLabel("Вступить")
      .setStyle(ButtonStyle.Success)
      .setEmoji("➕")
      .setDisabled(!isRecruiting || isFull),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_LEAVE)
      .setLabel("Покинуть")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚪")
      .setDisabled(!isRecruiting),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_PARTY)
      .setLabel("Состав пати")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("👥"),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_PROFILES)
      .setLabel("Профили участников")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🧬")
      .setDisabled(!mission.participants || mission.participants.length === 0)
  );

  // Row 2: GM / Admin Actions
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_START)
      .setLabel("Начать миссию")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚔️")
      .setDisabled(!isRecruiting),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_FINISH)
      .setLabel("Завершить миссию")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🏁")
      .setDisabled(isCompleted || isCancelled),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_CANCEL)
      .setLabel("Отменить")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️")
      .setDisabled(isCompleted || isCancelled)
  );

  return [row1, row2];
}

/**
 * Ephemeral embed showing detailed party members list.
 */
export function createPartyListEmbed(mission) {
  const participants = mission.participants || [];
  const lines = [];

  if (participants.length === 0) {
    lines.push("В этой миссии пока нет участников.");
  } else {
    participants.forEach((p, index) => {
      const org = p.organization_name || "Без организации";
      const rank = p.rank ? ` (${p.rank})` : "";
      const joinedAt = p.joined_at
        ? `<t:${Math.floor(new Date(p.joined_at).getTime() / 1000)}:R>`
        : "недавно";
      lines.push(
        `**${index + 1}. ${p.character_name}**\n` +
        `• Организация: **${org}**${rank}\n` +
        `• Вступил: ${joinedAt}`
      );
    });
  }

  return new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`👥 Состав пати: ${mission.title}`)
    .setDescription(
      `**ID миссии:** \`${mission.public_id}\`\n` +
      `**Участники:** ${participants.length} / ${mission.max_players}\n\n` +
      lines.join("\n\n")
    )
    .setFooter({ text: "Verge RPG • Личный просмотр" })
    .setTimestamp();
}

/**
 * Creates select menu to choose a participant to view their public profile.
 */
export function createMemberProfileSelectRow(mission) {
  const participants = mission.participants || [];
  if (participants.length === 0) return null;

  const options = participants.slice(0, 25).map((p, idx) => ({
    label: `${idx + 1}. ${p.character_name.slice(0, 80)}`,
    description: `${p.organization_name || "Вольный"} · ${p.rank || "Нет ранга"}`.slice(0, 100),
    value: p.player_id,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MISSION_SELECT_MEMBER)
      .setPlaceholder("Выберите участника для просмотра профиля...")
      .addOptions(options)
  );
}

/**
 * Creates safe public profile embed for party members.
 * NEVER leaks private balance (KRW/Yen), internal IDs, notes, or private inventory!
 */
export function createPublicProfileEmbed(player, styles = [], baseUrl = null) {
  const siteBase =
    baseUrl ||
    process.env.APP_URL ||
    process.env.BASE_URL ||
    "https://verge-rp.ru";

  const name = player.character_name || player.username || "Безымянный";
  const org = player.organization || player.custom_org || "Не состоит";
  const rank = player.rank || "Нет ранга";
  const ap = Number(player.ap || 0);
  const attribute = player.attribute_name || "Не указан";
  const avatar = safeAvatarUrl(player.character_avatar);

  const styleLines =
    styles && styles.length > 0
      ? styles.map((s) => `• **${s.name}** — ${s.sp} SP`).join("\n")
      : "Стили ещё не изучены";

  const slug = player.slug || player.public_id;
  const webProfileUrl = slug ? `${siteBase.replace(/\/+$/, "")}/characters/${slug}` : null;

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`🧬 Публичный профиль: ${name}`)
    .setDescription(
      [
        `**Атрибут:** ${attribute}`,
        `**Организация:** ${org}`,
        `**Ранг:** ${rank}`,
        `**Очки способностей:** ${ap} AP`,
        "",
        "### 🥋 Боевые стили:",
        styleLines,
        "",
        webProfileUrl ? `🌐 [Открыть досье на сайте](${webProfileUrl})` : "",
      ].filter(Boolean).join("\n")
    )
    .setFooter({ text: "Публичные данные персонажа • Verge RPG" })
    .setTimestamp();

  if (avatar) {
    embed.setThumbnail(avatar);
  }

  return embed;
}

/**
 * GM Confirmation Dialog embed for completing a mission.
 */
export function createCompletionConfirmationEmbed(mission) {
  const participants = mission.participants || [];
  const rewards = [];
  if (mission.reward.ap > 0) rewards.push(`• +${mission.reward.ap} AP каждому`);
  if (mission.reward.sp > 0) rewards.push(`• +${mission.reward.sp} SP каждому (в основной стиль)`);
  if (mission.reward.reputation > 0) rewards.push(`• +${mission.reward.reputation} Rtg каждому`);
  if (mission.reward.item?.item_name) {
    rewards.push(
      `• Предмет: **${mission.reward.item.item_name}** ×${mission.reward.item.quantity || 1} каждому`
    );
  }

  const memberNames = participants.map((p) => `• ${p.character_name}`).join("\n");

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`🏁 Подтверждение завершения: ${mission.title}`)
    .setDescription(
      [
        `**ID миссии:** \`${mission.public_id}\``,
        `**Участников к награждению:** ${participants.length}`,
        "",
        "### Получатели наград:",
        memberNames || "*Нет участников в пати*",
        "",
        "### Награды каждому участнику:",
        rewards.join("\n") || "• Без наград",
        "",
        "⚠️ **Внимание:** После подтверждения бот автоматически начислит награды всем участникам. Действие необратимо.",
      ].join("\n")
    )
    .setFooter({ text: "Подтверждение ГМа" });
}

/**
 * Action row for completion confirmation dialog.
 */
export function createCompletionActionRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(MISSION_BTN_CONFIRM_FINISH)
        .setLabel("Подтвердить и выдать награды")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(MISSION_BTN_ABORT_FINISH)
        .setLabel("Отмена")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✖️")
    ),
  ];
}

/**
 * Detailed report embed on reward delivery results.
 */
export function createRewardReportEmbed(mission, result) {
  const { allDelivered, deliveryReport = [] } = result;
  const color = allDelivered ? 0x22c55e : 0xef4444;
  const title = allDelivered
    ? `✅ Награды успешно выданы: ${mission.title}`
    : `⚠️ Частичная выдача наград: ${mission.title}`;

  const lines = [];
  for (const rep of deliveryReport) {
    const r = rep.rewards;
    const items = [];
    if (r.ap) items.push(`AP: ${r.ap.status === "failed" ? "❌ " + r.ap.error : "✅ +" + r.ap.amount}`);
    if (r.sp) items.push(`SP: ${r.sp.status === "failed" ? "❌ " + r.sp.error : "✅ +" + r.sp.amount}`);
    if (r.reputation) {
      items.push(
        `Rtg: ${r.reputation.status === "failed" ? "❌ " + r.reputation.error : "✅ +" + r.reputation.amount}`
      );
    }
    if (r.item) {
      items.push(
        `Предмет: ${r.item.status === "failed" ? "❌ " + r.item.error : "✅ " + r.item.itemName + " ×" + r.item.qty}`
      );
    }

    lines.push(`**${rep.character_name}:** ${items.join(" | ")}`);
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      [
        `**ID миссии:** \`${mission.public_id}\``,
        allDelivered
          ? "Все награды успешно начислены в базу данных!"
          : "⚠️ У некоторых участников произошла ошибка (например, нет изученных стилей). Вы можете исправить причину и повторить выдачу только невыданных наград.",
        "",
        lines.join("\n\n"),
      ].join("\n")
    )
    .setTimestamp();

  return embed;
}

/**
 * Retry action row for partial delivery failures.
 */
export function createRetryDeliveryActionRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(MISSION_BTN_RETRY_REWARDS)
        .setLabel("Повторить невыданные награды")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄")
    ),
  ];
}
