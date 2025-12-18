import { SlashCommandBuilder } from 'discord.js';
import { getActiveSlot, getPlayer } from '../utils/dataManager.js';
import { createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Показать список слотов и имена персонажей');

export async function execute(interaction) {
    const userId = interaction.user.id;
    let description = '';
    let found = false;
    for (let slot = 1; slot <= 2; slot++) {
        const playerId = slot === 1 ? userId : `${userId}_${slot}`;
        const player = await getPlayer(playerId);
        if (player) {
            found = true;
            description += `**Слот ${slot}:** ${player.character_name || player.username}\n`;
        } else {
            description += `Слот ${slot}: _пусто_\n`;
        }
    }
    if (!found) {
        // Если нет ни одного персонажа, сразу отправляем красный эмбед и завершаем выполнение
        await interaction.reply({ embeds: [createErrorEmbed('Нет персонажей', 'У вас нет ни одного персонажа в слотах. Используйте /register для создания.')], ephemeral: true });
        return;
    }
    await interaction.reply({ embeds: [createInfoEmbed('Ваши слоты', description)], ephemeral: true });
}
