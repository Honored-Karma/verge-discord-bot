import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, exchangeCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed } from '../utils/embeds.js';
import { embedV2, errorV2, cooldownV2 } from '../utils/containers.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

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
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            ...cooldownV2('Обмен', retryAt),
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const userId = interaction.user.id;
    const { getActiveSlot } = await import('../utils/dataManager.js');
    const activeSlot = await getActiveSlot(userId);
    const playerId = makePlayerKey(userId, activeSlot);
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    
    if (amount <= 0) {
        const msg = await interaction.reply({
            ...errorV2('Ошибка', 'Сумма должна быть больше 0!'),
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            ...errorV2('Пустой слот', 'В этом слоте нет персонажа. Используйте /register, чтобы создать персонажа в этом слоте.'),
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const result = await exchangeCurrency(playerId, currency, amount);
    
    if (!result.success) {
        const msg = await interaction.reply({
            ...errorV2('Ошибка обмена', result.reason),
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const description = currency === 'yen' 
        ? `💱 Вы обменяли **${amount.toLocaleString('ru-RU')} ¥** на **${result.received.toLocaleString('ru-RU')} ₩**\n\n**Курс:** 1 ¥ = 9.4 ₩`
        : `💱 Вы обменяли **${amount.toLocaleString('ru-RU')} ₩** на **${result.received.toLocaleString('ru-RU')} ¥**\n\n**Курс:** 1 ¥ = 9.4 ₩`;
    
    const embed = createSuccessEmbed('Обмен успешен!', description, 'exchange');
    
    const msg = await interaction.reply({ ...embedV2(embed, { omitImage: true }), fetchReply: true });
    autoDeleteMessageShort(msg);
}
