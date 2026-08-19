import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createInfoEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { logCommand } from '../utils/logs.js';
import {
    formatRollResult,
    looksLikeOptionList,
    parseRollInput,
    rollExpression,
} from '../utils/diceRoller.js';

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
    '**Перебросы и взрывы**',
    '`4d6r1` — перебросить единицы **один раз** · `4d6rr1` — пока не уйдут',
    '`3d6!` — выпал максимум: кубик кидается ещё раз и прибавляется к себе же',
    '`3d6!5` — то же, но начиная с 5. Поэтому на `3d6` кубик может показать 11 — это 6+5',
    '',
    '**Успехи**',
    '`5d10t8` — считать успехи от 8 · `5d10t8f1` — минус провалы на 1',
    '',
    '**Пачками**',
    '`6#4d6dl1` — шесть наборов сразу · `1d20; 2d6` — разные броски через `;`',
    '',
    '-# Пробелы не важны: `4d6 dl1 +2` и `4d6dl1+2` — одно и то же. Можно писать `2д6`.',
].join('\n');

export const data = new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Бросить кубики: 2d6+3, 4d6dl1, 2d20kh1, 6#4d6')
    .addStringOption(option =>
        option.setName('expression')
            .setDescription('Что бросаем: 2d6+3, 4d6dl1, 3d6!, 5d10t8. Напишите ? для шпаргалки')
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

export async function execute(interaction) {
    const raw = interaction.options.getString('expression').trim();
    const comment = interaction.options.getString('comment');
    const hidden = interaction.options.getBoolean('hidden') === true;

    if (['?', 'help', 'справка', '/?'].includes(raw.toLowerCase())) {
        return interaction.reply({
            embeds: [createInfoEmbed('🎲 Как бросать кубики', CHEATSHEET)],
            flags: MessageFlags.Ephemeral,
        });
    }

    const cooldown = checkGlobalCooldown(interaction.user.id);
    if (cooldown.onCooldown) {
        return interaction.reply({
            content: `⏱️ Подождите **${cooldown.remainingFormatted}** перед следующим броском.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const parsed = parseRollInput(raw);
    if (!parsed.ok) {
        // Привычка из UnbelievaBoat, где кубики и выбор из вариантов живут в
        // одной команде: вместо сухой ошибки парсера показываем нужную команду.
        const hint = looksLikeOptionList(raw)
            ? '\n\nПохоже, вы хотели выбрать случайный вариант из списка — это `/pick`.'
            : '\n\nШпаргалка по записи: `/roll expression:?`';
        return interaction.reply({
            embeds: [createErrorEmbed('Не понял бросок', `${parsed.error}${hint}`)],
            flags: MessageFlags.Ephemeral,
        });
    }

    const results = parsed.specs.map(spec => rollExpression(spec));
    const body = formatRollResult(results);
    const header = comment ? `**${comment}**\n` : '';

    await interaction.reply({
        embeds: [createInfoEmbed(`🎲 ${interaction.user.username} бросает`, `${header}${body}`)],
        ...(hidden ? { flags: MessageFlags.Ephemeral } : {}),
    });

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
