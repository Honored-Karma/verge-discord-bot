import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export const LOOTBOX_TITLE = '<:16arrow:1494708278297497660>  LUCKY LOOTBOX ';
export const LOOTBOX_COLOR = '#FF57EF';
export const PURPLE_DIVIDER = '<:18purple_line:1494708149951660042>'.repeat(22);

export const LOOTBOX_PRICE_LIST_URL = 'https://discord.com/channels/1426853129499967559/1456766947415953563';
export const LOOTBOX_PRICE_LIST_EMOJI = '<:38126donatorpurple:1456772668572434443>';

export const LOOTBOX_OUTCOMES = [
    {
        id: 'currency_500k',
        name: '500 000 Валюты',
        min: 1,
        max: 35,
        chance: 35,
        image: 'https://iili.io/BsvqeWl.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛА ВАЛЮТА!**\n' +
            '<:27arrow2:1497551297862176871> **Вы получаете дополнительную валюту  вашего региона! Попросите администрацию выдать  вам  её!**\n\n' +
            ' **<:17arrow:1494708207300509887> 500 000 Валюты!** \n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'currency_1m',
        name: '1 000 000 Валюты',
        min: 36,
        max: 40,
        chance: 5,
        image: 'https://iili.io/BsvqeWl.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛА ВАЛЮТА!**\n' +
            '<:27arrow2:1497551297862176871> **Вы получаете дополнительную валюту  вашего региона! Попросите администрацию выдать  вам  её!**\n\n' +
            ' **<:17arrow:1494708207300509887> 1  000 000 Валюты!** \n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'currency_2m',
        name: '2 000 000 Валюты',
        min: 41,
        max: 45,
        chance: 5,
        image: 'https://iili.io/BsvqeWl.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛА ВАЛЮТА!**\n' +
            '<:27arrow2:1497551297862176871> **Вы получаете дополнительную валюту  вашего региона! Попросите администрацию выдать  вам  её!**\n\n' +
            ' **<:17arrow:1494708207300509887> 2  000 000 Валюты!** \n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'gift_reroll',
        name: 'Перекрут одаренности',
        min: 46,
        max: 55,
        chance: 10,
        image: 'https://iili.io/BsvqlxR.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛ ПЕРЕКРУТ ОДАРЕННОСТИ!**\n' +
            '<:27arrow2:1497551297862176871> **Вы получаете возможность перекрутить одаренность своего персонажа!**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'lootbox_reroll',
        name: 'Реролл лутбокса',
        min: 56,
        max: 65,
        chance: 10,
        image: 'https://iili.io/BsvqlxR.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛ РЕРОЛЛ ЛУТБОКСА!**\n' +
            '<:27arrow2:1497551297862176871> **Попробуйте еще раз! Вам выпал повторный прокрут лутбокса.**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'ap_100',
        name: '100 AP',
        min: 66,
        max: 75,
        chance: 10,
        image: 'https://iili.io/BsvqUg9.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛИ AP!**\n' +
            '<:27arrow2:1497551297862176871> **Вы получаете 100 AP. Обратитесь к высшей администрации для выдачи AP.**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'sp_200',
        name: '200 SP',
        min: 76,
        max: 85,
        chance: 10,
        image: 'https://iili.io/BsvBvTJ.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ  ВЫПАЛИ SP!**\n' +
            '<:27arrow2:1497551297862176871> **Вы получаете 200 SP. Обратитесь к высшей администрации для выдачи SP.**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'custom_trait',
        name: 'Кастомный трейт',
        min: 86,
        max: 90,
        chance: 5,
        image: 'https://iili.io/BsvqMlt.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682>  ВАМ ВЫПАЛ КАСТОМНЫЙ ТРЕЙТ!**\n' +
            '<:27arrow2:1497551297862176871> **Вы можете прописать его, используя шаблон `!трейт`. После  этого обратитесь к администрации с целью его проверки. Помните, что он занимает слот.**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'trait_slot',
        name: 'Доп.слот трейта',
        min: 91,
        max: 94,
        chance: 4,
        image: 'https://iili.io/BsvqOx4.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛ ДОП.СЛОТ ТРЕЙТА**\n' +
            '<:27arrow2:1497551297862176871> **Вам повезло! Вам выпал дополнительный слот на трейт. Благодаря нему вы можете взять один дополнительный трейт поверх ограничения в своей анкете. Помните, что подобных слотов на одном персонаже может быть максимум четыре.**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'weak_artifact',
        name: 'Слабый артефакт',
        min: 95,
        max: 97,
        chance: 3,
        image: 'https://iili.io/Bsvq1iN.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛ СЛАБЫЙ АРТЕФАКТ**\n' +
            '<:27arrow2:1497551297862176871> **Вам  повезло! Ведь вы стали обладателем Слабого Артефакта, который обладает одной пассивной или активной способностью. Вы расписываете его сами используя шаблон `!артефакт`, а после отправки анкеты ожидаете вышестоящий персонал для его проверки.**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'medium_artifact',
        name: 'Средний артефакт',
        min: 98,
        max: 99,
        chance: 2,
        image: 'https://iili.io/BsvqVUX.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ ВЫПАЛ СРЕДНИЙ АРТЕФАКТ**\n' +
            '<:27arrow2:1497551297862176871> **Вам  повезло! Ведь вы стали обладателем Среднего Артефакта, который обладает двумя способностями, активными или пассивными по вашему желанию. Вы расписываете его сами используя шаблон `!артефакт`, а после отправки анкеты ожидаете вышестоящий персонал для его проверки..**\n\n\n ' +
            PURPLE_DIVIDER
    },
    {
        id: 'strong_artifact',
        name: 'Сильный артефакт',
        min: 100,
        max: 100,
        chance: 1,
        image: 'https://iili.io/BsvqGfI.png',
        description:
            '**# <:45lootbox:1499585857995411576> <:reply_line:1494725580959121682> ВАМ  ВЫПАЛ СИЛЬНЫЙ АРТЕФАКТ**\n' +
            '<:27arrow2:1497551297862176871> **Вам  повезло! Ведь вы стали обладателем __Сильного__ Артефакта, который обладает тремя способностями, активными или пассивными по вашему желанию. Вы расписываете его сами используя шаблон `!артефакт`, а после отправки анкеты ожидаете вышестоящий персонал для его проверки..**\n\n\n ' +
            PURPLE_DIVIDER
    }
];

