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
import { safeAvatarUrl } from "./avatarUrl.js";
import { formatItemEffect, getItemDefinition } from "./itemSystem.js";

export const INVENTORY_SELECT_ID = "inventory_select";
export const INVENTORY_PREV_ID = "inventory_prev";
export const INVENTORY_NEXT_ID = "inventory_next";
export const INVENTORY_USE_ONE_ID = "inventory_use_one";
export const INVENTORY_USE_ALL_ID = "inventory_use_all";
export const INVENTORY_BACK_ID = "inventory_back";

const ITEMS_PER_PAGE = 12;
const INVENTORY_COLOR = 0x8b5cf6;
const SUCCESS_COLOR = 0x22c55e;
const ERROR_COLOR = 0xef4444;

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "слишком много";
  if (Number.isSafeInteger(number)) return number.toLocaleString("ru-RU");
  return number.toLocaleString("ru-RU", {
    notation: "scientific",
    maximumFractionDigits: 2,
  });
}

function cleanText(value, maxLength = 100) {
  const compact = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1))}…`;
}

function markdownText(value, maxLength = 100) {
  return cleanText(value, maxLength).replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

export function getInventoryPageCount(inventory) {
  return Math.max(1, Math.ceil(inventory.length / ITEMS_PER_PAGE));
}

export function createInventoryComponents({
  characterName,
  avatarUrl,
  inventory,
  page = 0,
  canUse = false,
  disabled = false,
}) {
  const totalPages = getInventoryPageCount(inventory);
  const safePage = Math.max(0, Math.min(totalPages - 1, page));
  const pageItems = inventory.slice(
    safePage * ITEMS_PER_PAGE,
    (safePage + 1) * ITEMS_PER_PAGE,
  );
  const totalQuantity = inventory.reduce(
    (sum, item) => sum + Math.max(0, Number(item.qty || 0)),
    0,
  );

  const lines = pageItems.map((item) => {
    const definition = getItemDefinition(item.item_name);
    const state = definition.usable ? definition.effectText : "Коллекционный";
    return `${definition.emoji} **${markdownText(item.item_name, 80)}** ×${formatNumber(item.qty)}\n-# ${definition.rarity.name} • ${markdownText(state, 120)}`;
  });

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Инвентарь • ${markdownText(characterName, 80)}\n` +
        `**${formatNumber(inventory.length)}** видов предметов • **${formatNumber(totalQuantity)}** всего\n` +
        `-# Выберите предмет, чтобы открыть описание${canUse ? " и использовать его" : ""}.`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(safeAvatarUrl(avatarUrl))
        .setDescription(`Аватар персонажа ${cleanText(characterName, 80)}`),
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId(INVENTORY_SELECT_ID)
    .setPlaceholder("Выберите предмет")
    .setDisabled(disabled)
    .addOptions(
      pageItems.map((item, index) => {
        const definition = getItemDefinition(item.item_name);
        const inventoryIndex = safePage * ITEMS_PER_PAGE + index;
        return {
          label: cleanText(item.item_name, 100) || "Безымянный предмет",
          value: String(inventoryIndex),
          description: cleanText(`${formatNumber(item.qty)} шт. • ${definition.effectText}`, 100),
          emoji: definition.emoji,
        };
      }),
    );

  const container = new ContainerBuilder()
    .setAccentColor(INVENTORY_COLOR)
    .addSectionComponents(header)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join("\n\n")),
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));

  if (totalPages > 1) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Страница ${safePage + 1} из ${totalPages}`),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(INVENTORY_PREV_ID)
            .setLabel("Назад")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || safePage === 0),
          new ButtonBuilder()
            .setCustomId(INVENTORY_NEXT_ID)
            .setLabel("Вперёд")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || safePage === totalPages - 1),
        ),
      );
  }

  return [container];
}

export function createInventoryItemComponents({
  characterName,
  avatarUrl,
  item,
  canUse = false,
  disabled = false,
}) {
  const definition = getItemDefinition(item.item_name);
  const quantity = Math.max(0, Number(item.qty || 0));
  const safeItemName = markdownText(item.item_name, 100);
  const safeStyleName = definition.styleName
    ? markdownText(definition.styleName, 80)
    : null;
  const description = definition.kind === "ap"
    ? `Расходник, который мгновенно добавляет **${formatNumber(definition.amount)} AP**.`
    : definition.kind === "sp"
      ? `Расходник для стиля **${safeStyleName}**. Мгновенно добавляет **${formatNumber(definition.amount)} SP**.`
      : definition.description;

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${definition.emoji} ${safeItemName}\n` +
        `${definition.rarity.emoji} **${definition.rarity.name}** • в инвентаре **${formatNumber(quantity)} шт.**`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(safeAvatarUrl(avatarUrl))
        .setDescription(`Аватар персонажа ${cleanText(characterName, 80)}`),
    );

  const ownerNote = !canUse
    ? "\n\n-# Использовать предмет может только владелец персонажа."
    : definition.usable
      ? ""
      : "\n\n-# Этот предмет сохранён как коллекционный и не будет потрачен."
  const container = new ContainerBuilder()
    .setAccentColor(definition.rarity.color)
    .addSectionComponents(header)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${description}\n\n` +
        `**Эффект одного предмета:** ${markdownText(definition.effectText, 150)}` +
        (definition.usable && quantity > 1
          ? `\n**Эффект всей стопки:** ${markdownText(formatItemEffect(item.item_name, quantity), 150)}`
          : "") +
        ownerNote,
      ),
    );

  const buttons = [
    new ButtonBuilder()
      .setCustomId(INVENTORY_BACK_ID)
      .setLabel("К списку")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  ];

  if (canUse && definition.usable) {
    buttons.unshift(
      new ButtonBuilder()
        .setCustomId(INVENTORY_USE_ONE_ID)
        .setLabel("Использовать 1")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || quantity < 1),
    );
    if (quantity > 1) {
      buttons.splice(
        1,
        0,
        new ButtonBuilder()
          .setCustomId(INVENTORY_USE_ALL_ID)
          .setLabel(cleanText(`Использовать все (${formatNumber(quantity)})`, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
      );
    }
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
  return [container];
}

export function createItemUsedComponents({
  characterName,
  avatarUrl,
  result,
  disabled = false,
}) {
  const definition = result.definition;
  const resource = definition.kind === "ap"
    ? "AP"
    : `SP • ${markdownText(result.style?.name || definition.styleName, 80)}`;

  return [
    new ContainerBuilder()
      .setAccentColor(SUCCESS_COLOR)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Предмет использован\n` +
              `**${markdownText(characterName, 80)}** использует ${definition.emoji} **${markdownText(result.itemName, 100)}** ×${formatNumber(result.quantity)}.\n\n` +
              `Получено: **+${formatNumber(result.reward)} ${resource}**\n` +
              `Новое значение: **${formatNumber(result.newValue)} ${resource}**\n` +
              `Осталось предметов: **${formatNumber(result.remainingQuantity)}**`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(safeAvatarUrl(avatarUrl))
              .setDescription(`Аватар персонажа ${cleanText(characterName, 80)}`),
          ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(INVENTORY_BACK_ID)
            .setLabel("Вернуться в инвентарь")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createInventoryEmptyComponents(characterName, avatarUrl) {
  return [
    new ContainerBuilder()
      .setAccentColor(INVENTORY_COLOR)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Инвентарь пуст\nУ **${markdownText(characterName, 80)}** пока нет предметов.\n-# Когда предметы появятся, здесь можно будет открыть их описание и эффект.`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(safeAvatarUrl(avatarUrl))
              .setDescription(`Аватар персонажа ${cleanText(characterName, 80)}`),
          ),
      ),
  ];
}

export function createInventoryErrorComponents(title, message) {
  return [
    new ContainerBuilder()
      .setAccentColor(ERROR_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${markdownText(title, 100)}\n${message}`),
      ),
  ];
}
