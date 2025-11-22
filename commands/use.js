import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, useItem } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessage } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('use')
    .setDescription('Использовать предмет из инвентаря')
    .addStringOption(option =>
        option.setName('item_name')
            .setDescription('Название предмета для использования')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('quantity')
            .setDescription('Количество (по умолчанию: 1)')
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

    const playerId = interaction.user.id;
    const itemName = interaction.options.getString('item_name');
    const qty = interaction.options.getInteger('quantity') || 1;
    
    const player = getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    if (qty < 1) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное количество', 'Количество должно быть не меньше 1.')],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
        return;
    }
    
    const result = useItem(playerId, itemName, qty);
    
    if (result.success) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Предмет использован', 
                `✨ Вы успешно использовали **${result.item.name}** x${qty}`)],
            fetchReply: true
        });
        autoDeleteMessage(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка использования', result.reason)],
            ephemeral: true,
            fetchReply: true
        });
        autoDeleteMessage(msg);
    }
}
