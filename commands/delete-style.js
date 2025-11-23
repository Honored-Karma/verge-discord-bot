import { SlashCommandBuilder } from 'discord.js';
import { deleteStyle, getStyleByName } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessageShort, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('delete-style')
    .setDescription('[АДМИН] Удалить боевой стиль')
    .addStringOption(option =>
        option.setName('style_name')
            .setDescription('Название стиля для удаления')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const styleName = interaction.options.getString('style_name');
    
    const style = getStyleByName(styleName);
    
    if (!style) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', `Стиль **"${styleName}"** не существует.`)],
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const success = deleteStyle(style.id, interaction.user.id);
    
    if (success) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Стиль удален', 
                `Стиль **${styleName}** был удален вместе со всеми данными об изучении.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось удалить стиль.')],
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
