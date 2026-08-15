import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { isAdmin } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { logCommand } from "../utils/logs.js";
import {
  getManagedShopItem,
  validateShopCatalogItem,
} from "../utils/shopCatalog.js";
import {
  changeManagedShopStock,
  createManagedShopItem,
  getShopCatalogAudit,
  listManagedShopItems,
  setManagedShopItemState,
  updateManagedShopItem,
} from "../utils/shopAdminStore.js";
import {
  createShopAdminListComponents,
  createShopAdminHistoryComponents,
  createShopAdminItemComponents,
  createShopAdminPreviewComponents,
  createShopAdminReceiptComponents,
  SHOP_ADMIN_CANCEL_ID,
  SHOP_ADMIN_CONFIRM_ID,
} from "../utils/shopAdminComponents.js";
import { createShopStatusComponents } from "../utils/shopComponents.js";

const CONFIRMATION_DURATION = 2 * 60 * 1000;

const CATEGORY_CHOICES = [
  { name: "Свитки и тома", value: "scrolls" },
  { name: "Эликсиры", value: "elixirs" },
  { name: "Киберклиника", value: "cybernetics" },
  { name: "Лаборатория мутаций", value: "mutations" },
];
const RARITY_CHOICES = [
  { name: "Обычный", value: "common" },
  { name: "Необычный", value: "uncommon" },
  { name: "Редкий", value: "rare" },
  { name: "Эпический", value: "epic" },
  { name: "Легендарный", value: "legendary" },
];
const TYPE_CHOICES = [
  { name: "Предмет в инвентарь", value: "inventory" },
  { name: "SP-свиток с выбором стиля", value: "sp_scroll" },
  { name: "Временный эффект", value: "active_effect" },
  { name: "Заявка на ручную выдачу", value: "order" },
];

function addCommonEditOptions(subcommand, required) {
  return subcommand
    .addStringOption((option) => option.setName("name").setDescription("Название товара").setMaxLength(100).setRequired(required))
    .addStringOption((option) => option.setName("category").setDescription("Раздел магазина").addChoices(...CATEGORY_CHOICES).setRequired(required))
    .addStringOption((option) => option.setName("type").setDescription("Способ выдачи").addChoices(...TYPE_CHOICES).setRequired(required))
    .addIntegerOption((option) => option.setName("price").setDescription("Цена в YEN").setMinValue(1).setMaxValue(Number.MAX_SAFE_INTEGER).setRequired(required))
    .addStringOption((option) => option.setName("description").setDescription("Полное описание и условия").setMinLength(1).setMaxLength(1000).setRequired(required))
    .addStringOption((option) => option.setName("emoji").setDescription("Один эмодзи для карточки").setMinLength(1).setMaxLength(32).setRequired(required))
    .addStringOption((option) => option.setName("rarity").setDescription("Редкость").addChoices(...RARITY_CHOICES).setRequired(required))
    .addIntegerOption((option) => option.setName("weekly-limit").setDescription("Лимит покупок на персонажа за неделю").setMinValue(1).setMaxValue(100).setRequired(false))
    .addIntegerOption((option) => option.setName("cooldown-hours").setDescription("Кулдаун между покупками в часах; 0 — без кулдауна").setMinValue(0).setMaxValue(8760).setRequired(false))
    .addIntegerOption((option) => option.setName("sort-order").setDescription("Позиция товара внутри раздела; меньше — выше").setMinValue(0).setMaxValue(1_000_000).setRequired(false))
    .addStringOption((option) => option.setName("item-name").setDescription("Для инвентаря: точное название выдаваемого предмета").setMaxLength(100).setRequired(false))
    .addIntegerOption((option) => option.setName("amount").setDescription("Для SP-свитка: количество SP").setMinValue(1).setMaxValue(1_000_000).setRequired(false))
    .addIntegerOption((option) => option.setName("bonus").setDescription("Для эффекта: бонус к тренировкам в процентах").setMinValue(1).setMaxValue(200).setRequired(false))
    .addIntegerOption((option) => option.setName("duration-hours").setDescription("Для эффекта: длительность в часах").setMinValue(1).setMaxValue(720).setRequired(false))
    .addStringOption((option) => option.setName("applies-to").setDescription("Для эффекта: какие тренировки усиливаются").addChoices(
      { name: "AP и SP", value: "ap,sp" },
      { name: "Только AP", value: "ap" },
      { name: "Только SP", value: "sp" },
    ).setRequired(false))
    .addStringOption((option) => option.setName("order-type").setDescription("Для заявки: тип, например artifact").setMaxLength(50).setRequired(false))
    .addStringOption((option) => option.setName("tier").setDescription("Для заявки: уровень, например weak").setMaxLength(50).setRequired(false));
}

