import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getStyleByName, addSP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('add-sp')
    .setDescription('[АДМИН] Добавить SP игроку для стиля')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('style')
            .setDescription('Название боевого стиля')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество SP для добавления')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    const targetUser = interaction.options.getUser('user');
    const styleName = interaction.options.getString('style');
    const amount = interaction.options.getInteger('amount');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    const style = getStyleByName(styleName);
    
    if (!style) {
        return interaction.reply({
            embeds: [createErrorEmbed('Стиль не найден', `Стиль "${styleName}" не существует. Используйте \`/styles-list\` для просмотра доступных стилей.`)],
            ephemeral: true
        });
    }
    
    const newSP = addSP(playerId, style.id, amount, interaction.user.id);
    
    if (newSP !== false) {
        const rank = newSP >= 2500 ? 'Мастер' : newSP >= 1000 ? 'Эксперт' : newSP >= 350 ? 'Владелец' : 'Новичок';
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('SP обновлено', 
                `Добавлено **${amount} SP** к стилю **${styleName}** игроку **${player.character_name || player.username}**\n\nНовый баланс: **${newSP} SP** (${rank})`)],
            fetchReply: true
        });
        autoDeleteMessage(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить SP.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
    }
}
