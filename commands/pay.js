import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, transferCurrency } from '../utils/dataManager.js';
import { createPayEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Перевести валюту другому игроку (налог 2%)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Получатель')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('currency')
            .setDescription('Валюта для перевода')
            .setRequired(true)
            .addChoices(
                { name: 'KRW (₩)', value: 'krw' },
                { name: 'Йены (¥)', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Сумма перевода')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот получателя: 1 или 2 (по умолчанию активный слот получателя)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 }
            ));

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const userId = interaction.user.id;
    const toUser = interaction.options.getUser('user');

    // Нельзя переводить самому себе (включая другие слоты)
    if (userId === toUser.id) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Нельзя переводить самому себе!')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const { getActiveSlot } = await import('../utils/dataManager.js');
    const fromSlot = await getActiveSlot(userId);
    const requestedToSlot = interaction.options.getInteger('slot');
    const toSlot = (requestedToSlot === 1 || requestedToSlot === 2) ? requestedToSlot : await getActiveSlot(toUser.id);
    const fromId = makePlayerKey(userId, fromSlot);
    const toId = makePlayerKey(toUser.id, toSlot);
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    
    if (amount <= 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Сумма должна быть больше 0!')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const fromPlayer = await getPlayer(fromId);
    const toPlayer = await getPlayer(toId);
    
    if (!fromPlayer) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (!toPlayer) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', `${toUser.username} не зарегистрирован!`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const result = await transferCurrency(fromId, toId, currency, amount);
    
    if (!result.success) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка перевода', result.reason)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const currencySymbol = currency === 'krw' ? '₩' : '¥';
    const currencyName = currency === 'krw' ? 'KRW' : 'Йен';
    
    const embed = createPayEmbed('Перевод выполнен!', 
        `💸 Вы перевели **${amount.toLocaleString('ru-RU')} ${currencySymbol}** игроку **${toPlayer.character_name || toPlayer.username}**\n\n` +
        `**Налог (2%):** ${result.tax.toLocaleString('ru-RU')} ${currencySymbol}\n` +
        `**Получатель получил:** ${result.received.toLocaleString('ru-RU')} ${currencySymbol}`
    );
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
