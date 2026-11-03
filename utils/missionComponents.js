import { RESPONSE_COLORS, setResponseState, cleanText, markdownText, truncateText } from "./responseStyle.js";
import { createStatusComponents } from "./modernResponses.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  MISSION_EMOJIS,
  MISSION_STATUS,
  parseOptionEmoji,
  resolveCustomEmoji,
  STATUS_ICONS,
  STATUS_LABELS,
  TYPE_ICONS,
  TYPE_LABELS,
} from "./missionStore.js";
import { safeAvatarUrl } from "./avatarUrl.js";
import { formatRankRequirement } from "./rankSystem.js";
import { getReputationTier } from "./dataManager.js";

const STATUS_COLORS = {
  [MISSION_STATUS.recruiting]: RESPONSE_COLORS.brand,
  [MISSION_STATUS.active]: RESPONSE_COLORS.brand,
  [MISSION_STATUS.completed]: RESPONSE_COLORS.success,
  [MISSION_STATUS.cancelled]: RESPONSE_COLORS.closed,
};

export const MISSION_BTN_DETAILS = "mission_details";
export const MISSION_BTN_JOIN = "mission_join";
export const MISSION_BTN_LEAVE = "mission_leave";
export const MISSION_BTN_PARTY = "mission_party";
export const MISSION_BTN_PROFILES = "mission_profiles";
export const MISSION_BTN_START = "mission_start";
export const MISSION_BTN_FINISH = "mission_finish";
export const MISSION_BTN_CANCEL = "mission_cancel";
export const MISSION_BTN_KICK = "mission_kick";
export const MISSION_BTN_CONFIRM_FINISH = "mission_finish_confirm";
export const MISSION_BTN_ABORT_FINISH = "mission_cancel_finish";
export const MISSION_BTN_RETRY_REWARDS = "mission_retry_rewards";
export const MISSION_SELECT_MEMBER = "mission_member_select";
export const MISSION_SELECT_KICK = "mission_select_kick";
export const MISSION_SELECT_UNKICK = "mission_select_unkick";

function missionRewardLines(mission) {
  // Format rewards
  const rewardLines = [];
  if (mission.reward?.krw > 0) {
    rewardLines.push(`• <:Flag_of_South_Korea:1438985777949179935>  +${Number(mission.reward.krw).toLocaleString("ru-RU")} KRW каждому (на баланс)`);
  }
  if (mission.reward?.yen > 0) {
    rewardLines.push(`• <:2640japanflag:1438980353925714081>  +${Number(mission.reward.yen).toLocaleString("ru-RU")} ¥ каждому (на баланс)`);
  }
  if (mission.reward?.ap > 0) {
    rewardLines.push(`• +${mission.reward.ap} AP каждому`);
  }
  if (mission.reward?.sp > 0) {
    rewardLines.push(`• +${mission.reward.sp} SP каждому`);
  }
  if (mission.reward?.reputation > 0) {
    rewardLines.push(`• +${mission.reward.reputation} Rtg каждому`);
  }

  const items = Array.isArray(mission.reward?.items) && mission.reward.items.length > 0
    ? mission.reward.items
    : (mission.reward?.item?.item_name ? [mission.reward.item] : []);

  for (const item of items) {
    const isRandom = item.distribution === "random";
    const distBadge = isRandom ? " 🎲 *(случайному участнику)*" : " *(каждому)*";
    rewardLines.push(`• Предмет: **${item.item_name}** ×${item.quantity || 1}${distBadge}`);
  }

  if (rewardLines.length === 0) {
    rewardLines.push("• Без автоматических наград");
  }

  return { rewardLines, items };
}

export function createMissionDetailsComponents(mission) {
  const { rewardLines } = missionRewardLines(mission);
  return createStatusComponents(`Условия • ${cleanText(mission.title, 120)}`,
    `${mission.description || "Цель не указана."}\n\n### Награды\n${rewardLines.join("\n")}\n\n` +
    "Исход сцены и канонические последствия определяют игроки и ГМ. Бот учитывает участников и выдаёт настроенные награды.", "info");
}

/**
 * Creates the main interactive mission card embed.
 */
