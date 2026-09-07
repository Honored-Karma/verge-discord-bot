import { getDB } from './db.js';
import { EmbedBuilder } from 'discord.js';
import { modernizeResponsePayload } from './modernResponses.js';

export function buildLogEmbed(entry) {
    const { command, userId, userTag, targetTag, channelId, extra, timestamp } = entry;
    const isTraining = command === 'train-ap' || command === 'train-sp' || command === 'social-rp' || Boolean(extra?.text);

    const embed = new EmbedBuilder().setTimestamp(timestamp || new Date());

    if (isTraining) {
        let title = `📋 Лог активности: /${command}`;
        let color = '#b209d4';
        if (command === 'train-ap') {
            title = '🏋️ Лог тренировки AP: /train-ap';
            color = '#38bdf8';
        } else if (command === 'train-sp') {
            title = '🥋 Лог тренировки стиля: /train-sp';
            color = '#f59e0b';
        } else if (command === 'social-rp') {
            title = '🎭 Лог социального RP: /social-rp';
            color = '#10b981';
        }

        embed.setTitle(title).setColor(color);

        const executor = userTag ? `<@${userId}> (${userTag})` : `<@${userId}>`;
        embed.addFields(
            { name: '👤 Игрок', value: executor, inline: true },
            { name: '⏰ Время', value: `<t:${Math.floor((timestamp || new Date()).getTime() / 1000)}:F>`, inline: true },
            { name: '💬 Канал', value: channelId ? `<#${channelId}>` : 'Не указан', inline: true }
        );

        if (extra?.character_name || extra?.slot) {
            const charVal = extra.character_name
                ? `**${extra.character_name}** (Слот ${extra.slot || 1})`
                : `Слот ${extra.slot || 1}`;
            embed.addFields({ name: '🎭 Персонаж', value: charVal, inline: true });
        }

        if (extra?.style) {
            embed.addFields({ name: '🥋 Стиль', value: `**${extra.style}**`, inline: true });
        }

        if (extra?.ap_gained !== undefined || extra?.sp_gained !== undefined) {
            const rewardParts = [];
            if (extra.ap_gained !== undefined) rewardParts.push(`+${extra.ap_gained} AP`);
            if (extra.sp_gained !== undefined) rewardParts.push(`+${extra.sp_gained} SP`);
            if (extra.multiplier) rewardParts.push(`(множитель: ${extra.multiplier}%)`);
            embed.addFields({ name: '✨ Награда', value: rewardParts.join(' '), inline: true });
        }

        // Full player text up to 4096 chars in embed description
        if (extra?.text) {
            const fullText = String(extra.text).trim();
            if (fullText.length <= 4000) {
                embed.setDescription(`### 📝 Текст отыгровки игрока:\n${fullText}`);
            } else {
                embed.setDescription(`### 📝 Текст отыгровки игрока:\n${fullText.slice(0, 3990)}...`);
            }
        }

        // Add any other extra fields
        const knownKeys = new Set(['text', 'slot', 'character_name', 'ap_gained', 'sp_gained', 'multiplier', 'style']);
        const otherExtra = Object.entries(extra || {}).filter(([k]) => !knownKeys.has(k));
        if (otherExtra.length > 0) {
            const extraStr = otherExtra.map(([k, v]) => `**${k}**: ${v}`).join('\n');
            embed.addFields({ name: 'ℹ️ Прочее', value: extraStr.slice(0, 1021), inline: false });
        }
    } else {
        embed
            .setColor('#b209d4')
            .setTitle(`📋 Лог команды: /${command}`)
            .addFields(
                { name: '👤 Исполнитель', value: userTag ? `<@${userId}> (${userTag})` : `<@${userId}>`, inline: true },
                { name: '⏰ Время', value: `<t:${Math.floor((timestamp || new Date()).getTime() / 1000)}:F>`, inline: true },
                { name: '💬 Канал', value: channelId ? `<#${channelId}>` : 'Не указан', inline: true }
            );

        if (targetTag) {
            embed.addFields({ name: '🎯 Цель', value: targetTag.length > 1024 ? targetTag.slice(0, 1021) + '...' : targetTag, inline: true });
        }

        if (extra) {
            const extraStr = Object.entries(extra)
                .map(([k, v]) => `**${k}**: ${v}`)
                .join('\n');
            if (extraStr) {
                const safeExtraStr = extraStr.length > 1024 ? extraStr.slice(0, 1021) + '...' : extraStr;
                embed.addFields({ name: '📝 Подробности', value: safeExtraStr, inline: false });
            }
        }
    }

    return embed;
}

