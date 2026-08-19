import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createInfoEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { logCommand } from '../utils/logs.js';
import { PICK_LIMITS, pickOptions, splitOptions } from '../utils/randomPick.js';

export const data = new SlashCommandBuilder()
    .setName('pick')
    .setDescription('Случайно выбрать из вариантов: пупсик пупсик дино кепка')
    .addStringOption(option =>
        option.setName('options')
            .setDescription('Варианты через пробел, запятую или черту |')
            .setRequired(true)
            .setMaxLength(1000))
    .addIntegerOption(option =>
        option.setName('count')
            .setDescription('Сколько вариантов выбрать (по умолчанию один)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(PICK_LIMITS.maxDraw))
    .addStringOption(option =>
        option.setName('comment')
            .setDescription('Зачем выбираем — например «кого затянуло в Скважину»')
            .setRequired(false)
            .setMaxLength(120))
    .addBooleanOption(option =>
        option.setName('hidden')
            .setDescription('Показать результат только вам (выбор попадёт в журнал для ГМ)')
            .setRequired(false));

export async function execute(interaction) {
    const raw = interaction.options.getString('options');
    const count = interaction.options.getInteger('count') || 1;
    const comment = interaction.options.getString('comment');
    const hidden = interaction.options.getBoolean('hidden') === true;

    const cooldown = checkGlobalCooldown(interaction.user.id);
    if (cooldown.onCooldown) {
        return interaction.reply({
            content: `⏱️ Подождите **${cooldown.remainingFormatted}** перед следующим выбором.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const split = splitOptions(raw);
    if (!split.ok) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не понял список', split.error)],
            flags: MessageFlags.Ephemeral,
        });
    }

    if (count > split.options.length) {
        return interaction.reply({
            embeds: [createErrorEmbed('Слишком много просите',
                `Просите выбрать ${count}, а вариантов всего ${split.options.length}.`)],
            flags: MessageFlags.Ephemeral,
        });
    }

    const result = pickOptions(split.options, count);

    const answer = result.chosen.length === 1
        ? `## ${result.chosen[0]}`
        : result.chosen.map((option, index) => `**${index + 1}.** ${option}`).join('\n');

    // Показываем, как бот понял список: разделитель определяется автоматически,
    // и молчаливая эвристика — худшее, что можно сделать с чужим списком.
    const footer = [
        `-# Из ${result.total} вариантов, разделитель — ${split.separator}.`,
        result.hasDuplicates
            ? `Повторы оставлены как есть: уникальных ${result.uniqueCount}, они влияют на шансы.`
            : '',
    ].filter(Boolean).join(' ');

    const header = comment ? `**${comment}**\n` : '';

    await interaction.reply({
        embeds: [createInfoEmbed(
            `🎯 ${interaction.user.username} выбирает`,
            `${header}${answer}\n\n${footer}`,
        )],
        ...(hidden ? { flags: MessageFlags.Ephemeral } : {}),
    });

    if (hidden) {
        await logCommand({
            client: interaction.client,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            command: 'pick',
            extra: {
                options: split.options,
                chosen: result.chosen,
                comment: comment || null,
                hidden: true,
            },
        }).catch(error => console.error('Error logging hidden pick:', error));
    }
}
