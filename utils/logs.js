import { getDB } from './db.js';

export async function logCommand({ guildId, channelId, userId, userTag, command, targetId = null, targetTag = null, extra = null }) {
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
        return true;
    } catch (err) {
        console.error('Failed to write command log:', err);
        return false;
    }
}
