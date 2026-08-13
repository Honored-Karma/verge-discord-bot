import { randomUUID } from "node:crypto";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  getActiveSlot,
  getLearnedPlayerStyles,
  getPlayer,
} from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { makePlayerKey } from "../utils/playerKey.js";
import {
  getShopCategory,
  getShopItem,
  listShopCategories,
  listShopItems,
  shopPrice,
} from "../utils/shopCatalog.js";
import {
  getActiveShopEffects,
  getPlayerShopOrders,
  purchaseShopItem,
} from "../utils/shopStore.js";
import {
  createShopCategoryComponents,
  createShopConfirmationComponents,
  createShopHomeComponents,
  createShopItemComponents,
  createShopOrdersComponents,
  createShopReceiptComponents,
  createShopStatusComponents,
  createShopStyleComponents,
  SHOP_BACK_ID,
  SHOP_BUY_ID,
  SHOP_CANCEL_ID,
  SHOP_CATEGORY_SELECT_ID,
  SHOP_CATEGORY_PREV_ID,
  SHOP_CATEGORY_NEXT_ID,
  SHOP_CONFIRM_ID,
  SHOP_CURRENCY_SELECT_ID,
  SHOP_ITEM_SELECT_ID,
  SHOP_ORDERS_ID,
  SHOP_STYLE_SELECT_ID,
} from "../utils/shopComponents.js";
import { logCommand } from "../utils/logs.js";

const SHOP_SESSION_DURATION = 5 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Открыть магазин расходников и редких заказов")
  .setDMPermission(false);

function preferredCurrency(player) {
  return String(player?.organization || "").toUpperCase() === "GUARDIANS"
    ? "krw"
    : "yen";
}

