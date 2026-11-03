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
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";
import { safeAvatarUrl } from "./avatarUrl.js";
import { formatItemEffect, getItemDefinition } from "./itemSystem.js";

export const GIVE_ITEM_CATALOG_SELECT_ID = "give_item_catalog";
export const GIVE_ITEM_CATALOG_PREV_ID = "give_item_catalog_prev";
export const GIVE_ITEM_CATALOG_NEXT_ID = "give_item_catalog_next";
export const GIVE_ITEM_CUSTOM_AP_ID = "give_item_custom_ap";
export const GIVE_ITEM_CUSTOM_SP_ID = "give_item_custom_sp";
export const GIVE_ITEM_COLLECTIBLE_ID = "give_item_collectible";
export const GIVE_ITEM_CUSTOM_ID = "give_item_custom";
export const GIVE_ITEM_QUANTITY_ID = "give_item_quantity";
export const GIVE_ITEM_REPEAT_ID = "give_item_repeat";
export const GIVE_ITEM_STYLE_SELECT_ID = "give_item_style";
export const GIVE_ITEM_STYLE_PREV_ID = "give_item_style_prev";
export const GIVE_ITEM_STYLE_NEXT_ID = "give_item_style_next";
export const GIVE_ITEM_BACK_ID = "give_item_back";
export const GIVE_ITEM_CONFIRM_ID = "give_item_confirm";
export const GIVE_ITEM_CANCEL_ID = "give_item_cancel";

export const GIVE_ITEM_AP_MODAL_PREFIX = "give_item_ap:";
export const GIVE_ITEM_SP_MODAL_PREFIX = "give_item_sp:";
export const GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX = "give_item_collectible:";
export const GIVE_ITEM_CUSTOM_MODAL_PREFIX = "give_item_custom:";
export const GIVE_ITEM_QUANTITY_MODAL_PREFIX = "give_item_quantity:";
export const GIVE_ITEM_AMOUNT_INPUT_ID = "give_item_amount";
export const GIVE_ITEM_NAME_INPUT_ID = "give_item_name";
export const GIVE_ITEM_QUANTITY_INPUT_ID = "give_item_quantity_value";

const ITEMS_PER_PAGE = 20;
const STYLES_PER_PAGE = 25;
const COLORS = { ...RESPONSE_COLORS, center: RESPONSE_COLORS.brand, sp: RESPONSE_COLORS.brand };




function pageCount(values, perPage) {
  return Math.max(1, Math.ceil(values.length / perPage));
}

