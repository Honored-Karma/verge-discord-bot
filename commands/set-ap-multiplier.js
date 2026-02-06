import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setAPMultiplier, getActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('set-ap-multiplier')
    .setDescription('[АДМИН] Установить множитель получения AP для игрока')
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
            .setDescription('Слот персонажа (1 или 2). Если не указан — используется активный слот игрока.')
            .setRequired(false)
            .addChoices(
                { name: '1', value: 1 },
                { name: '2', value: 2 }
            ));

export async function execute(interaction) {
const member = await resolveMember(interaction);
if (!hasCommandPermission(member, 'set-ap')) {
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
    const multiplier = interaction.options.getInteger('multiplier');
    const requestedSlot = interaction.options.getInteger('slot');
    let slot = requestedSlot && requestedSlot >= 1 ? requestedSlot : await getActiveSlot(targetUser.id);
    if (slot > 2) slot = 2;

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
    
    const result = await setAPMultiplier(playerId, multiplier, interaction.user.id);
    
    if (result !== false) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Множитель AP установлен', 
                `Установлен множитель **${result}%** для **${player.character_name || player.username}** (слот **${slot}**).\n\n` +
                `**Пример:** Тренировка дает 10 AP → теперь даст **${Math.round(10 * result / 100)} AP**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось установить множитель AP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
