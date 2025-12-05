import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('log-disable')
    .setDescription('[АДМИН] Отключить логирование команд в этом канале');

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Только администраторы могут управлять логированием.')],
            ephemeral: true
        });
    }

    const db = getDB();
    if (!db) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'База данных недоступна.')],
            ephemeral: true
        });
    }

    try {
        const channelId = interaction.channelId;
        const result = await db.collection('log_channels').deleteOne({ channel_id: channelId });

        if (result.deletedCount === 0) {
            return interaction.reply({
                embeds: [createErrorEmbed('Не включено', 'Логирование в этом канале не было включено.')],
                ephemeral: true
            });
        }

        await interaction.reply({
            embeds: [createSuccessEmbed(
                '✅ Логирование отключено',
                `Логи команд больше не будут отправляться в <#${channelId}>.`
            )],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error disabling logs:', error);
        await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось отключить логирование.')],
            ephemeral: true
        });
    }
}
