import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { getActiveSlot, getPlayer, setActiveSlot, isSlot3Unlocked } from '../utils/dataManager.js';
import { makePlayerKey } from '../utils/playerKey.js';
import { createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';
import { syncOrgRoles } from '../utils/orgRoles.js';

export const data = new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Показать список слотов и имена персонажей');

export function buildSlotsRow(currentActive, chars, slot3Unlocked = false) {
    const hasChar3 = Boolean(chars[3]);
    const slot3Label = !hasChar3 && !slot3Unlocked ? 'Слот 3 🔒' : 'Слот 3';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('slots_set_1')
            .setLabel('Слот 1')
            .setStyle(currentActive === 1 ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!chars[1] || currentActive === 1),
        new ButtonBuilder()
            .setCustomId('slots_set_2')
            .setLabel('Слот 2')
            .setStyle(currentActive === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!chars[2] || currentActive === 2),
        new ButtonBuilder()
            .setCustomId('slots_set_3')
            .setLabel(slot3Label)
            .setStyle(currentActive === 3 ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!hasChar3 || currentActive === 3)
    );
}

export async function execute(interaction) {
    const userId = interaction.user.id;
    let activeSlot = await getActiveSlot(userId);
    const slot3Unlocked = await isSlot3Unlocked(userId);
    let description = '';
    let found = false;
    const players = {};

    for (let slot = 1; slot <= 3; slot++) {
        const playerId = makePlayerKey(userId, slot);
        const player = await getPlayer(playerId);
        players[slot] = player;
        if (player) {
            found = true;
            const active = activeSlot === slot ? ' 🟢 (активный)' : '';
            description += `**Слот ${slot}:** ${player.character_name || player.username}${active}\n`;
        } else {
            if (slot === 3 && !slot3Unlocked) {
                description += `Слот 3: 🔒 _заблокирован (выдаётся администрацией)_\n`;
            } else {
                description += `Слот ${slot}: _пусто_\n`;
            }
        }
    }
    if (!found) {
        await interaction.reply({ embeds: [createErrorEmbed('Нет персонажей', 'У вас нет ни одного персонажа в слотах. Используйте /register для создания.')], flags: 64 });
        return;
    }

    const message = await interaction.reply({
        embeds: [createInfoEmbed('Ваши слоты', description, 'slots')],
        components: [buildSlotsRow(activeSlot, players, slot3Unlocked)],
        flags: 64,
        fetchReply: true
    });

    const collector = message.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Эти кнопки не для вас.', flags: 64 });
        }

        const nextSlot = i.customId === 'slots_set_1' ? 1 : (i.customId === 'slots_set_2' ? 2 : 3);
        const ok = await setActiveSlot(userId, nextSlot);
        if (!ok) {
            return i.reply({ embeds: [createErrorEmbed('Ошибка', 'Не удалось переключить слот.')], flags: 64 });
        }

        activeSlot = nextSlot;
        await syncOrgRoles({ guild: interaction.guild, userId }).catch(() => {});

        let updated = '';
        const updatedPlayers = {};
        for (let slot = 1; slot <= 3; slot++) {
            const player = await getPlayer(makePlayerKey(userId, slot));
            updatedPlayers[slot] = player;
            const active = activeSlot === slot ? ' 🟢 (активный)' : '';
            updated += player
                ? `**Слот ${slot}:** ${player.character_name || player.username}${active}\n`
                : `Слот ${slot}: _пусто_\n`;
        }

        await i.update({
            embeds: [createInfoEmbed('Ваши слоты', updated, 'slots')],
            components: [buildRow(activeSlot, updatedPlayers)]
        });
    });

    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });
}
