import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addCurrency } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('deduct-currency')
    .setDescription('[ADMIN] Remove currency from player')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Player')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('currency')
            .setDescription('Currency type')
            .setRequired(true)
            .addChoices(
                { name: 'KRW', value: 'krw' },
                { name: 'YEN', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Amount to deduct')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Slot: 1 or 2')
            .setRequired(false)
            .addChoices(
                { name: 'Slot 1', value: 1 },
                { name: 'Slot 2', value: 2 }
            )
    );

export async function execute(interaction) {
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'deduct-currency')) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Access Denied', 'Admin only.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `Wait **${globalCooldown.remainingFormatted}** before next command!`,
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
            embeds: [createErrorEmbed('Empty slot', 'No character found.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    if (amount < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Invalid amount', 'Amount must be positive.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    const newAmount = await addCurrency(playerId, currency, -amount, interaction.user.id);
    if (newAmount !== false) {
        const currencySymbol = currency === 'krw' ? 'KRW' : 'YEN';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Currency removed',
                `Removed **${amount}** ${currencySymbol} from **${player.character_name || player.username}**.\n\nBalance: **${newAmount}** ${currencySymbol}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        try {
            await logCommand({
                client: interaction.client,
                guildId: interaction.guildId,
                commandName: 'deduct-currency',
                executor: interaction.user.tag,
                targetUser: targetUser.tag,
                details: `Removed ${amount} ${currency}`
            });
        } catch (error) {
            console.error('Failed to log command:', error);
        }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Error', 'Could not deduct currency.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
