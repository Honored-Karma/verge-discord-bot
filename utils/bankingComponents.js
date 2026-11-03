import { safeAvatarUrl } from "./avatarUrl.js";
import { RESPONSE_COLORS, cleanText, markdownText, formatNumber } from "./responseStyle.js";
import { createStatusComponents } from "./modernResponses.js";
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
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";
import { CURRENCIES, EXCHANGE_RATE, TRANSFER_TAX_RATE } from "./banking.js";

export const PAY_CONFIRM_ID = "bank_pay_confirm";
export const PAY_CANCEL_ID = "bank_pay_cancel";
export const PAY_AMOUNT_ID = "bank_pay_amount";
export const EXCHANGE_CONFIRM_ID = "bank_exchange_confirm";
export const EXCHANGE_CANCEL_ID = "bank_exchange_cancel";

const COLORS = { ...RESPONSE_COLORS, bank: RESPONSE_COLORS.confirm, exchange: RESPONSE_COLORS.confirm };

function money(value, currency) {
  return `${formatNumber(value)} ${CURRENCIES[currency].symbol}`;
}

function confirmationButtons(confirmId, cancelId, confirmLabel, disabled, { editAmount = false, pending = false, canAfford = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel(confirmLabel)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || !canAfford),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Отменить")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pending),
  );
  if (editAmount) row.addComponents(new ButtonBuilder().setCustomId(PAY_AMOUNT_ID)
    .setLabel("Изменить сумму").setStyle(ButtonStyle.Secondary).setDisabled(disabled || pending));
  return row;
}

export function insufficientFundsText(required, available, currency) {
  return `Нужно **${money(required, currency)}**. Доступно **${money(available, currency)}**. Не хватает **${money(Math.max(0, required - available), currency)}**.`;
}

export function createPayAmountModal(customId, amount, currency) {
  return new ModalBuilder().setCustomId(customId).setTitle("Изменить сумму перевода")
    .addLabelComponents(new LabelBuilder().setLabel(`Сумма в ${CURRENCIES[currency].code}, до налога`)
      .setDescription("Целое число от 2. После изменения проверьте расчёт и подтвердите перевод.")
      .setTextInputComponent(new TextInputBuilder().setCustomId("amount").setStyle(TextInputStyle.Short)
        .setValue(String(amount)).setMaxLength(24).setRequired(true)));
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
  pending = false,
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
              .setURL(safeAvatarUrl(senderAvatarUrl))
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
          (balanceAfter >= 0
            ? `Ваш баланс: **${money(senderBalance, currency)} → ${money(balanceAfter, currency)}**\n`
            : `${insufficientFundsText(calculation.sent, senderBalance, currency)}\nИзмените сумму перевода.\n`) +
          (pending ? "-# Результат проверяется. Повторное подтверждение проверит ту же операцию." : "-# Налог удерживается из суммы перевода. Перед подтверждением баланс и получатель проверяются снова."),
        ),
      )
      .addActionRowComponents(
        confirmationButtons(
          PAY_CONFIRM_ID,
          PAY_CANCEL_ID,
          "Подтвердить перевод",
          disabled,
          { editAmount: true, pending, canAfford: pending || balanceAfter >= 0 },
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
              `**${markdownText(senderName)}** перевёл **${markdownText(recipientName)}** ${money(result.sent, currency)}.`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(safeAvatarUrl(senderAvatarUrl))
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
          "-# Перевод завершён. Баланс можно проверить в `/profile`.",
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
              .setURL(safeAvatarUrl(avatarUrl))
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
          `Комиссия: **0**\n` +
          `Баланс ${source.code}: **${money(sourceBalance, calculation.sourceCurrency)} → ${money(sourceBalance - calculation.spent, calculation.sourceCurrency)}**\n` +
          `-# Дробная часть результата округляется вниз.`,
        ),
      )
      .addActionRowComponents(
        confirmationButtons(
          EXCHANGE_CONFIRM_ID,
          EXCHANGE_CANCEL_ID,
          "Подтвердить обмен",
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
              .setURL(safeAvatarUrl(avatarUrl))
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
  return createStatusComponents(title, message, type);
}
