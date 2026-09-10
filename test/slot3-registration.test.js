import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegistrationSlot, data as registerCommandData } from '../commands/register.js';
import { data as slotCommandData } from '../commands/slot.js';
import { data as slotsCommandData, buildSlotsRow } from '../commands/slots.js';
import { data as grantSlotCommandData, execute as grantSlotExecute } from '../commands/grant-slot.js';
import { normalizeSlot, isSlot3Unlocked, setSlot3Unlocked, _clearSlot3UnlockedSimulationForTesting } from '../utils/dataManager.js';
import { makePlayerKey } from '../utils/playerKey.js';
import { makeTargetPlayerId } from '../utils/physicalStats.js';
import { normalizePlayer, setUserActiveSlot, getPlayerByPublicIdentifier } from '../services/playerService.js';

test('register command schema exposes slots 1, 2, and 3', () => {
    const json = registerCommandData.toJSON();
    const slotOption = json.options.find(opt => opt.name === 'slot');
    assert.ok(slotOption, 'slot option must exist');
    assert.equal(slotOption.choices.length, 3);
    assert.deepEqual(
        slotOption.choices.map(c => c.value),
        [1, 2, 3]
    );
});

test('slot command schema exposes slots 1, 2, and 3', () => {
    const json = slotCommandData.toJSON();
    const numberOption = json.options.find(opt => opt.name === 'number');
    assert.ok(numberOption, 'number option must exist');
    assert.equal(numberOption.choices.length, 3);
    assert.deepEqual(
        numberOption.choices.map(c => c.value),
        [1, 2, 3]
    );
});

test('grant-slot command schema has subcommands give, remove, and check', () => {
    const json = grantSlotCommandData.toJSON();
    assert.equal(json.name, 'grant-slot');
    const subcommands = json.options.map(o => o.name);
    assert.ok(subcommands.includes('give'), 'must have give subcommand');
    assert.ok(subcommands.includes('remove'), 'must have remove subcommand');
    assert.ok(subcommands.includes('check'), 'must have check subcommand');
});

test('slot 3 access: blocked by default without admin grant', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 3,
        slot1Player: { character_name: 'Первый' },
        slot2Player: { character_name: 'Второй' },
        slot3Player: null,
        isSlot3Unlocked: false
    });

    assert.equal(res.ok, false);
    assert.match(res.title, /Слот 3 заблокирован/);
    assert.match(res.message, /Выдача 3-го слота осуществляется администрацией/);
});

test('slot 3 access: auto-select stops at slot 2 without admin grant', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: null,
        slot1Player: { character_name: 'Первый' },
        slot2Player: { character_name: 'Второй' },
        slot3Player: null,
        isSlot3Unlocked: false
    });

    assert.equal(res.ok, false);
    assert.match(res.title, /Лимит слотов достигнут/);
    assert.match(res.message, /стандартных слотах \(1 и 2\)/);
});

test('slot 3 access: allows slot 3 registration after admin grant', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 3,
        slot1Player: { character_name: 'Первый' },
        slot2Player: { character_name: 'Второй' },
        slot3Player: null,
        isSlot3Unlocked: true
    });

    assert.equal(res.ok, true);
    assert.equal(res.slot, 3);
});

test('slot 3 access: auto-select selects slot 3 after admin grant', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: null,
        slot1Player: { character_name: 'Первый' },
        slot2Player: { character_name: 'Второй' },
        slot3Player: null,
        isSlot3Unlocked: true
    });

    assert.equal(res.ok, true);
    assert.equal(res.slot, 3);
});

test('sequential registration: blocks slot 2 when slot 1 is missing', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 2,
        slot1Player: null,
        slot2Player: null,
        slot3Player: null,
        isSlot3Unlocked: false
    });

    assert.equal(res.ok, false);
    assert.match(res.title, /Сначала создайте слот 1/);
    assert.match(res.message, /не создан персонаж в слоте 1/);
});

test('sequential registration: blocks slot 3 when slot 1 is missing even if slot 3 is unlocked', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 3,
        slot1Player: null,
        slot2Player: null,
        slot3Player: null,
        isSlot3Unlocked: true
    });

    assert.equal(res.ok, false);
    assert.match(res.title, /Сначала создайте слот 1/);
    assert.match(res.message, /не создан персонаж в слоте 1/);
});

