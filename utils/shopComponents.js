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
import { CURRENCIES } from "./banking.js";
import {
  getShopCategory,
  getShopRarity,
  shopDeliveryLabel,
  shopPrice,
} from "./shopCatalog.js";

export const SHOP_CATEGORY_SELECT_ID = "shop_category";
export const SHOP_ITEM_SELECT_ID = "shop_item";
export const SHOP_CURRENCY_SELECT_ID = "shop_currency";
export const SHOP_STYLE_SELECT_ID = "shop_style";
export const SHOP_BACK_ID = "shop_back";
export const SHOP_BUY_ID = "shop_buy";
export const SHOP_CONFIRM_ID = "shop_confirm";
export const SHOP_CANCEL_ID = "shop_cancel";
export const SHOP_ORDERS_ID = "shop_orders";
export const SHOP_CATEGORY_PREV_ID = "shop_category_prev";
export const SHOP_CATEGORY_NEXT_ID = "shop_category_next";
export const SHOP_ORDER_RESOLVE_CONFIRM_ID = "shop_order_resolve_confirm";
export const SHOP_ORDER_RESOLVE_CANCEL_ID = "shop_order_resolve_cancel";

const COLORS = {
  shop: 0xb209d4,
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
    : "некорректное значение";
}

function money(value, currency) {
  return `${formatNumber(value)} ${CURRENCIES[currency].symbol}`;
}

function characterHeader(characterName, avatarUrl, title, subtitle) {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${title}\n**${markdownText(characterName, 80)}**\n${subtitle}`,
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`Аватар персонажа ${cleanText(characterName, 80)}`),
    );
}

function currencyRow(currency, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SHOP_CURRENCY_SELECT_ID)
      .setPlaceholder("Выберите валюту магазина")
      .setDisabled(disabled)
      .addOptions(
        {
          label: "Японские йены",
          value: "yen",
          description: "Все цены отображаются в ¥",
          emoji: "💴",
          default: currency === "yen",
        },
        {
          label: "Корейские воны",
          value: "krw",
          description: "Цены пересчитываются по курсу 1 ¥ = 9,4 ₩",
          emoji: "💳",
          default: currency === "krw",
        },
      ),
  );
}

function navigationRow({ showBack = true, showOrders = true, disabled = false } = {}) {
  const row = new ActionRowBuilder();
  if (showBack) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(SHOP_BACK_ID)
        .setLabel("Вернуться в магазин")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    );
  }
  if (showOrders) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(SHOP_ORDERS_ID)
        .setLabel("Показать мои заявки")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    );
  }
  return row;
}

export function createShopHomeComponents({
  characterName,
  avatarUrl,
  balances,
  currency,
  categories,
  effects = [],
  disabled = false,
}) {
  const activeEffects = effects.length > 0
    ? effects.map((effect) => (
        `• **+${formatNumber(effect.bonus_percent)}%** к тренировкам до ` +
        `<t:${Math.floor(new Date(effect.expires_at).getTime() / 1000)}:R>`
      )).join("\n")
    : "Активных эффектов нет.";
  const container = new ContainerBuilder()
      .setAccentColor(COLORS.shop)
      .addSectionComponents(
        characterHeader(
          characterName,
          avatarUrl,
          "🏪 Магазин Verge",
          "Свитки, усиления и редкие заказы для активного персонажа.",
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Баланс\n💴 **${money(balances.yen, "yen")}** · 💳 **${money(balances.krw, "krw")}**\n\n` +
          `### Активные эффекты\n${activeEffects}\n\n` +
          (categories.length > 0
            ? "### Выберите раздел\nЦена, остаток, недельный лимит и способ выдачи будут показаны до подтверждения."
            : "### Магазин временно пуст\nАдминистратор ещё не включил товары. Откройте магазин позже."),
        ),
      )
      .addActionRowComponents(currencyRow(currency, disabled));
  if (categories.length > 0) {
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId(SHOP_CATEGORY_SELECT_ID)
      .setPlaceholder("Открыть раздел магазина")
      .setDisabled(disabled)
      .addOptions(categories.map((category) => ({
        label: cleanText(category.name, 100),
        value: category.id,
        description: cleanText(category.description, 100),
        emoji: category.emoji,
      })));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(categorySelect));
  }
  container.addActionRowComponents(navigationRow({ showBack: false, disabled }));
  return [container];
}