export function createMissionCardEmbed(mission, client = null) {
  const rawTypeIcon = TYPE_ICONS[mission.type] || "📜";
  const typeIcon = resolveCustomEmoji(rawTypeIcon, client);
  const typeLabel = TYPE_LABELS[mission.type] || "Миссия";
  const statusIcon = STATUS_ICONS[mission.status] || "ℹ️";
  const statusLabel = STATUS_LABELS[mission.status] || mission.status;
  const color = STATUS_COLORS[mission.status] || 0xb209d4;

  const partyIcon = resolveCustomEmoji(MISSION_EMOJIS.party, client);
  const objectiveIcon = resolveCustomEmoji(MISSION_EMOJIS.objective, client);
  const rewardsIcon = resolveCustomEmoji(MISSION_EMOJIS.rewards, client);

  const orgDisplay = mission.organization_name
    ? mission.organization_name
    : "Открытая миссия";

  // Format party roster
  const partyLines = [];
  if (mission.participants && mission.participants.length > 0) {
    for (const p of mission.participants.slice(0, 4)) {
      const orgRank = [p.organization_name, p.rank].filter(Boolean).join(" / ");
      partyLines.push(`• **${markdownText(p.character_name, 70)}** — ${markdownText(orgRank || "вольный", 70)}`);
    }
  } else {
    partyLines.push("Пока нет участников. Выберите «Вступить в миссию», если условия подходят.");
  }

  const { rewardLines, items } = missionRewardLines(mission);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(truncateText(`${typeIcon} ${cleanText(mission.title, 200)}`, 256))
    .setDescription(
      [
        `**Организация:** ${markdownText(orgDisplay, 120)}`,
        `**Тип:** ${typeLabel}`,
        `**Статус:** ${statusIcon} ${statusLabel}`,
        mission.min_rank ? `**Требуемый ранг:** ${formatRankRequirement(mission.min_rank)}` : null,
        "",
        `### ${objectiveIcon} Краткая цель:`,
        truncateText(mission.description, 1000),
        "",
        `### ${partyIcon} Участники: ${mission.participants?.length || 0} / ${mission.max_players}`,
        partyLines.join("\n"),
        (mission.participants?.length > 4 ? `Ещё ${mission.participants.length - 4}. Полный список — «Участники».` : null),
        "",
        `### ${rewardsIcon} Награды:`,
        truncateText(rewardLines.join("\n"), 1000),
        "",
        `**ГМ:** ${markdownText(mission.created_by?.username || "Не указан", 80)}`,
        mission.status === MISSION_STATUS.recruiting
          ? ((mission.participants?.length || 0) >= mission.max_players ? "Набор заполнен. Вступление станет доступно, если освободится место." : "Набор открыт. Вступление и выход доступны до начала миссии.")
          : "Набор закрыт. Участие и выход больше недоступны.",
        "-# Полные условия и награды — «Условия миссии». Управление миссией доступно ГМу и администраторам.",
      ].filter((line) => line !== null).join("\n")
    );

  if (mission.status === MISSION_STATUS.completed) {
    const completedLines = [
      "Награды автоматически выданы участникам.",
      `Завершил: **${mission.completed_by?.username || "ГМ"}**`,
    ];

    const deliveries = mission.reward_delivery || {};
    const randomWinnerLines = [];
    items.forEach((it, idx) => {
      if (it.distribution === "random") {
        const winnerKey = `mission:${mission.public_id}:item:${idx}:winner`;
        const winner = deliveries[winnerKey];
        if (winner?.winner_character_name) {
          randomWinnerLines.push(`• 🎲 **${it.item_name}** ×${it.quantity || 1} достался: **${winner.winner_character_name}**`);
        }
      }
    });

    if (randomWinnerLines.length > 0) {
      completedLines.push("", "**Победители случайных наград:**", ...randomWinnerLines);
    }

    embed.addFields({
      name: "🏆 Завершение",
      value: truncateText(completedLines.join("\n"), 1024),
      inline: false,
    });
  } else if (mission.status === MISSION_STATUS.cancelled) {
    embed.addFields({
      name: "❌ Отмена",
      value: `Миссия отменена.\nПричина: *${markdownText(mission.cancel_reason || "не указана", 400)}*`,
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

  return setResponseState(embed, mission.status === MISSION_STATUS.completed ? "success"
    : mission.status === MISSION_STATUS.cancelled ? "closed" : "info");
}

/**
 * Creates Discord Action Rows for the mission card buttons.
 */
export function createMissionActionRows(mission, client = null) {
  const isRecruiting = mission.status === MISSION_STATUS.recruiting;
  const isCompleted = mission.status === MISSION_STATUS.completed;
  const isCancelled = mission.status === MISSION_STATUS.cancelled;
  const isFull = (mission.participants?.length || 0) >= mission.max_players;
  const partyButtonEmoji = parseOptionEmoji(
    resolveCustomEmoji(MISSION_EMOJIS.party, client),
    "👥"
  );

  // Row 1: Player Actions
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_JOIN)
      .setLabel("Вступить в миссию")
      .setStyle(ButtonStyle.Success)
      .setEmoji("➕")
      .setDisabled(!isRecruiting || isFull),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_LEAVE)
      .setLabel("Покинуть миссию")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚪")
      .setDisabled(!isRecruiting),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_PARTY)
      .setLabel("Участники")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(partyButtonEmoji),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_PROFILES)
      .setLabel("Профили участников")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🧬")
      .setDisabled(!mission.participants || mission.participants.length === 0),
    new ButtonBuilder().setCustomId(MISSION_BTN_DETAILS).setLabel("Условия миссии").setStyle(ButtonStyle.Secondary)
  );

  // Row 2: GM / Admin Actions
  const hasParticipants = Array.isArray(mission.participants) && mission.participants.length > 0;
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
      .setCustomId(MISSION_BTN_KICK)
      .setLabel("Исключить")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👢")
      .setDisabled(!isRecruiting || !hasParticipants),
    new ButtonBuilder()
      .setCustomId(MISSION_BTN_CANCEL)
      .setLabel("Отменить миссию")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️")
      .setDisabled(isCompleted || isCancelled)
  );

  return [row1, row2];
}

