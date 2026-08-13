import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { formatItemEffect, getItemDefinition } from "./itemSystem.js";

export const ITEM_TRANSFER_SELECT_ID = "item_transfer_select";
export const ITEM_TRANSFER_PREV_ID = "item_transfer_prev";
export const ITEM_TRANSFER_NEXT_ID = "item_transfer_next";
export const ITEM_TRANSFER_BACK_ID = "item_transfer_back";
export const ITEM_TRANSFER_CONFIRM_ID = "item_transfer_confirm";
export const ITEM_TRANSFER_CANCEL_ID = "item_transfer_cancel";

const ITEMS_PER_PAGE = 20;
const COLORS = {
  transfer: 0x8b5cf6,
  success: 0x22c55e,
  error: 0xef4444,
  warning: 0xf59e0b,
  neutral: 0x64748b,
};

function cleanText(value, maxLength = 100) {
  const compact = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, Math.max(1, maxLength - 1))}…`;
}

function markdownText(value, maxLength = 100) {
  return cleanText(value, maxLength).replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isSafeInteger(number)
    ? number.toLocaleString("ru-RU")
    : "слишком много";
}

export function getItemTransferPageCount(inventory) {
  return Math.max(1, Math.ceil(inventory.length / ITEMS_PER_PAGE));
}

function heading({ senderName, senderAvatarUrl, recipientName, recipientSlot, subtitle }) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Передача предмета\n` +
        `**${markdownText(senderName, 80)}** → **${markdownText(recipientName, 80)}** · слот ${recipientSlot}\n` +
        subtitle,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(senderAvatarUrl)
        .setDescription(`Аватар персонажа ${cleanText(senderName, 80)}`),
    );
}

export function createItemTransferListComponents({
  senderName,
  senderAvatarUrl,
  recipientName,
  recipientSlot,
  inventory,
  quantity,
  page = 0,
  disabled = false,
}) {
  const pages = getItemTransferPageCount(inventory);
  const safePage = Math.max(0, Math.min(pages - 1, page));
  const items = inventory.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);
  const select = new StringSelectMenuBuilder()
    .setCustomId(ITEM_TRANSFER_SELECT_ID)
    .setPlaceholder("Выберите предмет для передачи")
    .setDisabled(disabled)
    .addOptions(items.map((item, index) => {
      const definition = getItemDefinition(item.item_name);
      return {
        label: cleanText(item.item_name, 100),
        value: String(safePage * ITEMS_PER_PAGE + index),
        description: cleanText(`${formatNumber(item.qty)} шт. • ${definition.effectText}`, 100),
        emoji: definition.emoji,
      };
    }));

  const container = new ContainerBuilder()
    .setAccentColor(COLORS.transfer)
    .addSectionComponents(heading({
      senderName,
      senderAvatarUrl,
      recipientName,
      recipientSlot,
      subtitle: `Количество: **${formatNumber(quantity)} шт.**`,
    }))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "Выберите предмет из своего активного инвентаря. Перед подтверждением бот повторно проверит остаток и получателя.",
      ),
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));

  if (pages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(ITEM_TRANSFER_PREV_ID)
          .setLabel("Предыдущие")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || safePage === 0),
        new ButtonBuilder()
          .setCustomId(ITEM_TRANSFER_NEXT_ID)
          .setLabel("Следующие")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || safePage === pages - 1),
      ),
    );
  }
  return [container];
}

export function createItemTransferPreviewComponents({
  senderName,
  senderAvatarUrl,
  recipientName,
  recipientSlot,
  item,
  quantity,
  disabled = false,
}) {
  const definition = getItemDefinition(item.item_name);
  return [
    new ContainerBuilder()
      .setAccentColor(definition.rarity.color)
      .addSectionComponents(heading({
        senderName,
        senderAvatarUrl,
        recipientName,
        recipientSlot,
        subtitle: `${definition.emoji} **${markdownText(item.item_name, 100)}** ×${formatNumber(quantity)}`,
      }))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Сейчас в инвентаре: **${formatNumber(item.qty)} шт.**\n` +
          `После передачи останется: **${formatNumber(Number(item.qty) - quantity)} шт.**\n` +
          `Эффект стопки: **${markdownText(formatItemEffect(item.item_name, quantity), 150)}**\n\n` +
          "-# Получатель сможет увидеть предмет в `/inventory`. Расходник применяется через `/use`.",
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(ITEM_TRANSFER_CONFIRM_ID)
            .setLabel("Передать предмет")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(ITEM_TRANSFER_BACK_ID)
            .setLabel("Выбрать другой")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(ITEM_TRANSFER_CANCEL_ID)
            .setLabel("Отменить")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createItemTransferReceiptComponents({
  senderName,
  senderAvatarUrl,
  recipientName,
  recipientSlot,
  result,
  disabled = false,
}) {
  const definition = getItemDefinition(result.itemName);
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.success)
      .addSectionComponents(heading({
        senderName,
        senderAvatarUrl,
        recipientName,
        recipientSlot,
        subtitle: `${definition.emoji} **${markdownText(result.itemName, 100)}** ×${formatNumber(result.quantity)}`,
      }))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Передача выполнена\n` +
          `Осталось у отправителя: **${formatNumber(result.senderQuantity)} шт.**\n` +
          `Теперь у получателя: **${formatNumber(result.recipientQuantity)} шт.**\n` +
          "-# Операция сохранена в журнале команд.",
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(ITEM_TRANSFER_BACK_ID)
            .setLabel("Передать другой")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createItemTransferStatusComponents(title, message, type = "error") {
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS[type] || COLORS.error)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${markdownText(title, 100)}\n${message}`),
      ),
  ];
}
