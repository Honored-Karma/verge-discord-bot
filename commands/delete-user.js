import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getPlayer, deletePlayer, getActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { describeOrgSync, syncOrgRoles } from '../utils/orgRoles.js';

export const data = new SlashCommandBuilder()
    .setName('delete-user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .setDescription('[АДМИН] Удалить профиль игрока (для переучета)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для удаления')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1, 2 или 3 (по умолчанию активный)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 },
                { name: 'Слот 3', value: 3 }
            )
    );

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
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
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        slot = await getActiveSlot(targetUser.id);
    }
    if (![1, 2, 3].includes(slot)) slot = 1;
    const playerId = slot === 1 ? targetUser.id : `${targetUser.id}_${slot}`;
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не найден', `В слоте ${slot} у игрока **${targetUser.username}** нет персонажа.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    const success = await deletePlayer(playerId, interaction.user.id);
    if (success) {
        // Персонажа больше нет — роль его организации висеть не должна.
        const sync = await syncOrgRoles({
            guild: interaction.guild,
            userId: targetUser.id,
            actorId: interaction.user.id,
        });
        const note = describeOrgSync(sync);
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Профиль удален',
                `Профиль **${player.character_name}** из слота **${slot}** успешно удален.\nИгрок может переучесться командой \`/register\`.${note ? `\n\n${note}` : ''}`, 'deleteUser')],
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
                command: 'delete-user',
                targetId: playerId,
                targetTag: `${player.character_name || player.username} <@${playerId}>`,
                extra: { slot }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось удалить профиль.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
