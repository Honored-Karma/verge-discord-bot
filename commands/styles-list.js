import { SlashCommandBuilder } from 'discord.js';
import { listStyles, getStylePlayerCount } from '../utils/dataManager.js';
import { createStylesListEmbed, createInfoEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('styles-list')
    .setDescription('Просмотр всех доступных боевых стилей');

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const styles = await listStyles();
    
    if (styles.length === 0) {
        return interaction.reply({
            embeds: [createInfoEmbed('🥋 Боевые стили', 'Пока нет доступных стилей. Администраторы могут добавить их командой `/add-style`.')],
            fetchReply: true
        });
    }
    
    const styleText = await Promise.all(styles.map(async style => {
        const playerCount = await getStylePlayerCount(style.id);
        return `**${style.name}**\nИгроков тренируется: ${playerCount}`;
    })).then(results => results.join('\n\n'));
    
    const embed = createStylesListEmbed('🥋 Доступные боевые стили', styleText);
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
