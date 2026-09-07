import { MessageFlags, SlashCommandBuilder, TextDisplayBuilder } from 'discord.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { logCommand } from '../utils/logs.js';
import { PICK_LIMITS, pickOptions, splitOptions } from '../utils/randomPick.js';

const PICK_EMOJI = process.env.PICK_EMOJI || '🎯';

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

/** Тот же скромный вид, что у `/roll`: готовый V2-компонент вместо embed. */
function plain(text, ephemeral = false) {
    return {
        flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
        components: [new TextDisplayBuilder().setContent(text)],
    };
}

export async function execute(interaction) {
    const raw = interaction.options.getString('options');
    const count = interaction.options.getInteger('count') || 1;
    const comment = interaction.options.getString('comment');
    const hidden = interaction.options.getBoolean('hidden') === true;

    const cooldown = checkGlobalCooldown(interaction.user.id);
    if (cooldown.onCooldown) {
        return interaction.reply(
            plain(`⏱️ Подождите **${cooldown.remainingFormatted}** перед следующим выбором.`, true),
        );
    }

    const split = splitOptions(raw);
    if (!split.ok) {
        return interaction.reply(plain(`❌ ${split.error}`, true));
    }

    if (count > split.options.length) {
        return interaction.reply(plain(
            `❌ Просите выбрать ${count}, а вариантов всего ${split.options.length}.`,
            true,
        ));
    }

    const result = pickOptions(split.options, count);
    const answer = result.chosen.map(option => `**${option}**`).join(', ');
    const scope = count > 1 ? `выбирает ${count} из ${result.total}` : `выбирает из ${result.total}`;

    // Показываем, как бот понял список: разделитель определяется автоматически,
    // и молчаливая эвристика — худшее, что можно сделать с чужим списком.
    const notes = [`разделитель — ${split.separator}`];
    if (result.hasDuplicates) {
        notes.push(`повторы оставлены, уникальных ${result.uniqueCount}`);
    }

    const head = `${PICK_EMOJI} **${interaction.user.username}** ${scope}: ${answer}`;
    const text = `${head}${comment ? ` — ${comment}` : ''}\n-# ${notes.join(' · ')}`;

    await interaction.reply(plain(text, hidden));

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
