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
