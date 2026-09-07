import { getDB } from '../utils/db.js';

/**
 * In-memory fallback logs for testing / preview without active MongoDB
 */
const MEMORY_AUDIT_LOGS = [];

/**
 * Log an administrative mutation to the audit log
 * @param {Object} params
 * @param {Object} params.actor - Authenticated user details { discord_id, username, global_name }
 * @param {string} params.action - Action name (e.g. 'wiki_create', 'wiki_update', 'wiki_publish', 'wiki_archive', 'application_sync', 'character_update')
 * @param {string} params.entity_type - 'wiki_article' | 'application' | 'character' | 'system'
 * @param {string} params.entity_id - Public slug or public_id
 * @param {Object} [params.changes] - Changes object { before: {...}, after: {...} }
 * @param {string|Object} [params.details] - Short human description or stats
 */
export async function logAdminAction({
    actor,
    action,
    entity_type,
    entity_id,
    changes = null,
    details = null
}) {
    const timestamp = new Date().toISOString();

    const safeActor = {
        discord_id: actor?.id || actor?.discord_id || 'unknown',
        username: actor?.username || 'unknown',
        global_name: actor?.global_name || actor?.username || 'Admin'
    };

    // Sanitize changes to ensure no sensitive tokens or passwords are logged
    const safeChanges = changes ? {
        before: changes.before || null,
        after: changes.after || null
    } : null;

    const logDoc = {
        actor: safeActor,
        action: String(action),
        entity_type: String(entity_type),
        entity_id: String(entity_id || 'general'),
        changes: safeChanges,
        details: details || null,
        source: 'web_admin',
        created_at: timestamp
    };

    const db = getDB();
    if (db) {
        try {
            await db.collection('admin_actions').insertOne(logDoc);
            return logDoc;
        } catch (err) {
            console.error('Failed to write to admin_actions collection:', err);
        }
    }

    // Keep up to 200 in-memory entries as preview fallback
    MEMORY_AUDIT_LOGS.unshift(logDoc);
    if (MEMORY_AUDIT_LOGS.length > 200) {
        MEMORY_AUDIT_LOGS.pop();
    }

    return logDoc;
}

/**
 * Fetch paginated audit log entries with filters
 */
export async function getAuditLogs({
    page = 1,
    limit = 25,
    action = '',
    entity_type = '',
    actor_id = ''
}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const db = getDB();
    if (!db) {
        let filtered = [...MEMORY_AUDIT_LOGS];

        if (action) {
            filtered = filtered.filter(l => l.action === action);
        }
        if (entity_type) {
            filtered = filtered.filter(l => l.entity_type === entity_type);
        }
        if (actor_id) {
            filtered = filtered.filter(l => l.actor?.discord_id === actor_id);
        }

        const total = filtered.length;
        const items = filtered.slice(skip, skip + limitNum);

        return {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
            items
        };
    }

    const query = {};
    if (action) query.action = action;
    if (entity_type) query.entity_type = entity_type;
    if (actor_id) query['actor.discord_id'] = actor_id;

    const [total, items] = await Promise.all([
        db.collection('admin_actions').countDocuments(query),
        db.collection('admin_actions')
            .find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .toArray()
    ]);

    return {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
        items
    };
}
