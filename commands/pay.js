import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, transferCurrency } from '../utils/dataManager.js';
import { createPayEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

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
            .setRequired(true));

export async function execute(interaction) {
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

    const fromId = interaction.user.id;
    const toUser = interaction.options.getUser('user');
    const toId = toUser.id;
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    
    if (fromId === toId) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Нельзя переводить себе!')],
            ephemeral: true
        });
    }
    
    if (amount <= 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Сумма должна быть больше 0!')],
            ephemeral: true
        });
    }
    
    const fromPlayer = getPlayer(fromId);
    const toPlayer = getPlayer(toId);
    
    if (!fromPlayer) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
            ephemeral: true
        });
    }
    
    if (!toPlayer) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', `${toUser.username} не зарегистрирован!`)],
            ephemeral: true
        });
    }
    
    const result = transferCurrency(fromId, toId, currency, amount);
    
    if (!result.success) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка перевода', result.reason)],
            ephemeral: true
        });
    }
    
    const currencySymbol = currency === 'krw' ? '₩' : '¥';
    const currencyName = currency === 'krw' ? 'KRW' : 'Йен';
    
    const embed = createPayEmbed('Перевод выполнен!', 
        `💸 Вы перевели **${amount.toLocaleString('ru-RU')} ${currencySymbol}** игроку **${toPlayer.character_name || toPlayer.username}**\n\n` +
        `**Налог (2%):** ${result.tax.toLocaleString('ru-RU')} ${currencySymbol}\n` +
        `**Получатель получил:** ${result.received.toLocaleString('ru-RU')} ${currencySymbol}`
    );
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessage(msg);
}
