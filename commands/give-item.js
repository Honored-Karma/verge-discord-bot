import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, giveItem } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('give-item')
    .setDescription('[АДМИН] Выдать предмет игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок-получатель')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('item_name')
            .setDescription('Название предмета (любое)')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('qty')
            .setDescription('Количество (по умолчанию: 1)')
            .setRequired(false))
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
    if (!hasCommandPermission(member, 'give-item')) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            fetchReply: true
        });
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
    const itemName = interaction.options.getString('item_name');
    const qty = interaction.options.getInteger('qty') || 1;
    const player = await getPlayer(playerId);
        if (!player) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }
    
    if (qty < 1) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное количество', 'Количество должно быть не меньше 1.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const success = await giveItem(playerId, itemName, qty, interaction.user.id);
    
    if (success) {
        const name = player.character_name || player.username;
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Предмет выдан', `Выдано **${qty}x ${itemName}** игроку **${name}**`)],
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
                command: 'give-item',
                targetId: playerId,
                targetTag: `${name} <@${playerId}>`,
                extra: { itemName, qty }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось выдать предмет.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
