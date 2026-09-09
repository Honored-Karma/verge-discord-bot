import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer, getActiveSlot } from '../utils/dataManager.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { createErrorEmbed, createSuccessEmbed } from '../utils/embeds.js';
import { isValidRankForOrganization, normalizeOrganization, normalizeRank } from '../utils/rankSystem.js';
import { describeOrgSync, syncOrgRoles } from '../utils/orgRoles.js';

export const data = new SlashCommandBuilder()
    .setName('set-rank')
    .setDescription('[АДМИН/АНКЕТОЛОГ] Установить ранг игроку')
    .addUserOption(option => 
        option.setName('user')
            .setDescription('Пользователь, которому нужно установить ранг')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('organization')
            .setDescription('Организация ранговой сетки')
            .setRequired(true)
            .addChoices(
                { name: 'ТЕНРЮ (F-S)', value: 'TENRYU' },
                { name: 'Стражи (VI-I)', value: 'GUARDIANS' }
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
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'set-rank')) {
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
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const slotPlayerId = slot === 1 ? userId : `${userId}_${slot}`;

    const player = await getPlayer(slotPlayerId);

    if (!player) {
        return interaction.reply({ embeds: [createErrorEmbed('Игрок не найден', 'Указанный игрок не найден в этом слоте.')], ephemeral: true });
    }

    await updatePlayer(slotPlayerId, { rank, organization });

    // Синхронизация идемпотентна и сама смотрит на активный слот: если админ
    // выдал организацию неактивному персонажу, роли останутся как были.
    const sync = await syncOrgRoles({
        guild: interaction.guild,
        userId,
        actorId: interaction.user.id,
    });
    const note = describeOrgSync(sync);

    await interaction.reply({
        embeds: [createSuccessEmbed(
            'Ранг обновлен',
            `Для ${targetUser.username} (Слот ${slot}) установлен ранг **${rank}** в организации **${organization}**.${note ? `\n\n${note}` : ''}`,
            'setRank',
        )]
    });
}
