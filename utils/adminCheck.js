import { PermissionFlagsBits } from 'discord.js';

export function isAdmin(member) {
    if (!member) return false;
    
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
    
    if (adminIds.includes(member.id)) return true;
    
    if (member.roles.cache.some(role => role.name === 'Game Master')) return true;
    
    if (member.guild.ownerId === member.id) return true;
    
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    
    return false;
}


// Check whether a member has permission to run a specific admin-style command.
// This allows configured role IDs (LIMITED_ADMIN_ROLE_IDS) to run certain commands.
export function hasCommandPermission(member, commandName) {
    if (!member) return false;

    // Full admins pass immediately
    if (isAdmin(member)) return true;

    // Commands that limited admin roles can use
    const limitedAdminCommands = [
        'add-ap',
        'add-sp',
        'add-currency',
        'deduct-currency',
        'set-ap',
        'set-sp',
        'set-currency',
        'give-item'
    ];

    // Commands that style-giver roles can use
    const styleGiverCommands = [
        'give-style',
        'remove-player-style'
    ];

    // Check limited admin commands
    if (limitedAdminCommands.includes(commandName)) {
        const allowedRoleIds = process.env.LIMITED_ADMIN_ROLE_IDS ? process.env.LIMITED_ADMIN_ROLE_IDS.split(',').map(r => r.trim()) : [];
        if (allowedRoleIds.length > 0) {
            try {
                if (member.roles) {
                    if (member.roles.cache && typeof member.roles.cache.some === 'function') {
                        return member.roles.cache.some(role => allowedRoleIds.includes(role.id) || allowedRoleIds.includes(role.name));
                    }
                    if (Array.isArray(member.roles)) {
                        return member.roles.some(rid => allowedRoleIds.includes(String(rid)));
                    }
                }
            } catch (e) {
                // fallback
            }
        }
    }

    // Check style-giver commands
    if (styleGiverCommands.includes(commandName)) {
        const allowedRoleIds = process.env.GIVE_STYLE_ROLE_IDS ? process.env.GIVE_STYLE_ROLE_IDS.split(',').map(r => r.trim()) : [];
        if (allowedRoleIds.length > 0) {
            try {
                if (member.roles) {
                    if (member.roles.cache && typeof member.roles.cache.some === 'function') {
                        return member.roles.cache.some(role => allowedRoleIds.includes(role.id) || allowedRoleIds.includes(role.name));
                    }
                    if (Array.isArray(member.roles)) {
                        return member.roles.some(rid => allowedRoleIds.includes(String(rid)));
                    }
                }
            } catch (e) {
                // fallback
            }
        }
    }

    return false;
}
