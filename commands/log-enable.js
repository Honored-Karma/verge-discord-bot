import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('log-enable')
    .setDescription('[АДМИН] Включить логирование команд в этом канале');

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
        await db.collection('log_channels').updateOne(
            { channel_id: channelId },
            {
                $set: {
                    channel_id: channelId,
                    guild_id: interaction.guildId,
                    enabled: true,
                    enabled_at: new Date(),
                    enabled_by: interaction.user.id
                }
            },
            { upsert: true }
        );

        await interaction.reply({
            embeds: [createSuccessEmbed(
                '✅ Логирование включено',
                `Логи команд будут отправляться в <#${channelId}>.`
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
