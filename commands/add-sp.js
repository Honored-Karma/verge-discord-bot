import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, addSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';

function isAdmin(member) {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.includes(member.id)) return true;
    if (member.roles.cache.some(role => role.name === 'Game Master')) return true;
    if (member.guild.ownerId === member.id) return true;
    return false;
}

export const data = new SlashCommandBuilder()
    .setName('add-sp')
    .setDescription('[ADMIN] Add SP to a player for a specific style')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The player to modify')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style')
            .setDescription('The martial arts style name')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('The SP amount to add')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Permission Denied', 'You must be a Game Master or admin to use this command.')],
            ephemeral: true
        });
    }
    
    const targetUser = interaction.options.getUser('user');
    const styleName = interaction.options.getString('style');
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Not Registered', `${targetUser.username} is not registered yet.`)],
            ephemeral: true
        });
    }
    
    const style = getStyleByName(styleName);
    
    if (!style) {
        return interaction.reply({
            embeds: [createErrorEmbed('Style Not Found', `Style "${styleName}" does not exist. Use \`/styles-list\` to see available styles.`)],
            ephemeral: true
        });
    }
    
    const newSP = addSP(playerId, style.id, amount, interaction.user.id);
    
    if (newSP !== false) {
        const rank = newSP >= 2500 ? 'Master' : newSP >= 1000 ? 'Expert' : newSP >= 350 ? 'Owner' : 'Novice';
        return interaction.reply({
            embeds: [createSuccessEmbed('SP Updated', `Added **${amount} SP** to **${targetUser.username}**'s **${styleName}**.\n\nNew total: **${newSP} SP** (${rank})`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to update SP.')],
            ephemeral: true
        });
    }
}