function avatarUrl(player, user) {
  const custom = String(player?.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
}

function purchaseError(result, currency) {
  switch (result.reason) {
    case "weekly_limit":
      return `Недельный лимит этого товара — **${Number(result.limit || 1).toLocaleString("ru-RU")} шт.** Выберите другой товар или дождитесь следующей недели.`;
    case "insufficient_funds":
      return `Доступно только **${Number(result.available || 0).toLocaleString("ru-RU")} ${currency === "yen" ? "¥" : "₩"}**. Выберите более доступный товар или другую валюту.`;
    case "player_not_found":
      return "Активный персонаж больше не существует. Закройте магазин и проверьте выбранный слот.";
    case "rollback_failed":
      return "Покупка остановлена из-за ошибки возврата. Не повторяйте оплату и обратитесь к администратору для проверки баланса.";
    case "delivery_failed":
      return "Товар не удалось выдать. Списанная сумма возвращена на баланс.";
    case "out_of_stock":
      return "Товар закончился. Вернитесь в раздел магазина и выберите другой.";
    case "item_unavailable":
      return "Товар снят с продажи. Вернитесь в каталог и выберите другой.";
    case "item_changed":
      return "Условия товара изменились после открытия карточки. Вернитесь в раздел и проверьте новую цену и остаток.";
    default:
      return "Покупка не выполнена. Баланс не должен измениться — проверьте его и повторите попытку.";
  }
}

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + cooldown.remaining) / 1000);
    return interaction.reply({
      components: createShopStatusComponents(
        "Магазин пока недоступен",
        `Попробуйте снова <t:${retryAt}:R>.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const slot = await getActiveSlot(interaction.user.id);
  const playerId = makePlayerKey(interaction.user.id, slot);
  let player = await getPlayer(playerId);
  if (!player) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Персонаж не найден",
        "Создайте персонажа в активном слоте через `/register`, затем снова откройте `/shop`.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const categories = listShopCategories();
  const characterName = player.character_name || player.username;
  const characterAvatarUrl = avatarUrl(player, interaction.user);
  let currency = preferredCurrency(player);
  let view = "home";
  let category = null;
  let categoryPage = 0;
  let item = null;
  let selectedStyle = null;
  let styles = [];
  let orders = [];
  let effects = await getActiveShopEffects(playerId);
  let operationId = null;
  let busy = false;
  let completed = false;

  const balances = () => ({
    yen: Number(player.yen || 0),
    krw: Number(player.krw || 0),
  });

  function components(disabled = false) {
    if (view === "category" && category) {
      return createShopCategoryComponents({
        characterName,
        avatarUrl: characterAvatarUrl,
        balances: balances(),
        currency,
        category,
        items: listShopItems(category.id),
        page: categoryPage,
        disabled,
      });
    }
    if (view === "item" && item) {
      return createShopItemComponents({
        characterName,
        avatarUrl: characterAvatarUrl,
        balance: balances()[currency],
        currency,
        item,
        selectedStyle,
        disabled,
      });
    }
    if (view === "style" && item) {
      return createShopStyleComponents({ item, styles, disabled });
    }
    if (view === "confirm" && item) {
      return createShopConfirmationComponents({
        characterName,
        avatarUrl: characterAvatarUrl,
        balance: balances()[currency],
        currency,
        item,
        selectedStyle,
        disabled,
      });
    }
    if (view === "orders") {
      return createShopOrdersComponents({ orders, disabled });
    }
    return createShopHomeComponents({
      characterName,
      avatarUrl: characterAvatarUrl,
      balances: balances(),
      currency,
      categories,
      effects,
      disabled,
    });
  }

  const response = await interaction.reply({
    components: components(),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });
  const collector = response.createMessageComponentCollector({
    time: SHOP_SESSION_DURATION,
  });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({
        components: createShopStatusComponents(
          "Это магазин другого игрока",
          "Откройте собственную витрину через `/shop`.",
          "warning",
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }
    if (busy) {
      await componentInteraction.reply({
        components: createShopStatusComponents(
          "Покупка обрабатывается",
          "Дождитесь квитанции перед следующим действием.",
          "warning",
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    if (componentInteraction.customId === SHOP_CURRENCY_SELECT_ID
      && componentInteraction.isStringSelectMenu()) {
      currency = componentInteraction.values[0] === "krw" ? "krw" : "yen";
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_CATEGORY_SELECT_ID
      && componentInteraction.isStringSelectMenu()) {
      category = getShopCategory(componentInteraction.values[0]);
      if (!category) return;
      view = "category";
      categoryPage = 0;
      item = null;
      selectedStyle = null;
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_ITEM_SELECT_ID
      && componentInteraction.isStringSelectMenu()) {
      item = getShopItem(componentInteraction.values[0]);
      if (!item) return;
      view = "item";
      selectedStyle = null;
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_CATEGORY_PREV_ID) {
      categoryPage = Math.max(0, categoryPage - 1);
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_CATEGORY_NEXT_ID && category) {
      const pageCount = Math.max(1, Math.ceil(listShopItems(category.id).length / 25));
      categoryPage = Math.min(pageCount - 1, categoryPage + 1);
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_STYLE_SELECT_ID
      && componentInteraction.isStringSelectMenu()) {
      selectedStyle = styles.find(
        (style) => String(style.id) === componentInteraction.values[0],
      ) || null;
      if (!selectedStyle) {
        await componentInteraction.reply({
          components: createShopStatusComponents(
            "Стиль больше недоступен",
            "Вернитесь к товару и снова выберите изученный стиль.",
          ),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }
      view = "item";
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_ORDERS_ID) {
      orders = await getPlayerShopOrders(playerId);
      view = "orders";
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_BACK_ID) {
      if (view === "category" || view === "orders") {
        view = "home";
        effects = await getActiveShopEffects(playerId);
      } else if (view === "style" || view === "confirm") {
        view = "item";
      } else if (view === "item") {
        view = "category";
      } else {
        view = "home";
      }
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_CANCEL_ID) {
      operationId = null;
      view = "item";
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId === SHOP_BUY_ID && item) {
      if (item.delivery.kind === "sp_scroll" && !selectedStyle) {
        styles = await getLearnedPlayerStyles(playerId);
        if (styles.length === 0) {
          await componentInteraction.reply({
            components: createShopStatusComponents(
              "Нет изученных стилей",
              "Получите боевой стиль у ответственного за развитие персонажей, затем вернитесь в магазин.",
              "warning",
            ),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }
        view = "style";
        await componentInteraction.update({ components: components() });
        return;
      }
      operationId = `shop:${randomUUID()}`;
      view = "confirm";
      await componentInteraction.update({ components: components() });
      return;
    }

    if (componentInteraction.customId !== SHOP_CONFIRM_ID || !item || !operationId) return;

    busy = true;
    await componentInteraction.deferUpdate();
    const result = await purchaseShopItem({
      operationId,
      playerId,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      itemId: item.id,
      currency,
      styleName: selectedStyle?.name || null,
      expectedVersion: item.version,
      expectedPrice: shopPrice(item, currency),
    });

    if (!result.success) {
      busy = false;
      player = await getPlayer(playerId) || player;
      const refreshedItem = getShopItem(item.id);
      if (refreshedItem) {
        item = refreshedItem;
        view = "item";
      } else {
        item = null;
        view = "category";
      }
      operationId = null;
      await interaction.editReply({ components: components() });
      await componentInteraction.followUp({
        components: createShopStatusComponents(
          "Покупка не выполнена",
          purchaseError(result, currency),
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    completed = true;
    collector.stop("purchased");
    player = await getPlayer(playerId) || player;
    await interaction.editReply({
      components: createShopReceiptComponents({ item, result }),
    });

    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      command: "shop",
      targetId: playerId,
      targetTag: characterName,
      extra: {
        item: item.name,
        currency,
        price: result.price,
        delivery: result.delivery,
        order: result.orderId || "—",
      },
    });
  });

  collector.on("end", async () => {
    if (completed) return;
    try {
      await interaction.editReply({ components: components(true) });
    } catch {}
  });

  return response;
}