export function createShopCategoryComponents({
  characterName,
  avatarUrl,
  balances,
  currency,
  category,
  items,
  page = 0,
  disabled = false,
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / 25));
  const safePage = Math.max(0, Math.min(pageCount - 1, Number(page) || 0));
  const pageItems = items.slice(safePage * 25, safePage * 25 + 25);
  const container = new ContainerBuilder()
      .setAccentColor(COLORS.shop)
      .addSectionComponents(
        characterHeader(
          characterName,
          avatarUrl,
          `${category.emoji} ${category.name}`,
          `Доступно: **${items.length}** · страница **${safePage + 1}/${pageCount}** · баланс: **${money(balances[currency], currency)}**`,
        ),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          items.length > 0
            ? `${category.description}\n\n-# Выберите товар, чтобы увидеть полные условия и остаток после оплаты.`
            : `${category.description}\n\nВ этом разделе сейчас нет доступных товаров. Вернитесь к разделам магазина.`,
        ),
      )
      .addActionRowComponents(currencyRow(currency, disabled));
  if (pageItems.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(SHOP_ITEM_SELECT_ID)
      .setPlaceholder("Выберите товар")
      .setDisabled(disabled)
      .addOptions(pageItems.map((item) => ({
        label: cleanText(item.name, 100),
        value: item.id,
        description: cleanText(
          `${money(shopPrice(item, currency), currency)} · ${item.stock === null ? "без лимита" : `осталось ${formatNumber(item.stock)}`} · ${item.description}`,
          100,
        ),
        emoji: item.emoji,
      })));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  }
  if (pageCount > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(SHOP_CATEGORY_PREV_ID)
          .setLabel("Предыдущие товары")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || safePage === 0),
        new ButtonBuilder()
          .setCustomId(SHOP_CATEGORY_NEXT_ID)
          .setLabel("Следующие товары")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || safePage >= pageCount - 1),
      ),
    );
  }
  container.addActionRowComponents(navigationRow({ disabled }));
  return [container];
}

/** Человеческая запись длительности: «3 суток» читается лучше «72 часов». */
export function cooldownLabel(hours) {
  const total = Math.max(0, Number(hours) || 0);
  if (total === 0) return "нет";
  if (total % 24 === 0) {
    const days = total / 24;
    return `${days} ${days === 1 ? "сутки" : "суток"}`;
  }
  if (total === 1) return "1 час";
  if (total < 5) return `${total} часа`;
  return `${total} часов`;
}

export function createShopItemComponents({
  characterName,
  avatarUrl,
  balance,
  currency,
  item,
  selectedStyle = null,
  disabled = false,
}) {
  const rarity = getShopRarity(item.rarity);
  const price = shopPrice(item, currency);
  const canAfford = Number(balance) >= price;
  const inStock = item.stock === null || Number(item.stock) > 0;
  const styleLine = selectedStyle
    ? `\nВыбранный стиль: **${markdownText(selectedStyle.name, 80)}**`
    : "";
  return [
    new ContainerBuilder()
      .setAccentColor(rarity.color)
      .addSectionComponents(
        characterHeader(
          characterName,
          avatarUrl,
          `${item.emoji} ${item.name}`,
          `${rarity.emoji} **${rarity.name}** · ${getShopCategory(item.category)?.name || "Магазин"}`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${item.description}${styleLine}\n\n` +
          `Цена: **${money(price, currency)}**\n` +
          `Баланс после покупки: **${canAfford ? money(balance - price, currency) : "недостаточно средств"}**\n` +
          `Остаток магазина: **${item.stock === null ? "без ограничений" : `${formatNumber(item.stock)} шт.`}**\n` +
          `Недельный лимит: **${formatNumber(item.weekly_limit)} шт.**\n` +
          (Number(item.cooldown_hours) > 0
            ? `Кулдаун: **${cooldownLabel(item.cooldown_hours)}** между покупками\n`
            : "") +
          `Выдача: **${shopDeliveryLabel(item)}**\n\n` +
          "-# Особые товары не дают способность автоматически: стафф проверяет их отдельно.",
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(SHOP_BUY_ID)
            .setLabel(item.delivery.kind === "sp_scroll" && !selectedStyle
              ? "Выбрать стиль"
              : item.delivery.kind === "order"
                ? "Создать заявку"
                : "Купить товар")
            .setEmoji(item.delivery.kind === "order" ? "📋" : "🛒")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || !canAfford || !inStock),
        ),
      )
      .addActionRowComponents(navigationRow({ disabled })),
  ];
}

export function createShopStyleComponents({ item, styles, disabled = false }) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(SHOP_STYLE_SELECT_ID)
    .setPlaceholder("Выберите изученный стиль")
    .setDisabled(disabled)
    .addOptions(styles.slice(0, 25).map((style) => ({
      label: cleanText(style.name, 100),
      value: String(style.id),
      description: cleanText(`Текущий прогресс: ${formatNumber(style.sp)} SP`, 100),
      emoji: "🥋",
    })));
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.shop)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${item.emoji} Выберите стиль\n` +
          `Свиток будет привязан к выбранному боевому стилю. После покупки изменить выбор нельзя.`,
        ),
      )
      .addActionRowComponents(new ActionRowBuilder().addComponents(select))
      .addActionRowComponents(navigationRow({ showOrders: false, disabled })),
  ];
}

