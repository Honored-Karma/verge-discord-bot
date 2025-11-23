import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setAP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-ap')
    .setDescription('[АДМИН] Установить AP игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество AP')
            .setRequired(true));

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
    const amount = interaction.options.getInteger('amount');
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
    
    if (amount < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное значение', 'AP не может быть отрицательным.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    const success = setAP(playerId, amount, interaction.user.id);
    
    if (success) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('AP обновлено', 
                `Установлено **${amount} AP** для игрока **${player.character_name || player.username}**`)],
            fetchReply: true
        });
        autoDeleteMessage(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить AP.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
    }
}
