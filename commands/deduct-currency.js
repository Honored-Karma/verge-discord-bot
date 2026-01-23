import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('deduct-currency')
    .setDescription('[АДМИН/ГМ] Минусовать валюту у игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('currency')
            .setDescription('Валюта')
            .setRequired(true)
            .addChoices(
                { name: 'KRW (?)', value: 'krw' },
                { name: 'Йены (?)', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество для вычета')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1 или 2 (по умолчанию активный)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 }
            )
    );

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам и ГМам.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `?? Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const targetUser = interaction.options.getUser('user');
    const userId = targetUser.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    
    // Validate amount is positive
    if (amount <= 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректная сумма', 'Сумма должна быть больше 0.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    // Validate currency
    if (currency !== 'krw' && currency !== 'yen') {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Неверная валюта. Используйте krw или yen.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    // Get current balance
    const currentBalance = Number(player[currency]) || 0;
    
    // Check if player has enough currency
    if (currentBalance < amount) {
        const currencySymbol = currency === 'krw' ? '?' : '?';
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Недостаточно валюты', 
                `У игрока **${player.character_name || player.username}** только **${currentBalance.toLocaleString('ru-RU')} ${currencySymbol}**, а вы хотите вычесть **${amount.toLocaleString('ru-RU')} ${currencySymbol}**.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    // Deduct currency
    const newBalance = currentBalance - amount;
    const success = await deductCurrency(playerId, currency, amount, interaction.user.id);
    
    if (success) {
        const currencySymbol = currency === 'krw' ? '?' : '?';
        
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Валюта вычтена', 
                `Вычтено **${amount.toLocaleString('ru-RU')} ${currencySymbol}** у игрока **${player.character_name || player.username}**\n` +
                `Новый баланс: **${newBalance.toLocaleString('ru-RU')} ${currencySymbol}**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось вычесть валюту.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}

// Helper function to deduct currency
async function deductCurrency(playerId, currency, amount, adminId) {
    try {
        const db = getDB();
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        const updateObj = {};
        updateObj[currency] = Math.max(0, (Number(player[currency]) || 0) - Number(amount));
        
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: updateObj }
        );
        
        // Log the action
        const timestamp = Math.floor(Date.now() / 1000);
        try {
            db.collection('admin_actions').insertOne({
                admin_id: adminId,
                action: 'DEDUCT_CURRENCY',
                details: `Вычел ${amount} ${currency.toUpperCase()} у игрока ${playerId}`,
                timestamp
            }).catch(err => console.error('Error logging to DB:', err));
        } catch (error) {
            console.error('Error logging admin action:', error);
        }
        
        return true;
    } catch (error) {
        console.error('Error deducting currency:', error);
        return false;
    }
}
