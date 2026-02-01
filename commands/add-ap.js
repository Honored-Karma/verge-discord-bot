import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addAP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('add-ap')
    .setDescription('[АДМИН] Добавить AP игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество AP (может быть отрицательным)')
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
    if (!hasCommandPermission(member, 'add-ap')) {
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
    const slot = interaction.options.getInteger('slot');
    let usedSlot = slot;
    if (!usedSlot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        usedSlot = await getActiveSlot(userId);
    }
    if (usedSlot !== 1 && usedSlot !== 2) usedSlot = 1;
    const playerId = usedSlot === 1 ? userId : `${userId}_${usedSlot}`;
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
    const newAP = await addAP(playerId, amount, 'admin');
    
    if (newAP !== false) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('AP обновлено', 
                `Добавлено **${amount} AP** игроку **${player.character_name || player.username}**.\n\nНовый баланс: **${newAP} AP**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        // Log admin action
        try {
            await logCommand({
                client: interaction.client,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                command: 'add-ap',
                targetId: playerId,
                targetTag: `${player.character_name || player.username} <@${playerId}>`,
                extra: { amount }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить AP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
