import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { resolveImageTarget, requestPublicImage, MAX_IMAGE_BYTES } from '../utils/remoteImage.js';
import { isSafeRemoteImageUrl, isDiscordCdnUrl } from '../utils/avatarStorage.js';
import { createSessionAuthorization } from '../server/middlewares/sessionAuthorization.js';
import { calculateUserCapabilities } from '../services/permissionService.js';
import { isAdmin } from '../utils/adminCheck.js';
import { setDB } from '../utils/db.js';
import * as dm from '../utils/dataManager.js';
import { createMission, deliverMissionRewards } from '../utils/missionStore.js';
import { getUserCharacters, isCharacterOwner, normalizePlayer } from '../services/playerService.js';
import { createCharactersRouter } from '../server/routes/characters.js';
import { insertSession, claimSession, findSession, releaseSession, closeSession } from '../utils/interactionSessions.js';
import { execute as register } from '../commands/register.js';
import { purchaseShopItem } from '../utils/shopStore.js';
import { createAdminRouter } from '../server/routes/admin.js';

function fakeImageRequest(status, headers, chunks = []) {
    return (_url, options, callback) => {
        const request = new EventEmitter();
        request.destroy = () => {};
        request.end = () => {
            const response = Readable.from(chunks);
            Object.assign(response, { statusCode: status, statusMessage: 'test', headers });
            options.lookup('images.example', { all: true }, (error, addresses) => {
                assert.ifError(error);
                assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
            });
            callback(response);
        };
        return request;
    };
}

test('avatar SSRF: loopback spellings, private DNS answers and redirects are blocked', async () => {
    for (const url of ['http://localhost./x.png', 'http://127.1/x.png', 'http://2130706433/x.png',
        'http://[::1]/x.png', 'http://[::ffff:127.0.0.1]/x.png', 'http://169.254.169.254/x.png']) {
        assert.equal(isSafeRemoteImageUrl(url), false, url);
    }
    await assert.rejects(resolveImageTarget('https://images.example/a.png', async () => [
        { address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 },
    ]), /непубличную сеть/);
    await assert.rejects(requestPublicImage('https://images.example/a.png', {
        resolve: async () => [{ address: '8.8.8.8', family: 4 }],
        request: fakeImageRequest(302, { location: 'http://localhost./private.png' }),
    }), /небезопасный URL/);
    await assert.rejects(requestPublicImage('https://images.example/a.png', {
        resolve: async () => [{ address: '8.8.8.8', family: 4 }],
        request: fakeImageRequest(302, { location: 'http://[' }),
    }), /Invalid URL/);
    assert.equal(isDiscordCdnUrl('https://cdn.discordapp.com.attacker.example/attachments/1/2/x.png'), false);
});

test('avatar download pins the validated DNS result and stops oversized streams', async () => {
    let lookups = 0;
    const resolve = async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; };
    const response = await requestPublicImage('https://images.example/a.png', {
        resolve, request: fakeImageRequest(200, { 'content-type': 'image/png' }, [Buffer.from('test')]),
    });
    assert.equal(response.buffer.toString(), 'test');
    assert.equal(lookups, 1);
    await assert.rejects(requestPublicImage('https://images.example/a.png', {
        resolve, request: fakeImageRequest(200, {}, [Buffer.alloc(MAX_IMAGE_BYTES), Buffer.alloc(1)]),
    }), /лимит 8 МБ/);
});

