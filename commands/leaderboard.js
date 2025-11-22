import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../utils/dataManager.js';
import { createInfoEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top players')
    .addStringOption(option =>
        option.setName('sort_by')
            .setDescription('What to sort by')
            .setRequired(false)
            .addChoices(
                { name: 'AP (Ability Points)', value: 'ap' },
                { name: 'SP (Style Points)', value: 'sp' },
                { name: 'Balance (Coins)', value: 'balance' }
            ))
    .addIntegerOption(option =>
        option.setName('limit')
            .setDescription('Number of players to show (default: 10)')
            .setRequired(false));

export async function execute(interaction) {
    const sortBy = interaction.options.getString('sort_by') || 'ap';
    const limit = interaction.options.getInteger('limit') || 10;
    
    if (limit < 1 || limit > 50) {
        return interaction.reply({
            content: 'Limit must be between 1 and 50.',
            ephemeral: true
        });
    }
    
    const leaderboard = getLeaderboard(sortBy, limit);
    
    if (leaderboard.length === 0) {
        return interaction.reply({
            embeds: [createInfoEmbed('📊 Leaderboard', 'No players registered yet.')],
            ephemeral: true
        });
    }
    
    let title = '📊 Leaderboard';
    let leaderboardText = '';
    
    if (sortBy === 'ap') {
        title += ' - Top AP';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            return `${medal} **${player.username}** - ${player.ap} AP`;
        }).join('\n');
    } else if (sortBy === 'sp') {
        title += ' - Top SP';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            return `${medal} **${player.username}** - ${player.total_sp} SP`;
        }).join('\n');
    } else if (sortBy === 'balance') {
        title += ' - Top Balance';
        leaderboardText = leaderboard.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
            return `${medal} **${player.username}** - ${player.balance} coins`;
        }).join('\n');
    }
    
    const embed = createInfoEmbed(title, leaderboardText);
    
    return interaction.reply({ embeds: [embed] });
}
