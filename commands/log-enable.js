import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('log-enable')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false)
    .setDescription('[АДМИН] Включить логирование команд в этом канале')
    .addStringOption(option =>
        option.setName('type')
            .setDescription('Тип логов для этого канала')
            .setRequired(false)
            .addChoices(
                { name: 'Все логи (тренировки и команды)', value: 'all' },
                { name: 'Только тренировки (train-ap, train-sp, social-rp)', value: 'training' },
                { name: 'Только административные команды', value: 'commands' }
            )
    );

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Только администраторы могут управлять логированием.')],
            flags: 64
        });
    }

    const db = getDB();
    if (!db) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'База данных недоступна.')],
            flags: 64
        });
    }

    try {
        const channelId = interaction.channelId;
        const type = interaction.options.getString('type') || 'all';

        await db.collection('log_channels').updateOne(
            { channel_id: channelId },
            {
                $set: {
                    channel_id: channelId,
                    guild_id: interaction.guildId,
                    type,
                    enabled: true,
                    enabled_at: new Date(),
                    enabled_by: interaction.user.id
                }
            },
            { upsert: true }
        );

        let typeDescription = 'Все логи команд и тренировок';
        if (type === 'training') {
            typeDescription = 'Только логи тренировок (/train-ap, /train-sp, /social-rp)';
        } else if (type === 'commands') {
            typeDescription = 'Только административные команды';
        }

        await interaction.reply({
            embeds: [createSuccessEmbed(
                '✅ Логирование включено',
                `${typeDescription} будут отправляться в <#${channelId}>.`,
                'logEnable'
            )],
            flags: 64
        });
    } catch (error) {
        console.error('Error enabling logs:', error);
        await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось включить логирование.')],
            flags: 64
        });
    }
}

