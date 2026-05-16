import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import {
    getPlayer,
    getActiveSlot,
    getReputationTier,
    getRecentReputationHistory,
} from '../utils/dataManager.js';
import { createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('reputation')
    .setDescription('Посмотреть репутацию (Rtg) игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок (по умолчанию вы)')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1 или 2 (по умолчанию активный)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 }
            )
    );

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) slot = await getActiveSlot(userId);
    if (slot !== 1 && slot !== 2) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;

    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', 'В этом слоте нет персонажа.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const rep = Number(player.reputation || 0);
    const tier = getReputationTier(rep);
    const name = player.character_name || player.username;
    const history = await getRecentReputationHistory(playerId, 5);

    const historyText = history.length > 0
        ? history.map(entry => {
            const deltaSign = entry.delta >= 0 ? '+' : '';
            const ts = Math.floor(new Date(entry.changed_at).getTime() / 1000);
            const reasonPart = entry.reason ? ` — *${entry.reason}*` : '';
            return `• ${deltaSign}${entry.delta} Rtg → **${entry.new_value}** (<t:${ts}:R>)${reasonPart}`;
        }).join('\n')
        : 'Изменений пока нет';

    const embed = new EmbedBuilder()
        .setColor(0xb209d4)
        .setTitle(`📈 Репутация — ${name}`)
        .setThumbnail(
            player.character_avatar || targetUser.displayAvatarURL({ dynamic: true })
        )
        .addFields(
            { name: 'Rtg', value: `**${rep}**`, inline: true },
            { name: 'Тир', value: `${tier.emoji} ${tier.name}`, inline: true },
            { name: 'Слот', value: `№${slot}`, inline: true },
            { name: '🕓 История', value: historyText, inline: false }
        )
        .setFooter({ text: `ID: ${player.id}` })
        .setTimestamp();

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