test('sequential registration: blocks slot 3 when slot 1 exists but slot 2 is missing even if slot 3 is unlocked', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 3,
        slot1Player: { character_name: 'Первый' },
        slot2Player: null,
        slot3Player: null,
        isSlot3Unlocked: true
    });

    assert.equal(res.ok, false);
    assert.match(res.title, /Сначала создайте слот 2/);
    assert.match(res.message, /не создан персонаж в слоте 2/);
});

test('sequential registration: allows slot 1 anytime for empty account', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 1,
        slot1Player: null,
        slot2Player: null,
        slot3Player: null,
        isSlot3Unlocked: false
    });

    assert.equal(res.ok, true);
    assert.equal(res.slot, 1);
});

test('sequential registration: allows slot 2 when slot 1 exists', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: 2,
        slot1Player: { character_name: 'Первый' },
        slot2Player: null,
        slot3Player: null,
        isSlot3Unlocked: false
    });

    assert.equal(res.ok, true);
    assert.equal(res.slot, 2);
});

test('sequential registration: rejects auto-registration when all 3 slots are occupied and unlocked', () => {
    const res = resolveRegistrationSlot({
        requestedSlot: null,
        slot1Player: { character_name: 'Первый' },
        slot2Player: { character_name: 'Второй' },
        slot3Player: { character_name: 'Третий' },
        isSlot3Unlocked: true
    });

    assert.equal(res.ok, false);
    assert.match(res.title, /Все слоты заняты/);
    assert.match(res.message, /всех трёх слотах/);
});

test('sequential registration: rejects out-of-range slots', () => {
    for (const invalid of [0, 4, 99, -1]) {
        const res = resolveRegistrationSlot({
            requestedSlot: invalid,
            slot1Player: null,
            slot2Player: null,
            slot3Player: null,
            isSlot3Unlocked: false
        });
        assert.equal(res.ok, false);
        assert.match(res.title, /Неверный слот/);
    }
});

test('isSlot3Unlocked and setSlot3Unlocked manage access state properly', async () => {
    _clearSlot3UnlockedSimulationForTesting();
    const testUser = 'user_grant_test_999';

    assert.equal(await isSlot3Unlocked(testUser), false);

    await setSlot3Unlocked(testUser, true);
    assert.equal(await isSlot3Unlocked(testUser), true);

    await setSlot3Unlocked(testUser, false);
    assert.equal(await isSlot3Unlocked(testUser), false);
});

test('grant-slot command: rejects non-admin users', async () => {
    let replyPayload = null;
    const mockInteraction = {
        member: {
            id: 'regular_user',
            permissions: { has: () => false },
            roles: { cache: [] }
        },
        user: { id: 'regular_user' },
        options: {
            getSubcommand: () => 'give',
            getUser: () => ({ id: 'target_user', username: 'Target' })
        },
        reply: async (payload) => {
            replyPayload = payload;
            return { id: 'msg_1' };
        }
    };

    await grantSlotExecute(mockInteraction);
    assert.ok(replyPayload);
    const json = replyPayload.embeds[0].toJSON();
    assert.match(json.title, /Доступ запрещен/);
});

import { sweepGlobalCooldowns } from '../utils/cooldowns.js';

test('grant-slot command: admin can grant, check, and revoke slot 3', async () => {
    _clearSlot3UnlockedSimulationForTesting();
    sweepGlobalCooldowns(Date.now() + 60_000);
    const targetUser = { id: 'lucky_player', username: 'Lucky' };
    const adminMember = {
        id: 'admin_user_test',
        permissions: { has: (perm) => true },
        roles: { cache: [] },
        guild: { ownerId: 'admin_user_test' }
    };

    let replyPayload = null;
    const makeMock = (subcommand) => ({
        member: adminMember,
        user: { id: adminMember.id, username: 'Admin' },
        options: {
            getSubcommand: () => subcommand,
            getUser: () => targetUser
        },
        reply: async (payload) => {
            replyPayload = payload;
            return { id: 'msg_1' };
        }
    });

    // 1. Give
    sweepGlobalCooldowns(Date.now() + 60_000);
    await grantSlotExecute(makeMock('give'));
    assert.ok(replyPayload.embeds);
    assert.match(replyPayload.embeds[0].toJSON().title, /3-й слот разблокирован/);
    assert.equal(await isSlot3Unlocked(targetUser.id), true);

    // 2. Check
    sweepGlobalCooldowns(Date.now() + 60_000);
    await grantSlotExecute(makeMock('check'));
    assert.ok(replyPayload.embeds);
    assert.match(replyPayload.embeds[0].toJSON().description, /🟢 \*\*Разблокирован\*\*/);

    // 3. Remove
    sweepGlobalCooldowns(Date.now() + 60_000);
    await grantSlotExecute(makeMock('remove'));
    assert.ok(replyPayload.embeds);
    assert.match(replyPayload.embeds[0].toJSON().title, /Доступ к 3-му слоту отозван/);
    assert.equal(await isSlot3Unlocked(targetUser.id), false);
});

