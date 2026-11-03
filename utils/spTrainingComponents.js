import { RESPONSE_COLORS, markdownText, formatNumber } from "./responseStyle.js";
import { createStatusComponents } from "./modernResponses.js";
import { createActivityResultComponents } from "./trainingComponents.js";
import { TRAINING_RULES, trainingRequirements } from "./trainingRules.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { didMasteryRankChange, getSPMastery } from "./spMastery.js";

export const SP_TRAINING_MODAL_PREFIX = "train_sp_modal:";
export const SP_TRAINING_TEXT_INPUT_ID = "sp_training_text";
export const SP_STYLE_SELECT_ID = "train_sp_style";
export const SP_STYLE_PREV_ID = "train_sp_prev";
export const SP_STYLE_NEXT_ID = "train_sp_next";

const ACCENT_COLOR = RESPONSE_COLORS.brand;

const STYLES_PER_PAGE = 25;

export function getSPStylePageCount(styles) {
  return Math.max(1, Math.ceil(styles.length / STYLES_PER_PAGE));
}

export function createSPStyleSelectionComponents({
  characterName,
  styles,
  page = 0,
  disabled = false,
}) {
  if (!styles.length) return createStatusComponents("Нет изученных стилей", "Получите боевой стиль у ответственного за развитие персонажей, затем откройте `/train-sp`.", "empty");
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
        `**${markdownText(characterName, 120)}**, выберите стиль, который хотите развить.\n\n` +
        `${trainingRequirements("sp")}\n` +
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
    .setMinLength(TRAINING_RULES.sp.minLength)
    .setMaxLength(TRAINING_RULES.sp.maxLength)
    .setPlaceholder("Опишите технику, последовательность действий, ошибки и работу над ними…")
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`${SP_TRAINING_MODAL_PREFIX}${slot}:${style.id}`)
    .setTitle(`Тренировка: ${String(style.name).slice(0, 28)}`)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${markdownText(style.name, 120)}\nОпишите полноценную тренировку этого боевого стиля. После отправки бот проверит текст и начислит SP.`,
      ),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Текст тренировки")
        .setDescription(trainingRequirements("sp"))
        .setTextInputComponent(input),
    );
}

export function createSPTrainingSuccessComponents(data) {
  const mastery = getSPMastery(data.newSP);
  const rankChange = didMasteryRankChange(data.oldSP, data.newSP);
  const progressText = `Стиль: **${markdownText(data.styleName, 100)}** · мастерство: **${mastery.rank}**` +
    (rankChange ? `\nНовый уровень: ${rankChange.before.rank} → **${rankChange.after.rank}**` : "") +
    (mastery.isMax ? "\nДостигнут максимальный уровень мастерства." : `\nДо уровня «${mastery.nextRank}»: **${formatNumber(mastery.remaining)} SP**`);
  return createActivityResultComponents({ ...data, newValue: data.newSP, activityText: data.trainingText,
    resource: "SP", title: "Тренировка стиля завершена", nextActionLabel: "Следующая тренировка стиля", progressText });
}

export function createSPTrainingErrorComponents(title, message, state = "error") {
  return createStatusComponents(title, message, state);
}
