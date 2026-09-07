import { config } from 'dotenv';

config();

/**
 * Parses comma-separated ID lists from environment variables
 */
function parseEnvIds(envVar) {
    if (!envVar) return [];
    return envVar.split(',').map(id => id.trim()).filter(Boolean);
}

// Configured Roles & Users
const ADMIN_IDS = parseEnvIds(process.env.ADMIN_IDS || process.env.ADMIN_USER_IDS);
const ADMIN_ROLE_IDS = parseEnvIds(process.env.ADMIN_ROLE_IDS);
const STAFF_ROLE_IDS = parseEnvIds(process.env.STAFF_ROLE_IDS || process.env.ADMIN_ROLE_ID);
const ANKETOLOG_ROLE_IDS = parseEnvIds(process.env.ANKETOLOG_ROLE_IDS || process.env.ANKETOLOG_ROLE_ID);
const MODERATOR_ROLE_IDS = parseEnvIds(process.env.MODERATOR_ROLE_IDS || process.env.MODERATOR_ROLE_ID);
const LORE_MASTER_ROLE_IDS = parseEnvIds(process.env.LORE_MASTER_ROLE_IDS || process.env.WIKI_EDITOR_ROLE_IDS);

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
    const userRoles = Array.isArray(user.roles) ? user.roles.map(String) : [];

    // Check role memberships
    const isDirectAdmin = ADMIN_IDS.includes(userId);
    const hasAdminRole = userRoles.some(r => ADMIN_ROLE_IDS.includes(r));
    const isFullAdmin = isDirectAdmin || hasAdminRole || Boolean(user.is_admin);

    const isAnketolog = isFullAdmin || userRoles.some(r => ANKETOLOG_ROLE_IDS.includes(r));
    const isLoreMaster = isFullAdmin || userRoles.some(r => LORE_MASTER_ROLE_IDS.includes(r));
    const isModerator = isFullAdmin || userRoles.some(r => MODERATOR_ROLE_IDS.includes(r));
    const isStaff = isFullAdmin || isModerator || isAnketolog || userRoles.some(r => STAFF_ROLE_IDS.includes(r)) || Boolean(user.is_staff);

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
