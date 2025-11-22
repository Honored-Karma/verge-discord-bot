import { SlashCommandBuilder } from 'discord.js';
import { listStyles, getStylePlayerCount } from '../utils/dataManager.js';
import { createStylesListEmbed, createInfoEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('styles-list')
    .setDescription('Просмотр всех доступных боевых стилей');

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }

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
    
    const embed = createStylesListEmbed('🥋 Доступные боевые стили', styleText);
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessage(msg);
}
