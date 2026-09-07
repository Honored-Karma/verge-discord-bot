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
    const db = getDB();

    // Permission: admin or allowed limited role
    const member = await resolveMember(interaction);
    if (!isAdmin(member) && !hasCommandPermission(member, 'logs')) {
        await interaction.reply({ embeds: [createErrorEmbed('Доступ запрещен', 'Недостаточно прав.')], flags: 64 });
        return;
    }

    // Only allow running in designated logs channel or any channel enabled via /log-enable
    let isAllowedChannel = false;
    if (!logsChannel && !db) {
        isAllowedChannel = true;
    } else {
        if (logsChannel && interaction.channelId === logsChannel) {
            isAllowedChannel = true;
        }
        if (!isAllowedChannel && db) {
            const registered = await db.collection('log_channels').findOne({ channel_id: interaction.channelId, enabled: true });
            if (registered) isAllowedChannel = true;
        }
        if (!isAllowedChannel && !logsChannel && db) {
            const anyChannel = await db.collection('log_channels').findOne({ enabled: true });
            if (!anyChannel) isAllowedChannel = true;
        }
    }

    if (!isAllowedChannel) {
        const targetRef = logsChannel ? `<#${logsChannel}>` : 'канале логов';
        return interaction.reply({
            embeds: [createErrorEmbed('Недоступно в этом канале', `Эту команду можно запускать только в канале логов (${targetRef}).`)],
            flags: 64
        });
    }

    await interaction.deferReply({ flags: 64 });

    const limit = Math.min(interaction.options.getInteger('limit') || 10, 50);
    const commandFilter = interaction.options.getString('command');
    const userFilter = interaction.options.getUser('user');

    if (!db) {
        return interaction.editReply({ embeds: [createErrorEmbed('Ошибка', 'База данных недоступна.')] });
    }

    const query = {};
    if (commandFilter) query.command = commandFilter;
    if (userFilter) {
        query.$or = [
            { user_id: userFilter.id },
            { user_id: new RegExp(`^${userFilter.id}(_|$)`) }
        ];
    }
    if (interaction.guildId) query.guild_id = interaction.guildId;

    const rows = await db.collection('command_logs').find(query).sort({ timestamp: -1 }).limit(limit).toArray();

    if (!rows || rows.length === 0) {
        return interaction.editReply({ content: 'Нет записей.' });
    }

    const lines = rows.map(r => {
        const time = new Date(r.timestamp).toLocaleString('ru-RU');
        const cleanUserId = r.user_id ? String(r.user_id).replace(/_slot\d+$/, '') : null;
        const who = r.user_tag
            ? `**${r.user_tag}** (<@${cleanUserId}>)`
            : (cleanUserId ? `<@${cleanUserId}>` : 'неизвестно');
        const cmd = r.command || 'неизвестно';
        const target = r.target_tag ? ` → ${r.target_tag}` : '';
        const ch = r.channel_id ? ` в <#${r.channel_id}>` : '';

        let extraInfo = '';
        if (r.extra) {
            const parts = [];
            if (r.extra.slot) parts.push(`Слот ${r.extra.slot}`);
            if (r.extra.character_name) parts.push(`персонаж: **${r.extra.character_name}**`);
            if (r.extra.style) parts.push(`стиль: **${r.extra.style}**`);
            if (r.extra.ap_gained !== undefined) parts.push(`+${r.extra.ap_gained} AP`);
            if (r.extra.sp_gained !== undefined) parts.push(`+${r.extra.sp_gained} SP`);
            if (r.extra.multiplier) parts.push(`${r.extra.multiplier}%`);
            if (parts.length) extraInfo = ` • ${parts.join(', ')}`;
        }

        let line = `• [${time}] ${who} — **/${cmd}**${target}${ch}${extraInfo}`;
        if (r.extra?.text) {
            const snippet = String(r.extra.text).trim().replace(/\s+/g, ' ');
            const preview = snippet.length > 120 ? snippet.slice(0, 117) + '...' : snippet;
            line += `\n  > 💬 *«${preview}»*`;
        }
        return line;
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
            await interaction.editReply({ content: outputs[i] });
        } else {
            await interaction.followUp({ content: outputs[i], flags: 64 });
        }
    }
}
