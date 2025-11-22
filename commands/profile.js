import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getAllPlayerSP, getPlayerInventory } from '../utils/dataManager.js';
import { createProfileEmbed, createErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a player profile')
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
            embeds: [createErrorEmbed('Not Registered', `${targetUser.username} is not registered yet. Use \`/register\` to get started!`)],
            ephemeral: true
        });
    }
    
    const styles = getAllPlayerSP(playerId);
    const inventory = getPlayerInventory(playerId);
    
    const embed = createProfileEmbed(player, styles, inventory, targetUser);
    
    return interaction.reply({ embeds: [embed] });
}
