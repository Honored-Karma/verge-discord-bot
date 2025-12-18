import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

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
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'add-currency')) {
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
    const newAmount = await addCurrency(playerId, currency, amount, interaction.user.id);
    if (newAmount !== false) {
        const currencySymbol = currency === 'krw' ? '₩' : '¥';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Валюта добавлена',
                `Добавлено **${amount.toLocaleString('ru-RU')} ${currencySymbol}** игроку **${player.character_name || player.username}**.\n\n` +
                `Новый баланс: **${newAmount.toLocaleString('ru-RU')} ${currencySymbol}**`)],
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
                command: 'add-currency',
                targetId: playerId,
                targetTag: `${player.character_name || player.username} <@${playerId}>`,
                extra: { currency, amount }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить валюту.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
