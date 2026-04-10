import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getTotalSP, getRecentProgressionHistory } from '../utils/dataManager.js';
import { createModernProfileEmbed, createErrorEmbed, createCooldownEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Просмотр профиля игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Пользователь для просмотра (оставьте пустым для себя)')
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
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Profile', retryAt)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const slotPlayerId = slot === 1 ? userId : `${userId}_${slot}`;
    const player = await getPlayer(slotPlayerId);

    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const totalSP = await getTotalSP(slotPlayerId);
    const history = await getRecentProgressionHistory(slotPlayerId, 6);
    const embed = createModernProfileEmbed({ ...player, total_sp: totalSP }, targetUser, history);

    const msg = await interaction.reply({
        embeds: [embed],
        fetchReply: true
    });
    autoDeleteMessageShort(msg);
}
