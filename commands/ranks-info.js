import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllSalaryMultipliers } from '../utils/dataManager.js';
import { ORGANIZATIONS } from '../utils/rankSystem.js';

export const data = new SlashCommandBuilder()
    .setName('ranks-info')
    .setDescription('Показать ранговую систему и зарплаты по организациям');

export async function execute(interaction) {
    const multipliers = await getAllSalaryMultipliers();
    const multMap = {};
    for (const m of multipliers) {
        multMap[`${m.organization}_${m.rank}`] = m.multiplier;
    }

    function formatMultiplier(org, rank) {
        const key = `${org}_${rank}`;
        const mult = multMap[key];
        if (mult && mult !== 100) return ` (×${mult}%)`;
        return '';
    }

    const embed = new EmbedBuilder()
        .setColor(0xB209D4)
        .setTitle('📊 Ранговая система и зарплаты')
        .setDescription('Зарплата начисляется **раз в неделю** автоматически.')
        .setImage('https://iili.io/BP3OQte.png')
        .addFields(
            {
                name: '🏢 TENRYU (F-S, YEN/месяц)',
                value: [
                    `F: ~180,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'F')}`,
                    `E: ~240,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'E')}`,
                    `D: ~320,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'D')}`,
                    `C: ~450,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'C')}`,
                    `B: ~600,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'B')}`,
                    `A: ~900,000-1,200,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'A')}`,
                    `S: ~1,500,000-2,300,000 ¥${formatMultiplier(ORGANIZATIONS.TENRYU, 'S')}`
                ].join('\n'),
                inline: false
            },
            {
                name: '⚔️ Guardians (VI-I, KRW/месяц)',
                value: [
                    `VI: 1,700,000-2,000,000 KRW${formatMultiplier(ORGANIZATIONS.GUARDIANS, 'VI')}`,
                    `V: 2,500,000-3,200,000 KRW${formatMultiplier(ORGANIZATIONS.GUARDIANS, 'V')}`,
                    `IV: 4,000,000-5,000,000 KRW${formatMultiplier(ORGANIZATIONS.GUARDIANS, 'IV')}`,
                    `III: 6,000,000-8,000,000 KRW${formatMultiplier(ORGANIZATIONS.GUARDIANS, 'III')}`,
                    `II: 9,000,000-14,000,000 KRW${formatMultiplier(ORGANIZATIONS.GUARDIANS, 'II')}`,
                    `I: 15,000,000-20,000,000 KRW${formatMultiplier(ORGANIZATIONS.GUARDIANS, 'I')}`
                ].join('\n'),
                inline: false
            },
            {
                name: '🛠 Управление',
                value: 'Админы используют `/set-rank` и выбирают организацию + ранг.\nВыплата идет в валюте организации: TENRYU -> YEN, Guardians -> KRW.\nМножители зарплат задаются через `/set-salary-multiplier`.',
                inline: false
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
}
