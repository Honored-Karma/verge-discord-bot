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

    // Commands that we allow limited roles to use
    const limitedCommands = [
        'add-ap',
        'add-sp',
        'give-style',
        'add-currency',
        'give-item'
    ];

    if (!limitedCommands.includes(commandName)) return false;

    const allowedRoleIds = process.env.LIMITED_ADMIN_ROLE_IDS ? process.env.LIMITED_ADMIN_ROLE_IDS.split(',').map(r => r.trim()) : [];
    if (allowedRoleIds.length === 0) return false;

    // member.roles may be a RoleManager with a cache, or an array of role IDs (from interaction.member payload).
    try {
        if (member.roles) {
            // If roles is a manager with cache
            if (member.roles.cache && typeof member.roles.cache.some === 'function') {
                return member.roles.cache.some(role => allowedRoleIds.includes(role.id));
            }

            // If roles is an array (raw payload), check directly
            if (Array.isArray(member.roles)) {
                return member.roles.some(rid => allowedRoleIds.includes(String(rid)));
            }
        }
    } catch (e) {
        // fallback
    }

    return false;
}
