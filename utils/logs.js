import { getDB } from './db.js';
import { EmbedBuilder } from 'discord.js';

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

        await db.collection('command_logs').insertOne(entry);

        // Send log embed to enabled log channels
        if (client) {
            try {
                const logChannels = await db.collection('log_channels').find({ guild_id: guildId, enabled: true }).toArray();
                
                for (const logChannelDoc of logChannels) {
                    try {
                        const logsChannel = await client.channels.fetch(logChannelDoc.channel_id);
                        if (logsChannel && logsChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#FFA500')
                                .setTitle(`📋 Command Log: /${command}`)
                                .addFields(
                                    { name: '👤 Executor', value: userTag || `<@${userId}>`, inline: true },
                                    { name: '⏰ Time', value: `<t:${Math.floor(entry.timestamp.getTime() / 1000)}:F>`, inline: true },
                                    { name: '💬 Channel', value: channelId ? `<#${channelId}>` : 'N/A', inline: true }
                                );
                            
                            if (targetTag) {
                                embed.addFields({ name: '🎯 Target', value: targetTag, inline: true });
                            }
                            
                            if (extra) {
                                const extraStr = Object.entries(extra)
                                    .map(([k, v]) => `**${k}**: ${v}`)
                                    .join('\n');
                                if (extraStr) embed.addFields({ name: '📝 Details', value: extraStr, inline: false });
                            }
                            
                            embed.setTimestamp();
                            await logsChannel.send({ embeds: [embed] });
                        }
                    } catch (err) {
                        console.error(`Failed to send log to channel ${logChannelDoc.channel_id}:`, err);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch log channels:', err);
            }
        }

        return true;
    } catch (err) {
        console.error('Failed to write command log:', err);
        return false;
    }
}
