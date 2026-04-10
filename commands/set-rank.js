import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../utils/dataManager.js';
import { isAdmin } from '../utils/adminCheck.js';
import { createErrorEmbed, createSuccessEmbed } from '../utils/embeds.js';
import { isValidRankForOrganization, normalizeOrganization, normalizeRank } from '../utils/rankSystem.js';

export const data = new SlashCommandBuilder()
    .setName('set-rank')
    .setDescription('Установить ранг игроку (только для администраторов)')
    .addUserOption(option => 
        option.setName('user')
            .setDescription('Пользователь, которому нужно установить ранг')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('organization')
            .setDescription('Организация ранговой сетки')
            .setRequired(true)
            .addChoices(
                { name: 'TENRYU (F-S)', value: 'TENRYU' },
                { name: 'HERO_CORPS (VI-I)', value: 'HERO_CORPS' }
            ))
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
    const organization = normalizeOrganization(interaction.options.getString('organization'));
    const rank = normalizeRank(interaction.options.getString('rank'));
    let slot = interaction.options.getInteger('slot');
    const userId = targetUser.id;

    if (!organization) {
        return interaction.reply({ embeds: [createErrorEmbed('Ошибка', 'Неизвестная организация.')], ephemeral: true });
    }
    if (!isValidRankForOrganization(organization, rank)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка ранга', `Ранг "${rank}" не подходит для организации "${organization}".`)],
            ephemeral: true
        });
    }

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

    await updatePlayer(slotPlayerId, { rank, organization });

    interaction.reply({
        embeds: [createSuccessEmbed('Ранг обновлен', `Для ${targetUser.username} (Слот ${slot}) установлен ранг **${rank}** в организации **${organization}**.`)]
    });
}
