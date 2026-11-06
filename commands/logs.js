import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { getDB } from '../utils/db.js';

export const data = new SlashCommandBuilder()
    .setName('logs')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false)
    .setDescription('Показать последние записи использования команд (только в канале логов)')
    .addIntegerOption(option => option.setName('limit').setDescription('Количество записей (по умолчанию: 10)').setRequired(false))
    .addStringOption(option => option.setName('command').setDescription('Фильтр по команде (начните вводить)').setAutocomplete(true).setRequired(false))
    .addUserOption(option => option.setName('user').setDescription('Фильтр по пользователю').setRequired(false));

const POPULAR_LOG_COMMANDS = [
    { name: '🏋️ Все тренировки (train-ap, train-sp, social-rp, train)', value: 'train' },
    { name: '🏋️ Тренировка AP (/train-ap)', value: 'train-ap' },
    { name: '🥋 Тренировка стиля SP (/train-sp)', value: 'train-sp' },
    { name: '🎭 Социальный RP (/social-rp)', value: 'social-rp' },
    { name: '🔒 Блокировки тренировок (/train-block)', value: 'train-block' },
    { name: '🚫 Запреты тренировок в каналах (/train-channel-block)', value: 'train-channel-block' },
    { name: '🎁 Лутбокс (/lootbox)', value: 'lootbox' },
    { name: '💳 Перевод валюты (/pay)', value: 'pay' },
    { name: '🛒 Магазин (/shop)', value: 'shop' },
    { name: '📦 Выдача предметов (/give-item)', value: 'give-item' },
    { name: '⚡ Начисление AP (/add-ap)', value: 'add-ap' },
    { name: '🥋 Начисление SP (/add-sp)', value: 'add-sp' },
    { name: '💰 Начисление валюты (/add-currency)', value: 'add-currency' },
    { name: '💸 Списание валюты (/deduct-currency)', value: 'deduct-currency' },
    { name: '⭐ Начисление репутации (/add-reputation)', value: 'add-reputation' },
    { name: '📜 Регистрация (/register)', value: 'register' }
];

export async function autocomplete(interaction) {
    try {
        const focusedValue = (interaction.options.getFocused() || '').toLowerCase().trim();
        const filtered = POPULAR_LOG_COMMANDS.filter(choice =>
            choice.name.toLowerCase().includes(focusedValue) ||
            choice.value.toLowerCase().includes(focusedValue)
        ).slice(0, 25);
        await interaction.respond(filtered);
    } catch {
        // Autocomplete error ignored
    }
}

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

    const andClauses = [];

    if (commandFilter) {
        const cmd = commandFilter.trim().toLowerCase();
        if (cmd === 'train' || cmd === 'training' || cmd === 'тренировка' || cmd === 'тренировки' || cmd === 'треня') {
            andClauses.push({ command: { $in: ['train', 'train-ap', 'train-sp', 'social-rp'] } });
        } else if (cmd === 'train-ap') {
            andClauses.push({ command: { $in: ['train-ap', 'train'] } });
        } else if (cmd === 'train-block') {
            andClauses.push({ command: { $in: ['train-block', 'train-block block', 'train-block unblock'] } });
        } else if (cmd === 'train-channel-block') {
            andClauses.push({ command: { $in: ['train-channel-block', 'train-channel-block block', 'train-channel-block unblock', 'train-channel-block unblock all'] } });
        } else {
            andClauses.push({ command: { $regex: new RegExp(`^${cmd}$`, 'i') } });
        }
    }

    if (userFilter) {
        andClauses.push({
            $or: [
                { user_id: userFilter.id },
                { user_id: new RegExp(`^${userFilter.id}(_|$)`) }
            ]
        });
    }

    if (interaction.guildId) {
        andClauses.push({
            $or: [
                { guild_id: interaction.guildId },
                { guild_id: null },
                { guild_id: { $exists: false } }
            ]
        });
    }

    const query = andClauses.length > 0 ? { $and: andClauses } : {};
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
            const slotNum = r.extra.slot || (r.user_id && /_slot(\d+)$/.test(String(r.user_id)) ? Number(String(r.user_id).match(/_slot(\d+)$/)[1]) : null);
            if (slotNum) parts.push(`Слот ${slotNum}`);
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
            const preview = snippet.length > 280 ? snippet.slice(0, 277) + '...' : snippet;
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
