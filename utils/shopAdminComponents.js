import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { CURRENCIES } from "./banking.js";
import { getShopCategory, getShopRarity, shopPrice } from "./shopCatalog.js";

export const SHOP_ADMIN_CONFIRM_ID = "shop_admin_confirm";
export const SHOP_ADMIN_CANCEL_ID = "shop_admin_cancel";

function clean(value, max = 1000) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function codeValue(value, max = 50) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f`]/g, "")
    .trim()
    .slice(0, max);
}

function number(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function status(item) {
  if (item.archived) return "🗄️ Удалён из каталога";
  if (!item.enabled) return "⏸️ Скрыт";
  if (item.stock !== null && Number(item.stock) === 0) return "🔴 Нет в наличии";
  return "🟢 Продаётся";
}

function stock(item) {
  return item.stock === null ? "без ограничений" : `${number(item.stock)} шт.`;
}

function delivery(item) {
  const value = item.delivery || {};
  if (value.kind === "inventory") return `инвентарь · ${value.item_name}`;
  if (value.kind === "sp_scroll") return `SP-свиток · +${number(value.amount)} SP`;
  if (value.kind === "active_effect") {
    return `эффект · +${number(value.bonus_percent)}% на ${number(value.duration_seconds / 3600)} ч.`;
  }
  if (value.kind === "order") return `заявка · ${value.order_type}/${value.tier}`;
  return "не настроена";
}

export function createShopAdminListComponents(items, page = 1) {
  const visible = items.filter((item) => !item.archived).length;
  const pageCount = Math.max(1, Math.ceil(items.length / 20));
  const safePage = Math.max(1, Math.min(pageCount, Number(page) || 1));
  const pageItems = items.slice((safePage - 1) * 20, safePage * 20);
  const lines = items.length > 0
    ? pageItems.map((item) => (
        `### ${item.emoji} ${clean(item.name, 100)}\n` +
        `ID: \`${codeValue(item.id)}\` · ${status(item)}\n` +
        `Цена: **${number(item.price_yen)} ${CURRENCIES.yen.symbol}** · остаток: **${stock(item)}** · продано: **${number(item.sold_count)}**`
      )).join("\n\n")
    : "Товаров пока нет. Добавьте первый через `/shop-admin add`.";
  return [
    new ContainerBuilder()
      .setAccentColor(0xb209d4)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Управление магазином\nАктивных и скрытых карточек: **${visible}** · всего записей: **${items.length}** · страница **${safePage}/${pageCount}**\n\n${lines}` +
          (pageCount > 1 ? `\n\n-# Для другой страницы используйте \`/shop-admin list page:${safePage === pageCount ? 1 : safePage + 1}\`.` : ""),
        ),
      ),
  ];
}

export function createShopAdminHistoryComponents(entries, itemId = null) {
  const lines = entries.length > 0
    ? entries.map((entry) => {
        const before = entry.before || {};
        const after = entry.after || {};
        const changes = [];
        if (before.price_yen !== after.price_yen) {
          changes.push(`цена ${number(before.price_yen)} → ${number(after.price_yen)} ¥`);
        }
        if (before.stock !== after.stock) {
          changes.push(`остаток ${before.stock === null ? "∞" : number(before.stock)} → ${after.stock === null ? "∞" : number(after.stock)}`);
        }
        if (before.enabled !== after.enabled || before.archived !== after.archived) {
          changes.push(`состояние: ${after.archived ? "удалён" : after.enabled ? "продаётся" : "скрыт"}`);
        }
        return (
          `### ${clean(entry.action, 50)} · \`${codeValue(entry.item_id)}\`\n` +
          `Администратор: <@${codeValue(entry.admin_id, 30)}> · <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:R>\n` +
          (changes.length > 0 ? changes.join(" · ") : "Карточка или способ выдачи изменены.")
        );
      }).join("\n\n")
    : "Изменений пока нет. После первой правки здесь появятся администратор, время и результат.";
  return [
    new ContainerBuilder()
      .setAccentColor(0x64748b)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## История магазина${itemId ? ` · ${clean(itemId, 50)}` : ""}\n${lines}`,
        ),
      ),
  ];
}

function itemDetails(item) {
  if (!item) return "Товар будет создан.";
  const category = getShopCategory(item.category)?.name || item.category;
  const rarity = getShopRarity(item.rarity);
  return (
    `${item.emoji} **${clean(item.name, 100)}** · \`${codeValue(item.id)}\`\n` +
    `${status(item)} · ${rarity.emoji} ${rarity.name} · ${clean(category, 100)}\n` +
    `Цена: **${number(item.price_yen)} ${CURRENCIES.yen.symbol}** / **${number(shopPrice(item, "krw"))} ${CURRENCIES.krw.symbol}**\n` +
    `Остаток: **${stock(item)}** · недельный лимит: **${number(item.weekly_limit)} шт.**\n` +
    `Выдача: **${clean(delivery(item), 200)}**\n` +
    `Описание: ${clean(item.description, 700)}`
  );
}

export function createShopAdminItemComponents(item) {
  return [
    new ContainerBuilder()
      .setAccentColor(0xb209d4)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Карточка товара\n${itemDetails(item)}\n\n` +
          `Позиция: **${number(item.sort_order)}** · продано: **${number(item.sold_count)}** · версия: **${number(item.version)}**`,
        ),
      ),
  ];
}

const ACTION_COPY = {
  create: ["Добавить товар", "Добавить товар", ButtonStyle.Success],
  edit: ["Сохранить изменения", "Сохранить изменения", ButtonStyle.Primary],
  stock: ["Изменить остаток", "Изменить остаток", ButtonStyle.Primary],
  enable: ["Вернуть товар в продажу", "Вернуть в продажу", ButtonStyle.Success],
  disable: ["Скрыть товар", "Скрыть товар", ButtonStyle.Secondary],
  archive: ["Удалить товар из каталога", "Удалить из каталога", ButtonStyle.Danger],
  restore: ["Восстановить карточку", "Восстановить карточку", ButtonStyle.Primary],
};

export function createShopAdminPreviewComponents({ action, before = null, after, disabled = false }) {
  const [title, button, style] = ACTION_COPY[action] || ACTION_COPY.edit;
  const consequence = action === "archive"
    ? "Карточка исчезнет из магазина, но покупки и заявки останутся в истории."
    : action === "disable"
      ? "Новые покупки станут недоступны, пока товар снова не включат."
      : action === "stock" && after.stock !== null && Number(after.stock) === 0
        ? "После сохранения товар останется видимым со статусом «Нет в наличии»."
        : "Изменение начнёт действовать для новых покупок сразу после сохранения.";
  const beforeText = before
    ? `\n\n### До изменения\n${itemDetails(before)}`
    : "";
  return [
    new ContainerBuilder()
      .setAccentColor(style === ButtonStyle.Danger ? 0xef4444 : 0xf59e0b)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${title}\n${consequence}${beforeText}\n\n### После изменения\n${itemDetails(after)}`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(SHOP_ADMIN_CONFIRM_ID)
            .setLabel(button)
            .setStyle(style)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(SHOP_ADMIN_CANCEL_ID)
            .setLabel("Отменить изменение")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      ),
  ];
}

export function createShopAdminReceiptComponents({ action, item }) {
  const [title] = ACTION_COPY[action] || ACTION_COPY.edit;
  return [
    new ContainerBuilder()
      .setAccentColor(0x22c55e)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Изменение сохранено\n**${title}**\n\n${itemDetails(item)}\n\n-# Версия карточки: ${number(item.version)}`,
        ),
      ),
  ];
}
