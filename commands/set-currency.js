import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('set-currency')
    .setDescription('[АДМИН] Установить валюту игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('currency')
            .setDescription('Валюта')
            .setRequired(true)
            .addChoices(
                { name: 'KRW (₩)', value: 'krw' },
                { name: 'Йены (¥)', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
    }
    
    const targetUser = interaction.options.getUser('user');
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    if (amount < 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Некорректная сумма', 'Сумма не может быть отрицательной.')],
            ephemeral: true
        });
    }
    
    const success = setCurrency(playerId, currency, amount, interaction.user.id);
    
    if (success) {
        const currencySymbol = currency === 'krw' ? '₩' : '¥';
        
        return interaction.reply({
            embeds: [createSuccessEmbed('Валюта установлена', 
                `Установлен баланс **${amount.toLocaleString('ru-RU')} ${currencySymbol}** для игрока **${player.character_name || player.username}**`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось установить валюту.')],
            ephemeral: true
        });
    }
}