/**
 * Ephemeral embed showing detailed party members list.
 */
export function createPartyListEmbed(mission, client = null) {
  const partyIcon = resolveCustomEmoji(MISSION_EMOJIS.party, client);
  const participants = mission.participants || [];
  const lines = [];

  if (participants.length === 0) {
    lines.push("В этой миссии пока нет участников.");
  } else {
    participants.forEach((p, index) => {
      const org = p.organization_name || "Без организации";
      const rank = p.rank ? ` (${p.rank})` : "";
      const rep = Number(p.reputation ?? 20);
      const repTier = getReputationTier(rep);
      const joinedAt = p.joined_at
        ? `<t:${Math.floor(new Date(p.joined_at).getTime() / 1000)}:R>`
        : "недавно";
      lines.push(
        `**${index + 1}. ${p.character_name}**\n` +
        `• Организация: **${org}**${rank}\n` +
        `• Репутация: **${rep} Rtg** ${repTier.emoji} *${repTier.name}*\n` +
        `• Вступил: ${joinedAt}`
      );
    });
  }

  return new EmbedBuilder()
    .setColor(RESPONSE_COLORS.info)
    .setTitle(`${partyIcon} Состав пати: ${mission.title}`)
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

  const options = participants.slice(0, 25).map((p, idx) => {
    const rep = Number(p.reputation ?? 20);
    const tier = getReputationTier(rep);
    const org = p.organization_name || "Вольный";
    const rank = p.rank || "Нет ранга";
    const desc = `${org} · ${rank} · ${rep} Rtg (${tier.name})`.slice(0, 100);
    return {
      label: `${idx + 1}. ${p.character_name.slice(0, 80)}`,
      description: desc,
      value: p.player_id,
      emoji: tier.emoji,
    };
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MISSION_SELECT_MEMBER)
      .setPlaceholder("Выберите участника для просмотра профиля...")
      .addOptions(options)
  );
}

/**
 * Creates select menu to choose a participant to kick from the party.
 */
export function createKickMemberSelectRow(mission) {
  const participants = mission.participants || [];
  if (participants.length === 0) return null;

  const options = participants.slice(0, 25).map((p, idx) => {
    const rep = Number(p.reputation ?? 20);
    const org = p.organization_name || "Без орг.";
    const desc = `Игрок: @${p.user_id} · ${org} · ${rep} Rtg`.slice(0, 100);
    return {
      label: `${idx + 1}. ${p.character_name}`.slice(0, 100),
      description: desc,
      value: p.player_id,
      emoji: "👢",
    };
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MISSION_SELECT_KICK)
      .setPlaceholder("Выберите участника для исключения из пати...")
      .addOptions(options)
  );
}

/**
 * Creates select menu to unban a previously kicked participant.
 */
