import { config } from 'dotenv';

config();

import { getStaffConfig } from '../config/adminConfig.js';

/**
 * Resolves current configured Admin User IDs from both ENV and config/admins.json
 */
export function getConfiguredAdminIds() {
    return getStaffConfig().adminUserIds;
}

/**
 * Resolves current configured Admin Role IDs from both ENV and config/admins.json
 */
export function getConfiguredAdminRoleIds() {
    return getStaffConfig().adminRoleIds;
}

/**
 * Calculate granular capabilities for an authenticated user session
 * @param {Object} user - User object from session (contains id, roles, permissions)
 * @returns {Object} Granular capabilities map
 */
export function calculateUserCapabilities(user) {
    if (!user || !user.id || user.is_member_of_guild === false) {
        return {
            canAccessAdmin: false,
            canManageWiki: false,
            canManageApplications: false,
            canViewPrivateCharacters: false,
            canViewInventories: false,
            canManageCharacters: false,
            canManageEconomy: false,
            canManageRoles: false,
            canViewAuditLog: false
        };
    }

    const userId = String(user.id);
    const userRoles = Array.isArray(user.roles) 
        ? user.roles.map(String) 
        : (Array.isArray(user.permissions?.roles) ? user.permissions.roles.map(String) : []);

    const {
        adminUserIds: adminIds, adminRoleIds, staffRoleIds, headGmRoleIds,
        headAnketologRoleIds, gmRoleIds, anketologRoleIds, moderatorRoleIds,
        loreMasterRoleIds
    } = getStaffConfig();

    // Check role memberships & explicit admin status
    const isDirectAdmin = adminIds.includes(userId);
    const hasAdminRole = userRoles.some(r => adminRoleIds.includes(r));
    const isFullAdmin = isDirectAdmin || hasAdminRole || Boolean(user.is_admin) || Boolean(user.permissions?.isAdmin);

    const isHeadGM = isFullAdmin || userRoles.some(r => headGmRoleIds.includes(r));
    const isHeadAnketolog = isFullAdmin || userRoles.some(r => headAnketologRoleIds.includes(r));
    const isAnketolog = isFullAdmin || isHeadAnketolog || userRoles.some(r => anketologRoleIds.includes(r)) || Boolean(user.permissions?.isAnketolog);
    const isLoreMaster = isFullAdmin || userRoles.some(r => loreMasterRoleIds.includes(r));
    const isModerator = isFullAdmin || userRoles.some(r => moderatorRoleIds.includes(r)) || Boolean(user.permissions?.isModerator);
    const isGM = isFullAdmin || isHeadGM || userRoles.some(r => gmRoleIds.includes(r));
    const isStaff = isFullAdmin || isGM || isHeadGM || isHeadAnketolog || isModerator || isAnketolog || userRoles.some(r => staffRoleIds.includes(r)) || Boolean(user.is_staff) || Boolean(user.permissions?.isStaff);

    const capabilities = {
        canAccessAdmin: isStaff || isLoreMaster,
        canManageWiki: isFullAdmin || isLoreMaster,
        canManageApplications: isFullAdmin || isAnketolog,
        canViewPrivateCharacters: isStaff || isFullAdmin,
        canViewInventories: isStaff || isFullAdmin,
        canManageCharacters: isFullAdmin || isHeadGM || isHeadAnketolog,
        canManageEconomy: isFullAdmin || isHeadGM,
        canManageRoles: isFullAdmin,
        canViewAuditLog: isFullAdmin || isHeadGM
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
