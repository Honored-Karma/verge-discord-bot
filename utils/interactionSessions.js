import { getDB } from "./db.js";

export const INTERACTION_SESSIONS_COLLECTION = "interaction_sessions";

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLOSED_RETENTION_MS = 10 * 60 * 1000;

export const SESSION_STATUS = {
  open: "open",
  working: "working",
  closed: "closed",
};

function sessions() {
  return getDB().collection(INTERACTION_SESSIONS_COLLECTION);
}

function safeId(value, maxLength = 120) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function ttlDate(ttlMs, now) {
  const span = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_SESSION_TTL_MS;
  return new Date(now + span);
}

/**
 * A session is expired when its own business deadline has passed. The document
 * lives longer than that deadline on purpose: it lets the router answer with a
 * friendly "время истекло" panel instead of silently ignoring the click.
 */
export function sessionExpired(session, now = Date.now()) {
  const deadline = Number(session?.state?.deadline_at || 0);
  return deadline > 0 && deadline <= now;
}

export function sessionClosed(session) {
  return session?.status === SESSION_STATUS.closed;
}

export async function insertSession(collection, {
  messageId,
  namespace,
  ownerId,
  guildId = null,
  channelId = null,
  state = {},
  ttlMs = DEFAULT_SESSION_TTL_MS,
}) {
  const message_id = safeId(messageId);
  const namespaceId = safeId(namespace, 40);
  const owner_id = safeId(ownerId);
  if (!message_id || !namespaceId || !owner_id) {
    return { success: false, reason: "invalid_session" };
  }

  const now = Date.now();
  const document = {
    message_id,
    namespace: namespaceId,
    owner_id,
    guild_id: guildId ? safeId(guildId) : null,
    channel_id: channelId ? safeId(channelId) : null,
    status: SESSION_STATUS.open,
    revision: 1,
    state,
    created_at: new Date(now),
    updated_at: new Date(now),
    expires_at: ttlDate(ttlMs, now),
  };

  try {
    await collection.insertOne(document);
  } catch (error) {
    if (error?.code === 11000) return { success: false, reason: "duplicate_session" };
    throw error;
  }
  return { success: true, session: document };
}

export async function findSession(collection, messageId) {
  const message_id = safeId(messageId);
  if (!message_id) return null;
  return collection.findOne({ message_id });
}

/**
 * Optimistic write: the caller passes the revision it rendered from, so two
 * clicks racing on the same panel cannot overwrite each other silently.
 */
export async function saveSessionState(collection, messageId, revision, state, {
  status = SESSION_STATUS.open,
  ttlMs = null,
} = {}) {
  const message_id = safeId(messageId);
  if (!message_id) return { success: false, reason: "invalid_session" };

  const now = Date.now();
  const update = {
    $set: {
      state,
      status,
      updated_at: new Date(now),
    },
    $inc: { revision: 1 },
  };
  if (ttlMs) update.$set.expires_at = ttlDate(ttlMs, now);

  const updated = await collection.findOneAndUpdate(
    { message_id, revision },
    update,
    { returnDocument: "after" },
  );
  if (!updated) {
    const current = await collection.findOne({ message_id });
    return current
      ? { success: false, reason: "revision_conflict", session: current }
      : { success: false, reason: "session_not_found" };
  }
  return { success: true, session: updated };
}

/**
 * Atomically moves an open session into "working". This is the persistent
 * replacement for the in-memory `busy` flag: it survives a restart and it is
 * safe when several bot replicas run at once.
 */
export async function claimSession(collection, messageId, revision) {
  const message_id = safeId(messageId);
  if (!message_id) return null;
  const claimed = await collection.findOneAndUpdate(
    { message_id, revision, status: SESSION_STATUS.open },
    {
      $set: { status: SESSION_STATUS.working, updated_at: new Date() },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" },
  );
  return claimed || null;
}

export async function releaseSession(collection, messageId, state = null) {
  const message_id = safeId(messageId);
  if (!message_id) return null;
  const update = {
    $set: { status: SESSION_STATUS.open, updated_at: new Date() },
    $inc: { revision: 1 },
  };
  if (state) update.$set.state = state;
  const released = await collection.findOneAndUpdate(
    { message_id },
    update,
    { returnDocument: "after" },
  );
  return released || null;
}

export async function closeSession(collection, messageId) {
  const message_id = safeId(messageId);
  if (!message_id) return null;
  const now = Date.now();
  const closed = await collection.findOneAndUpdate(
    { message_id },
    {
      $set: {
        status: SESSION_STATUS.closed,
        updated_at: new Date(now),
        expires_at: new Date(now + CLOSED_RETENTION_MS),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" },
  );
  return closed || null;
}

export async function dropSession(collection, messageId) {
  const message_id = safeId(messageId);
  if (!message_id) return false;
  const result = await collection.deleteOne({ message_id });
  return result.deletedCount === 1;
}

export const createInteractionSession = (payload) => insertSession(sessions(), payload);
export const getInteractionSession = (messageId) => findSession(sessions(), messageId);
export const saveInteractionSession = (messageId, revision, state, options) =>
  saveSessionState(sessions(), messageId, revision, state, options);
export const claimInteractionSession = (messageId, revision) =>
  claimSession(sessions(), messageId, revision);
export const releaseInteractionSession = (messageId, state) =>
  releaseSession(sessions(), messageId, state);
export const closeInteractionSession = (messageId) => closeSession(sessions(), messageId);
export const deleteInteractionSession = (messageId) => dropSession(sessions(), messageId);
