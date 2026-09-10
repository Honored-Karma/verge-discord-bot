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
            return { adminUserIds: [], adminRoleIds: [], anketologRoleIds: [], loreMasterRoleIds: [] };
        }
        const raw = fs.readFileSync(ADMINS_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            adminUserIds: Array.isArray(parsed.adminUserIds) ? parsed.adminUserIds.map(String).map(s => s.trim()).filter(Boolean) : [],
            adminRoleIds: Array.isArray(parsed.adminRoleIds) ? parsed.adminRoleIds.map(String).map(s => s.trim()).filter(Boolean) : [],
            anketologRoleIds: Array.isArray(parsed.anketologRoleIds) ? parsed.anketologRoleIds.map(String).map(s => s.trim()).filter(Boolean) : [],
            loreMasterRoleIds: Array.isArray(parsed.loreMasterRoleIds) ? parsed.loreMasterRoleIds.map(String).map(s => s.trim()).filter(Boolean) : []
        };
    } catch (err) {
        console.error('[AdminConfig] Failed to read admins.json:', err.message);
        return { adminUserIds: [], adminRoleIds: [], anketologRoleIds: [], loreMasterRoleIds: [] };
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