export function createUnkickMemberSelectRow(mission) {
  const kickedUserIds = mission.kicked_user_ids || [];
  if (kickedUserIds.length === 0) return null;

  const options = kickedUserIds.slice(0, 25).map((uid, idx) => ({
    label: `${idx + 1}. Разблокировать ID: ${uid}`.slice(0, 100),
    description: `Разрешить пользователю вновь вступать в миссию`.slice(0, 100),
    value: uid,
    emoji: "🔓",
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MISSION_SELECT_UNKICK)
      .setPlaceholder("Разблокировать ранее исключенного игрока...")
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
  const rep = Number(player.reputation ?? 20);
  const repTier = getReputationTier(rep);
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
        `**Репутация:** **${rep} Rtg** ${repTier.emoji} *${repTier.name}*`,
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
  if (mission.reward?.krw > 0) rewards.push(`• +${Number(mission.reward.krw).toLocaleString("ru-RU")} KRW каждому (на баланс)`);
  if (mission.reward?.yen > 0) rewards.push(`• +${Number(mission.reward.yen).toLocaleString("ru-RU")} YEN каждому (на баланс)`);
  if (mission.reward?.ap > 0) rewards.push(`• +${mission.reward.ap} AP каждому`);
  if (mission.reward?.sp > 0) rewards.push(`• +${mission.reward.sp} SP каждому (в основной стиль)`);
  if (mission.reward?.reputation > 0) rewards.push(`• +${mission.reward.reputation} Rtg каждому`);

  const items = Array.isArray(mission.reward?.items) && mission.reward.items.length > 0
    ? mission.reward.items
    : (mission.reward?.item?.item_name ? [mission.reward.item] : []);

  for (const it of items) {
    const isRandom = it.distribution === "random";
    const distBadge = isRandom ? " 🎲 *(1 случайному участнику)*" : " *(каждому)*";
    rewards.push(`• Предмет: **${it.item_name}** ×${it.quantity || 1}${distBadge}`);
  }

  const memberNames = participants.map((p) => `• ${p.character_name}`).join("\n");

  return new EmbedBuilder()
    .setColor(RESPONSE_COLORS.confirm)
    .setTitle(`🏁 Подтверждение завершения: ${mission.title}`)
    .setDescription(
      [
        `**ID миссии:** \`${mission.public_id}\``,
        `**Участников к награждению:** ${participants.length}`,
        "",
        "### Получатели наград:",
        memberNames || "*Нет участников в пати*",
        "",
        "### Награды за миссию:",
        rewards.join("\n") || "• Без наград",
        "",
        "⚠️ **Внимание:** После подтверждения бот автоматически начислит награды участникам. Случайные предметы будут разыграны среди участников пати. Действие необратимо.",
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
  const color = allDelivered ? RESPONSE_COLORS.success : RESPONSE_COLORS.warning;
  const title = allDelivered
    ? `✅ Награды успешно выданы: ${mission.title}`
    : `⚠️ Частичная выдача наград: ${mission.title}`;

  const lines = [];
  for (const rep of deliveryReport) {
    const r = rep.rewards;
    const items = [];
    if (r.krw) {
      items.push(
        `KRW: ${r.krw.status === "failed" ? "❌ " + r.krw.error : "✅ +" + Number(r.krw.amount).toLocaleString("ru-RU") + " ₩"}`
      );
    }
    if (r.yen) {
      items.push(
        `YEN: ${r.yen.status === "failed" ? "❌ " + r.yen.error : "✅ +" + Number(r.yen.amount).toLocaleString("ru-RU") + " ¥"}`
      );
    }
    if (r.ap) items.push(`AP: ${r.ap.status === "failed" ? "❌ " + r.ap.error : "✅ +" + r.ap.amount}`);
    if (r.sp) {
      if (r.sp.status === "failed") {
        items.push(`SP: ❌ ${r.sp.error}`);
      } else if (r.sp.status === "skipped") {
        items.push(`SP: ⚠️ ${r.sp.error || "пропущено (нет стиля)"}`);
      } else {
        items.push(`SP: ✅ +${r.sp.amount}`);
      }
    }
    if (r.reputation) {
      items.push(
        `Rtg: ${r.reputation.status === "failed" ? "❌ " + r.reputation.error : "✅ +" + r.reputation.amount}`
      );
    }
    if (Array.isArray(r.items) && r.items.length > 0) {
      for (const it of r.items) {
        const icon = it.status === "failed" ? "❌ " : "✅ ";
        const randomIcon = it.isWinner ? "🎲 " : "";
        const errorPart = it.status === "failed" ? ` (${it.error})` : ` ×${it.qty}`;
        items.push(`Предмет: ${icon}${randomIcon}${it.itemName}${errorPart}`);
      }
    } else if (r.item) {
      items.push(
        `Предмет: ${r.item.status === "failed" ? "❌ " + r.item.error : "✅ " + r.item.itemName + " ×" + r.item.qty}`
      );
    }

    lines.push(`**${rep.character_name}:** ${items.join(" | ")}`);
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(truncateText(title, 256))
    .setDescription(
      [
        `**ID миссии:** \`${mission.public_id}\``,
        allDelivered
          ? "Все награды успешно начислены в базу данных!"
          : "⚠️ У некоторых участников произошла ошибка при начислении наград. Вы можете устранить проблему и нажать повтор.",
        "",
        lines.join("\n\n"),
      ].join("\n")
    )
    .setTimestamp();

  return setResponseState(embed, allDelivered ? "success" : "warning");
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
