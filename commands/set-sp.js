import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, setSP, listStyles } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-sp')
    .setDescription('[АДМИН] Установить SP игрока для стиля')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style')
            .setDescription('Номер стиля (1, 2, 3...) или название стиля')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество SP')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const targetUser = interaction.options.getUser('user');
    const styleInput = interaction.options.getString('style');
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    // Get all styles to show list
    const allStyles = listStyles();
    
    if (allStyles.length === 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Нет стилей', 'В базе не создано ни одного стиля. Создайте стиль командой `/add-style`.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (amount < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное значение', 'SP не может быть отрицательным.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    // Try to find style by number or name
    let style = null;
    
    if (/^\d+$/.test(styleInput)) {
        // Input is a number - get style by index
        const styleIndex = parseInt(styleInput) - 1;
        if (styleIndex >= 0 && styleIndex < allStyles.length) {
            style = allStyles[styleIndex];
        }
    } else {
        // Input is a name - search by name
        style = getStyleByName(styleInput);
    }
    
    if (!style) {
        // Build styles list for error message
        const stylesList = allStyles.map((s, i) => `${i + 1}) ${s.name}`).join('\n');
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', 
                `Стиль не найден!\n\n**Доступные стили:**\n${stylesList}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const success = setSP(playerId, style.id, amount, interaction.user.id);
    
    if (success) {
        const rank = amount >= 2500 ? 'Мастер' : amount >= 1000 ? 'Эксперт' : amount >= 350 ? 'Владелец' : 'Новичок';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('SP обновлено', 
                `Установлено **${amount} SP** для стиля **${style.name}** игроку **${player.character_name || player.username}**\n\nРанг: **${rank}**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить SP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
