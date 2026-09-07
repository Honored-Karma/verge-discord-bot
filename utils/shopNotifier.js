import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import { shopDeliveryLabel } from "./shopCatalog.js";
import {
  createOrderReviewComponents,
  createOrderSessionState,
  SHOP_ORDER_NAMESPACE,
  SHOP_ORDER_SESSION_TTL_MS,
} from "../interactions/shopOrderSession.js";
import { createInteractionSession } from "./interactionSessions.js";

/**
 * Сообщения администраторам о покупках в магазине.
 *
 * Канал берётся из SHOP_LOG_CHANNEL_ID. Значение по умолчанию — админский
 * канал сервера Verge; так уведомления работают сразу после деплоя, но их
 * можно перенаправить переменной окружения без правки кода.
 */
const DEFAULT_CHANNEL_ID = "1494015049797206147";
const PURCHASE_COLOR = 0x22c55e;

export function shopLogChannelId() {
  const configured = String(process.env.SHOP_LOG_CHANNEL_ID || "").trim();
  return /^\d{5,25}$/.test(configured) ? configured : DEFAULT_CHANNEL_ID;
}

function money(value, currency) {
  const amount = Number(value || 0).toLocaleString("ru-RU")
    .replace(/\s/g, String.fromCharCode(160));
  return `${amount} ${currency === "krw" ? "₩" : "¥"}`;
}

function clean(value, maxLength = 100) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .replace(/([\\`*_{}[\]()<>#+\-.!|~])/g, "\\$1");
}

/**
 * Карточка обычной покупки — только факт для журнала: выдача уже произошла
 * автоматически, решать администратору нечего.
 */
export function createPurchaseNotice({ item, result, playerId, characterName, userId }) {
  const boughtAt = Math.floor(Date.now() / 1000);

  return [
    new ContainerBuilder()
      .setAccentColor(PURCHASE_COLOR)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([
        "## 🛒 Покупка в магазине",
        `**${clean(item?.name || result?.itemName || "Товар")}** — ${money(result?.price, result?.currency)}`,
        "",
        `**Покупатель:** <@${userId}> · ${clean(characterName || "без имени")}`,
        `-# Персонаж \`${clean(playerId, 60)}\` · <t:${boughtAt}:f>`,
        `-# Выдача: ${clean(shopDeliveryLabel(item) || result?.delivery || "—", 80)}`,
      ].join("\n"))),
  ];
}

/**
 * Отправляет уведомление в админский канал.
 *
 * Для заявок сообщение получает кнопки «Выдать» и «Отклонить» и собственную
 * сессию: решение принимается прямо в канале, без набора команд. Сессия живёт
 * долго и переживает рестарт бота, поэтому кнопки не превращаются в мёртвые.
 *
 * Никогда не бросает исключение: покупка уже совершена и оплачена, поэтому
 * проблема с каналом не должна превращаться в ошибку у игрока.
 */
export async function notifyShopPurchase({
  client,
  item,
  result,
  playerId,
  characterName,
  userId,
  guildId = null,
}) {
  const channelId = shopLogChannelId();
  const isOrder = Boolean(result?.orderId);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) {
      console.warn(`⚠️  Канал покупок ${channelId} не текстовый — уведомление пропущено`);
      return { sent: false, reason: "not_text_channel" };
    }

    const orderState = isOrder
      ? createOrderSessionState({
        publicId: result.orderId,
        itemName: item?.name || result?.itemName || "Товар",
        playerId,
        characterName,
        userId,
        price: result?.price,
        currency: result?.currency,
        delivery: shopDeliveryLabel(item) || result?.delivery || null,
      })
      : null;

    const message = await channel.send({
      components: orderState
        ? createOrderReviewComponents(orderState)
        : createPurchaseNotice({ item, result, playerId, characterName, userId }),
      flags: MessageFlags.IsComponentsV2,
      // Упоминание покупателя в тексте не должно никого пинговать: это журнал.
      allowedMentions: { parse: [] },
    });

    if (!orderState) return { sent: true, order: false };

    const created = await createInteractionSession({
      messageId: message.id,
      namespace: SHOP_ORDER_NAMESPACE,
      // Владелец здесь справочный: право решать проверяется по роли админа.
      ownerId: userId,
      guildId,
      channelId,
      state: orderState,
      ttlMs: SHOP_ORDER_SESSION_TTL_MS,
    });

    if (!created.success) {
      // Без сессии кнопки нерабочие — честнее сразу дать текстовый путь.
      console.error("Order review session was not stored:", created.reason);
      await message.edit({
        components: [
          new ContainerBuilder()
            .setAccentColor(PURCHASE_COLOR)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `## 🧾 Заявка ${clean(result.orderId, 20)}\n`
              + `**${clean(orderState.item_name)}** — ${money(orderState.price, orderState.currency)}\n`
              + `**Покупатель:** <@${userId}> · ${clean(characterName || "без имени")}\n\n`
              + "Кнопки недоступны — разберите заявку командой:\n"
              + `\`/shop-order order:${result.orderId} action:Выдать\`\n`
              + `\`/shop-order order:${result.orderId} action:Отклонить reason:причина\``,
            )),
        ],
      }).catch(() => {});
      return { sent: true, order: true, buttons: false };
    }

    return { sent: true, order: true, buttons: true };
  } catch (error) {
    console.error(`❌ Не удалось отправить уведомление о покупке в ${channelId}:`, error.message);
    return { sent: false, reason: "send_failed" };
  }
}
