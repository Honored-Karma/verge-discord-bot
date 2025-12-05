import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addAP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasCommandPermission } from '../utils/adminCheck.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('add-ap')
    .setDescription('[АДМИН] Добавить AP игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество AP для добавления (может быть отрицательным)')
            .setRequired(true));

export async function execute(interaction) {
    if (!hasCommandPermission(interaction.member, 'add-ap')) {
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
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const newAP = await addAP(playerId, amount, 'admin');
    
    if (newAP !== false) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('AP обновлено', 
                `Добавлено **${amount} AP** игроку **${player.character_name || player.username}**.\n\nНовый баланс: **${newAP} AP**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        // Log admin action
        try {
            await logCommand({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                command: 'add-ap',
                targetId: playerId,
                targetTag: `${player.character_name || player.username} <@${playerId}>`,
                extra: { amount }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить AP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