test('revoked session roles cannot authorize a mutation; Discord failures fail closed', async () => {
    const old = process.env.ADMIN_ROLE_IDS;
    process.env.ADMIN_ROLE_IDS = 'debug-admin-role';
    try {
        const user = { id: 'debug-former-admin', roles: ['debug-admin-role'], is_admin: true,
            permissions: { isAdmin: true, isStaff: true }, authorization_checked_at: Date.now() };
        const req = { method: 'POST', session: { user } };
        let nextCalled = false;
        await createSessionAuthorization({ lookupMember: async () => ({ roles: [] }) })(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(calculateUserCapabilities(user).canManageEconomy, false);
        const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
        await createSessionAuthorization({ lookupMember: async () => { throw new Error('offline'); } })(req, res,
            () => assert.fail('Unverified request must not reach the route'));
        assert.equal(res.code, 503);
        assert.equal(user.is_admin, false);
        assert.equal(calculateUserCapabilities(user).canAccessAdmin, false);
        assert.equal(isAdmin({ id: 'debug-gm', roles: { cache: { some: fn => [{ id: 'unconfigured', name: 'Game Master' }].some(fn) } } }), false);
    } finally {
        if (old === undefined) delete process.env.ADMIN_ROLE_IDS; else process.env.ADMIN_ROLE_IDS = old;
    }
});

test('Lore Master can open Wiki administration without gaining private-character permissions', () => {
    const old = process.env.LORE_MASTER_ROLE_IDS;
    process.env.LORE_MASTER_ROLE_IDS = 'debug-lore-role';
    try {
        const caps = calculateUserCapabilities({ id: 'debug-lore', roles: ['debug-lore-role'] });
        assert.equal(caps.canAccessAdmin, true);
        assert.equal(caps.canManageWiki, true);
        assert.equal(caps.canViewInventories, false);
        assert.equal(caps.canManageEconomy, false);
    } finally {
        if (old === undefined) delete process.env.LORE_MASTER_ROLE_IDS; else process.env.LORE_MASTER_ROLE_IDS = old;
    }
});

test('logout remains available when Discord authorization is unavailable', async () => {
    let nextCalled = false;
    await createSessionAuthorization({ lookupMember: async () => assert.fail('Logout must not depend on Discord') })(
        { method: 'POST', path: '/auth/logout', session: { user: { id: 'debug-logout' } } }, {},
        () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});

test('economic and portal regressions on a real MongoDB replica set', { timeout: 120_000 }, async t => {
    const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const client = new MongoClient(server.getUri());
    await client.connect();
    const db = client.db('debug_regressions');
    setDB(db);
    try {
        for (const name of ['players', 'player_sp', 'inventory', 'operation_receipts', 'missions',
            'styles', 'progression_history', 'reputation_history', 'admin_actions', 'interaction_sessions']) {
            await db.createCollection(name);
        }
        await db.collection('players').createIndex({ id: 1 }, { unique: true });
        await db.collection('players').createIndex({ slug: 1 }, { unique: true, sparse: true });
        await db.collection('player_sp').createIndex({ player_id: 1, style_id: 1 }, { unique: true });
        await db.collection('inventory').createIndex({ player_id: 1, item_name: 1 }, { unique: true });

        await t.test('concurrent AP, SP and reputation awards preserve all increments', async () => {
            await dm.createPlayer('concurrent', 'test', 'Конкурент');
            await db.collection('styles').insertOne({ id: 1, name: 'Debug Style' });
            await db.collection('player_sp').insertOne({ player_id: 'concurrent', style_id: 1, sp: 0 });
            for (const award of [() => dm.addAP('concurrent', 1, 'debug', false),
                () => dm.addSP('concurrent', 1, 1, null, 'debug', false),
                () => dm.addReputation('concurrent', 1, 'debug')]) {
                const results = await Promise.all(Array.from({ length: 20 }, award));
                assert.ok(results.every(result => result !== false));
            }
            const player = await dm.getPlayer('concurrent');
            assert.equal(player.ap, 20);
            assert.equal(player.reputation, 40);
            assert.equal(await dm.getSP('concurrent', 1), 20);
        });

        await t.test('a retry after the final mission write fails does not duplicate any reward or change the winner', async () => {
            await dm.createPlayer('mission-player', 'test', 'Участник');
            await dm.giveStyle('mission-player', 'Debug Style', 0, 'system');
            const mission = await createMission({ guildId: 'guild', channelId: 'channel', title: 'Crash retry',
                access: 'open', maxPlayers: 2, createdBy: { user_id: 'gm', username: 'GM' },
                reward: { ap: 10, sp: 5, reputation: 3, krw: 100, yen: 20,
                    items: [{ item_name: 'Debug artifact', quantity: 1, distribution: 'random' }] } }, db);
            await db.collection('missions').updateOne({ public_id: mission.public_id }, { $set: {
                status: 'active', participants: [{ player_id: 'mission-player', user_id: 'owner', character_name: 'Участник' }],
            } });
            const original = db.collection;
            let fail = true;
            db.collection = function(name, ...args) {
                const collection = original.call(this, name, ...args);
                if (name !== 'missions') return collection;
                return new Proxy(collection, { get(target, key) {
                    if (key === 'findOneAndUpdate') return async (...params) => {
                        if (fail && params[1].$set?.status === 'completed') { fail = false; throw new Error('Simulated final mission write failure'); }
                        return target.findOneAndUpdate(...params);
                    };
                    const value = Reflect.get(target, key);
                    return typeof value === 'function' ? value.bind(target) : value;
                } });
            };
            try {
                await assert.rejects(deliverMissionRewards({ publicId: mission.public_id, actorId: 'gm', db }), /Simulated final/);
            } finally { db.collection = original; }
            const before = await dm.getPlayer('mission-player');
            const spBefore = await dm.getSP('mission-player', 1);
            // A second module instance has its own process-local mutex, like another worker.
            const worker = await import('../utils/missionStore.js?debug-worker=2');
            const results = await Promise.all([
                deliverMissionRewards({ publicId: mission.public_id, actorId: 'gm', db }),
                worker.deliverMissionRewards({ publicId: mission.public_id, actorId: 'gm', db }),
            ]);
            assert.ok(results.every(result => result.success));
            const after = await dm.getPlayer('mission-player');
            for (const field of ['ap', 'reputation', 'krw', 'yen']) assert.equal(after[field], before[field], field);
            assert.equal(await dm.getSP('mission-player', 1), spBefore);
            assert.equal((await db.collection('inventory').findOne({ player_id: 'mission-player', item_name: 'Debug artifact' })).qty, 1);
        });

        await t.test('currency and item transfers and item use replay their persisted result', async () => {
            await dm.createPlayer('sender', 'sender', 'Отправитель');
            await dm.createPlayer('recipient', 'recipient', 'Получатель');
            await dm.addCurrency('sender', 'krw', 1000, 'system');
            const first = await dm.transferCurrency('sender', 'recipient', 'krw', 100, 'debug-transfer');
            assert.equal(first.success, true);
            assert.deepEqual(await dm.transferCurrency('sender', 'recipient', 'krw', 100, 'debug-transfer'), first);
            assert.equal((await dm.getPlayer('sender')).krw, 900);
            assert.equal((await dm.getPlayer('recipient')).krw, 98);
            await dm.giveItem('sender', 'AP Tome (25)', 3, 'system');
            const item = await dm.transferItem('sender', 'recipient', 'AP Tome (25)', 1, 'debug-item-transfer');
            assert.equal(item.success, true);
            assert.deepEqual(await dm.transferItem('sender', 'recipient', 'AP Tome (25)', 1, 'debug-item-transfer'), item);
            const used = await dm.useItem('recipient', 'AP Tome (25)', 1, 'debug-use');
            assert.equal(used.success, true);
            assert.deepEqual(await dm.useItem('recipient', 'AP Tome (25)', 1, 'debug-use'), used);
            assert.equal((await dm.getPlayer('recipient')).ap, 25);
            assert.equal(await db.collection('inventory').findOne({ player_id: 'recipient', item_name: 'AP Tome (25)' }), null);
        });

        await t.test('SP cooldown and reward roll back together when delivery fails', async () => {
            const original = db.collection;
            db.collection = function(name, ...args) {
                const collection = original.call(this, name, ...args);
                if (name !== 'player_sp') return collection;
                return new Proxy(collection, { get(target, key) {
                    if (key === 'findOneAndUpdate') return async () => { throw new Error('Simulated SP write failure'); };
                    const value = Reflect.get(target, key);
                    return typeof value === 'function' ? value.bind(target) : value;
                } });
            };
            try { assert.equal((await dm.completeSPTraining('concurrent', 1, 10, 18_000_000)).success, false); }
            finally { db.collection = original; }
            assert.equal((await dm.getPlayer('concurrent')).last_sp_train_timestamp, 0);
            assert.equal(await dm.getSP('concurrent', 1), 20);
            const result = await dm.completeSPTraining('concurrent', 1, 10, 18_000_000);
            assert.equal(result.success, true);
            assert.equal(await dm.getSP('concurrent', 1), 30);
        });

        await t.test('expired session leases recover safely and stale workers cannot close a new claim', async () => {
            const sessions = db.collection('interaction_sessions');
            const created = await insertSession(sessions, { messageId: 'lease', namespace: 'pay', ownerId: 'sender' });
            const first = await claimSession(sessions, 'lease', created.session.revision);
            await sessions.updateOne({ message_id: 'lease' }, { $set: { lease_expires_at: new Date(0) } });
            const recovered = await findSession(sessions, 'lease');
            assert.equal(recovered.status, 'open');
            const second = await claimSession(sessions, 'lease', recovered.revision);
            assert.equal(await closeSession(sessions, 'lease', { claimToken: first.claim_token }), null);
            assert.equal(await releaseSession(sessions, 'lease', {}, { claimToken: first.claim_token }), null);
            assert.equal((await closeSession(sessions, 'lease', { claimToken: second.claim_token })).status, 'closed');
            await sessions.insertOne({ message_id: 'legacy-lease', status: 'working', revision: 1, updated_at: new Date(0) });
            assert.equal((await findSession(sessions, 'legacy-lease')).status, 'closed');
        });

        await t.test('a committed shop purchase is replayable after its catalog item disappears', async () => {
            await db.collection('shop_purchases').insertOne({ operation_id: 'archived-purchase',
                player_id: 'sender', user_id: 'sender', guild_id: 'guild', item_id: 'archived-item',
                item_name: 'Archived item', currency: 'yen', amount: 50, status: 'completed', balance_after: 900 });
            const parameters = { operationId: 'archived-purchase', playerId: 'sender', userId: 'sender',
                guildId: 'guild', itemId: 'archived-item', currency: 'yen' };
            const result = await purchaseShopItem(parameters);
            assert.equal(result.success, true);
            assert.equal(result.idempotent, true);
            assert.equal(result.price, 50);
            assert.equal((await purchaseShopItem({ ...parameters, userId: 'someone-else' })).success, false);
        });

        await t.test('standalone MongoDB rejects valuable operations without a partial debit', async () => {
            const standalone = await MongoMemoryServer.create();
            const standaloneClient = new MongoClient(standalone.getUri());
            await standaloneClient.connect();
            const standaloneDb = standaloneClient.db('standalone_regression');
            setDB(standaloneDb);
            try {
                await standaloneDb.collection('players').insertMany([
                    { id: 'source', krw: 1000, ap: 0 }, { id: 'target', krw: 0, ap: 0 },
                ]);
                await standaloneDb.collection('inventory').insertOne({ player_id: 'source', item_name: 'AP Tome (25)', qty: 1 });
                const transfer = await dm.transferCurrency('source', 'target', 'krw', 100, 'standalone-transfer');
                assert.equal(transfer.reason, 'transactions_required');
                const use = await dm.useItem('source', 'AP Tome (25)', 1, 'standalone-use');
                assert.equal(use.reason, 'transactions_required');
                assert.equal((await standaloneDb.collection('players').findOne({ id: 'source' })).krw, 1000);
                assert.equal((await standaloneDb.collection('inventory').findOne({ player_id: 'source' })).qty, 1);
            } finally {
                setDB(db);
                await standaloneClient.close();
                await standalone.stop();
            }
        });

        await t.test('new third-slot character links, private inventory and nested physical stats work together', async () => {
            const owner = '123456789012345678';
            await dm.createPlayer(owner, 'test', 'Третий персонаж', null, 3);
            const id = owner + '_3';
            await dm.giveItem(id, 'Portal artifact', 1, 'system');
            const physical = { punch_strength_kg: 120, lifting_strength_kg: 80, speed_kmh: 25, reaction_ms: 200, stamina_percent: 130 };
            assert.equal((await dm.registerPhysicalStats(id, physical, 'gm')).success, true);
            const characters = await getUserCharacters(owner);
            assert.equal(isCharacterOwner({ id: owner }, characters.slot3), true);
            assert.equal(characters.slot3.physical_stats.punch_kg, 120);
            assert.equal(characters.slot3.physical_stats.is_registered, true);
            assert.equal(normalizePlayer({ id, punch_strength_kg: 999, physical_stats: physical }).physical_stats.punch_kg, 120);
            const app = express();
            app.use((req, _res, next) => { req.session = { user: { id: owner, permissions: {} } }; next(); });
            app.use('/api/characters', createCharactersRouter());
            const http = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
            try {
                const base = `http://127.0.0.1:${http.address().port}/api/characters/${characters.slot3.slug}`;
                const profile = await fetch(base);
                assert.equal(profile.status, 200);
                assert.equal((await profile.json()).character.is_owner, true);
                assert.equal((await fetch(base + '/inventory')).status, 200);
            } finally { await new Promise(resolve => http.close(resolve)); }
        });

        await t.test('Wiki-only staff cannot read the audit log through the overview endpoint', async () => {
            const previous = process.env.LORE_MASTER_ROLE_IDS;
            process.env.LORE_MASTER_ROLE_IDS = 'debug-overview-lore';
            const app = express();
            app.use((req, _res, next) => {
                req.session = { user: { id: 'debug-overview-user', roles: ['debug-overview-lore'] } };
                next();
            });
            app.use('/api/admin', createAdminRouter(null));
            const http = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
            try {
                assert.ok(await db.collection('admin_actions').countDocuments() > 0);
                const response = await fetch(`http://127.0.0.1:${http.address().port}/api/admin/overview`);
                assert.equal(response.status, 200);
                assert.deepEqual((await response.json()).recentAudit, []);
            } finally {
                await new Promise(resolve => http.close(resolve));
                if (previous === undefined) delete process.env.LORE_MASTER_ROLE_IDS; else process.env.LORE_MASTER_ROLE_IDS = previous;
            }
        });

        await t.test('registration acknowledges the interaction before database work', async () => {
            let deferred = false;
            const original = db.collection;
            db.collection = function(name, ...args) {
                assert.equal(deferred, true, 'registration must defer before database operations');
                return original.call(this, name, ...args);
            };
            try {
                await register({ user: { id: 'register-regression', username: 'test' }, options: {
                    getString: name => name === 'character_name' ? 'Новый герой' : null,
                    getAttachment: () => null, getInteger: () => 1,
                }, async deferReply() { deferred = true; }, async editReply() { return {}; } });
            } finally { db.collection = original; }
            const player = await db.collection('players').findOne({ id: 'register-regression' });
            assert.ok(player.slug);
            assert.ok(player.public_id);
        });
    } finally {
        setDB(null);
        await client.close();
        await server.stop();
    }
});
