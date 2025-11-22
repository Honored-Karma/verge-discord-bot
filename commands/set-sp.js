import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, setSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('set-sp')
    .setDescription('[АДМИН] Установить SP игрока для стиля')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style')
            .setDescription('Название боевого стиля')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество SP')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
    }
    
    const targetUser = interaction.options.getUser('user');
    const styleName = interaction.options.getString('style');
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    const style = getStyleByName(styleName);
    
    if (!style) {
        return interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', `Стиль "${styleName}" не существует. Используйте \`/styles-list\` для просмотра доступных стилей.`)],
            ephemeral: true
        });
    }
    
    if (amount < 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Некорректное значение', 'SP не может быть отрицательным.')],
            ephemeral: true
        });
    }
    
    const success = setSP(playerId, style.id, amount, interaction.user.id);
    
    if (success) {
        const rank = amount >= 2500 ? 'Мастер' : amount >= 1000 ? 'Эксперт' : amount >= 350 ? 'Владелец' : 'Новичок';
        return interaction.reply({
            embeds: [createSuccessEmbed('SP обновлено', 
                `Установлено **${amount} SP** для стиля **${styleName}** игроку **${player.character_name || player.username}**\n\nРанг: **${rank}**`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить SP.')],
            ephemeral: true
        });
    }
}
