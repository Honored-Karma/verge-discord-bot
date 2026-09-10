import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addCurrency, getActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('deduct-currency')
    .setDescription('[АДМИН] Списать валюту с игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('currency')
            .setDescription('Тип валюты')
            .setRequired(true)
            .addChoices(
                { name: 'KRW (₩)', value: 'krw' },
                { name: 'Йены (¥)', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Сумма списания')
            .setRequired(true)
            .setMinValue(1))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1, 2 или 3')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 },
                { name: 'Слот 3', value: 3 }
            )
    );

export async function execute(interaction) {
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'deduct-currency')) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещён', 'Только для администраторов.')],
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
        slot = await getActiveSlot(userId);
    }
    if (![1, 2, 3].includes(slot)) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;
    const currency = interaction.options.getString('currency');
    const amount = interaction.options.getInteger('amount');
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', 'Персонаж не найден.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    if (amount <= 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректная сумма', 'Сумма должна быть больше нуля.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    const newAmount = await addCurrency(playerId, currency, -amount, interaction.user.id);
    if (newAmount !== false) {
        const currencySymbol = currency === 'krw' ? 'KRW' : 'YEN';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Валюта списана',
                `Списано **${amount}** ${currencySymbol} с **${player.character_name || player.username}**.\n\nБаланс: **${newAmount}** ${currencySymbol}`, 'deductCurrency')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        try {
            await logCommand({
                client: interaction.client,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                command: 'deduct-currency',
                targetId: playerId,
                targetTag: player.character_name || player.username,
                extra: {
                    currency,
                    amount,
                    balance: newAmount
                }
            });
        } catch (error) {
            console.error('Failed to log command:', error);
        }
    } else {
        // Списание больше не уводит баланс в минус, поэтому самая частая причина
        // отказа — на балансе просто нет такой суммы. Показываем её админу.
        const currencySymbol = currency === 'krw' ? 'KRW' : 'YEN';
        const available = Number(player[currency] || 0);
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не удалось списать валюту',
                available < amount
                    ? `На балансе **${player.character_name || player.username}** только **${available}** ${currencySymbol}. Укажите сумму не больше этой.`
                    : 'Не удалось списать валюту. Попробуйте позже.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
