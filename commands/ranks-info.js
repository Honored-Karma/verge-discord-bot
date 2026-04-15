import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('ranks-info')
    .setDescription('Показать ранговую систему и зарплаты по организациям');

export async function execute(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0xA855F7)
        .setTitle('📊 Ранговая система и зарплаты')
        .setDescription('Зарплата начисляется **раз в неделю** автоматически.')
        .setImage('https://s.iimg.su/s/22/uAHetLrx0gHhdpdgNEk0sz5rXNryIiakpM4NOC2i.jpg')
        .addFields(
            {
                name: '🏢 TENRYU (F-S, YEN/месяц)',
                value: [
                    'F: ~180,000 ¥',
                    'E: ~240,000 ¥',
                    'D: ~320,000 ¥',
                    'C: ~450,000 ¥',
                    'B: ~600,000 ¥',
                    'A: ~900,000-1,200,000 ¥',
                    'S: ~1,500,000-2,300,000 ¥'
                ].join('\n'),
                inline: false
            },
            {
                name: '⚔️ Guardians (VI-I, KRW/месяц)',
                value: [
                    'VI: 1,700,000-2,000,000 KRW',
                    'V: 2,500,000-3,200,000 KRW',
                    'IV: 4,000,000-5,000,000 KRW',
                    'III: 6,000,000-8,000,000 KRW',
                    'II: 9,000,000-14,000,000 KRW',
                    'I: 15,000,000-20,000,000 KRW'
                ].join('\n'),
                inline: false
            },
            {
                name: '🛠 Управление',
                value: 'Админы используют `/set-rank` и выбирают организацию + ранг.\nВыплата идет в валюте организации: TENRYU -> YEN, Guardians -> KRW.',
                inline: false
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
}
