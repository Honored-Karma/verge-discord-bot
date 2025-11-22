import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setAP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('set-ap')
    .setDescription('[ADMIN] Set a player\'s AP to a specific value')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The player to modify')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('The AP amount to set')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Permission Denied', 'You must be a Game Master or admin to use this command.')],
            ephemeral: true
        });
    }
    
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Not Registered', `${targetUser.username} is not registered yet.`)],
            ephemeral: true
        });
    }
    
    if (amount < 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Invalid Amount', 'AP cannot be negative.')],
            ephemeral: true
        });
    }
    
    const success = setAP(playerId, amount, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('AP Updated', `Set **${targetUser.username}**'s AP to **${amount}**.`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to update AP.')],
            ephemeral: true
        });
    }
}
