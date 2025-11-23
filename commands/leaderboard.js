import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../utils/dataManager.js';
import { createInfoEmbed, createLeaderboardEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort, autoDeleteMessage } from '../utils/cooldowns.js';

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
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const sortBy = interaction.options.getString('sort_by') || 'ap';
    const limit = interaction.options.getInteger('limit') || 10;
    
    if (limit < 1 || limit > 50) {
        const msg = await interaction.reply({
            content: 'Лимит должен быть от 1 до 50.',
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const leaderboard = getLeaderboard(sortBy, limit);
    
    if (leaderboard.length === 0) {
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('📊 Таблица лидеров', 'Пока нет зарегистрированных игроков.')],
            fetchReply: true,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    let title = '📊 Таблица лидеров';
    let leaderboardText = '';
    
    if (sortBy === 'ap') {
        title += ' - Топ по AP';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            const name = player.character_name || player.username;
            return `${medal} **${name}** - ${player.ap} AP`;
        }).join('\n');
    } else if (sortBy === 'sp') {
        title += ' - Топ по SP';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            const name = player.character_name || player.username;
            return `${medal} **${name}** - ${player.total_sp} SP`;
        }).join('\n');
    } else if (sortBy === 'krw') {
        title += ' - Топ по KRW';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            const name = player.character_name || player.username;
            return `${medal} **${name}** - ${player.krw.toLocaleString('ru-RU')} ₩`;
        }).join('\n');
    } else if (sortBy === 'yen') {
        title += ' - Топ по Йенам';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            const name = player.character_name || player.username;
            return `${medal} **${name}** - ${player.yen.toLocaleString('ru-RU')} ¥`;
        }).join('\n');
    }
    
    const embed = createLeaderboardEmbed(title, leaderboardText, sortBy);
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
