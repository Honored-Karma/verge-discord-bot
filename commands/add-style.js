import { SlashCommandBuilder } from 'discord.js';
import { addStyle } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('add-style')
    .setDescription('[АДМИН] Создать новый боевой стиль')
    .addStringOption(option =>
        option.setName('name')
            .setDescription('Название стиля')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
    }
    
    const name = interaction.options.getString('name');
    
    if (name.length < 2 || name.length > 50) {
        return interaction.reply({
            embeds: [createErrorEmbed('Некорректное название', 'Название должно быть от 2 до 50 символов.')],
            ephemeral: true
        });
    }
    
    const success = addStyle(name, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('Стиль создан', `**${name}** был добавлен в список доступных боевых стилей!`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось создать стиль. Возможно, он уже существует.')],
            ephemeral: true
        });
    }
}
