import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getPlayerInventory } from '../utils/dataManager.js';
import { createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your or another player\'s inventory')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The user to view (leave empty for yourself)')
            .setRequired(false));

export async function execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Not Registered', `${targetUser.username} is not registered yet.`)],
            ephemeral: true
        });
    }
    
    const inventory = getPlayerInventory(playerId);
    
    if (inventory.length === 0) {
        return interaction.reply({
            embeds: [createInfoEmbed('🎒 Inventory', `${targetUser.username}'s inventory is empty.`)],
            ephemeral: true
        });
    }
    
    const inventoryText = inventory.map(item => {
        const effect = item.effect ? JSON.parse(item.effect) : null;
        let effectText = '';
        if (effect?.ap) effectText = ` (+${effect.ap} AP)`;
        if (effect?.sp) effectText = ` (+${effect.sp.value} SP to ${effect.sp.style})`;
        
        return `**${item.name}** x${item.qty}${effectText}\n*${item.type}* - ID: \`${item.id}\``;
    }).join('\n\n');
    
    const embed = createInfoEmbed(`🎒 ${targetUser.username}'s Inventory`, inventoryText);
    
    return interaction.reply({ embeds: [embed] });
}
