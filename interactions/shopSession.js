import { randomUUID } from "node:crypto";
import { MessageFlags } from "discord.js";
import {
  getLearnedPlayerStyles,
  getPlayer,
} from "../utils/dataManager.js";
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
  SHOP_CATEGORY_NEXT_ID,
  SHOP_CATEGORY_PREV_ID,
  SHOP_CATEGORY_SELECT_ID,
  SHOP_CONFIRM_ID,
  SHOP_CURRENCY_SELECT_ID,
  SHOP_ITEM_SELECT_ID,
  SHOP_ORDERS_ID,
  SHOP_STYLE_SELECT_ID,
} from "../utils/shopComponents.js";
import {
  claimInteractionSession,
  closeInteractionSession,
  getInteractionSession,
  releaseInteractionSession,
  saveInteractionSession,
  SESSION_STATUS,
} from "../utils/interactionSessions.js";
import { logCommand } from "../utils/logs.js";
import { notifyShopPurchase } from "../utils/shopNotifier.js";

export const SHOP_NAMESPACE = "shop";

/**
 * The shop panel used to die with a five minute collector. It is now a stored
 * session, so the window can be long: every purchase re-validates price, stock
 * and catalog version at confirm time, and the operation id is persisted, which
 * makes a repeated confirm idempotent instead of a double charge.
 */
export const SHOP_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const ITEMS_PER_PAGE = 25;

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export function preferredCurrency(player) {
  return String(player?.organization || "").toUpperCase() === "GUARDIANS"
    ? "krw"
    : "yen";
}

