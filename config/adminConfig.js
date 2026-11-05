import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMINS_JSON_PATH = path.join(__dirname, 'admins.json');

/**
 * Safely reads the admins.json file
 * @returns {Object} JSON configuration
 */
export function loadAdminConfigFile() {
    try {
        if (!fs.existsSync(ADMINS_JSON_PATH)) {
            return {
                adminUserIds: [],
                adminRoleIds: [],
                headGmRoleIds: [],
                headAnketologRoleIds: [],
                anketologRoleIds: [],
                gmRoleIds: [],
                loreMasterRoleIds: []
            };
        }
        const raw = fs.readFileSync(ADMINS_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const sanitize = (arr) => Array.isArray(arr) ? arr.map(String).map(s => s.trim()).filter(Boolean) : [];
        return {
            adminUserIds: sanitize(parsed.adminUserIds),
            adminRoleIds: sanitize(parsed.adminRoleIds),
            headGmRoleIds: sanitize(parsed.headGmRoleIds),
            headAnketologRoleIds: sanitize(parsed.headAnketologRoleIds),
            anketologRoleIds: sanitize(parsed.anketologRoleIds),
            gmRoleIds: sanitize(parsed.gmRoleIds),
            loreMasterRoleIds: sanitize(parsed.loreMasterRoleIds)
        };
    } catch (err) {
        console.error('[AdminConfig] Failed to read admins.json:', err.message);
        return {
            adminUserIds: [],
            adminRoleIds: [],
            headGmRoleIds: [],
            headAnketologRoleIds: [],
            anketologRoleIds: [],
            gmRoleIds: [],
            loreMasterRoleIds: []
        };
    }
}

// Use the same file + environment role lists in Discord commands and web sessions.
export function getStaffConfig() {
    const fileConfig = loadAdminConfigFile();
    const merge = (key, ...envNames) => Array.from(new Set([
        ...(fileConfig[key] || []),
        ...envNames.flatMap(name => (process.env[name] || '').split(','))
            .map(id => id.trim()).filter(Boolean)
    ]));
    return {
        adminUserIds: merge('adminUserIds', 'ADMIN_IDS', 'ADMIN_USER_IDS'),
        adminRoleIds: merge('adminRoleIds', 'ADMIN_ROLE_IDS', 'ADMIN_ROLE_ID'),
        headGmRoleIds: merge('headGmRoleIds', 'HEAD_GM_ROLE_IDS', 'HEAD_GM_ROLE_ID'),
        headAnketologRoleIds: merge('headAnketologRoleIds', 'HEAD_ANKETOLOG_ROLE_IDS', 'HEAD_ANKETOLOG_ROLE_ID'),
        gmRoleIds: merge('gmRoleIds', 'GM_ROLE_IDS', 'GM_ROLE_ID', 'LIMITED_ADMIN_ROLE_IDS'),
        anketologRoleIds: merge('anketologRoleIds', 'ANKETOLOG_ROLE_IDS', 'ANKETOLOG_ROLE_ID'),
        moderatorRoleIds: merge('moderatorRoleIds', 'MODERATOR_ROLE_IDS', 'MODERATOR_ROLE_ID'),
        loreMasterRoleIds: merge('loreMasterRoleIds', 'LORE_MASTER_ROLE_IDS', 'WIKI_EDITOR_ROLE_IDS'),
        staffRoleIds: merge('staffRoleIds', 'STAFF_ROLE_IDS'),
        styleGiverRoleIds: merge('styleGiverRoleIds', 'GIVE_STYLE_ROLE_IDS', 'GIVE_STYLE_ROLE_ID')
    };
}

/**
 * Append or save an admin user ID to admins.json
 * @param {string} userId - Discord user ID
 */
export function addAdminUserId(userId) {
    if (!userId || typeof userId !== 'string') return;
    const cleanId = userId.trim();
    const config = loadAdminConfigFile();
    if (!config.adminUserIds.includes(cleanId)) {
        config.adminUserIds.push(cleanId);
        try {
            fs.writeFileSync(ADMINS_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8');
        } catch (err) {
            console.error('[AdminConfig] Failed to write admins.json:', err.message);
        }
    }
}
