import { SlashCommandBuilder } from 'discord.js';
import { setSalaryMultiplier } from '../utils/dataManager.js';
import { isAdmin } from '../utils/adminCheck.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isValidRankForOrganization, normalizeOrganization, normalizeRank, RANK_SETS } from '../utils/rankSystem.js';

export const data = new SlashCommandBuilder()
    .setName('set-salary-multiplier')
    .setDescription('[АДМИН] Установить множитель зарплаты для ранга организации')
    .addStringOption(option =>
        option.setName('organization')
            .setDescription('Организация')
            .setRequired(true)
            .addChoices(
                { name: 'ТЕНРЮ (F-S)', value: 'TENRYU' },
                { name: 'Стражи (VI-I)', value: 'GUARDIANS' }
            ))
    .addStringOption(option =>
        option.setName('rank')
            .setDescription('Ранг')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('multiplier')
            .setDescription('Множитель в процентах (100 = без изменений, 150 = +50%, 200 = x2)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000));

export async function execute(interaction) {
    if (!await isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Недостаточно прав', 'У вас нет прав на использование этой команды.')],
            ephemeral: true
        });
    }

    const org = normalizeOrganization(interaction.options.getString('organization'));
    const rank = normalizeRank(interaction.options.getString('rank'));
    const multiplier = interaction.options.getInteger('multiplier');

    if (!org) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Неизвестная организация.')],
            ephemeral: true
        });
    }

    if (!isValidRankForOrganization(org, rank)) {
        const validRanks = RANK_SETS[org].join(', ');
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка ранга', `Ранг "${rank}" не подходит для организации "${org}".\nДопустимые ранги: ${validRanks}`)],
            ephemeral: true
        });
    }

    const result = await setSalaryMultiplier(org, rank, multiplier, interaction.user.id);

    if (result) {
        const description = multiplier === 100
            ? `Множитель зарплаты для **${org}** ранг **${rank}** сброшен на стандартный (100%).`
            : `Установлен множитель зарплаты **${multiplier}%** для **${org}** ранг **${rank}**.\n\n` +
              `**Пример:** базовая зарплата 100,000 → теперь **${Math.floor(100000 * multiplier / 100).toLocaleString('ru-RU')}**`;

        return interaction.reply({
            embeds: [createSuccessEmbed('Множитель зарплаты обновлён', description, 'setRank')]
        });
    }

    return interaction.reply({
        embeds: [createErrorEmbed('Ошибка', 'Не удалось установить множитель зарплаты.')],
        ephemeral: true
    });
}