export function createShopSessionState({
  playerId,
  characterName,
  characterAvatarUrl,
  currency,
}) {
  return {
    player_id: playerId,
    character_name: characterName,
    character_avatar_url: characterAvatarUrl,
    currency: currency === "krw" ? "krw" : "yen",
    view: "home",
    category_id: null,
    item_id: null,
    category_page: 0,
    style_id: null,
    style_name: null,
    operation_id: null,
  };
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

function selectedStyleOf(state) {
  return state.style_id
    ? { id: state.style_id, name: state.style_name }
    : null;
}

/**
 * Renders the panel purely from the stored state plus fresh reads, so the same
 * output is produced by the process that opened the shop and by any later one.
 */
export async function renderShopComponents(state, { disabled = false } = {}) {
  const player = await getPlayer(state.player_id);
  const balances = {
    yen: Number(player?.yen || 0),
    krw: Number(player?.krw || 0),
  };
  const identity = {
    characterName: state.character_name,
    avatarUrl: state.character_avatar_url,
  };
  const currency = state.currency === "krw" ? "krw" : "yen";
  const item = state.item_id ? getShopItem(state.item_id) : null;
  const category = state.category_id ? getShopCategory(state.category_id) : null;
  const selectedStyle = selectedStyleOf(state);

  if (state.view === "category" && category) {
    return createShopCategoryComponents({
      ...identity,
      balances,
      currency,
      category,
      items: listShopItems(category.id),
      page: Number(state.category_page || 0),
      disabled,
    });
  }

  if (state.view === "item" && item) {
    return createShopItemComponents({
      ...identity,
      balance: balances[currency],
      currency,
      item,
      selectedStyle,
      disabled,
    });
  }

  if (state.view === "style" && item) {
    const styles = await getLearnedPlayerStyles(state.player_id);
    return createShopStyleComponents({ item, styles, disabled });
  }

  if (state.view === "confirm" && item) {
    return createShopConfirmationComponents({
      ...identity,
      balance: balances[currency],
      currency,
      item,
      selectedStyle,
      disabled,
    });
  }

  if (state.view === "orders") {
    const orders = await getPlayerShopOrders(state.player_id);
    return createShopOrdersComponents({ orders, disabled });
  }

  const effects = await getActiveShopEffects(state.player_id);
  return createShopHomeComponents({
    ...identity,
    balances,
    currency,
    categories: listShopCategories(),
    effects,
    disabled,
  });
}

function backView(view) {
  if (view === "category" || view === "orders") return "home";
  if (view === "style" || view === "confirm") return "item";
  if (view === "item") return "category";
  return "home";
}

/**
 * Applies a navigation click to the state. Returns null when the click does not
 * change anything the panel shows, and a status payload when the player has to
 * be told why nothing happened.
 */
async function applyNavigation(interaction, state) {
  const customId = interaction.customId;

  if (customId === SHOP_CURRENCY_SELECT_ID && interaction.isStringSelectMenu()) {
    state.currency = interaction.values[0] === "krw" ? "krw" : "yen";
    return { changed: true };
  }

  if (customId === SHOP_CATEGORY_SELECT_ID && interaction.isStringSelectMenu()) {
    const category = getShopCategory(interaction.values[0]);
    if (!category) return { changed: false };
    state.category_id = category.id;
    state.view = "category";
    state.category_page = 0;
    state.item_id = null;
    state.style_id = null;
    state.style_name = null;
    return { changed: true };
  }

  if (customId === SHOP_ITEM_SELECT_ID && interaction.isStringSelectMenu()) {
    const item = getShopItem(interaction.values[0]);
    if (!item) return { changed: false };
    state.item_id = item.id;
    state.view = "item";
    state.style_id = null;
    state.style_name = null;
    return { changed: true };
  }

  if (customId === SHOP_CATEGORY_PREV_ID) {
    state.category_page = Math.max(0, Number(state.category_page || 0) - 1);
    return { changed: true };
  }

  if (customId === SHOP_CATEGORY_NEXT_ID && state.category_id) {
    const pageCount = Math.max(
      1,
      Math.ceil(listShopItems(state.category_id).length / ITEMS_PER_PAGE),
    );
    state.category_page = Math.min(
      pageCount - 1,
      Number(state.category_page || 0) + 1,
    );
    return { changed: true };
  }

  if (customId === SHOP_STYLE_SELECT_ID && interaction.isStringSelectMenu()) {
    const styles = await getLearnedPlayerStyles(state.player_id);
    const style = styles.find(
      (candidate) => String(candidate.id) === interaction.values[0],
    );
    if (!style) {
      return {
        changed: false,
        status: createShopStatusComponents(
          "Стиль больше недоступен",
          "Вернитесь к товару и снова выберите изученный стиль.",
        ),
      };
    }
    state.style_id = String(style.id);
    state.style_name = style.name;
    state.view = "item";
    return { changed: true };
  }

  if (customId === SHOP_ORDERS_ID) {
    state.view = "orders";
    return { changed: true };
  }

  if (customId === SHOP_BACK_ID) {
    state.view = backView(state.view);
    return { changed: true };
  }

  if (customId === SHOP_CANCEL_ID) {
    state.operation_id = null;
    state.view = "item";
    return { changed: true };
  }

  if (customId === SHOP_BUY_ID && state.item_id) {
    const item = getShopItem(state.item_id);
    if (!item) return { changed: false };
    if (item.delivery.kind === "sp_scroll" && !state.style_id) {
      const styles = await getLearnedPlayerStyles(state.player_id);
      if (styles.length === 0) {
        return {
          changed: false,
          status: createShopStatusComponents(
            "Нет изученных стилей",
            "Получите боевой стиль у ответственного за развитие персонажей, затем вернитесь в магазин.",
            "warning",
          ),
        };
      }
      state.view = "style";
      return { changed: true };
    }
    state.operation_id = `shop:${randomUUID()}`;
    state.view = "confirm";
    return { changed: true };
  }

  return { changed: false };
}

async function handleConfirm({ interaction, session }) {
  const claimed = await claimInteractionSession(session.message_id, session.revision);
  if (!claimed) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Покупка обрабатывается",
        "Дождитесь квитанции перед следующим действием.",
        "warning",
      ),
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }

  const state = { ...claimed.state };
  const item = state.item_id ? getShopItem(state.item_id) : null;

  if (!item || !state.operation_id) {
    state.operation_id = null;
    state.view = item ? "item" : "category";
    await releaseInteractionSession(session.message_id, state);
    return interaction.update({
      components: await renderShopComponents(state),
    }).catch(() => {});
  }

  await interaction.deferUpdate();

  try {
    const result = await purchaseShopItem({
      operationId: state.operation_id,
      playerId: state.player_id,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      itemId: item.id,
      currency: state.currency,
      styleName: state.style_name || null,
      expectedVersion: item.version,
      expectedPrice: shopPrice(item, state.currency),
    });

    if (!result.success) {
      const refreshedItem = getShopItem(item.id);
      state.operation_id = null;
      if (refreshedItem) {
        state.view = "item";
      } else {
        state.item_id = null;
        state.view = "category";
      }
      await releaseInteractionSession(session.message_id, state);
      await interaction.editReply({
        components: await renderShopComponents(state),
      });
      await interaction.followUp({
        components: createShopStatusComponents(
          "Покупка не выполнена",
          purchaseError(result, state.currency),
        ),
        flags: EPHEMERAL_V2,
      }).catch(() => {});
      return;
    }

    await closeInteractionSession(session.message_id);
    await interaction.editReply({
      components: createShopReceiptComponents({ item, result }),
    });

    // Уведомление админам — после квитанции и без await в общем потоке ошибок:
    // покупка уже оплачена, недоступный канал не должен ломать её для игрока.
    await notifyShopPurchase({
      client: interaction.client,
      item,
      result,
      playerId: state.player_id,
      characterName: state.character_name,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    }).catch((error) => console.error("Shop notification error:", error));

    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      command: "shop",
      targetId: state.player_id,
      targetTag: state.character_name,
      extra: {
        item: item.name,
        currency: state.currency,
        price: result.price,
        delivery: result.delivery,
        order: result.orderId || "—",
      },
    }).catch((error) => console.error("Error logging shop purchase:", error));
  } catch (error) {
    console.error("Error handling shop confirmation:", error);
    await releaseInteractionSession(session.message_id, state);
    await interaction.followUp({
      components: createShopStatusComponents(
        "Покупка не подтверждена",
        "Не удалось связаться с хранилищем. Проверьте баланс и инвентарь перед повторной попыткой — операция защищена от двойного списания.",
      ),
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }
}

async function handleComponent({ interaction, session }) {
  if (interaction.customId === SHOP_CONFIRM_ID) {
    return handleConfirm({ interaction, session });
  }

  // A purchase is mid-flight: navigating away now would repaint the panel from a
  // state the confirm step is about to rewrite.
  if (session.status === SESSION_STATUS.working) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Покупка обрабатывается",
        "Дождитесь квитанции перед следующим действием.",
        "warning",
      ),
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }

  const state = { ...session.state };
  const outcome = await applyNavigation(interaction, state);

  if (outcome.status) {
    return interaction.reply({
      components: outcome.status,
      flags: EPHEMERAL_V2,
    }).catch(() => {});
  }

  if (!outcome.changed) {
    return interaction.deferUpdate().catch(() => {});
  }

  const saved = await saveInteractionSession(
    session.message_id,
    session.revision,
    state,
    { ttlMs: SHOP_SESSION_TTL_MS },
  );

  // Another click won the race — repaint from whatever is actually stored.
  const effectiveState = saved.success
    ? saved.session.state
    : (saved.session?.state || state);

  return interaction.update({
    components: await renderShopComponents(effectiveState),
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    components: createShopStatusComponents(
      "Витрина закрыта",
      "Эта панель магазина больше не активна. Откройте `/shop` ещё раз — баланс и корзина не пострадали.",
      "warning",
    ),
    flags: EPHEMERAL_V2,
  }).catch(() => {});
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    components: createShopStatusComponents(
      "Это магазин другого игрока",
      "Откройте собственную витрину через `/shop`.",
      "warning",
    ),
    flags: EPHEMERAL_V2,
  }).catch(() => {});
}

export const shopInteractionHandler = {
  namespace: SHOP_NAMESPACE,
  handleComponent,
  renderExpired,
  renderForeign,
};

export const __testables = {
  applyNavigation,
  backView,
  purchaseError,
  getInteractionSession,
};
