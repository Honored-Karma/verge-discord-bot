import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setAP } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { isAdmin, hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-ap')
    .setDescription('[АДМИН] Установить AP игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Количество AP')
            .setRequired(true))
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
const member = await resolveMember(interaction);
if (!hasCommandPermission(member, 'set-ap')) {
    const msg = await interaction.reply({
        embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам.')],
        fetchReply: true
    });
    autoDeleteMessageShort(msg);
    return;
}

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const targetUser = interaction.options.getUser('user');
    const userId = targetUser.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;
    const amount = interaction.options.getInteger('amount');
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (amount < 0) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное значение', 'AP не может быть отрицательным.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const success = await setAP(playerId, amount, interaction.user.id);
    
    if (success) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('AP обновлено', 
                `Установлено **${amount} AP** для игрока **${player.character_name || player.username}**`, 'setAp')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить AP.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
