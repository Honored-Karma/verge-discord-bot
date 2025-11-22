import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, deletePlayer } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('delete-user')
    .setDescription('[АДМИН] Удалить профиль игрока (для переучета)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для удаления')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
            ephemeral: true
        });
    }
    
    const targetUser = interaction.options.getUser('user');
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не найден', `Игрок **${targetUser.username}** не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    const success = deletePlayer(playerId, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('Профиль удален', 
                `Профиль **${player.character_name}** успешно удален.\nИгрок может переучеться командой \`/register\`.`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось удалить профиль.')],
            ephemeral: true
        });
    }
}
