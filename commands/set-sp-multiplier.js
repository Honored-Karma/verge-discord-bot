import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setSPMultiplier } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-sp-multiplier')
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
            .setMaxValue(500));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
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
    const playerId = targetUser.id;
    
    const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const result = await setSPMultiplier(playerId, multiplier, interaction.user.id);
    
    if (result !== false) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Множитель SP установлен', 
                `Установлен множитель **${result}%** для **${player.character_name || player.username}**.\n\n` +
                `**Пример:** Добавление 100 SP → теперь добавит **${Math.round(100 * result / 100)} SP**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось установить множитель SP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
