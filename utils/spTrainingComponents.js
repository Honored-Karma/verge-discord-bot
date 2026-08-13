import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";
import { didMasteryRankChange, getSPMastery } from "./spMastery.js";

export const SP_TRAINING_MODAL_PREFIX = "train_sp_modal:";
export const SP_TRAINING_TEXT_INPUT_ID = "sp_training_text";
export const SP_STYLE_SELECT_ID = "train_sp_style";
export const SP_STYLE_PREV_ID = "train_sp_prev";
export const SP_STYLE_NEXT_ID = "train_sp_next";

const ACCENT_COLOR = 0x22d3ee;
const ERROR_COLOR = 0xef4444;
const STYLES_PER_PAGE = 25;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function progressBar(ratio, length = 20) {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const filled = Math.round(safeRatio * length);
  return `${"▰".repeat(filled)}${"▱".repeat(length - filled)}`;
}

export function getSPStylePageCount(styles) {
  return Math.max(1, Math.ceil(styles.length / STYLES_PER_PAGE));
}

export function createSPStyleSelectionComponents({
  characterName,
  styles,
  page = 0,
  disabled = false,
}) {
  const pageCount = getSPStylePageCount(styles);
  const safePage = Math.max(0, Math.min(pageCount - 1, page));
  const pageStyles = styles.slice(
    safePage * STYLES_PER_PAGE,
    (safePage + 1) * STYLES_PER_PAGE,
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(SP_STYLE_SELECT_ID)
    .setPlaceholder("Выберите стиль для тренировки")
    .setDisabled(disabled)
    .addOptions(
      pageStyles.map((style) => {
        const mastery = getSPMastery(style.sp);
        return {
          label: String(style.name).slice(0, 100),
          value: String(style.id),
          description: `${mastery.rank} • ${formatNumber(style.sp)} SP`.slice(0, 100),
          emoji: mastery.emoji,
        };
      }),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Тренировка боевого стиля\n` +
        `**${characterName}**, выберите стиль, который хотите развить.\n\n` +
        `Награда: **10 SP × множитель** • кулдаун: **5 часов**\n` +
        `-# В списке доступны только изученные стили.`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));

  if (pageCount > 1) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Страница ${safePage + 1} из ${pageCount}`),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(SP_STYLE_PREV_ID)
            .setLabel("Назад")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || safePage === 0),
          new ButtonBuilder()
            .setCustomId(SP_STYLE_NEXT_ID)
            .setLabel("Вперёд")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || safePage === pageCount - 1),
        ),
      );
  }

  return [container];
}

export function createSPTrainingModal(slot, style) {
  const input = new TextInputBuilder()
    .setCustomId(SP_TRAINING_TEXT_INPUT_ID)
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(500)
    .setMaxLength(4000)
    .setPlaceholder("Опишите технику, последовательность действий, ошибки и работу над ними…")
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`${SP_TRAINING_MODAL_PREFIX}${slot}:${style.id}`)
    .setTitle(`Тренировка: ${String(style.name).slice(0, 28)}`)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${style.name}\nОпишите полноценную тренировку этого боевого стиля. После отправки бот проверит текст и начислит SP.`,
      ),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Текст тренировки")
        .setDescription("От 500 до 4 000 символов. Используйте связное описание.")
        .setTextInputComponent(input),
    );
}

export function createSPTrainingSuccessComponents({
  characterName,
  avatarUrl,
  styleName,
  baseReward,
  gained,
  multiplier,
  dynamicBonus,
  oldSP,
  newSP,
  retryAt,
  trainingText,
}) {
  const mastery = getSPMastery(newSP);
  const rankChange = didMasteryRankChange(oldSP, newSP);
  const excerptWasTrimmed = String(trainingText || "").length > 520;
  const excerpt = String(trainingText || "")
    .slice(0, 520)
    .replaceAll("```", "''' ");
  const rankLine = rankChange
    ? `\n### Новый уровень мастерства\n${rankChange.before.emoji} ${rankChange.before.rank} → ${rankChange.after.emoji} **${rankChange.after.rank}**\n`
    : "";
  const progressText = mastery.isMax
    ? `${progressBar(1)} **100%**\nДостигнут максимальный уровень — **Мастер**.`
    : `${progressBar(mastery.ratio)} **${Math.round(mastery.ratio * 100)}%**\n` +
      `**${formatNumber(newSP)} / ${formatNumber(mastery.nextThreshold)} SP** • до уровня «${mastery.nextRank}» осталось ${formatNumber(mastery.remaining)} SP`;
  const bonusLine = Number(dynamicBonus) > 0
    ? `\n-# Бонус ранга и активности: +${formatNumber(dynamicBonus)}%`
    : "";

  const summary = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Тренировка стиля завершена\n` +
        `**${characterName}** получает **+${formatNumber(gained)} SP** в стиле **${styleName}**.\n\n` +
        `Базовая награда: **${formatNumber(baseReward)} SP**\n` +
        `Множитель: **${formatNumber(multiplier)}%**${bonusLine}`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`Аватар персонажа ${characterName}`),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addSectionComponents(summary)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${mastery.emoji} ${mastery.rank} • ${styleName}\n${progressText}${rankLine}\nСледующая тренировка: <t:${retryAt}:R>`,
      ),
    );

  if (excerpt) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Фрагмент тренировки\n> ${excerpt.replaceAll("\n", "\n> ")}${excerptWasTrimmed ? "…" : ""}`,
        ),
      );
  }

  return [container];
}

export function createSPTrainingErrorComponents(title, message) {
  return [
    new ContainerBuilder()
      .setAccentColor(ERROR_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}\n${message}`),
      ),
  ];
}
