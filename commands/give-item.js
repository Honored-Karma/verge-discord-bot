import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getItem, giveItem } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('give-item')
    .setDescription('[ADMIN] Give an item to a player')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The player to give the item to')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('item_id')
            .setDescription('The item ID (e.g., ap_tome_50)')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('qty')
            .setDescription('Quantity to give (default: 1)')
            .setRequired(false));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Permission Denied', 'You must be a Game Master or admin to use this command.')],
            ephemeral: true
        });
    }
    
    const targetUser = interaction.options.getUser('user');
    const itemId = interaction.options.getString('item_id');
    const qty = interaction.options.getInteger('qty') || 1;
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Not Registered', `${targetUser.username} is not registered yet.`)],
            ephemeral: true
        });
    }
    
    const item = getItem(itemId);
    
    if (!item) {
        return interaction.reply({
            embeds: [createErrorEmbed('Item Not Found', `Item with ID "${itemId}" does not exist in the database.`)],
            ephemeral: true
        });
    }
    
    if (qty < 1) {
        return interaction.reply({
            embeds: [createErrorEmbed('Invalid Quantity', 'Quantity must be at least 1.')],
            ephemeral: true
        });
    }
    
    const success = giveItem(playerId, itemId, qty, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('Item Given', `Gave **${qty}x ${item.name}** to **${targetUser.username}**.`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to give item.')],
            ephemeral: true
        });
    }
}
