import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, addSP, listStyles, getAllPlayerSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('add-sp')
    .setDescription('[АДМИН] Добавить SP игроку для стиля')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style')
            .setDescription('Номер стиля (1, 2, 3...) или название стиля')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество SP для добавления')
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
    if (!hasCommandPermission(member, 'add-sp')) {
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
    const amount = interaction.options.getInteger('amount');
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
    
    // Resolve by player's OWN styles for numeric input; enforce ownership for name input
    const playerStyles = await getAllPlayerSP(playerId); // sorted by SP desc (matches profile)

    // Fallback info if user has no styles
    if (!playerStyles || playerStyles.length === 0) {
        const allStyles = await listStyles();
        const allList = allStyles.map((s, i) => `${i + 1}) ${s.name}`).join('\n');
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Нет стилей у игрока', `У игрока нет изученных стилей. Сначала выдайте стиль командой \`/give-style\`.\n\nВсе стили:\n${allList}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    let style = null;

    if (/^\d+$/.test(styleInput)) {
        const idx = parseInt(styleInput, 10) - 1; // 1-based -> 0-based
        if (idx >= 0 && idx < playerStyles.length) {
            style = playerStyles[idx];
        }
    } else {
        // By name: ensure the player owns it
        const byName = playerStyles.find(s => s.name.toLowerCase() === styleInput.toLowerCase());
        if (byName) style = byName;
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

    const newSP = await addSP(playerId, style.id, amount, interaction.user.id);
    
    if (newSP !== false) {
        const rank = newSP >= 2500 ? 'Мастер' : newSP >= 1000 ? 'Эксперт' : newSP >= 350 ? 'Владелец' : 'Новичок';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('SP обновлено', 
                `Добавлено **${amount} SP** к стилю **${style.name}** игроку **${player.character_name || player.username}**\n\nНовый баланс: **${newSP} SP** (${rank})`, 'addSp')],
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
                command: 'add-sp',
                targetId: playerId,
                targetTag: `${player.character_name || player.username} <@${playerId}>`,
                extra: { amount, style: style.name }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить SP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