export async function getDestinationLogChannels(db, guildId = null) {
    const channelIds = new Set();

    // 1. Environment variable LOGS_CHANNEL_ID if provided
    const envChannelId = process.env.LOGS_CHANNEL_ID ? String(process.env.LOGS_CHANNEL_ID).trim() : null;
    if (envChannelId && /^\d{5,25}$/.test(envChannelId)) {
        channelIds.add(envChannelId);
    }

    // 2. Enabled log channels from DB
    if (db) {
        try {
            const query = { enabled: true };
            if (guildId) {
                query.$or = [
                    { guild_id: guildId },
                    { guild_id: null },
                    { guild_id: { $exists: false } }
                ];
            }
            const logChannelDocs = await db.collection('log_channels').find(query).toArray();
            for (const doc of logChannelDocs) {
                if (doc.channel_id) {
                    const chId = String(doc.channel_id).trim();
                    if (/^\d{5,25}$/.test(chId)) {
                        channelIds.add(chId);
                    }
                }
            }
        } catch (dbErr) {
            console.error('Failed to query log_channels from DB:', dbErr);
        }
    }

    return Array.from(channelIds);
}

export async function logCommand({ client, guildId, channelId, userId, userTag, command, targetId = null, targetTag = null, extra = null }) {
    try {
        const db = getDB();
        if (!db) return false;

        const entry = {
            timestamp: new Date(),
            guild_id: guildId || null,
            channel_id: channelId || null,
            user_id: userId || null,
            user_tag: userTag || null,
            command: command || null,
            target_id: targetId || null,
            target_tag: targetTag || null,
            extra: extra || null
        };

        // Optionally save to DB (default: true). Set LOGS_SAVE_TO_DB=false to disable DB writes.
        const saveToDb = process.env.LOGS_SAVE_TO_DB ? (process.env.LOGS_SAVE_TO_DB.toLowerCase() !== 'false' && process.env.LOGS_SAVE_TO_DB !== '0') : true;
        if (saveToDb) {
            await db.collection('command_logs').insertOne(entry);
        }

        // Send log embed to enabled log channels
        if (client) {
            try {
                const destinationChannelIds = await getDestinationLogChannels(db, guildId);
                const embed = buildLogEmbed(entry);

                for (const chId of destinationChannelIds) {
                    try {
                        const logsChannel = await client.channels.fetch(chId);
                        if (logsChannel && logsChannel.isTextBased()) {
                            let sent = false;
                            try {
                                const modernPayload = modernizeResponsePayload({ embeds: [embed] });
                                await logsChannel.send(modernPayload);
                                sent = true;
                            } catch (modernErr) {
                                console.warn(`[logs] modernizeResponsePayload failed for channel ${chId}, falling back to standard embed:`, modernErr?.message || modernErr);
                            }
                            if (!sent) {
                                await logsChannel.send({ embeds: [embed] });
                            }
                        }
                    } catch (err) {
                        console.error(`Failed to send log to channel ${chId}:`, err);
                    }
                }
            } catch (err) {
                console.error('Failed to dispatch log to channels:', err);
            }
        }

        return true;
    } catch (err) {
        console.error('Failed to write command log:', err);
        return false;
    }
}
