import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, setSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('set-sp')
    .setDescription('[ADMIN] Set a player\'s SP for a specific style')
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
            .setDescription('The SP amount to set')
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
    
    if (amount < 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Invalid Amount', 'SP cannot be negative.')],
            ephemeral: true
        });
    }
    
    const success = setSP(playerId, style.id, amount, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('SP Updated', `Set **${targetUser.username}**'s **${styleName}** SP to **${amount}**.`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to update SP.')],
            ephemeral: true
        });
    }
}
