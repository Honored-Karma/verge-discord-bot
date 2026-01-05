import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('slot')
    .setDescription('Переключить активный слот персонажа')
    .addIntegerOption(option =>
        option.setName('number')
            .setDescription('Номер слота (1 или 2)')
            .setRequired(true)
    );

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({ content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`, fetchReply: true });
        autoDeleteMessageShort(msg);
        return;
    }

    const slot = interaction.options.getInteger('number');
    if (slot !== 1 && slot !== 2) {
        const msg = await interaction.reply({ embeds: [createErrorEmbed('Ошибка', 'Неверный номер слота. Доступно: 1 или 2.')], fetchReply: true });
        autoDeleteMessageShort(msg);
        return;
    }

    const userId = interaction.user.id;
    // Try to get target character (if exists)
    const target = await getPlayer(makePlayerKey(userId, slot));

    const ok = await setActiveSlot(userId, slot);
    if (!ok) {
        const msg = await interaction.reply({ embeds: [createErrorEmbed('Ошибка', 'Не удалось переключить слот, попробуйте позже.')], fetchReply: true });
        autoDeleteMessageShort(msg);
        return;
    }

    if (target) {
        const msg = await interaction.reply({ embeds: [createSuccessEmbed('Слот изменён', `Теперь активен слот **${slot}** — **${target.character_name || target.username}**`)], fetchReply: true });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({ embeds: [createSuccessEmbed('Слот выбран', `Теперь активен пустой слот **${slot}**. Используйте /register чтобы создать персонажа в этом слоте.`)], fetchReply: true });
        autoDeleteMessageShort(msg);
    }
}
