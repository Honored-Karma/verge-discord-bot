import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { getDB } from '../utils/db.js';
import { getWeeklySalary, normalizeOrganization, normalizeRank } from '../utils/rankSystem.js';
import { getAllSalaryMultipliers } from '../utils/dataManager.js';

async function notifySalaryLogChannel(client, lines, totalAmount) {
    const channelId = process.env.SALARY_LOG_CHANNEL_ID;
    if (!channelId || !client) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(0xB209D4)
            .setTitle('💸 Еженедельный отчёт зарплат')
            .setDescription(lines.length > 0 ? lines.join('\n').slice(0, 4000) : 'На этой неделе выплат не было.')
            .addFields({ name: 'Итого выплачено', value: `${totalAmount.toLocaleString('ru-RU')}`, inline: true })
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

    const allMultipliers = await getAllSalaryMultipliers();
    const multMap = {};
    for (const m of allMultipliers) {
        multMap[`${m.organization}_${m.rank}`] = m.multiplier;
    }

    for (const player of players) {
        const orgSalary = getWeeklySalary(player.organization, player.rank);
        if (!orgSalary || !orgSalary.amount) continue;
        const baseAmount = orgSalary.amount;
        const currency = orgSalary.currency;

        const normOrg = normalizeOrganization(player.organization);
        const normRank = normalizeRank(player.rank);
        const multiplier = (normOrg && normRank) ? multMap[`${normOrg}_${normRank}`] : null;
        const effectiveMultiplier = multiplier || 100;
        const amount = Math.floor(baseAmount * effectiveMultiplier / 100);

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
            base_amount: baseAmount,
            multiplier: effectiveMultiplier,
            amount,
            paid_at: new Date()
        });

        paidCount += 1;
        totalAmount += amount;
        const multText = effectiveMultiplier !== 100 ? ` (×${effectiveMultiplier}%)` : '';
        lines.push(`👤 ${player.character_name || player.username || player.id} • ${player.organization || '-'} ${player.rank} • +${amount.toLocaleString('ru-RU')} ${currency.toUpperCase()}${multText}`);
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
