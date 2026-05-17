import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setSalaryMultiplier, getActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';
import { getWeeklySalary } from '../utils/rankSystem.js';

export const data = new SlashCommandBuilder()
    .setName('set-salary-multiplier')
    .setDescription('[АДМИН] Установить индивидуальный множитель зарплаты для игрока/слота')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Игрок для изменения')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('multiplier')
            .setDescription('Множитель в процентах (100 = стандарт, 150 = +50%, 50 = -50%, 0 = без зарплаты)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(1000))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот персонажа (1 или 2). Если не указан — активный слот.')
            .setRequired(false)
            .addChoices(
                { name: '1', value: 1 },
                { name: '2', value: 2 }
            ));

export async function execute(interaction) {
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'set-ap')) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещён', 'Эта команда доступна только администраторам.')],
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
    const multiplier = interaction.options.getInteger('multiplier');
    const requestedSlot = interaction.options.getInteger('slot');
    let slot = requestedSlot ?? await getActiveSlot(targetUser.id);
    if (slot < 1 || slot > 2) slot = 1;

    const playerId = makePlayerKey(targetUser.id, slot);
    const player = await getPlayer(playerId);

    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', `В слоте ${slot} у игрока нет персонажа.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const result = await setSalaryMultiplier(playerId, multiplier, interaction.user.id);

    if (result !== false) {
        // Показываем пример расчёта если у игрока есть ранг
        let exampleText = '';
        const baseSalary = getWeeklySalary(player.organization, player.rank);
        if (baseSalary) {
            const baseAmount = baseSalary.amount;
            const newAmount = Math.floor(baseAmount * result / 100);
            const currency = baseSalary.currency.toUpperCase();
            exampleText = `\n\n**Пример:** Базовая еженедельная зарплата **${baseAmount.toLocaleString('ru-RU')} ${currency}** → теперь **${newAmount.toLocaleString('ru-RU')} ${currency}**`;
        } else {
            exampleText = `\n\n*У игрока нет ранга/организации — зарплата не начисляется.*`;
        }

        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Множитель зарплаты установлен',
                `Установлен множитель зарплаты **${result}%** для **${player.character_name || player.username}** (слот **${slot}**).${exampleText}`,
                'setRank')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось установить множитель зарплаты.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
