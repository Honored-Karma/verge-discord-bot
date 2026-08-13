import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { CURRENCIES, EXCHANGE_RATE, TRANSFER_TAX_RATE } from "./banking.js";

export const PAY_CONFIRM_ID = "bank_pay_confirm";
export const PAY_CANCEL_ID = "bank_pay_cancel";
export const EXCHANGE_CONFIRM_ID = "bank_exchange_confirm";
export const EXCHANGE_CANCEL_ID = "bank_exchange_cancel";

const COLORS = {
  bank: 0x2563eb,
  exchange: 0x8b5cf6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  error: 0xef4444,
  neutral: 0x64748b,
};

function cleanText(value, maxLength = 80) {
  const compact = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1))}…`;
}

function markdownText(value, maxLength = 80) {
  return cleanText(value, maxLength).replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "слишком много";
  if (Number.isSafeInteger(number)) return number.toLocaleString("ru-RU");
  return number.toLocaleString("ru-RU", {
    notation: "scientific",
    maximumFractionDigits: 2,
  });
}

function money(value, currency) {
  return `${formatNumber(value)} ${CURRENCIES[currency].symbol}`;
}

function confirmationButtons(confirmId, cancelId, confirmLabel, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel(confirmLabel)
      .setEmoji("✓")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Отменить")
      .setEmoji("✕")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export function createPayPreviewComponents({
  senderName,
  senderAvatarUrl,
  recipientName,
  recipientSlot,
  currency,
  calculation,
  senderBalance,
  disabled = false,
}) {
  const config = CURRENCIES[currency];
  const balanceAfter = Number(senderBalance) - calculation.sent;
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.bank)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${config.emoji} Подтвердите перевод\n` +
              `**Отправитель:** ${markdownText(senderName)}\n` +
              `**Получатель:** ${markdownText(recipientName)} · слот ${recipientSlot}`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(senderAvatarUrl)
              .setDescription(`Аватар персонажа ${cleanText(senderName)}`),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Расчёт\n` +
          `Перевод: **${money(calculation.sent, currency)}**\n` +
          `Налог ${Math.round(TRANSFER_TAX_RATE * 100)}%: **−${money(calculation.tax, currency)}**\n` +
          `Получатель получит: **${money(calculation.received, currency)}**\n\n` +
          `Ваш баланс: **${money(senderBalance, currency)} → ${money(balanceAfter, currency)}**\n` +
          `-# Перед подтверждением бот ещё раз проверит баланс и получателя.`,
        ),
      )
      .addActionRowComponents(
        confirmationButtons(
          PAY_CONFIRM_ID,
          PAY_CANCEL_ID,
          `Перевести ${config.code}`,
          disabled,
        ),
      ),
  ];
}

export function createPayReceiptComponents({
  senderName,
  senderAvatarUrl,
  recipientName,
  currency,
  result,
}) {
  const config = CURRENCIES[currency];
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.success)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Перевод выполнен\n` +
              `**${markdownText(senderName)}** отправляет **${markdownText(recipientName)}** ${money(result.sent, currency)}.`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(senderAvatarUrl)
              .setDescription(`Квитанция ${cleanText(senderName)}`),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${config.emoji} Получено: **${money(result.received, currency)}**\n` +
          `Налог: **${money(result.tax, currency)}**\n` +
          `Остаток отправителя: **${money(result.senderBalance, currency)}**\n` +
          `-# Списание и зачисление проведены как одна операция.`,
        ),
      ),
  ];
}

export function createExchangePreviewComponents({
  characterName,
  avatarUrl,
  calculation,
  sourceBalance,
  disabled = false,
}) {
  const source = CURRENCIES[calculation.sourceCurrency];
  const target = CURRENCIES[calculation.targetCurrency];
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.exchange)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## 💱 Подтвердите обмен\n` +
              `**${markdownText(characterName)}** · ${source.code} → ${target.code}`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(avatarUrl)
              .setDescription(`Аватар персонажа ${cleanText(characterName)}`),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Отдаёте: **${money(calculation.spent, calculation.sourceCurrency)}**\n` +
          `Получаете: **${money(calculation.received, calculation.targetCurrency)}**\n` +
          `Курс: **1 ¥ = ${EXCHANGE_RATE.toLocaleString("ru-RU")} ₩**\n\n` +
          `Баланс ${source.code}: **${money(sourceBalance, calculation.sourceCurrency)} → ${money(sourceBalance - calculation.spent, calculation.sourceCurrency)}**\n` +
          `-# Дробная часть результата округляется вниз.`,
        ),
      )
      .addActionRowComponents(
        confirmationButtons(
          EXCHANGE_CONFIRM_ID,
          EXCHANGE_CANCEL_ID,
          `Обменять на ${target.code}`,
          disabled,
        ),
      ),
  ];
}

export function createExchangeReceiptComponents({
  characterName,
  avatarUrl,
  result,
}) {
  const source = CURRENCIES[result.sourceCurrency];
  const target = CURRENCIES[result.targetCurrency];
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.success)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Обмен выполнен\n` +
              `**${markdownText(characterName)}** обменял ${money(result.spent, result.sourceCurrency)} на **${money(result.received, result.targetCurrency)}**.`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(avatarUrl)
              .setDescription(`Квитанция ${cleanText(characterName)}`),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${source.emoji} Баланс ${source.code}: **${money(result.sourceBalance, result.sourceCurrency)}**\n` +
          `${target.emoji} Баланс ${target.code}: **${money(result.targetBalance, result.targetCurrency)}**\n` +
          `-# Курс операции: 1 ¥ = ${EXCHANGE_RATE.toLocaleString("ru-RU")} ₩.`,
        ),
      ),
  ];
}

export function createBankStatusComponents(title, message, type = "error") {
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS[type] || COLORS.error)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${markdownText(title, 100)}\n${message}`,
        ),
      ),
  ];
}
