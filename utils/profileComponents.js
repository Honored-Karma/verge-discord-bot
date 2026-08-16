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

const PROFILE_COLOR = 0xb209d4;

export const PROFILE_INVENTORY_ID = "profile_inventory";

/**
 * Действия вынесены в отдельный ряд, ниже вкладок. Вкладки переключают вид этой
 * же панели, а инвентарь открывает новое окно — в одном ряду эти кнопки было бы
 * не отличить друг от друга.
 */
function createActions(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PROFILE_INVENTORY_ID)
      .setLabel("Инвентарь")
      .setEmoji("🎒")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function createTabs(activePage, disabled = false) {
  const tabs = [
    { id: "profile_main", page: "main", label: "Основная", emoji: "👤" },
    { id: "profile_physical", page: "physical", label: "Физа", emoji: "💪" },
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
      .setDescription(description),
  );
}

function formatHistory(history) {
  if (!history?.length) return "Изменений пока нет.";

  return history
    .map((entry) => {
      const amount = Number(entry.delta || 0);
      const sign = amount >= 0 ? "+" : "−";
      const formatted = Math.abs(amount).toLocaleString("ru-RU");
      const date = new Date(entry.changed_at).getTime();
      const timestamp = Number.isFinite(date) ? Math.floor(date / 1000) : null;
      const relativeTime = timestamp ? ` • <t:${timestamp}:R>` : "";
      const styleName = entry.style_name ? ` • ${entry.style_name}` : "";
      return `**${String(entry.type || "Изменение").toUpperCase()}**  ${sign}${formatted}${styleName}${relativeTime}`;
    })
    .join("\n");
}

/**
 * Текстовый вид основной страницы. Показывается дважды: как первая фаза ответа,
 * пока рисуется карточка, и как постоянный вид, если канвас не справился.
 * Поэтому он должен читаться законченным, а не заготовкой под картинку.
 */
function mainFallback(player, totalSP) {
  const number = (value) => Number(value || 0).toLocaleString("ru-RU");
  const name = player.character_name || player.username || "Неизвестно";
  const org = player.organization || player.custom_org;
  const affiliation = org
    ? `${org}${player.rank ? ` · ${player.rank}` : ""}`
    : "Без организации";

  const lines = [
    `## ${name}`,
    `-# ${affiliation}${player.attribute_name ? ` · ${player.attribute_name}` : ""}`,
    "",
    `**${number(player.ap)}** AP · **${number(totalSP)}** SP`,
    `**${number(player.krw)}** ₩ · **${number(player.yen)}** ¥ · репутация **${number(player.reputation)}**`,
  ];
  return lines.join("\n");
}

export function createProfileV2Components({
  page,
  player,
  user,
  slot,
  totalSP = 0,
  history = [],
  imageName = null,
  disabled = false,
}) {
  const name = player.character_name || player.username || "Неизвестно";
  const container = new ContainerBuilder().setAccentColor(PROFILE_COLOR);

  if (page === "main") {
    if (imageName) {
      container.addMediaGalleryComponents(
        createGallery(imageName, `Основной профиль персонажа ${name}`),
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(mainFallback(player, totalSP)),
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
        new TextDisplayBuilder().setContent(`## Физа • ${name}\n${fallback}`),
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

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(historyText)
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(safeAvatarUrl(user?.displayAvatarURL?.({ extension: "png", size: 256 })))
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
    .addActionRowComponents(createActions(disabled));

  return [container];
}
