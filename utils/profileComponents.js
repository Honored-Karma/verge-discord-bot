import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { isValidCharacterUrl, physicalStatsSummary } from "./physicalStats.js";
import { safeAvatarUrl } from "./avatarUrl.js";
import { getProfileMultipliers } from "./embeds.js";
import { RESPONSE_COLORS, markdownText, formatNumber, truncateText, splitResponseText } from "./responseStyle.js";

const PROFILE_COLOR = RESPONSE_COLORS.brand;

export const PROFILE_INVENTORY_ID = "profile_inventory";
export const PROFILE_TEXT_ID = "profile_text";
export const PROFILE_REFRESH_ID = "profile_refresh";

/**
 * Действия вынесены в отдельный ряд, ниже вкладок. Вкладки переключают вид этой
 * же панели, а инвентарь открывает новое окно — в одном ряду эти кнопки было бы
 * не отличить друг от друга.
 */
function createActions(disabled = false, textMode = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PROFILE_INVENTORY_ID)
      .setLabel("Открыть инвентарь")
      .setEmoji("🎒")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder().setCustomId(PROFILE_TEXT_ID)
      .setLabel(textMode ? "Показать изображение" : "Показать текст")
      .setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(PROFILE_REFRESH_ID).setLabel("Обновить")
      .setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

function createTabs(activePage, disabled = false) {
  const tabs = [
    { id: "profile_main", page: "main", label: "Досье", emoji: "👤" },
    { id: "profile_physical", page: "physical", label: "Физические показатели", emoji: "💪" },
    { id: "profile_history", page: "history", label: "История", emoji: "🕓" },
  ];

  return new ActionRowBuilder().addComponents(
    tabs.map((tab) =>
      new ButtonBuilder()
        .setCustomId(tab.id)
        .setLabel(tab.label)
        .setEmoji(tab.emoji)
        .setStyle(tab.page === activePage ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled || tab.page === activePage),
    ),
  );
}

function createGallery(imageName, description) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${imageName}`)
      .setDescription(truncateText(description, 1024)),
  );
}

function formatHistory(history) {
  if (!history?.length) return "Изменений пока нет. Здесь появятся начисления AP и SP после тренировок и других действий.";

  return history
    .slice(0, 8).map((entry) => {
      const amount = Number(entry.delta || 0);
      const sign = amount >= 0 ? "+" : "−";
      const formatted = Math.abs(amount).toLocaleString("ru-RU");
      const date = new Date(entry.changed_at).getTime();
      const timestamp = Number.isFinite(date) ? Math.floor(date / 1000) : null;
      const relativeTime = timestamp ? ` • <t:${timestamp}:R>` : "";
      const styleName = entry.style_name ? ` • ${markdownText(entry.style_name, 100)}` : "";
      return `**${String(entry.type || "Изменение").toUpperCase()}**  ${sign}${formatted}${styleName}${relativeTime}`;
    })
    .join("\n");
}

/**
 * Текстовый вид основной страницы. Показывается дважды: как первая фаза ответа,
 * пока рисуется карточка, и как постоянный вид, если канвас не справился.
 * Поэтому он должен читаться законченным, а не заготовкой под картинку.
 */
function mainFallback(player, totalSP, leaderboardRank = null, styles = [], slot = 1) {
  const number = formatNumber;
  const name = markdownText(player.character_name || player.username || "Без имени", 160);
  const org = markdownText(player.organization || player.custom_org, 120);
  const affiliation = org
    ? `${org}${player.rank ? ` · ${player.rank}` : ""}`
    : "Без организации";

  const rankPos = typeof leaderboardRank === "object" ? leaderboardRank?.position : leaderboardRank;
  const rankTotal = typeof leaderboardRank === "object" ? leaderboardRank?.total : null;
  const rankLine = rankPos
    ? `🏆 **#${number(rankPos)}** в лидерборде${rankTotal ? ` (из ${number(rankTotal)})` : ""}`
    : null;

  const lines = [
    `## Досье • ${name}`,
    `-# ${affiliation}${player.attribute_name ? ` · ${markdownText(player.attribute_name, 100)}` : ""} · слот ${slot}`,
    "",
    `**AP: ${number(player.ap)}** · **SP всего: ${number(totalSP)}**`,
    `Баланс: **${number(player.krw)} ₩** · **${number(player.yen)} ¥**`,
    `Репутация: **${number(player.reputation)}**`,
  ];
  if (rankLine) {
    lines.push(rankLine);
  }
  const multipliers = getProfileMultipliers(player);
  lines.push("", "### Множители", `AP: **${number(multipliers.ap)}%** · SP: **${number(multipliers.sp)}%** · зарплата: **${number(player.salary_multiplier ?? 100)}%**`,
    `-# Бонус ранга и активности уже включён: +${number(multipliers.dynamicBonus)}%.`);
  if (multipliers.apExpiresAt) lines.push(`Временный множитель AP: до <t:${multipliers.apExpiresAt}:R>.`);
  if (multipliers.spExpiresAt) lines.push(`Временный множитель SP: до <t:${multipliers.spExpiresAt}:R>.`);
  lines.push("", "### Боевые стили", styles.length
    ? styles.map((style) => `• ${markdownText(style.name, 100)} — **${number(style.sp)} SP**`).join("\n")
    : "Стили ещё не изучены. Получить стиль можно у ответственного за развитие персонажей.");
  return lines.join("\n");
}

export function createProfileV2Components({
  page,
  player,
  user,
  slot,
  totalSP = 0,
  leaderboardRank = null,
  history = [],
  imageName = null,
  styles = [],
  textMode = false,
  disabled = false,
}) {
  const name = markdownText(player.character_name || player.username || "Без имени", 160);
  const container = new ContainerBuilder().setAccentColor(PROFILE_COLOR);

  if (page === "main") {
    if (imageName) {
      container.addMediaGalleryComponents(
        createGallery(imageName, `Основной профиль персонажа ${name}`),
      );
    } else {
      container.addTextDisplayComponents(
        splitResponseText(mainFallback(player, totalSP, leaderboardRank, styles, slot)).map(text => new TextDisplayBuilder().setContent(text)),
      );
    }
  } else if (page === "physical") {
    if (imageName) {
      container.addMediaGalleryComponents(
        createGallery(imageName, `Физические характеристики персонажа ${name}`),
      );
    } else {
      const fallback = player.physical_stats
        ? physicalStatsSummary(player.physical_stats)
        : "**Показатели ещё не зарегистрированы.**\nОбратитесь к ответственному за анкеты персонажей.";
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Физические показатели • ${name}\n${fallback}`),
      );
    }

    if (isValidCharacterUrl(player.physical_stats?.character_url)) {
      const safeUrl = player.physical_stats.character_url.replaceAll(")", "%29");
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`🔗 [Открыть анкету персонажа](${safeUrl})`),
      );
    }
  } else {
    const historyText = new TextDisplayBuilder().setContent(
      `## История • ${name}\n${formatHistory(history)}\n\n-# ID: ${player.id} • Слот ${slot}`,
    );

    const historyAvatar = player.character_avatar
      ? safeAvatarUrl(player.character_avatar)
      : safeAvatarUrl(user?.displayAvatarURL?.({ extension: "png", size: 256 }));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(historyText)
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(historyAvatar)
            .setDescription(`Аватар ${name}`),
        ),
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addActionRowComponents(createTabs(page, disabled))
    .addActionRowComponents(createActions(disabled, textMode));

  return [container];
}
