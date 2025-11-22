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