function targetSection(characterName, avatarUrl, slot, heading, subtitle) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${heading}\n**${markdownText(characterName, 80)}** · слот ${slot}\n${subtitle}`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(safeAvatarUrl(avatarUrl))
        .setDescription(`Аватар персонажа ${cleanText(characterName, 80)}`),
    );
}

export function getGiveItemCatalogPageCount(items) {
  return pageCount(items, ITEMS_PER_PAGE);
}

export function getGiveItemStylePageCount(styles) {
  return pageCount(styles, STYLES_PER_PAGE);
}

export function createGiveItemCenterComponents({
  characterName,
  avatarUrl,
  slot,
  quantity,
  catalog,
  page = 0,
  disabled = false,
}) {
  const pages = getGiveItemCatalogPageCount(catalog);
  const safePage = Math.max(0, Math.min(pages - 1, page));
  const pageItems = catalog.slice(
    safePage * ITEMS_PER_PAGE,
    (safePage + 1) * ITEMS_PER_PAGE,
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId(GIVE_ITEM_CATALOG_SELECT_ID)
    .setPlaceholder("Выберите готовый предмет")
    .setDisabled(disabled)
    .addOptions(pageItems.map((item, index) => ({
      label: cleanText(item.name, 100),
      value: String(safePage * ITEMS_PER_PAGE + index),
      description: cleanText(item.definition.effectText, 100),
      emoji: item.definition.emoji,
    })));

  const container = new ContainerBuilder()
    .setAccentColor(COLORS.center)
    .addSectionComponents(
      targetSection(
        characterName,
        avatarUrl,
        slot,
        "Центр выдачи предметов",
        `Количество: **${formatNumber(quantity)} шт.**`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Готовый каталог\nВыберите проверенный расходник — название и эффект будут заполнены автоматически.",
      ),
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));

  if (pages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_CATALOG_PREV_ID)
          .setLabel("Предыдущие")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || safePage === 0),
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_CATALOG_NEXT_ID)
          .setLabel("Следующие")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || safePage === pages - 1),
      ),
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Создать новый предмет\nAP-том и SP-свиток станут расходниками. Пользовательский предмет останется коллекционным.",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_CUSTOM_AP_ID)
          .setLabel("Создать AP-том")
          .setEmoji("📘")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_CUSTOM_SP_ID)
          .setLabel("Создать SP-свиток")
          .setEmoji("📜")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_COLLECTIBLE_ID)
          .setLabel("Создать сюжетный")
          .setEmoji("💎")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_CUSTOM_ID)
          .setLabel("Ввести название")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(GIVE_ITEM_QUANTITY_ID)
          .setLabel("Изменить количество")
          .setEmoji("🔢")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    );
  return [container];
}

export function createGiveItemStyleComponents({
  characterName,
  avatarUrl,
  slot,
  quantity,
  styles,
  page = 0,
  disabled = false,
}) {
  const pages = getGiveItemStylePageCount(styles);
  const safePage = Math.max(0, Math.min(pages - 1, page));
  const pageStyles = styles.slice(
    safePage * STYLES_PER_PAGE,
    (safePage + 1) * STYLES_PER_PAGE,
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId(GIVE_ITEM_STYLE_SELECT_ID)
    .setPlaceholder("Выберите стиль свитка")
    .setDisabled(disabled)
    .addOptions(pageStyles.map((style) => ({
      label: cleanText(style.name, 100),
      value: String(style.id),
      description: "Свиток начислит SP только владельцу этого стиля",
      emoji: "🥋",
    })));
  const container = new ContainerBuilder()
    .setAccentColor(COLORS.sp)
    .addSectionComponents(
      targetSection(
        characterName,
        avatarUrl,
        slot,
        "Новый SP-свиток",
        `Количество: **${formatNumber(quantity)} шт.**`,
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "Выберите существующий боевой стиль. На следующем шаге укажите SP в одном свитке.",
      ),
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));

  const navigation = [];
  if (pages > 1) {
    navigation.push(
      new ButtonBuilder()
        .setCustomId(GIVE_ITEM_STYLE_PREV_ID)
        .setLabel("Предыдущие")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || safePage === 0),
      new ButtonBuilder()
        .setCustomId(GIVE_ITEM_STYLE_NEXT_ID)
        .setLabel("Следующие")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || safePage === pages - 1),
    );
  }
  navigation.push(
    new ButtonBuilder()
      .setCustomId(GIVE_ITEM_BACK_ID)
      .setLabel("К каталогу")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(navigation));
  return [container];
}

export function createGiveItemPreviewComponents({
  characterName,
  avatarUrl,
  slot,
  itemName,
  quantity,
  recipientOwnsStyle = true,
  disabled = false,
}) {
  const definition = getItemDefinition(itemName);
  const totalEffect = formatItemEffect(itemName, quantity);
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.confirm)
      .addSectionComponents(
        targetSection(
          characterName,
          avatarUrl,
          slot,
          "Подтвердите выдачу",
          `${definition.emoji} **${markdownText(itemName, 100)}** ×${formatNumber(quantity)}`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${definition.rarity.emoji} **${definition.rarity.name}**\n` +
          `Эффект одной штуки: **${markdownText(definition.effectText, 140)}**\n` +
          `Эффект всей стопки: **${markdownText(totalEffect, 160)}**\n\n` +
          (definition.usable
            ? definition.kind === "sp" && !recipientOwnsStyle
              ? `-# ⚠ Персонаж ещё не изучил стиль «${markdownText(definition.styleName, 80)}». Свиток сохранится, но использовать его можно будет только после изучения стиля.`
              : "-# Откройте `/inventory`, выберите предмет и нажмите «Использовать 1». Команда `/use` также доступна."
            : "-# Предмет будет коллекционным и не сможет начислять AP или SP."),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(GIVE_ITEM_CONFIRM_ID)
            .setLabel("Выдать предмет")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(GIVE_ITEM_CANCEL_ID)
            .setLabel("Отменить")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createGiveItemReceiptComponents({
  characterName,
  avatarUrl,
  slot,
  result,
  disabled = false,
  allowBack = true,
}) {
  const definition = getItemDefinition(result.itemName);
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.success)
      .addSectionComponents(
        targetSection(
          characterName,
          avatarUrl,
          slot,
          "✓ Предмет выдан",
          `${definition.emoji} **${markdownText(result.itemName, 100)}** ×${formatNumber(result.quantity)}`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Было: **${formatNumber(result.previousQuantity)} шт.** → стало: **${formatNumber(result.totalQuantity)} шт.**\n` +
          `Эффект выданной стопки: **${markdownText(formatItemEffect(result.itemName, result.quantity), 160)}**\n` +
          `-# Операция сохранена в журнале администратора.`,
        ),
      )
      .addActionRowComponents(() => {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(GIVE_ITEM_REPEAT_ID)
            .setLabel("Выдать ещё раз")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        );
        if (allowBack) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(GIVE_ITEM_BACK_ID)
              .setLabel("Выбрать другой")
              .setEmoji("⬅️")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(disabled),
          );
        }
        return row;
      }),
  ];
}

