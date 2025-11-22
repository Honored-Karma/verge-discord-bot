import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getItemByName, giveItem } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('give-item')
    .setDescription('[АДМИН] Выдать предмет игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок-получатель')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('item_name')
            .setDescription('Название предмета (напр., "AP Tome (50)")')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('qty')
            .setDescription('Количество (по умолчанию: 1)')
            .setRequired(false));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
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
    const itemName = interaction.options.getString('item_name');
    const qty = interaction.options.getInteger('qty') || 1;
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    const item = getItemByName(itemName);
    
    if (!item) {
        return interaction.reply({
            embeds: [createErrorEmbed('Предмет не найден', `Предмет с названием "${itemName}" не существует в базе данных.`)],
            ephemeral: true
        });
    }
    
    if (qty < 1) {
        return interaction.reply({
            embeds: [createErrorEmbed('Некорректное количество', 'Количество должно быть не меньше 1.')],
            ephemeral: true
        });
    }
    
    const success = giveItem(playerId, itemId, qty, interaction.user.id);
    
    if (success) {
        const name = player.character_name || player.username;
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Предмет выдан', `Выдано **${qty}x ${item.name}** игроку **${name}**`)],
            fetchReply: true
        });
        autoDeleteMessage(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось выдать предмет.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
    }
}
