import { SlashCommandBuilder } from 'discord.js';
import { deleteStyle, getStyleByName } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('delete-style')
    .setDescription('[АДМИН] Удалить боевой стиль')
    .addStringOption(option =>
        option.setName('style_name')
            .setDescription('Название стиля для удаления')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
    }
    
    const styleName = interaction.options.getString('style_name');
    
    const style = getStyleByName(styleName);
    
    if (!style) {
        return interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', `Стиль **"${styleName}"** не существует.`)],
            ephemeral: true
        });
    }
    
    const success = deleteStyle(style.id, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('Стиль удален', 
                `Стиль **${styleName}** был удален вместе со всеми данными об изучении.`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось удалить стиль.')],
            ephemeral: true
        });
    }
}
