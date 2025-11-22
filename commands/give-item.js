import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getItem, giveItem } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('give-item')
    .setDescription('[АДМИН] Выдать предмет игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок-получатель')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('item_id')
            .setDescription('ID предмета (напр., ap_tome_50)')
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
    
    const targetUser = interaction.options.getUser('user');
    const itemId = interaction.options.getString('item_id');
    const qty = interaction.options.getInteger('qty') || 1;
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    const item = getItem(itemId);
    
    if (!item) {
        return interaction.reply({
            embeds: [createErrorEmbed('Предмет не найден', `Предмет с ID "${itemId}" не существует в базе данных.`)],
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
        return interaction.reply({
            embeds: [createSuccessEmbed('Предмет выдан', `Выдано **${qty}x ${item.name}** игроку **${name}**`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось выдать предмет.')],
            ephemeral: true
        });
    }
}
