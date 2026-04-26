import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { getDB } from '../utils/db.js';
import { getWeeklySalary } from '../utils/rankSystem.js';

async function notifySalaryLogChannel(client, lines, totalAmount) {
    const channelId = process.env.SALARY_LOG_CHANNEL_ID;
    if (!channelId || !client) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xB209D4)
            .setTitle('💸 Weekly Salary Report')
            .setDescription(lines.length > 0 ? lines.join('\n').slice(0, 4000) : 'No payouts this week.')
            .addFields({ name: 'Total paid (numeric)', value: `${totalAmount.toLocaleString('ru-RU')}`, inline: true })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[salary] failed to send log channel message:', error);
    }
}

export async function runWeeklySalary(client) {
    const db = getDB();
    const players = await db.collection('players').find({}).toArray();
    const lines = [];
    let totalAmount = 0;
    let paidCount = 0;

    for (const player of players) {
        const orgSalary = getWeeklySalary(player.organization, player.rank);
        if (!orgSalary || !orgSalary.amount) continue;
        const amount = orgSalary.amount;
        const currency = orgSalary.currency;

        await db.collection('players').updateOne(
            { id: player.id },
            {
                $inc: { [currency]: amount },
                $set: { last_salary_paid_at: Math.floor(Date.now() / 1000) }
            }
        );

        await db.collection('salary_logs').insertOne({
            player_id: player.id,
            organization: player.organization || null,
            rank: player.rank,
            currency,
            amount,
            paid_at: new Date()
        });

        paidCount += 1;
        totalAmount += amount;
        lines.push(`👤 ${player.character_name || player.username || player.id} • ${player.organization || '-'} ${player.rank} • +${amount.toLocaleString('ru-RU')} ${currency.toUpperCase()}`);
    }

    console.log(`[salary] Weekly payouts completed: ${paidCount} users, total ${totalAmount} KRW`);
    await notifySalaryLogChannel(client, lines, totalAmount);
}

export function startWeeklySalaryScheduler(client) {
    const cronExpression = process.env.SALARY_CRON || '0 12 * * 1';
    const timezone = process.env.SALARY_TIMEZONE || 'UTC';

    cron.schedule(cronExpression, async () => {
        try {
            await runWeeklySalary(client);
        } catch (error) {
            console.error('[salary] weekly scheduler failed:', error);
        }
    }, { timezone });

    console.log(`[salary] Scheduler started: "${cronExpression}" (${timezone})`);
}
