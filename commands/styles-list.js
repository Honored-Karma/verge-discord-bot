import { SlashCommandBuilder } from 'discord.js';
import { listStyles, getStylePlayerCount } from '../utils/dataManager.js';
import { createInfoEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('styles-list')
    .setDescription('Просмотр всех доступных боевых стилей');

export async function execute(interaction) {
    const styles = listStyles();
    
    if (styles.length === 0) {
        return interaction.reply({
            embeds: [createInfoEmbed('🥋 Боевые стили', 'Пока нет доступных стилей. Администраторы могут добавить их командой `/add-style`.')],
            ephemeral: true
        });
    }
    
    const styleText = styles.map(style => {
        const playerCount = getStylePlayerCount(style.id);
        return `**${style.name}**\nИгроков тренируется: ${playerCount}`;
    }).join('\n\n');
    
    const embed = createInfoEmbed('🥋 Доступные боевые стили', styleText);
    
    return interaction.reply({ embeds: [embed] });
}