export const data = new SlashCommandBuilder()
  .setName("shop-admin")
  .setDescription("[АДМИН] Управление товарами и остатками магазина")
  .setDMPermission(false)
  .addSubcommand((subcommand) => subcommand
    .setName("list")
    .setDescription("Показать все товары и их состояние")
    .addIntegerOption((option) => option.setName("page").setDescription("Страница списка").setMinValue(1).setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName("history")
    .setDescription("Показать историю изменений магазина")
    .addStringOption((option) => option.setName("item").setDescription("ID товара; не указывать для всей истории").setRequired(false))
    .addIntegerOption((option) => option.setName("limit").setDescription("Количество записей").setMinValue(1).setMaxValue(20).setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName("view")
    .setDescription("Показать полные настройки одного товара")
    .addStringOption((option) => option.setName("item").setDescription("ID товара").setRequired(true)))
  .addSubcommand((subcommand) => addCommonEditOptions(
    subcommand
      .setName("add")
      .setDescription("Добавить товар")
      .addStringOption((option) => option.setName("id").setDescription("Уникальный ID: латиница, цифры, _ или -").setMinLength(3).setMaxLength(50).setRequired(true)),
    true,
  ).addIntegerOption((option) => option.setName("stock").setDescription("Начальный остаток; не указывать для безлимита").setMinValue(0).setMaxValue(1_000_000_000).setRequired(false)))
  .addSubcommand((subcommand) => addCommonEditOptions(
    subcommand
      .setName("edit")
      .setDescription("Изменить карточку или способ выдачи")
      .addStringOption((option) => option.setName("item").setDescription("ID товара из /shop-admin list").setRequired(true)),
    false,
  ))
  .addSubcommand((subcommand) => subcommand
    .setName("stock")
    .setDescription("Изменить количество товара")
    .addStringOption((option) => option.setName("item").setDescription("ID товара").setRequired(true))
    .addStringOption((option) => option.setName("mode").setDescription("Как изменить остаток").setRequired(true).addChoices(
      { name: "Установить точное количество", value: "set" },
      { name: "Добавить или вычесть", value: "add" },
      { name: "Сделать безлимитным", value: "unlimited" },
    ))
    .addIntegerOption((option) => option.setName("quantity").setDescription("Количество; для вычитания укажите отрицательное").setMinValue(-1_000_000_000).setMaxValue(1_000_000_000).setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName("state")
    .setDescription("Включить, скрыть, удалить или восстановить товар")
    .addStringOption((option) => option.setName("item").setDescription("ID товара").setRequired(true))
    .addStringOption((option) => option.setName("action").setDescription("Новое состояние карточки").setRequired(true).addChoices(
      { name: "Вернуть в продажу", value: "enable" },
      { name: "Временно скрыть", value: "disable" },
      { name: "Удалить из каталога", value: "archive" },
      { name: "Восстановить удалённую карточку", value: "restore" },
    )));

function option(interaction, name, fallback = undefined) {
  const value = interaction.options.get(name)?.value;
  return value === undefined || value === null ? fallback : value;
}

function buildDelivery(interaction, itemId, current = null) {
  const kind = option(interaction, "type", current?.kind);
  if (kind === "inventory") {
    return { kind, item_name: option(interaction, "item-name", current?.kind === kind ? current.item_name : null) };
  }
  if (kind === "sp_scroll") {
    return { kind, amount: Number(option(interaction, "amount", current?.kind === kind ? current.amount : 0)) };
  }
  if (kind === "active_effect") {
    const hours = Number(option(
      interaction,
      "duration-hours",
      current?.kind === kind ? Number(current.duration_seconds) / 3600 : 0,
    ));
    const targets = String(option(
      interaction,
      "applies-to",
      current?.kind === kind ? current.applies_to.join(",") : "",
    )).split(",").filter(Boolean);
    return {
      kind,
      effect_key: current?.kind === kind ? current.effect_key : `${itemId}_effect`,
      applies_to: targets,
      bonus_percent: Number(option(interaction, "bonus", current?.kind === kind ? current.bonus_percent : 0)),
      duration_seconds: Math.round(hours * 3600),
    };
  }
  if (kind === "order") {
    return {
      kind,
      order_type: option(interaction, "order-type", current?.kind === kind ? current.order_type : null),
      tier: option(interaction, "tier", current?.kind === kind ? current.tier : null),
    };
  }
  return null;
}

function validationMessage(reason) {
  const messages = {
    invalid_id: "Используйте ID длиной 3–50 символов: латиница, цифры, `_` или `-`.",
    invalid_category: "Выберите существующий раздел магазина.",
    invalid_rarity: "Выберите редкость из списка.",
    invalid_name: "Укажите название длиной до 100 символов.",
    invalid_description: "Укажите описание длиной до 1000 символов.",
    invalid_emoji: "Укажите эмодзи карточки.",
    invalid_price: "Укажите целую положительную цену в YEN.",
    invalid_weekly_limit: "Недельный лимит должен быть от 1 до 100.",
    invalid_cooldown: "Кулдаун должен быть целым числом часов от 0 до 8760.",
    invalid_stock: "Укажите нулевой или положительный остаток.",
    invalid_delivery: "Заполните параметры выбранной выдачи: название предмета, SP, эффект либо тип и уровень заявки.",
    duplicate_id: "Товар с таким ID уже существует. Выберите другой ID или отредактируйте существующий.",
    not_found: "Товар не найден. Скопируйте его ID из `/shop-admin list`.",
    changed: "Карточку уже изменил другой администратор. Откройте команду заново и проверьте актуальные данные.",
    archived: "Сначала восстановите карточку, затем верните её в продажу.",
    stock_unlimited: "Сначала установите ограниченный остаток, затем добавляйте или вычитайте количество.",
    stock_below_zero: "Остаток не может стать отрицательным. Укажите меньшее списание.",
  };
  return messages[reason] || "Изменение не сохранено. Проверьте параметры и повторите команду.";
}

async function confirmChange(interaction, context) {
  const response = await interaction.reply({
    components: createShopAdminPreviewComponents(context),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });
  const collector = response.createMessageComponentCollector({ time: CONFIRMATION_DURATION });
  let completed = false;
  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (componentInteraction.customId === SHOP_ADMIN_CANCEL_ID) {
      completed = true;
      collector.stop("cancelled");
      await componentInteraction.update({
        components: createShopStatusComponents("Изменение отменено", "Магазин не изменился.", "neutral"),
      });
      return;
    }
    if (componentInteraction.customId !== SHOP_ADMIN_CONFIRM_ID) return;
    completed = true;
    collector.stop("confirmed");
    await componentInteraction.deferUpdate();
    let result;
    if (context.action === "create") {
      result = await createManagedShopItem(context.after, interaction.user.id);
    } else if (context.action === "edit") {
      result = await updateManagedShopItem(
        context.after.id,
        context.after,
        interaction.user.id,
        context.before.version,
      );
    } else if (context.action === "stock") {
      result = await changeManagedShopStock(
        context.after.id,
        context.stockMode,
        context.stockQuantity,
        interaction.user.id,
        context.before.version,
      );
    } else {
      result = await setManagedShopItemState(
        context.after.id,
        context.action,
        interaction.user.id,
        context.before.version,
      );
    }
    if (!result.success) {
      await interaction.editReply({
        components: createShopStatusComponents("Изменение не сохранено", validationMessage(result.reason)),
      });
      return;
    }
    await interaction.editReply({
      components: createShopAdminReceiptComponents({ action: context.action, item: result.item }),
    });
    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      command: "shop-admin",
      targetId: result.item.id,
      targetTag: result.item.name,
      extra: { action: context.action, version: result.item.version },
    });
  });
  collector.on("end", async () => {
    if (completed) return;
    await interaction.editReply({
      components: createShopAdminPreviewComponents({ ...context, disabled: true }),
    }).catch(() => {});
  });
  return response;
}

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!isAdmin(member)) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Недостаточно прав",
        "Управлять каталогом могут только владельцы сервера и пользователи с правами администратора.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "list") {
    return interaction.reply({
      components: createShopAdminListComponents(
        listManagedShopItems(),
        Number(option(interaction, "page", 1)),
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (subcommand === "history") {
    const itemId = String(option(interaction, "item", "")).trim().toLowerCase() || null;
    const entries = await getShopCatalogAudit(itemId, Number(option(interaction, "limit", 15)));
    return interaction.reply({
      components: createShopAdminHistoryComponents(entries, itemId),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (subcommand === "view") {
    const itemId = String(option(interaction, "item", "")).trim().toLowerCase();
    const item = getManagedShopItem(itemId);
    if (!item) {
      return interaction.reply({
        components: createShopStatusComponents("Товар не найден", validationMessage("not_found")),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      components: createShopAdminItemComponents(item),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (subcommand === "add") {
    const id = String(option(interaction, "id", "")).trim().toLowerCase();
    const item = {
      id,
      name: option(interaction, "name"),
      category: option(interaction, "category"),
      delivery: buildDelivery(interaction, id),
      price_yen: Number(option(interaction, "price")),
      description: option(interaction, "description"),
      emoji: option(interaction, "emoji"),
      rarity: option(interaction, "rarity"),
      weekly_limit: Number(option(interaction, "weekly-limit", 1)),
      cooldown_hours: Number(option(interaction, "cooldown-hours", 0)),
      sort_order: option(interaction, "sort-order", undefined),
      stock: option(interaction, "stock", null),
      enabled: true,
      archived: false,
      sold_count: 0,
      version: 1,
    };
    const validation = validateShopCatalogItem(item);
    if (!validation.valid) {
      return interaction.reply({
        components: createShopStatusComponents("Проверьте параметры товара", validationMessage(validation.reason)),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    return confirmChange(interaction, { action: "create", after: item });
  }

  const itemId = String(option(interaction, "item", "")).trim().toLowerCase();
  const current = getManagedShopItem(itemId);
  if (!current) {
    return interaction.reply({
      components: createShopStatusComponents("Товар не найден", validationMessage("not_found")),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (subcommand === "edit") {
    const next = {
      ...current,
      name: option(interaction, "name", current.name),
      category: option(interaction, "category", current.category),
      price_yen: Number(option(interaction, "price", current.price_yen)),
      description: option(interaction, "description", current.description),
      emoji: option(interaction, "emoji", current.emoji),
      rarity: option(interaction, "rarity", current.rarity),
      weekly_limit: Number(option(interaction, "weekly-limit", current.weekly_limit)),
      cooldown_hours: Number(option(interaction, "cooldown-hours", current.cooldown_hours ?? 0)),
      sort_order: Number(option(interaction, "sort-order", current.sort_order || 0)),
      delivery: buildDelivery(interaction, current.id, current.delivery),
    };
    const validation = validateShopCatalogItem(next);
    if (!validation.valid) {
      return interaction.reply({
        components: createShopStatusComponents("Проверьте изменения", validationMessage(validation.reason)),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    return confirmChange(interaction, { action: "edit", before: current, after: next });
  }

  if (subcommand === "stock") {
    const mode = option(interaction, "mode");
    const quantity = option(interaction, "quantity", null);
    if (mode !== "unlimited" && quantity === null) {
      return interaction.reply({
        components: createShopStatusComponents("Укажите количество", "Для установки, добавления или вычитания заполните параметр `quantity`."),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    let nextStock = current.stock;
    if (mode === "unlimited") nextStock = null;
    if (mode === "set") nextStock = Number(quantity);
    if (mode === "add" && current.stock !== null) nextStock = Number(current.stock) + Number(quantity);
    if (mode === "add" && current.stock === null) {
      return interaction.reply({
        components: createShopStatusComponents("Остаток безлимитный", validationMessage("stock_unlimited")),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    if (!Number.isSafeInteger(nextStock) && nextStock !== null || Number(nextStock) < 0) {
      return interaction.reply({
        components: createShopStatusComponents("Проверьте количество", validationMessage(nextStock < 0 ? "stock_below_zero" : "invalid_stock")),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    return confirmChange(interaction, {
      action: "stock",
      before: current,
      after: { ...current, stock: nextStock },
      stockMode: mode,
      stockQuantity: quantity,
    });
  }

  const action = option(interaction, "action");
  const state = action === "archive"
    ? { enabled: false, archived: true }
    : action === "restore"
      ? { enabled: false, archived: false }
      : { enabled: action === "enable" };
  return confirmChange(interaction, {
    action,
    before: current,
    after: { ...current, ...state },
  });
}
