import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, deletePlayer } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('delete-user')
    .setDescription('[АДМИН] Удалить профиль игрока (для переучета)')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для удаления')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот для удаления (1 или 2, по умолчанию 1)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 }
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
    if (slot !== 1 && slot !== 2) slot = 1;
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
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Профиль удален', 
                `Профиль **${player.character_name}** из слота **${slot}** успешно удален.\nИгрок может переучесться командой \`/register\`.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось удалить профиль.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
