import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, exchangeCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('exchange')
    .setDescription('Обменять валюту (1 ¥ = 9.4 ₩)')
    .addStringOption(option =>
        option.setName('currency')
            .setDescription('Какую валюту обменять')
            .setRequired(true)
            .addChoices(
                { name: 'KRW в Йены (₩ → ¥)', value: 'krw' },
                { name: 'Йены в KRW (¥ → ₩)', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество для обмена')
            .setRequired(true));

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

    const playerId = interaction.user.id;
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
    
    const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const result = await exchangeCurrency(playerId, currency, amount);
    
    if (!result.success) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка обмена', result.reason)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const description = currency === 'yen' 
        ? `💱 Вы обменяли **${amount.toLocaleString('ru-RU')} ¥** на **${result.received.toLocaleString('ru-RU')} ₩**\n\n**Курс:** 1 ¥ = 9.4 ₩`
        : `💱 Вы обменяли **${amount.toLocaleString('ru-RU')} ₩** на **${result.received.toLocaleString('ru-RU')} ¥**\n\n**Курс:** 1 ¥ = 9.4 ₩`;
    
    const embed = createSuccessEmbed('Обмен успешен!', description);
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