export function createShopConfirmationComponents({
  characterName,
  avatarUrl,
  balance,
  currency,
  item,
  selectedStyle = null,
  disabled = false,
}) {
  const price = shopPrice(item, currency);
  const isOrder = item.delivery.kind === "order";
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.warning)
      .addSectionComponents(
        characterHeader(
          characterName,
          avatarUrl,
          isOrder ? "Подтвердите оплату заявки" : "Подтвердите покупку",
          `${item.emoji} **${markdownText(item.name, 80)}**`,
        ),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Будет списано: **${money(price, currency)}**\n` +
          `Баланс: **${money(balance, currency)} → ${money(balance - price, currency)}**` +
          (selectedStyle ? `\nСтиль: **${markdownText(selectedStyle.name, 80)}**` : "") +
          `\n\n${isOrder
            ? "После оплаты создастся заявка. Сам особый предмет выдаёт ответственный после проверки."
            : "Перед списанием бот ещё раз проверит баланс и недельный лимит."}`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(SHOP_CONFIRM_ID)
            .setLabel(isOrder ? "Оплатить и создать заявку" : "Оплатить покупку")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(SHOP_CANCEL_ID)
            .setLabel("Отменить покупку")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createShopReceiptComponents({ item, result }) {
  let deliveryText = "Покупка сохранена.";
  if (result.delivery === "inventory") {
    deliveryText = "Предмет уже находится в `/inventory`.";
  } else if (result.delivery === "active_effect") {
    deliveryText = `Эффект активен до <t:${Math.floor(new Date(result.effectExpiresAt).getTime() / 1000)}:F>.`;
  } else if (result.delivery === "order") {
    deliveryText = `Заявка **${result.orderId}** ожидает рассмотрения. Упомяните Главу анкетологов или администратора для оформления и выдачи.`;
  }
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.success)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Покупка выполнена\n${item.emoji} **${markdownText(item.name, 100)}**\n\n` +
          `Списано: **${money(result.price, result.currency)}**\n` +
          `Остаток: **${money(result.balance, result.currency)}**\n` +
          `${deliveryText}\n\n` +
          `-# Операция: ${markdownText(result.operationId, 120)}`,
        ),
      ),
  ];
}

const ORDER_STATUSES = {
  pending_review: "🟡 Ожидает рассмотрения",
  fulfilled: "🟢 Выдано",
  rejected: "🔴 Отклонено и возвращено",
};

export function createShopOrdersComponents({ orders, disabled = false }) {
  const body = orders.length > 0
    ? orders.map((order) => (
        `### ${order.item_name}\n` +
        `Заявка: **${order.public_id}** · ${ORDER_STATUSES[order.status] || order.status}\n` +
        `Создана: <t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:R>` +
        (order.resolution_reason ? `\nКомментарий: ${markdownText(order.resolution_reason, 300)}` : "")
      )).join("\n\n")
    : "Заявок пока нет. Особые артефакты, протезы и мутации появятся здесь после оплаты.";
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS.neutral)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Мои заявки\n${body}`))
      .addActionRowComponents(navigationRow({ showOrders: false, disabled })),
  ];
}

export function createShopOrderResolutionComponents({ details, action, reason, disabled = false }) {
  const isReject = action === "reject";
  const consequence = isReject
    ? `Игроку автоматически вернётся **${money(details.price, details.currency)}**. Заявку нельзя будет выдать без новой оплаты.`
    : "Деньги останутся списанными, а заявка получит статус «Выдано». Подтверждайте только после фактической выдачи предмета игроку.";
  return [
    new ContainerBuilder()
      .setAccentColor(isReject ? COLORS.error : COLORS.success)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${isReject ? "Отклонить заявку" : "Отметить заявку выданной"} · ${markdownText(details.publicId, 20)}\n` +
          `Предмет: **${markdownText(details.itemName, 100)}**\n` +
          `Игрок: <@${details.userId}>\n` +
          `Оплачено: **${money(details.price, details.currency)}**\n` +
          `Комментарий: ${markdownText(reason || "Причина не указана", 500)}\n\n${consequence}`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(SHOP_ORDER_RESOLVE_CONFIRM_ID)
            .setLabel(isReject ? "Отклонить и вернуть деньги" : "Подтвердить фактическую выдачу")
            .setStyle(isReject ? ButtonStyle.Danger : ButtonStyle.Success)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(SHOP_ORDER_RESOLVE_CANCEL_ID)
            .setLabel("Отмена")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createShopOrderResolutionReceipt({ result }) {
  const rejected = result.status === "rejected";
  return [
    new ContainerBuilder()
      .setAccentColor(rejected ? COLORS.warning : COLORS.success)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Заявка ${markdownText(result.publicId, 20)} обработана\n` +
          `**${markdownText(result.itemName, 100)}** — ${rejected ? "отклонено" : "отмечено выданным"}.\n` +
          (rejected
            ? `Игроку возвращено **${money(result.price, result.currency)}**. Новый баланс: **${money(result.balance, result.currency)}**.`
            : "Оплата сохранена. Игрок увидит статус «Выдано» в разделе своих заявок."),
        ),
      ),
  ];
}

export function createShopStatusComponents(title, message, type = "error") {
  return [
    new ContainerBuilder()
      .setAccentColor(COLORS[type] || COLORS.error)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${markdownText(title, 100)}\n${message}`),
      ),
  ];
}
