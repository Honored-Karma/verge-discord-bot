import { config } from 'dotenv';

config();

import { loadAdminConfigFile } from '../config/adminConfig.js';

/**
 * Parses comma-separated ID lists from environment variables
 */
function parseEnvIds(envVar) {
    if (!envVar) return [];
    return envVar.split(',').map(id => id.trim()).filter(Boolean);
}

/**
 * Resolves current configured Admin User IDs from both ENV and config/admins.json
 */
export function getConfiguredAdminIds() {
    const envIds = parseEnvIds(process.env.ADMIN_IDS || process.env.ADMIN_USER_IDS);
    const fileIds = loadAdminConfigFile().adminUserIds;
    return Array.from(new Set([...envIds, ...fileIds]));
}

/**
 * Resolves current configured Admin Role IDs from both ENV and config/admins.json
 */
export function getConfiguredAdminRoleIds() {
    const envIds = parseEnvIds(process.env.ADMIN_ROLE_IDS);
    const fileIds = loadAdminConfigFile().adminRoleIds;
    return Array.from(new Set([...envIds, ...fileIds]));
}

/**
 * Calculate granular capabilities for an authenticated user session
 * @param {Object} user - User object from session (contains id, roles, permissions)
 * @returns {Object} Granular capabilities map
 */
export function calculateUserCapabilities(user) {
    if (!user || !user.id) {
        return {
            canAccessAdmin: false,
            canManageWiki: false,
            canManageApplications: false,
            canViewPrivateCharacters: false,
            canViewInventories: false,
            canManageCharacters: false,
            canManageEconomy: false,
            canViewAuditLog: false
        };
    }

    const userId = String(user.id);
    const userRoles = Array.isArray(user.roles) 
        ? user.roles.map(String) 
        : (Array.isArray(user.permissions?.roles) ? user.permissions.roles.map(String) : []);

    const adminIds = getConfiguredAdminIds();
    const adminRoleIds = getConfiguredAdminRoleIds();
    const staffRoleIds = parseEnvIds(process.env.STAFF_ROLE_IDS || process.env.ADMIN_ROLE_ID);
    const anketologRoleIds = Array.from(new Set([
        ...parseEnvIds(process.env.ANKETOLOG_ROLE_IDS || process.env.ANKETOLOG_ROLE_ID),
        ...loadAdminConfigFile().anketologRoleIds
    ]));
    const moderatorRoleIds = parseEnvIds(process.env.MODERATOR_ROLE_IDS || process.env.MODERATOR_ROLE_ID);
    const loreMasterRoleIds = Array.from(new Set([
        ...parseEnvIds(process.env.LORE_MASTER_ROLE_IDS || process.env.WIKI_EDITOR_ROLE_IDS),
        ...loadAdminConfigFile().loreMasterRoleIds
    ]));

    // Check role memberships & explicit admin status
    const isDirectAdmin = adminIds.includes(userId);
    const hasAdminRole = userRoles.some(r => adminRoleIds.includes(r));
    const isFullAdmin = isDirectAdmin || hasAdminRole || Boolean(user.is_admin) || Boolean(user.permissions?.isAdmin);

    const isAnketolog = isFullAdmin || userRoles.some(r => anketologRoleIds.includes(r)) || Boolean(user.permissions?.isAnketolog);
    const isLoreMaster = isFullAdmin || userRoles.some(r => loreMasterRoleIds.includes(r));
    const isModerator = isFullAdmin || userRoles.some(r => moderatorRoleIds.includes(r)) || Boolean(user.permissions?.isModerator);
    const isStaff = isFullAdmin || isModerator || isAnketolog || userRoles.some(r => staffRoleIds.includes(r)) || Boolean(user.is_staff) || Boolean(user.permissions?.isStaff);

    const capabilities = {
        canAccessAdmin: isStaff || isFullAdmin,
        canManageWiki: isFullAdmin || isLoreMaster,
        canManageApplications: isFullAdmin || isAnketolog,
        canViewPrivateCharacters: isStaff || isFullAdmin,
        canViewInventories: isStaff || isFullAdmin,
        canManageCharacters: isFullAdmin,
        canManageEconomy: isFullAdmin,
        canViewAuditLog: isFullAdmin
    };

    return capabilities;
}

/**
 * Check if a user possesses a specific capability
 */
export function hasCapability(user, capabilityName) {
    const caps = calculateUserCapabilities(user);
    return Boolean(caps[capabilityName]);
}
