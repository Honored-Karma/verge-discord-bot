import { SlashCommandBuilder } from 'discord.js';
import { listStyles, getStylePlayerCount } from '../utils/dataManager.js';
import { createStylesListEmbed, createStylesNavigationButtons } from '../utils/embeds.js';
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
        const msg = await interaction.reply({
            embeds: [createStylesListEmbed('🥋 Боевые стили', 'Пока нет доступных стилей. Администраторы могут добавить их командой `/add-style`.', 1, 1, '')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const ITEMS_PER_PAGE = 5;
    const totalPages = Math.ceil(styles.length / ITEMS_PER_PAGE);
    let currentPage = 0;
    
    async function buildPage(page) {
        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageStyles = styles.slice(start, end);
        
        const styleText = await Promise.all(pageStyles.map(async style => {
            const playerCount = await getStylePlayerCount(style.id);
            return `**${style.name}**\nИгроков тренируется: ${playerCount}`;
        })).then(results => results.join('\n\n'));
        
        return styleText;
    }
    
    const initialText = await buildPage(0);
    const embed = createStylesListEmbed('🥋 Доступные боевые стили', initialText, 1, totalPages);
    
    const components = totalPages > 1 ? [createStylesNavigationButtons(0, totalPages)] : [];
    
    const response = await interaction.reply({ 
        embeds: [embed], 
        components: components,
        fetchReply: true 
    });
    
    if (totalPages === 1) {
        autoDeleteMessageShort(response);
        return;
    }
    
    const collector = response.createMessageComponentCollector({ time: 300000 });
    
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Это не ваш список!', flags: 64 });
        }
        
        if (i.customId === 'styles_prev') {
            currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === 'styles_next') {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
        }
        
        const pageText = await buildPage(currentPage);
        const newEmbed = createStylesListEmbed('🥋 Доступные боевые стили', pageText, currentPage + 1, totalPages);
        const newButtons = createStylesNavigationButtons(currentPage, totalPages);
        
        await i.update({ embeds: [newEmbed], components: [newButtons] });
    });
    
    collector.on('end', () => {
        response.edit({ components: [] }).catch(() => {});
    });
    
    // Auto-delete after 20 seconds
    setTimeout(() => {
        response.delete().catch(() => {});
    }, 20000);
}
