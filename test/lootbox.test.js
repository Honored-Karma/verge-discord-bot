import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getLootboxOutcome,
    rollLootboxNumber,
    createLootboxPayload,
    LOOTBOX_OUTCOMES,
    LOOTBOX_TITLE,
    LOOTBOX_COLOR,
    LOOTBOX_PRICE_LIST_URL,
    LOOTBOX_PRICE_LIST_EMOJI,
    PURPLE_DIVIDER
} from '../utils/lootbox.js';

test('lootbox outcomes probability table spans 1 to 100 with total 100%', () => {
    assert.equal(LOOTBOX_OUTCOMES.length, 12);

    let totalChance = 0;
    for (let roll = 1; roll <= 100; roll++) {
        const outcome = getLootboxOutcome(roll);
        assert.ok(outcome, `Roll ${roll} should have a matching outcome`);
        assert.ok(roll >= outcome.min && roll <= outcome.max, `Roll ${roll} within bounds [${outcome.min}, ${outcome.max}]`);
    }

    for (const outcome of LOOTBOX_OUTCOMES) {
        totalChance += outcome.chance;
        assert.equal(outcome.max - outcome.min + 1, outcome.chance, `Outcome ${outcome.name} chance matches range length`);
        assert.ok(outcome.image.startsWith('https://'), `Outcome ${outcome.name} has valid image URL`);
        assert.ok(outcome.description.includes(PURPLE_DIVIDER), `Outcome ${outcome.name} contains divider`);
    }

    assert.equal(totalChance, 100);
});

test('boundary rolls map to precise prizes from Twig specifications', () => {
    // 1..35: 500k currency
    assert.equal(getLootboxOutcome(1).id, 'currency_500k');
    assert.equal(getLootboxOutcome(35).id, 'currency_500k');

    // 36..40: 1m currency
    assert.equal(getLootboxOutcome(36).id, 'currency_1m');
    assert.equal(getLootboxOutcome(40).id, 'currency_1m');

    // 41..45: 2m currency
    assert.equal(getLootboxOutcome(41).id, 'currency_2m');
    assert.equal(getLootboxOutcome(45).id, 'currency_2m');

    // 46..55: gift reroll
    assert.equal(getLootboxOutcome(46).id, 'gift_reroll');
    assert.equal(getLootboxOutcome(55).id, 'gift_reroll');

    // 56..65: lootbox reroll
    assert.equal(getLootboxOutcome(56).id, 'lootbox_reroll');
    assert.equal(getLootboxOutcome(65).id, 'lootbox_reroll');

    // 66..75: 100 AP
    assert.equal(getLootboxOutcome(66).id, 'ap_100');
    assert.equal(getLootboxOutcome(75).id, 'ap_100');

    // 76..85: 200 SP
    assert.equal(getLootboxOutcome(76).id, 'sp_200');
    assert.equal(getLootboxOutcome(85).id, 'sp_200');

    // 86..90: custom trait
    assert.equal(getLootboxOutcome(86).id, 'custom_trait');
    assert.equal(getLootboxOutcome(90).id, 'custom_trait');

    // 91..94: extra trait slot
    assert.equal(getLootboxOutcome(91).id, 'trait_slot');
    assert.equal(getLootboxOutcome(94).id, 'trait_slot');

    // 95..97: weak artifact
    assert.equal(getLootboxOutcome(95).id, 'weak_artifact');
    assert.equal(getLootboxOutcome(97).id, 'weak_artifact');

    // 98..99: medium artifact
    assert.equal(getLootboxOutcome(98).id, 'medium_artifact');
    assert.equal(getLootboxOutcome(99).id, 'medium_artifact');

    // 100: strong artifact
    assert.equal(getLootboxOutcome(100).id, 'strong_artifact');
});

test('createLootboxPayload constructs faithful Embed and Button', () => {
    const payload = createLootboxPayload(100);

    assert.equal(payload.roll, 100);
    assert.equal(payload.outcome.id, 'strong_artifact');

    const embedJson = payload.embed.toJSON();
    assert.equal(embedJson.title, LOOTBOX_TITLE);
    assert.equal(embedJson.color, 16734191); // 0xFF57EF
    assert.equal(embedJson.image.url, 'https://iili.io/BsvqGfI.png');
    assert.ok(embedJson.description.includes('ВАМ  ВЫПАЛ СИЛЬНЫЙ АРТЕФАКТ'));

    assert.equal(payload.components.length, 1);
    const rowJson = payload.components[0].toJSON();
    assert.equal(rowJson.type, 1); // ActionRow
    assert.equal(rowJson.components.length, 1);

    const button = rowJson.components[0];
    assert.equal(button.type, 2); // Button
    assert.equal(button.style, 5); // Link
    assert.equal(button.label, 'PRICE LIST');
    assert.equal(button.url, LOOTBOX_PRICE_LIST_URL);
    assert.equal(button.emoji.id, '1456772668572434443');
    assert.equal(button.emoji.name, '38126donatorpurple');
});

test('rollLootboxNumber returns numbers within 1..100', () => {
    for (let i = 0; i < 200; i++) {
        const num = rollLootboxNumber();
        assert.ok(Number.isInteger(num));
        assert.ok(num >= 1 && num <= 100);
    }
});

test('createLootboxPayload supports fallback without custom emoji', () => {
    const payload = createLootboxPayload(50, false);
    assert.equal(payload.components.length, 1);

    const button = payload.components[0].toJSON().components[0];
    assert.equal(button.label, 'PRICE LIST');
    assert.equal(button.url, LOOTBOX_PRICE_LIST_URL);
    assert.equal(button.emoji, undefined);
});
