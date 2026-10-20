import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { getDB } from '../utils/db.js';
import { getWeeklySalary } from '../utils/rankSystem.js';
import { modernizeResponsePayload } from '../utils/modernResponses.js';

function salaryPeriodKey(date = new Date()) {
    const value = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    ));
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
    return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function notifySalaryLogChannel(client, lines, totals) {
    const channelId = process.env.SALARY_LOG_CHANNEL_ID;
    if (!channelId || !client) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xB209D4)
            .setTitle('💸 Еженедельный отчёт зарплат')
            .setDescription(lines.length > 0 ? lines.join('\n').slice(0, 4000) : 'На этой неделе выплат не было.')
            .addFields(
                { name: 'Выплачено KRW', value: `${totals.krw.toLocaleString('ru-RU')} ₩`, inline: true },
                { name: 'Выплачено YEN', value: `${totals.yen.toLocaleString('ru-RU')} ¥`, inline: true }
            )
            .setTimestamp();

        await channel.send(modernizeResponsePayload({ embeds: [embed] }));
    } catch (error) {
        console.error('[salary] failed to send log channel message:', error);
    }
}

export async function runWeeklySalary(client) {
    const db = getDB();
    if (!db) {
        console.warn('[salary] Database is not connected; skipping weekly salary run.');
        return;
    }

    const players = await db.collection('players').find(
        { organization: { $exists: true, $ne: null } },
        { projection: { id: 1, organization: 1, rank: 1, salary_multiplier: 1, character_name: 1, username: 1 } }
    ).toArray();
    const lines = [];
    const totals = { krw: 0, yen: 0 };
    let paidCount = 0;
    const periodKey = salaryPeriodKey();

    for (const player of players) {
        const orgSalary = getWeeklySalary(player.organization, player.rank);
        if (!orgSalary || !orgSalary.amount) continue;
        const salaryMult = Math.max(0, Math.min(200, Number(player.salary_multiplier ?? 100) || 0));
        const amount = Math.floor(orgSalary.amount * salaryMult / 100);
        if (amount <= 0) continue;
        const currency = orgSalary.currency;

        const paidPlayer = await db.collection('players').findOneAndUpdate(
            {
                id: player.id,
                $or: [
                    { last_salary_period_key: { $ne: periodKey } },
                    { last_salary_period_key: { $exists: false } }
                ]
            },
            {
                $inc: { [currency]: amount },
                $set: {
                    last_salary_paid_at: Math.floor(Date.now() / 1000),
                    last_salary_period_key: periodKey
                }
            },
            { returnDocument: 'after' }
        );
        if (!paidPlayer) continue;

        const operationId = `salary:${player.id}:${periodKey}`;
        try {
            await db.collection('salary_logs').updateOne({
                player_id: player.id,
                period_key: periodKey
            }, { $setOnInsert: {
                player_id: player.id,
                period_key: periodKey,
                organization: player.organization || null,
                rank: player.rank,
                currency,
                amount,
                paid_at: new Date()
            } }, { upsert: true });
            await db.collection('economy_ledger').updateOne({
                operation_id: operationId
            }, { $setOnInsert: {
                operation_id: operationId,
                player_id: player.id,
                type: 'salary',
                currency,
                amount,
                balance_after: Number(paidPlayer[currency] || 0),
                period_key: periodKey,
                created_at: new Date()
            } }, { upsert: true });
        } catch (error) {
            console.error(`[salary] payout recorded on player but audit log failed for ${player.id}:`, error);
        }

        paidCount += 1;
        totals[currency] += amount;
        lines.push(`👤 ${player.character_name || player.username || player.id} • ${player.organization || '-'} ${player.rank} • +${amount.toLocaleString('ru-RU')} ${currency.toUpperCase()}${salaryMult !== 100 ? ` (×${salaryMult}%)` : ''}`);
    }

    console.log(`[salary] Weekly payouts completed for ${periodKey}: ${paidCount} users, ${totals.krw} KRW, ${totals.yen} YEN`);
    await notifySalaryLogChannel(client, lines, totals);
}

export function startWeeklySalaryScheduler(client) {
    const cronExpression = process.env.SALARY_CRON || '0 12 * * 1';
    const timezone = process.env.SALARY_TIMEZONE || 'UTC';

    const task = cron.schedule(cronExpression, async () => {
        try {
            await runWeeklySalary(client);
        } catch (error) {
            console.error('[salary] weekly scheduler failed:', error);
        }
    }, { timezone });

    console.log(`[salary] Scheduler started: "${cronExpression}" (${timezone})`);
    return task;
}
