import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getPlayerInventory } from '../utils/dataManager.js';
import { createInventoryEmbed, createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Просмотр инвентаря')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Пользователь для просмотра (оставьте пустым для себя)')
            .setRequired(false));

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
    const playerId = targetUser.id;
    
    const player = await getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const inventory = await getPlayerInventory(playerId);
    
    if (inventory.length === 0) {
        const name = player.character_name || player.username;
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('🎒 Инвентарь', `Инвентарь игрока **${name}** пуст.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const inventoryText = inventory.map(item => {
        return `**${item.item_name}** x${item.qty}`;
    }).join('\n');
    
    const name = player.character_name || player.username;
    const embed = createInventoryEmbed(`🎒 Инвентарь — ${name}`, inventoryText);
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
