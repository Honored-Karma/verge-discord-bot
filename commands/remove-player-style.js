import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getAllPlayerSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('remove-player-style')
    .setDescription('[АДМИН] Удалить стиль у конкретного игрока (не глобально)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style')
            .setDescription('Номер стиля у игрока (с 1) или имя стиля')
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
    if (!hasCommandPermission(member, 'give-style') && !isAdmin(member)) { // allow same limited roles as give-style
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
    const styleInput = interaction.options.getString('style');
    const userId = targetUser.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;

    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const playerStyles = await getAllPlayerSP(playerId);
    if (!playerStyles || playerStyles.length === 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Нет стилей у игрока', 'У игрока нет изученных стилей для удаления.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    let style = null;
    if (/^\d+$/.test(styleInput)) {
        const idx = parseInt(styleInput, 10) - 1; // 1-based
        if (idx >= 0 && idx < playerStyles.length) style = playerStyles[idx];
    } else {
        style = playerStyles.find(s => s.name.toLowerCase() === styleInput.toLowerCase());
    }

    if (!style) {
        const ownedList = playerStyles.map((s, i) => `${i + 1}) ${s.name} — ${s.sp} SP`).join('\n');
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден у игрока', `Указанный стиль не найден среди стилей игрока.\n\nЕго стили (номера с 1):\n${ownedList}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    try {
        const db = getDB();
        await db.collection('player_sp').deleteOne({ player_id: playerId, style_id: style.id });
    } catch (e) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось удалить стиль у игрока.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const msg = await interaction.reply({
        embeds: [createSuccessEmbed('Стиль удален у игрока', `У игрока ${player.character_name || player.username} удален стиль **${style.name}**.`)],
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
            command: 'remove-player-style',
            targetId: playerId,
            targetTag: `${player.character_name || player.username} <@${playerId}>`,
            extra: { style: style.name }
        });
    } catch (e) {}
}