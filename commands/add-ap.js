import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addAP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('add-ap')
    .setDescription('[ADMIN] Add AP to a player')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The player to modify')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('The AP amount to add (can be negative)')
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
    
    const newAP = addAP(playerId, amount, 'admin');
    
    if (newAP !== false) {
        return interaction.reply({
            embeds: [createSuccessEmbed('AP Updated', `Added **${amount} AP** to **${targetUser.username}**. New total: **${newAP} AP**.`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to update AP.')],
            ephemeral: true
        });
    }
}
