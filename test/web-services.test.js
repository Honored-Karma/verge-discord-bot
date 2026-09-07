import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayer } from '../services/playerService.js';
import { resolveUserPermissions, getOAuthConfig } from '../services/authService.js';

test('normalizePlayer properly normalizes raw MongoDB player doc', () => {
    const rawDoc = {
        id: '123456789',
        username: 'solok',
        character_name: 'Хана Ками',
        character_avatar: 'https://example.com/avatar.png',
        attribute_name: 'Ангел',
        krw: 5000000,
        yen: 120000,
        ap: 1050,
        organization: 'TENRYU',
        rank: 'S',
        punch_strength_kg: 13200,
        lifting_strength_kg: 800,
        speed_kmh: 570,
        stamina_percent: 200,
        reaction_ms: 15,
        reputation: 1550
    };

    const player = normalizePlayer(rawDoc, 1);

    assert.equal(player.player_id, '123456789');
    assert.equal(player.slug, 'khana-kami');
    assert.ok(player.public_id.startsWith('ch_'));
    assert.equal(player.slot, 1);
    assert.equal(player.character_name, 'Хана Ками');
    assert.equal(player.attribute_name, 'Ангел');
    assert.equal(player.has_attribute, true);
    assert.equal(player.ap, 1050);
    assert.equal(player.organization, 'TENRYU');
    assert.equal(player.rank, 'S');
    assert.equal(player.reputation, 1550);
    assert.equal(player.reputation_tier.name, 'Городская известность');

    // Physical stats & derived durability (3x punch)
    assert.equal(player.physical_stats.punch_kg, 13200);
    assert.equal(player.physical_stats.durability_kg, 39600); // 13200 * 3
    assert.equal(player.physical_stats.stamina_percent, 200);
    assert.equal(player.physical_stats.reaction_ms, 15);
    assert.equal(player.physical_stats.is_registered, true);

    // Weekly salary calculation
    assert.ok(player.weekly_salary);
    assert.equal(player.weekly_salary.currency, 'yen');
    assert.equal(player.weekly_salary.amount, 475000); // 1900000 / 4
});

test('normalizePlayer provides safe defaults when fields are missing', () => {
    const rawDoc = {
        id: '999999_2',
        username: 'novice_player'
    };

    const player = normalizePlayer(rawDoc, 2);

    assert.equal(player.player_id, '999999_2');
    assert.equal(player.slug, 'character');
    assert.ok(player.public_id.startsWith('ch_'));
    assert.equal(player.slot, 2);
    assert.equal(player.character_name, 'Безымянный персонаж');
    assert.equal(player.has_attribute, false);
    assert.equal(player.ap, 0);
    assert.equal(player.krw, 0);
    assert.equal(player.yen, 0);
    assert.equal(player.reputation, 20);
    assert.equal(player.reputation_tier.name, 'Начальный уровень');
    assert.equal(player.physical_stats.is_registered, false);
    assert.equal(player.weekly_salary, null);
});

test('resolveUserPermissions correctly detects staff and admin roles', () => {
    process.env.ADMIN_IDS = 'admin_user_1,admin_user_2';
    process.env.ADMIN_ROLE_IDS = 'role_admin';
    process.env.GM_ROLE_IDS = 'role_gm';
    process.env.ANKETOLOG_ROLE_IDS = 'role_anketolog';

    // 1. Full admin by ID
    const permsAdmin = resolveUserPermissions('admin_user_1', null);
    assert.equal(permsAdmin.isAdmin, true);
    assert.equal(permsAdmin.isGM, true);
    assert.equal(permsAdmin.isStaff, true);

    // 2. GM by role
    const permsGm = resolveUserPermissions('regular_user', { roles: ['role_gm', 'role_player'] });
    assert.equal(permsGm.isAdmin, false);
    assert.equal(permsGm.isGM, true);
    assert.equal(permsGm.isStaff, true);

    // 3. Regular player
    const permsPlayer = resolveUserPermissions('player_3', { roles: ['role_player'] });
    assert.equal(permsPlayer.isAdmin, false);
    assert.equal(permsPlayer.isGM, false);
    assert.equal(permsPlayer.isAnketolog, false);
    assert.equal(permsPlayer.isStaff, false);
    assert.equal(permsPlayer.isMemberOfGuild, true);
});