function amountModal(customId, title, heading, description) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${heading}\n${description}`),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Значение одного предмета")
        .setDescription("Целое число от 1 до 1 000 000 000")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(GIVE_ITEM_AMOUNT_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(10)
            .setPlaceholder("Например: 50")
            .setRequired(true),
        ),
    );
}

export function createGiveItemAPModal(context) {
  return amountModal(
    `${GIVE_ITEM_AP_MODAL_PREFIX}${context}`,
    "Новый AP-том",
    "Сколько AP даст один том?",
    "Название и редкость будут рассчитаны автоматически.",
  );
}

export function createGiveItemSPModal(context, styleName) {
  return amountModal(
    `${GIVE_ITEM_SP_MODAL_PREFIX}${context}`,
    "Новый SP-свиток",
    `Сколько SP даст свиток «${cleanText(styleName, 40)}»?`,
    "Свиток сработает только у персонажа, который изучил этот стиль.",
  );
}

export function createGiveItemCollectibleModal(context) {
  return new ModalBuilder()
    .setCustomId(`${GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX}${context}`)
    .setTitle("Новый коллекционный предмет")
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Название предмета\nОн появится в инвентаре, но не будет расходоваться через `/use`.",
      ),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Название")
        .setDescription("От 1 до 100 символов")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(GIVE_ITEM_NAME_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setPlaceholder("Например: Ключ от хранилища")
            .setRequired(true),
        ),
    );
}

export function createGiveItemCustomModal(context) {
  return new ModalBuilder()
    .setCustomId(`${GIVE_ITEM_CUSTOM_MODAL_PREFIX}${context}`)
    .setTitle("Выдать предмет по названию")
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Точное название предмета\nПодходит для старых, событийных и сюжетных предметов. Если название совпадёт с форматом AP-тома или SP-свитка, предмет автоматически станет расходником.",
      ),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Название предмета")
        .setDescription("От 1 до 100 символов")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(GIVE_ITEM_NAME_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setPlaceholder("Например: Ключ от хранилища")
            .setRequired(true),
        ),
    );
}

export function createGiveItemQuantityModal(context, quantity) {
  return new ModalBuilder()
    .setCustomId(`${GIVE_ITEM_QUANTITY_MODAL_PREFIX}${context}`)
    .setTitle("Количество предметов")
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "### Сколько предметов выдать?\nКоличество применится к готовому, новому или сюжетному предмету.",
      ),
    )
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Количество")
        .setDescription("Целое число от 1 до 1 000 000")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(GIVE_ITEM_QUANTITY_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(7)
            .setValue(String(quantity || 1))
            .setPlaceholder("Например: 25")
            .setRequired(true),
        ),
    );
}

export function createGiveItemStatusComponents(title, message, type = "error") {
  return createStatusComponents(title, message, type);
}
