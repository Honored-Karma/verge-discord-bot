import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setReputation, getReputationTier } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-reputation')
    .setDescription('[АДМИН/ГМ] Установить репутацию (Rtg) игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Новое значение Rtg (может быть отрицательным)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Причина изменения')
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
    if (!hasCommandPermission(member, 'set-reputation')) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещён', 'Эта команда доступна только администраторам и ГМам.')],
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
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || null;

    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', 'В этом слоте нет персонажа.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const newRep = await setReputation(playerId, amount, interaction.user.id, reason);
    if (newRep === false) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить репутацию.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const tier = getReputationTier(newRep);
    const name = player.character_name || player.username;
    const reasonLine = reason ? `\nПричина: *${reason}*` : '';

    const msg = await interaction.reply({
        embeds: [createSuccessEmbed('Репутация установлена',
            `Установлено **${newRep} Rtg** для **${name}**.${reasonLine}\n\n` +
            `Тир: ${tier.emoji} *${tier.name}*`)],
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
            command: 'set-reputation',
            targetId: playerId,
            targetTag: `${name} <@${playerId}>`,
            extra: { amount: newRep, reason }
        });
    } catch (e) { console.error('logCommand error', e); }
}
