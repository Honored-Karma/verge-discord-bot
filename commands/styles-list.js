import { SlashCommandBuilder } from 'discord.js';
import { listStyles, getStylePlayerCount } from '../utils/dataManager.js';
import { createInfoEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('styles-list')
    .setDescription('View all available martial arts styles');

export async function execute(interaction) {
    const styles = listStyles();
    
    if (styles.length === 0) {
        return interaction.reply({
            embeds: [createInfoEmbed('🥋 Martial Arts Styles', 'No styles available yet.')],
            ephemeral: true
        });
    }
    
    const styleText = styles.map(style => {
        const playerCount = getStylePlayerCount(style.id);
        return `**${style.name}**\n*${style.description}*\nPlayers training: ${playerCount}`;
    }).join('\n\n');
    
    const embed = createInfoEmbed('🥋 Available Martial Arts Styles', styleText);
    
    return interaction.reply({ embeds: [embed] });
}
