import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('add-currency')
    .setDescription('[АДМИН] Добавить валюту игроку')
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
            .setDescription('Количество для добавления')
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
    
    const newAmount = addCurrency(playerId, currency, amount, interaction.user.id);
    
    if (newAmount !== false) {
        const currencySymbol = currency === 'krw' ? '₩' : '¥';
        const currencyName = currency === 'krw' ? 'KRW' : 'Йен';
        
        return interaction.reply({
            embeds: [createSuccessEmbed('Валюта добавлена', 
                `Добавлено **${amount.toLocaleString('ru-RU')} ${currencySymbol}** игроку **${player.character_name || player.username}**.\n\n` +
                `Новый баланс: **${newAmount.toLocaleString('ru-RU')} ${currencySymbol}**`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить валюту.')],
            ephemeral: true
        });
    }
}
