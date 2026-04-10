import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../utils/dataManager.js';
import { createCooldownEmbed, createInfoEmbed, createLeaderboardEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Просмотр топа игроков')
    .addStringOption(option =>
        option.setName('sort_by')
            .setDescription('По чему сортировать')
            .setRequired(false)
            .addChoices(
                { name: 'AP (Очки способностей)', value: 'ap' },
                { name: 'SP (Очки стилей)', value: 'sp' },
                { name: 'KRW (₩)', value: 'krw' },
                { name: 'Йены (¥)', value: 'yen' }
            ))
    .addIntegerOption(option =>
        option.setName('limit')
            .setDescription('Количество игроков (по умолчанию: 10)')
            .setRequired(false));

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Leaderboard', retryAt)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    let sortBy = interaction.options.getString('sort_by') || 'ap';
    const limit = interaction.options.getInteger('limit') || 10;
    
    if (limit < 1 || limit > 50) {
        const msg = await interaction.reply({
            content: 'Лимит должен быть от 1 до 50.',
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    function buildSortButtons(currentSort) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lb_ap').setLabel('AP').setStyle(currentSort === 'ap' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('lb_sp').setLabel('SP').setStyle(currentSort === 'sp' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('lb_krw').setLabel('KRW').setStyle(currentSort === 'krw' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('lb_yen').setLabel('YEN').setStyle(currentSort === 'yen' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
    }

    function createLeaderboardText(data, currentSort) {
        let title = '📊 Таблица лидеров';
        let leaderboardText = '';

        if (currentSort === 'ap') {
            title += ' - Топ по AP';
            leaderboardText = data.map((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
                const name = player.character_name || player.username;
                return `${medal} **${name}** - ${player.ap} AP`;
            }).join('\n');
        } else if (currentSort === 'sp') {
            title += ' - Топ по SP';
            leaderboardText = data.map((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
                const name = player.character_name || player.username;
                return `${medal} **${name}** - ${player.total_sp} SP`;
            }).join('\n');
        } else if (currentSort === 'krw') {
            title += ' - Топ по KRW';
            leaderboardText = data.map((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
                const name = player.character_name || player.username;
                return `${medal} **${name}** - ${player.krw.toLocaleString('ru-RU')} ₩`;
            }).join('\n');
        } else if (currentSort === 'yen') {
            title += ' - Топ по Йенам';
            leaderboardText = data.map((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
                const name = player.character_name || player.username;
                return `${medal} **${name}** - ${player.yen.toLocaleString('ru-RU')} ¥`;
            }).join('\n');
        }

        return createLeaderboardEmbed(title, leaderboardText, currentSort);
    }

    let leaderboard = await getLeaderboard(sortBy, limit);
    
    if (leaderboard.length === 0) {
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('📊 Таблица лидеров', 'Пока нет зарегистрированных игроков.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const embed = createLeaderboardText(leaderboard, sortBy);
    const row = buildSortButtons(sortBy);
    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const collector = msg.createMessageComponentCollector({ time: 180000 });
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Это меню не для вас.', flags: 64 });
        }

        const nextSort = i.customId.replace('lb_', '');
        if (!['ap', 'sp', 'krw', 'yen'].includes(nextSort)) return;
        sortBy = nextSort;
        leaderboard = await getLeaderboard(sortBy, limit);
        const nextEmbed = createLeaderboardText(leaderboard, sortBy);
        const nextRow = buildSortButtons(sortBy);
        await i.update({ embeds: [nextEmbed], components: [nextRow] });
    });

    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });
}
