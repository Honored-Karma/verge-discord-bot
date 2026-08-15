import { MessageFlags } from "discord.js";
import {
  getInteractionSession,
  sessionClosed,
  sessionExpired,
} from "./interactionSessions.js";

const handlers = new Map();

/**
 * Global registry of persistent interaction handlers.
 *
 * Every panel the bot posts is backed by a session document keyed by the
 * message id, so a button pressed after a restart is still routed to the right
 * handler instead of dying with the process-local collector that created it.
 */
export function registerInteractionHandler(namespace, handler) {
  const key = String(namespace || "").trim();
  if (!key) throw new Error("Interaction handler namespace is required");
  if (typeof handler?.handleComponent !== "function"
    && typeof handler?.handleModal !== "function") {
    throw new Error(`Interaction handler "${key}" must expose handleComponent or handleModal`);
  }
  handlers.set(key, handler);
  return handler;
}

export function getInteractionHandler(namespace) {
  return handlers.get(String(namespace || "")) || null;
}

export function listInteractionHandlers() {
  return [...handlers.keys()];
}

export function clearInteractionHandlers() {
  handlers.clear();
}

const MODAL_SEPARATOR = "|";

export function buildModalCustomId(namespace, action, messageId) {
  return [namespace, action, messageId].join(MODAL_SEPARATOR);
}

export function parseModalCustomId(customId) {
  const parts = String(customId || "").split(MODAL_SEPARATOR);
  if (parts.length < 3) return null;
  const [namespace, action, messageId] = parts;
  if (!namespace || !action || !messageId) return null;
  if (!handlers.has(namespace)) return null;
  return { namespace, action, messageId };
}

async function notice(interaction, payload) {
  const body = { ...payload, flags: MessageFlags.Ephemeral | (payload.flags || 0) };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(body).catch(() => {});
  }
  return interaction.reply(body).catch(() => {});
}

async function refuse(interaction, handler, session, kind) {
  const custom = handler?.[kind];
  if (typeof custom === "function") {
    return custom({ interaction, session });
  }
  const text = kind === "renderForeign"
    ? "Эта панель принадлежит другому игроку. Откройте свою командой заново."
    : "Панель больше не активна. Запустите команду ещё раз.";
  return notice(interaction, { content: text });
}

/**
 * @returns {Promise<boolean>} true when the interaction belonged to a
 * persistent session and was handled here. false means "not ours" — the caller
 * must leave the interaction alone so legacy per-message collectors still work.
 */
export async function routeComponentInteraction(interaction, {
  loadSession = getInteractionSession,
} = {}) {
  const messageId = interaction.message?.id;
  if (!messageId) return false;

  const session = await loadSession(messageId);
  if (!session) return false;

  const handler = handlers.get(session.namespace);
  if (!handler || typeof handler.handleComponent !== "function") {
    await refuse(interaction, handler, session, "renderExpired");
    return true;
  }

  if (!await allowed(interaction, handler, session)) {
    await refuse(interaction, handler, session, "renderForeign");
    return true;
  }

  if (sessionClosed(session) || sessionExpired(session)) {
    await refuse(interaction, handler, session, "renderExpired");
    return true;
  }

  await handler.handleComponent({ interaction, session });
  return true;
}

/**
 * Кто имеет право нажимать.
 *
 * По умолчанию панель принадлежит одному игроку — тому, кто её открыл. Но
 * админские панели общие: заявку из магазина разбирает любой администратор,
 * а не только тот, кому сообщение адресовано. Для таких панелей обработчик
 * объявляет свою проверку `authorize`, и владелец становится справочным полем.
 */
async function allowed(interaction, handler, session) {
  if (typeof handler.authorize === "function") {
    try {
      return Boolean(await handler.authorize({ interaction, session }));
    } catch (error) {
      console.error(`❌ Ошибка проверки прав в "${session.namespace}":`, error);
      return false;
    }
  }
  return session.owner_id === interaction.user.id;
}

export async function routeModalInteraction(interaction, {
  loadSession = getInteractionSession,
} = {}) {
  const parsed = parseModalCustomId(interaction.customId);
  if (!parsed) return false;

  const handler = handlers.get(parsed.namespace);
  if (!handler || typeof handler.handleModal !== "function") return false;

  const session = await loadSession(parsed.messageId);
  if (!session) {
    await refuse(interaction, handler, null, "renderExpired");
    return true;
  }

  if (!await allowed(interaction, handler, session)) {
    await refuse(interaction, handler, session, "renderForeign");
    return true;
  }

  if (sessionClosed(session) || sessionExpired(session)) {
    await refuse(interaction, handler, session, "renderExpired");
    return true;
  }

  await handler.handleModal({ interaction, session, action: parsed.action });
  return true;
}
