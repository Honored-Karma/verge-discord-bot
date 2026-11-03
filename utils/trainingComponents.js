import { RESPONSE_COLORS, markdownText, formatNumber, truncateText } from "./responseStyle.js";
import { safeAvatarUrl } from "./avatarUrl.js";
import { createStatusComponents } from "./modernResponses.js";
import { TRAINING_RULES, trainingRequirements } from "./trainingRules.js";
import {
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";

export const TRAINING_MODAL_PREFIX = "train_ap_modal:";
export const TRAINING_TEXT_INPUT_ID = "training_text";
export const SOCIAL_RP_MODAL_PREFIX = "social_rp_modal:";
export const SOCIAL_RP_TEXT_INPUT_ID = "social_rp_text";

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
    .setMaxLength(TRAINING_RULES.ap.maxLength)
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
    description: trainingRequirements("ap"),
    placeholder: "Опишите действия персонажа, нагрузку и ход тренировки…",
    minLength: TRAINING_RULES.ap.minLength,
  });
}

export function createSocialRPModal(slot) {
  return createAPActivityModal({
    slot,
    prefix: SOCIAL_RP_MODAL_PREFIX,
    inputId: SOCIAL_RP_TEXT_INPUT_ID,
    title: "Социальное РП",
    heading: "Социальная сцена",
    intro: "Опишите взаимодействие персонажа с другими героями или окружением. После отправки бот проверит сцену и начислит AP.",
    label: "Текст социальной сцены",
    description: trainingRequirements("social"),
    placeholder: "Например: разговор, совместная практика или исследование места…",
    minLength: TRAINING_RULES.social.minLength,
  });
}

/** Summary remains visible; the native spoiler container reveals the calculation on demand. */
export function createActivityResultComponents({ characterName, avatarUrl, baseReward, gained,
  multiplier, dynamicBonus, shopBonus = 0, locationFactor = 1, newValue, retryAt,
  activityText, title, resource, nextActionLabel, progressText = "" }) {
  const summary = new ContainerBuilder().setAccentColor(RESPONSE_COLORS.success)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ✓ ${title}\n**${markdownText(characterName, 120)}**\n\n` +
        `Начислено: **+${formatNumber(gained)} ${resource}**\n` +
        `Новое значение: **${formatNumber(newValue)} ${resource}**\n\n` +
        `${nextActionLabel}: <t:${retryAt}:R> · <t:${retryAt}:f>`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(safeAvatarUrl(avatarUrl))
        .setDescription("Аватар персонажа")));
  if (progressText) summary.addTextDisplayComponents(new TextDisplayBuilder().setContent(progressText));
  summary.addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Расчёт и фрагмент текста скрыты ниже. Раскройте блок, чтобы посмотреть подробности."));
  const lines = [
    "### Расчёт начисления",
    `База: **${formatNumber(baseReward)}** · итоговый множитель: **${formatNumber(multiplier)}%**`,
    `Бонус ранга и активности: **+${formatNumber(dynamicBonus)}%** · эффект магазина: **+${formatNumber(shopBonus)}%**`,
    "Бонусы уже включены в итоговый множитель.",
  ];
  if (locationFactor < 1) lines.push(`Повтор в том же канале: коэффициент **${formatNumber(locationFactor)}**. Сообщение в другом канале сервера сбросит снижение.`);
  if (activityText) lines.push("", "### Фрагмент сцены", `> ${truncateText(activityText, 350).replaceAll("\n", "\n> ").replaceAll("||", "¦¦")}`);
  const details = new ContainerBuilder().setAccentColor(RESPONSE_COLORS.brand).setSpoiler(true)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")));
  return [summary, details];
}

export function createTrainingSuccessComponents(data) {
  return createActivityResultComponents({ ...data, newValue: data.newAP, resource: "AP",
    title: "Тренировка завершена", nextActionLabel: "Следующая тренировка" });
}

export function createSocialRPSuccessComponents(data) {
  return createActivityResultComponents({ ...data, newValue: data.newAP, resource: "AP",
    title: "Социальная сцена учтена", nextActionLabel: "Следующая социальная сцена" });
}

export function createAPActivityErrorComponents(title, message, state = "error") {
  return createStatusComponents(title, message, state);
}
