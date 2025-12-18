import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

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
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (amount < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректная сумма', 'Сумма не может быть отрицательной.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const success = await setCurrency(playerId, currency, amount, interaction.user.id);
    
    if (success) {
        const currencySymbol = currency === 'krw' ? '₩' : '¥';
        
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Валюта установлена', 
                `Установлен баланс **${amount.toLocaleString('ru-RU')} ${currencySymbol}** для игрока **${player.character_name || player.username}**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось установить валюту.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
