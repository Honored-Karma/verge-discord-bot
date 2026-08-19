import { MessageFlags, SlashCommandBuilder, TextDisplayBuilder } from 'discord.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { logCommand } from '../utils/logs.js';
import {
    formatRollResult,
    looksLikeOptionList,
    parseRollInput,
    rollExpression,
} from '../utils/diceRoller.js';

/**
 * Серверная эмодзи кубика. Переопределяется переменной окружения на случай,
 * если эмодзи пересоздадут или заменят на анимированную (у той разметка
 * начинается с `a:`).
 */
export const DICE_EMOJI = process.env.DICE_EMOJI || '<:dice:1494708930138472469>';

const CHEATSHEET = [
    '**Кубики**',
    '`2d6` — два шестигранника · `d20` — один двадцатигранник · `d%` — процентный',
    '',
    '**Арифметика**',
    '`2d6+3` · `1d20-1` · `2d6+1d4` — можно добавлять и кубики',
    '',
    '**Отбор кубиков**',
    '`4d6dl1` — отбросить худший (характеристики) · `4d6kh3` — оставить 3 лучших',
    '`2d20kh1` — с преимуществом · `2d20kl1` — с помехой · `dh` — отбросить лучший',
    '',
    '**Перебросы**',
    '`4d6r1` — перебросить единицы **один раз** · `4d6rr1` — пока не уйдут',
    '',
    '**Успехи**',
    '`5d10t8` — считать успехи от 8 · `5d10t8f1` — минус провалы на 1',
    '',
    '**Пачками**',
    '`6#4d6dl1` — шесть наборов сразу · `1d20; 2d6` — разные броски через `;`',
    '',
    '-# Пробелы не важны: `4d6 dl1 +2` и `4d6dl1+2` — одно и то же. Можно писать `2д6`.',
    '-# Зачёркнутые кубики отброшены, `↻` — переброшенные.',
].join('\n');

export const data = new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Бросить кубики: 2d6+3, 4d6dl1, 2d20kh1, 6#4d6')
    .addStringOption(option =>
        option.setName('expression')
            .setDescription('Что бросаем: 2d6+3, 4d6dl1, 5d10t8. Напишите ? для шпаргалки')
            .setRequired(true)
            .setMaxLength(200))
    .addStringOption(option =>
        option.setName('comment')
            .setDescription('Зачем бросок — например «урон катаной»')
            .setRequired(false)
            .setMaxLength(120))
    .addBooleanOption(option =>
        option.setName('hidden')
            .setDescription('Показать результат только вам (бросок попадёт в журнал для ГМ)')
            .setRequired(false));

/**
 * Ответ отправляется готовым `TextDisplay`, а не embed.
 *
 * Адаптер `installModernResponseAdapter` заворачивает и текст, и embed в
 * контейнер с цветной полосой — для броска это лишняя рамка. Готовый
 * V2-компонент адаптер не трогает, и сообщение выглядит обычной строкой.
 */
function plain(text, ephemeral = false) {
    return {
        flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
        components: [new TextDisplayBuilder().setContent(text)],
    };
}

export async function execute(interaction) {
    const raw = interaction.options.getString('expression').trim();
    const comment = interaction.options.getString('comment');
    const hidden = interaction.options.getBoolean('hidden') === true;

    if (['?', 'help', 'справка', '/?'].includes(raw.toLowerCase())) {
        return interaction.reply(plain(`### ${DICE_EMOJI} Как бросать кубики\n${CHEATSHEET}`, true));
    }

    const cooldown = checkGlobalCooldown(interaction.user.id);
    if (cooldown.onCooldown) {
        return interaction.reply(
            plain(`⏱️ Подождите **${cooldown.remainingFormatted}** перед следующим броском.`, true),
        );
    }

    const parsed = parseRollInput(raw);
    if (!parsed.ok) {
        // Привычка из UnbelievaBoat, где кубики и выбор из вариантов живут в
        // одной команде: вместо сухой ошибки парсера показываем нужную команду.
        const hint = looksLikeOptionList(raw)
            ? 'Похоже, вы хотели выбрать случайный вариант из списка — это `/pick`.'
            : 'Шпаргалка по записи: `/roll expression:?`';
        return interaction.reply(plain(`❌ ${parsed.error}\n-# ${hint}`, true));
    }

    const results = parsed.specs.map(spec => rollExpression(spec));

    const lines = formatRollResult(results).split('\n');
    lines[0] = `${DICE_EMOJI} **${interaction.user.username}** ${lines[0]}`;
    if (comment) lines[0] += ` — ${comment}`;

    await interaction.reply(plain(lines.join('\n'), hidden));

    // Скрытый бросок не видит никто, кроме автора, — значит его результат нельзя
    // проверить на слово. Пишем такие броски в журнал, чтобы ГМ мог сверить их
    // с тем, что игрок объявил в отыгрыше. Публичные броски уже видны в канале.
    if (hidden) {
        await logCommand({
            client: interaction.client,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            command: 'roll',
            extra: {
                expression: raw,
                comment: comment || null,
                hidden: true,
                totals: results.flatMap(result => result.sets.map(set => set.total)),
            },
        }).catch(error => console.error('Error logging hidden roll:', error));
    }
}