/**
 * Получить исход рулетки по выпавшему числу (1..100)
 * @param {number} roll Число от 1 до 100
 */
export function getLootboxOutcome(roll) {
    const clamped = Math.max(1, Math.min(100, Math.floor(roll)));
    return LOOTBOX_OUTCOMES.find(outcome => clamped >= outcome.min && clamped <= outcome.max) || LOOTBOX_OUTCOMES[0];
}

/**
 * Сгенерировать случайный бросок 1..100
 */
export function rollLootboxNumber() {
    return Math.floor(Math.random() * 100) + 1;
}

/**
 * Создать кнопку Price List
 * @param {boolean} [includeEmoji=true] Включать ли кастомное эмодзи на кнопку
 */
export function createLootboxActionRow(includeEmoji = true) {
    const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(LOOTBOX_PRICE_LIST_URL)
        .setLabel('PRICE LIST');

    if (includeEmoji && LOOTBOX_PRICE_LIST_EMOJI) {
        button.setEmoji(LOOTBOX_PRICE_LIST_EMOJI);
    }

    return new ActionRowBuilder().addComponents(button);
}

/**
 * Создать Embed и ActionRow для ответа лутбокса
 * @param {number} [customRoll] Число (опционально, если нужно проверить конкретный исход)
 * @param {boolean} [includeEmoji=true] Включать ли кастомное эмодзи на кнопку
 */
export function createLootboxPayload(customRoll = null, includeEmoji = true) {
    const roll = Number.isInteger(customRoll) ? customRoll : rollLootboxNumber();
    const outcome = getLootboxOutcome(roll);

    const embed = new EmbedBuilder()
        .setTitle(LOOTBOX_TITLE)
        .setDescription(outcome.description)
        .setColor(LOOTBOX_COLOR)
        .setImage(outcome.image);

    const row = createLootboxActionRow(includeEmoji);

    return {
        roll,
        outcome,
        embed,
        components: [row]
    };
}
