import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getPlayer, setSPMultiplier, getActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('set-sp-multiplier')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .setDescription('[АДМИН] Установить множитель получения SP для игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('multiplier')
            .setDescription('Множитель в процентах (50 = 50%, 150 = 150%, 200 = 200%)')
            .setRequired(true)
            .setMinValue(50)
            .setMaxValue(500))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот персонажа (1, 2 или 3). Если не указан — используется активный слот игрока.')
            .setRequired(false)
            .addChoices(
                { name: '1', value: 1 },
                { name: '2', value: 2 },
                { name: '3', value: 3 }
            ))
    .addStringOption(option =>
        option.setName('duration')
            .setDescription('Длительность множителя. Если не указана — бессрочно.')
            .setRequired(false)
            .addChoices(
                { name: '1 час', value: '3600' },
                { name: '6 часов', value: '21600' },
                { name: '12 часов', value: '43200' },
                { name: '1 день', value: '86400' },
                { name: '3 дня', value: '259200' },
                { name: '7 дней', value: '604800' },
                { name: '14 дней', value: '1209600' },
                { name: '30 дней', value: '2592000' }
            ));

export async function execute(interaction) {
const member = await resolveMember(interaction);
if (!hasCommandPermission(member, 'set-sp-multiplier')) {
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
    const multiplier = interaction.options.getInteger('multiplier');
    const requestedSlot = interaction.options.getInteger('slot');
    let slot = requestedSlot && requestedSlot >= 1 ? requestedSlot : await getActiveSlot(targetUser.id);
    if (![1, 2, 3].includes(slot)) slot = 1;

    const playerId = makePlayerKey(targetUser.id, slot);
    const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `В слоте ${slot} у игрока нет персонажа.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const durationStr = interaction.options.getString('duration');
    const durationSeconds = durationStr ? parseInt(durationStr, 10) : 0;
    const result = await setSPMultiplier(playerId, multiplier, interaction.user.id, durationSeconds);
    
    if (result !== false) {
        const expiresText = result.expiresAt > 0
            ? `Истекает <t:${result.expiresAt}:R>`
            : 'Бессрочно';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Множитель SP установлен', 
                `Установлен множитель **${result.multiplier}%** для **${player.character_name || player.username}** (слот **${slot}**).\n` +
                `${expiresText}\n\n` +
                `**Пример:** Добавление 100 SP → теперь добавит **${Math.round(100 * result.multiplier / 100)} SP**`, 'setSpMultiplier')],
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
                command: 'set-sp-multiplier',
                targetId: playerId,
                targetTag: `${player.character_name || player.username} <@${playerId}>`,
                extra: { multiplier: result.multiplier, durationSeconds }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось установить множитель SP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
