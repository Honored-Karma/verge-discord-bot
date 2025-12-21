import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, setSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { logCommand } from '../utils/logs.js';
import { makePlayerKey } from '../utils/playerKey.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('give-style')
    .setDescription('[АДМИН] Выдать боевой стиль игроку')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок-получатель')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style_name')
            .setDescription('Название стиля')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('initial_sp')
            .setDescription('Начальное SP (по умолчанию: 0)')
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
    if (!hasCommandPermission(member, 'give-style')) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторами.')],
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
        const playerId = makePlayerKey(userId, slot);
        const styleName = interaction.options.getString('style_name');
        let initialSP = interaction.options.getInteger('initial_sp');
        if (initialSP === null) initialSP = 1;
        const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const style = await getStyleByName(styleName);
    
    if (!style) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', `Стиль **"${styleName}"** не существует. Создайте его командой \`/add-style\`.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (initialSP < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное значение', 'SP не может быть отрицательным.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const success = await setSP(playerId, style.id, initialSP, interaction.user.id);
    
    if (success) {
        const name = player.character_name || player.username;
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Стиль выдан', 
                `Выдан стиль **${styleName}** игроку **${name}** с **${initialSP} SP**`)],
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
                command: 'give-style',
                targetId: playerId,
                targetTag: `${name} <@${playerId}>`,
                extra: { style: styleName, initialSP }
            });
        } catch (e) { console.error('logCommand error', e); }
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось выдать стиль.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