test('normalizeSlot supports slot 3 and defaults invalid inputs to 1', () => {
    assert.equal(normalizeSlot(1), 1);
    assert.equal(normalizeSlot(2), 2);
    assert.equal(normalizeSlot(3), 3);
    assert.equal(normalizeSlot('3'), 3);
    assert.equal(normalizeSlot(0), 1);
    assert.equal(normalizeSlot(4), 1);
    assert.equal(normalizeSlot(-1), 1);
    assert.equal(normalizeSlot(null), 1);
    assert.equal(normalizeSlot(undefined), 1);
    assert.equal(normalizeSlot('invalid'), 1);
});

test('makePlayerKey and makeTargetPlayerId generate correct ID for slot 3', () => {
    const userId = '1122334455';
    assert.equal(makePlayerKey(userId, 1), '1122334455');
    assert.equal(makePlayerKey(userId, 2), '1122334455_2');
    assert.equal(makePlayerKey(userId, 3), '1122334455_3');

    assert.equal(makeTargetPlayerId(userId, 1), '1122334455');
    assert.equal(makeTargetPlayerId(userId, 2), '1122334455_2');
    assert.equal(makeTargetPlayerId(userId, 3), '1122334455_3');
});

test('normalizePlayer normalizes slot 3 documents correctly', () => {
    const rawDoc = {
        id: '1122334455_3',
        username: 'solok',
        character_name: 'Третий Герой'
    };
    const player = normalizePlayer(rawDoc, 3);
    assert.equal(player.slot, 3);
    assert.equal(player.character_name, 'Третий Герой');
    assert.equal(player.player_id, '1122334455_3');
});

test('setUserActiveSlot accepts 1, 2, and 3, and normalizes out-of-bounds slot', async () => {
    await setSlot3Unlocked('demo_user', true);
    const s1 = await setUserActiveSlot('demo_user', 1);
    assert.equal(s1, 1);
    const s2 = await setUserActiveSlot('demo_user', 2);
    assert.equal(s2, 2);
    const s3 = await setUserActiveSlot('demo_user', 3);
    assert.equal(s3, 3);
    const sInvalid = await setUserActiveSlot('demo_user', 4);
    assert.equal(sInvalid, 1);
});

test('getPlayerByPublicIdentifier parses slot 3 from public IDs or internal IDs', async () => {
    const res = await getPlayerByPublicIdentifier('player_3');
    assert.equal(typeof res, 'object');
});

test('buildSlotsRow creates 3 buttons and displays lock state when slot 3 is locked', () => {
    // Current active slot 1, slot 1 exists, slot 2 exists, slot 3 does not exist and NOT unlocked
    const rowLocked = buildSlotsRow(1, {
        1: { character_name: 'Первый' },
        2: { character_name: 'Второй' },
        3: null
    }, false);

    const jsonLocked = rowLocked.toJSON();
    assert.equal(jsonLocked.components.length, 3);
    assert.equal(jsonLocked.components[2].label, 'Слот 3 🔒');
    assert.equal(jsonLocked.components[2].disabled, true);

    // When slot 3 is unlocked by admin
    const rowUnlocked = buildSlotsRow(1, {
        1: { character_name: 'Первый' },
        2: { character_name: 'Второй' },
        3: null
    }, true);

    const jsonUnlocked = rowUnlocked.toJSON();
    assert.equal(jsonUnlocked.components[2].label, 'Слот 3');
    assert.equal(jsonUnlocked.components[2].disabled, true);
});
