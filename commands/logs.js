import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Показать последние записи использования команд (только в канале логов)')
    .addIntegerOption(option => option.setName('limit').setDescription('Количество записей (по умолчанию: 10)').setRequired(false))
    .addStringOption(option => option.setName('command').setDescription('Фильтр по команде').setRequired(false))
    .addUserOption(option => option.setName('user').setDescription('Фильтр по пользователю').setRequired(false));

export async function execute(interaction) {
    const logsChannel = process.env.LOGS_CHANNEL_ID || null;

    // Only allow running in the designated logs channel
    if (logsChannel && interaction.channelId !== logsChannel) {
        const msg = await interaction.reply({ embeds: [createErrorEmbed('Недоступно в этом канале', `Эту команду можно запускать только в канале логов <#${logsChannel}>.`)], ephemeral: true, fetchReply: true });
        return;
    }

    // Permission: admin or allowed limited role
    const member = await resolveMember(interaction);
    if (!isAdmin(member) && !hasCommandPermission(member, 'add-ap')) {
        const msg = await interaction.reply({ embeds: [createErrorEmbed('Доступ запрещен', 'Недостаточно прав.')], ephemeral: true, fetchReply: true });
        return;
    }

    const limit = Math.min(interaction.options.getInteger('limit') || 10, 50);
    const commandFilter = interaction.options.getString('command');
    const userFilter = interaction.options.getUser('user');

    const db = getDB();
    if (!db) {
        return interaction.reply({ embeds: [createErrorEmbed('Ошибка', 'База данных недоступна.')], ephemeral: true });
    }

    const query = {};
    if (commandFilter) query.command = commandFilter;
    if (userFilter) query.user_id = userFilter.id;
    if (interaction.guildId) query.guild_id = interaction.guildId;

    const rows = await db.collection('command_logs').find(query).sort({ timestamp: -1 }).limit(limit).toArray();

    if (!rows || rows.length === 0) {
        return interaction.reply({ content: 'Нет записей.', ephemeral: true });
    }

    const lines = rows.map(r => {
        const time = new Date(r.timestamp).toLocaleString('ru-RU');
        const who = r.user_tag || `<@${r.user_id}>`;
        const cmd = r.command || 'unknown';
        const target = r.target_tag ? ` → ${r.target_tag}` : '';
        const ch = r.channel_id ? ` in <#${r.channel_id}>` : '';
        return `• [${time}] **${who}** ran **/${cmd}**${target}${ch}`;
    });

    // Discord message limit considerations: send as multiple replies if needed
    const chunkSize = 1900;
    let current = '';
    const outputs = [];
    for (const line of lines) {
        if ((current + line + '\n').length > chunkSize) {
            outputs.push(current);
            current = '';
        }
        current += line + '\n';
    }
    if (current.length) outputs.push(current);

    for (let i = 0; i < outputs.length; i++) {
        if (i === 0) {
            await interaction.reply({ content: outputs[i], ephemeral: true });
        } else {
            await interaction.followUp({ content: outputs[i], ephemeral: true });
        }
    }
}
