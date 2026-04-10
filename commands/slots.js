import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { getActiveSlot, getPlayer, setActiveSlot } from '../utils/dataManager.js';
import { makePlayerKey } from '../utils/playerKey.js';
import { createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Показать список слотов и имена персонажей');

export async function execute(interaction) {
    const userId = interaction.user.id;
    let activeSlot = await getActiveSlot(userId);
    let description = '';
    let found = false;
    for (let slot = 1; slot <= 2; slot++) {
        const playerId = makePlayerKey(userId, slot);
        const player = await getPlayer(playerId);
        if (player) {
            found = true;
            const active = activeSlot === slot ? ' 🟢 (активный)' : '';
            description += `**Слот ${slot}:** ${player.character_name || player.username}${active}\n`;
        } else {
            description += `Слот ${slot}: _пусто_\n`;
        }
    }
    if (!found) {
        // Если нет ни одного персонажа, сразу отправляем красный эмбед и завершаем выполнение
        await interaction.reply({ embeds: [createErrorEmbed('Нет персонажей', 'У вас нет ни одного персонажа в слотах. Используйте /register для создания.')], flags: 64 });
        return;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('slots_set_1')
            .setLabel('Сделать слот 1 активным')
            .setStyle(activeSlot === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('slots_set_2')
            .setLabel('Сделать слот 2 активным')
            .setStyle(activeSlot === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const message = await interaction.reply({
        embeds: [createInfoEmbed('Ваши слоты', description)],
        components: [row],
        flags: 64,
        fetchReply: true
    });

    const collector = message.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Эти кнопки не для вас.', flags: 64 });
        }

        const nextSlot = i.customId === 'slots_set_1' ? 1 : 2;
        const ok = await setActiveSlot(userId, nextSlot);
        if (!ok) {
            return i.reply({ embeds: [createErrorEmbed('Ошибка', 'Не удалось переключить слот.')], flags: 64 });
        }

        activeSlot = nextSlot;
        let updated = '';
        for (let slot = 1; slot <= 2; slot++) {
            const player = await getPlayer(makePlayerKey(userId, slot));
            const active = activeSlot === slot ? ' 🟢 (активный)' : '';
            updated += player
                ? `**Слот ${slot}:** ${player.character_name || player.username}${active}\n`
                : `Слот ${slot}: _пусто_\n`;
        }

        const nextRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('slots_set_1')
                .setLabel('Сделать слот 1 активным')
                .setStyle(activeSlot === 1 ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('slots_set_2')
                .setLabel('Сделать слот 2 активным')
                .setStyle(activeSlot === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
        );

        await i.update({
            embeds: [createInfoEmbed('Ваши слоты', updated)],
            components: [nextRow]
        });
    });

    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });
}
