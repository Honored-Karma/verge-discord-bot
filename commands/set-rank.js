import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../utils/dataManager.js';
import { isAdmin } from '../utils/adminCheck.js';
import { createErrorEmbed, createSuccessEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('set-rank')
    .setDescription('Установить ранг игроку (только для администраторов)')
    .addUserOption(option => 
        option.setName('user')
            .setDescription('Пользователь, которому нужно установить ранг')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('rank')
            .setDescription('Ранг для установки')
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
    if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [createErrorEmbed('Недостаточно прав', 'У вас нет прав на использование этой команды.')], ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const rank = interaction.options.getString('rank');
    let slot = interaction.options.getInteger('slot');
    const userId = targetUser.id;

    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const slotPlayerId = slot === 1 ? userId : `${userId}_${slot}`;

    const player = await getPlayer(slotPlayerId);

    if (!player) {
        return interaction.reply({ embeds: [createErrorEmbed('Игрок не найден', 'Указанный игрок не найден в этом слоте.')], ephemeral: true });
    }

    await updatePlayer(slotPlayerId, { rank: rank });

    interaction.reply({ embeds: [createSuccessEmbed('Ранг обновлен', `Ранг для ${targetUser.username} (Слот ${slot}) был успешно установлен на "${rank}".`)] });
}
