import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getPlayerInventory } from '../utils/dataManager.js';
import { createInventoryEmbed, createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

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
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const playerId = targetUser.id;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `Игрок не зарегистрирован.`)],
            ephemeral: true
        });
    }
    
    const inventory = getPlayerInventory(playerId);
    
    if (inventory.length === 0) {
        const name = player.character_name || player.username;
        return interaction.reply({
            embeds: [createInfoEmbed('🎒 Инвентарь', `Инвентарь игрока **${name}** пуст.`)],
            ephemeral: true
        });
    }
    
    const inventoryText = inventory.map(item => {
        const effect = item.effect ? JSON.parse(item.effect) : null;
        let effectText = '';
        if (effect?.ap) effectText = ` (+${effect.ap} AP)`;
        if (effect?.sp) effectText = ` (+${effect.sp.value} SP к ${effect.sp.style})`;
        
        return `**${item.name}** x${item.qty}${effectText}\n*${item.type}* - ID: \`${item.id}\``;
    }).join('\n\n');
    
    const name = player.character_name || player.username;
    const embed = createInventoryEmbed(`🎒 Инвентарь — ${name}`, inventoryText);
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessage(msg);
}
