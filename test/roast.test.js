import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SELF_ROASTS,
    TARGET_ROASTS,
    BOT_ROASTS,
    PING_COMMENTS,
    generateRoastMessage,
    getCustomRoasts,
} from '../utils/roastData.js';
import { data, execute } from '../commands/roast.js';
import { MessageFlags } from 'discord.js';

test('roast database contains rich collection of roasts and ping comments', () => {
    assert.ok(SELF_ROASTS.length >= 40, `SELF_ROASTS must contain at least 40 roasts, got ${SELF_ROASTS.length}`);
    assert.ok(TARGET_ROASTS.length >= 20, `TARGET_ROASTS must contain at least 20 roasts, got ${TARGET_ROASTS.length}`);
    assert.ok(BOT_ROASTS.length >= 8, `BOT_ROASTS must contain at least 8 roasts, got ${BOT_ROASTS.length}`);
    assert.ok(PING_COMMENTS.length >= 5, `PING_COMMENTS must contain at least 5 comments, got ${PING_COMMENTS.length}`);

    // Verify self roasts include {ping} placeholder
    for (const roast of SELF_ROASTS) {
        assert.ok(roast.includes('{ping}'), `Self roast missing {ping}: "${roast}"`);
    }

    // Verify target roasts include {ping} and {caller} placeholders
    for (const roast of TARGET_ROASTS) {
        assert.ok(roast.includes('{ping}'), `Target roast missing {ping}: "${roast}"`);
        assert.ok(roast.includes('{caller}'), `Target roast missing {caller}: "${roast}"`);
    }

    // Verify bot roasts include {caller} placeholder
    for (const roast of BOT_ROASTS) {
        assert.ok(roast.includes('{caller}'), `Bot roast missing {caller}: "${roast}"`);
    }
});

test('generateRoastMessage correctly replaces placeholders for self, target, and bot', () => {
    const callerId = '111222333';
    const targetId = '444555666';
    const botId = '999888777';

    // 1. Self roast
    const selfMsg = generateRoastMessage({
        callerId,
        targetId: callerId,
        botId,
        pingMs: 45,
    });
    assert.ok(selfMsg.includes(`<@${callerId}>`), 'Self message must mention caller');
    assert.ok(selfMsg.includes('45мс'), 'Self message must include ping in ms');
    assert.ok(selfMsg.includes('ты че ебанулся'), 'Self message should feature authentic banter');

    // 2. Friend roast
    const targetMsg = generateRoastMessage({
        callerId,
        targetId,
        botId,
        pingMs: 30,
    });
    assert.ok(targetMsg.includes(`<@${targetId}>`), 'Target message must mention target');
    assert.ok(targetMsg.includes(`<@${callerId}>`), 'Target message must mention caller');
    assert.ok(targetMsg.includes('30мс'), 'Target message must include ping in ms');

    // 3. Bot roast
    const botMsg = generateRoastMessage({
        callerId,
        targetId: botId,
        botId,
        pingMs: 12,
    });
    assert.ok(botMsg.includes(`<@${callerId}>`), 'Bot roast must mention caller');
    assert.ok(botMsg.includes('12мс'), 'Bot message must include ping in ms');
});

test('generateRoastMessage supports custom extra roasts', () => {
    const callerId = '100';
    const customRoast = '{ping}, уникальная кастомная фраза 🦄';
    const message = generateRoastMessage({
        callerId,
        targetId: callerId,
        pingMs: 10,
        extraRoasts: [customRoast],
    });
    assert.ok(typeof message === 'string' && message.length > 0);
});

test('getCustomRoasts handles missing DB gracefully', async () => {
    const items = await getCustomRoasts();
    assert.ok(Array.isArray(items));
});

test('roast slash command schema has correct name, description and options', () => {
    const json = data.toJSON();
    assert.equal(json.name, 'roast');
    assert.ok(json.description.length > 0);

    const targetOpt = json.options.find(opt => opt.name === 'target');
    assert.ok(targetOpt, 'must have target option');
    assert.equal(targetOpt.type, 6, 'target must be USER option type 6');
    assert.equal(targetOpt.required, false);

    const hiddenOpt = json.options.find(opt => opt.name === 'hidden');
    assert.ok(hiddenOpt, 'must have hidden option');
    assert.equal(hiddenOpt.type, 5, 'hidden must be BOOLEAN option type 5');
    assert.equal(hiddenOpt.required, false);
});

test('roast execute sends reply with roast content', async () => {
    let replyArgs = null;
    const mockInteraction = {
        user: { id: '999111222', tag: 'Tester#0001' },
        guildId: '123456',
        channelId: '654321',
        client: {
            user: { id: 'bot123' },
            ws: { ping: 25 },
        },
        options: {
            getUser: () => null,
            getBoolean: (name) => name === 'hidden' ? false : null,
        },
        reply: async (args) => {
            replyArgs = args;
            return { id: 'msg123' };
        },
    };

    await execute(mockInteraction);

    assert.ok(replyArgs, 'interaction.reply must be called');
    assert.ok(typeof replyArgs.content === 'string');
    assert.ok(replyArgs.content.includes('<@999111222>'));
    assert.ok(replyArgs.content.includes('25мс'));
    assert.equal(replyArgs.flags, undefined);
});

test('roast execute with hidden=true sends ephemeral reply', async () => {
    let replyArgs = null;
    const mockInteraction = {
        user: { id: '999111333', tag: 'Tester#0002' },
        guildId: '123456',
        channelId: '654321',
        client: {
            user: { id: 'bot123' },
            ws: { ping: 35 },
        },
        options: {
            getUser: () => ({ id: '888777666', tag: 'Friend#0003' }),
            getBoolean: (name) => name === 'hidden' ? true : null,
        },
        reply: async (args) => {
            replyArgs = args;
            return { id: 'msg124' };
        },
    };

    await execute(mockInteraction);

    assert.ok(replyArgs, 'interaction.reply must be called');
    assert.ok(replyArgs.content.includes('<@888777666>'));
    assert.ok(replyArgs.content.includes('<@999111333>'));
    assert.equal(replyArgs.flags, MessageFlags.Ephemeral);
});
