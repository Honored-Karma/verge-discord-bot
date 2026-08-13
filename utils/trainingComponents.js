import {
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";
import { getAdaptiveProgressScale } from "./progressScale.js";

export const TRAINING_MODAL_PREFIX = "train_ap_modal:";
export const TRAINING_TEXT_INPUT_ID = "training_text";
export const SOCIAL_RP_MODAL_PREFIX = "social_rp_modal:";
export const SOCIAL_RP_TEXT_INPUT_ID = "social_rp_text";

const TRAINING_COLOR = 0xf59e0b;
const SOCIAL_RP_COLOR = 0x8b5cf6;
const ERROR_COLOR = 0xef4444;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function progressBar(ratio, length = 20) {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const filled = Math.round(safeRatio * length);
  return `${"▰".repeat(filled)}${"▱".repeat(length - filled)}`;
}

function createAPActivityModal({
  slot,
  prefix,
  inputId,
  title,
  heading,
  intro,
  label,
  description,
  placeholder,
  minLength,
}) {
  const input = new TextInputBuilder()
    .setCustomId(inputId)
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(minLength)
    .setMaxLength(4000)
    .setPlaceholder(placeholder)
    .setRequired(true);

  const field = new LabelBuilder()
    .setLabel(label)
    .setDescription(description)
    .setTextInputComponent(input);

  return new ModalBuilder()
    .setCustomId(`${prefix}${slot}`)
    .setTitle(title)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${heading}\n${intro}`,
      ),
    )
    .addLabelComponents(field);
}

export function createTrainingModal(slot) {
  return createAPActivityModal({
    slot,
    prefix: TRAINING_MODAL_PREFIX,
    inputId: TRAINING_TEXT_INPUT_ID,
    title: "Тренировка AP",
    heading: "Физическая тренировка",
    intro: "Опишите полноценную сцену тренировки персонажа. После отправки бот проверит текст и начислит AP с учётом множителя.",
    label: "Текст тренировки",
    description: "От 800 до 4 000 символов. Пишите связный текст без спама символами.",
    placeholder: "Опишите действия персонажа, нагрузку и ход тренировки…",
    minLength: 800,
  });
}

export function createSocialRPModal(slot) {
  return createAPActivityModal({
    slot,
    prefix: SOCIAL_RP_MODAL_PREFIX,
    inputId: SOCIAL_RP_TEXT_INPUT_ID,
    title: "Социальное RP",
    heading: "Социальная сцена",
    intro: "Опишите взаимодействие персонажа с другими героями или окружением. После отправки бот проверит сцену и начислит AP.",
    label: "Текст социальной сцены",
    description: "От 50 до 4 000 символов. Опишите действие и реакцию персонажа.",
    placeholder: "Например: разговор, совместная практика или исследование места…",
    minLength: 50,
  });
}

function createAPActivitySuccessComponents({
  characterName,
  avatarUrl,
  baseReward,
  gained,
  multiplier,
  dynamicBonus,
  shopBonus = 0,
  newAP,
  retryAt,
  activityText,
  title,
  nextActionLabel,
  excerptTitle,
  accentColor,
}) {
  const scale = getAdaptiveProgressScale(newAP, 100);
  const percentage = Math.round(scale.ratio * 100);
  const excerptWasTrimmed = String(activityText || "").length > 520;
  const excerpt = String(activityText || "")
    .slice(0, 520)
    .replaceAll("```", "''' ");
  const bonusLine = Number(dynamicBonus) > 0
    ? `\n-# В множитель включён бонус ранга и активности: +${formatNumber(dynamicBonus)}%`
    : "";
  const shopBonusLine = Number(shopBonus) > 0
    ? `\n-# Активный эффект магазина: +${formatNumber(shopBonus)}%`
    : "";

  const summary = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${title}\n` +
        `**${characterName}** получает **+${formatNumber(gained)} AP**\n\n` +
        `Базовая награда: **${formatNumber(baseReward)} AP**\n` +
        `Множитель: **${formatNumber(multiplier)}%**${bonusLine}${shopBonusLine}`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`Аватар персонажа ${characterName}`),
    );

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(summary)
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Прогресс AP\n` +
        `${progressBar(scale.ratio)} **${percentage}%**\n` +
        `**${formatNumber(scale.current)} / ${formatNumber(scale.next)} AP** до следующей крупной отметки\n\n` +
        `${nextActionLabel}: <t:${retryAt}:R>`,
      ),
    );

  if (excerpt) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${excerptTitle}\n> ${excerpt.replaceAll("\n", "\n> ")}${excerptWasTrimmed ? "…" : ""}`,
        ),
      );
  }

  return [container];
}

export function createTrainingSuccessComponents(data) {
  return createAPActivitySuccessComponents({
    ...data,
    title: "Тренировка завершена",
    nextActionLabel: "Следующая тренировка",
    excerptTitle: "Фрагмент тренировки",
    accentColor: TRAINING_COLOR,
  });
}

export function createSocialRPSuccessComponents(data) {
  return createAPActivitySuccessComponents({
    ...data,
    title: "Социальная сцена завершена",
    nextActionLabel: "Следующая социальная сцена",
    excerptTitle: "Фрагмент сцены",
    accentColor: SOCIAL_RP_COLOR,
  });
}

export function createAPActivityErrorComponents(title, message) {
  return [
    new ContainerBuilder()
      .setAccentColor(ERROR_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}\n${message}`),
      ),
  ];
}
