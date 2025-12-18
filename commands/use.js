import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, useItem } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

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
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const userId = interaction.user.id;
    const { getActiveSlot } = await import('../utils/dataManager.js');
    const activeSlot = await getActiveSlot(userId);
    const playerId = activeSlot === 1 ? userId : `${userId}_${activeSlot}`;
    const itemName = interaction.options.getString('item_name');
    const qty = interaction.options.getInteger('quantity') || 1;
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', 'В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (qty < 1) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное количество', 'Количество должно быть не меньше 1.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const result = await useItem(playerId, itemName, qty);
    
    if (result.success) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Предмет использован', 
                `✨ Вы успешно использовали **${result.itemName}** x${qty}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка использования', result.reason)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
