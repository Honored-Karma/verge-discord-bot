import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, setSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('give-style')
    .setDescription('[АДМИН] Выдать боевой стиль игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок-получатель')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style_name')
            .setDescription('Название стиля')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('initial_sp')
            .setDescription('Начальное SP (по умолчанию: 0)')
            .setRequired(false));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }

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
    
    const targetUser = interaction.options.getUser('user');
    const styleName = interaction.options.getString('style_name');
    let initialSP = interaction.options.getInteger('initial_sp');
    if (initialSP === null) initialSP = 1;
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    const style = getStyleByName(styleName);
    
    if (!style) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', `Стиль **"${styleName}"** не существует. Создайте его командой \`/add-style\`.`)],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    if (initialSP < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное значение', 'SP не может быть отрицательным.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    const success = setSP(playerId, style.id, initialSP, interaction.user.id);
    
    if (success) {
        const name = player.character_name || player.username;
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Стиль выдан', 
                `Выдан стиль **${styleName}** игроку **${name}** с **${initialSP} SP**`)],
            fetchReply: true
        });
        autoDeleteMessage(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось выдать стиль.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
    }
}
