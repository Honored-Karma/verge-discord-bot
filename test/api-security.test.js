import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { createCharactersRouter } from '../server/routes/characters.js';
import { createAuthRouter } from '../server/routes/auth.js';
import { createHealthRouter } from '../server/routes/health.js';
import { requireAuth, requireStaff, requireAdmin } from '../server/middlewares/auth.js';
import { isCharacterOwner, sanitizeCharacter } from '../services/playerService.js';

// Helper to create test express app with customizable session injector
function createTestApp(sessionData = null) {
    const app = express();
    app.use(express.json());
    
    // Inject session for tests
    app.use((req, res, next) => {
        req.session = sessionData ? { ...sessionData, destroy: (cb) => cb?.(), save: (cb) => cb?.() } : {};
        next();
    });

    app.use('/api/health', createHealthRouter({ isReady: () => true, user: { tag: 'TestBot#0001' } }));
    app.use('/api/auth', createAuthRouter());
    app.use('/api/characters', createCharactersRouter());

    // Test routes for permission middlewares
    app.get('/api/test/protected', requireAuth, (req, res) => res.json({ ok: true }));
    app.get('/api/test/staff-only', requireStaff, (req, res) => res.json({ ok: true }));
    app.get('/api/test/admin-only', requireAdmin, (req, res) => res.json({ ok: true }));

    return app;
}

// Simple request helper using listen(0)
async function makeRequest(app, method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const url = `http://127.0.0.1:${port}${path}`;
                const options = {
                    method,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Origin': 'http://localhost:3000',
                        ...headers
                    }
                };
                if (body) {
                    options.body = JSON.stringify(body);
                }
                const res = await fetch(url, options);
                const data = await res.json().catch(() => null);
                server.close(() => resolve({ status: res.status, data }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('GET /api/characters/me returns 401 when not authenticated', async () => {
    const app = createTestApp(null);
    const res = await makeRequest(app, 'GET', '/api/characters/me');
    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'Unauthorized');
});

test('GET /api/characters/:id/inventory returns 401 for unauthenticated requests', async () => {
    const app = createTestApp(null);
    const res = await makeRequest(app, 'GET', '/api/characters/hana-kami/inventory');
    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'Unauthorized');
});

test('GET /api/characters/:id/inventory returns 403 when requesting someone else inventory', async () => {
    // Session is user 999999, trying to view character hana-kami
    const app = createTestApp({
        user: {
            id: '999999',
            username: 'stranger',
            permissions: { isStaff: false, isAdmin: false }
        }
    });

    const res = await makeRequest(app, 'GET', '/api/characters/hana-kami/inventory');
    assert.equal(res.status, 403);
    assert.equal(res.data.error, 'Forbidden');
    assert.match(res.data.message, /приватным/i);
});

test('POST /api/auth/active-slot returns 400 on invalid slot numbers', async () => {
    const app = createTestApp({
        user: { id: '123456789', username: 'tester' }
    });

    const res1 = await makeRequest(app, 'POST', '/api/auth/active-slot', { slot: 4 });
    assert.equal(res1.status, 400);
    assert.equal(res1.data.error, 'InvalidSlot');

    const res2 = await makeRequest(app, 'POST', '/api/auth/active-slot', { slot: 'invalid' });
    assert.equal(res2.status, 400);
});

test('POST /api/auth/logout terminates session and clears cookie', async () => {
    const app = createTestApp({
        user: { id: '123456789', username: 'tester' }
    });

    const res = await makeRequest(app, 'POST', '/api/auth/logout');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
});

test('requireStaff middleware blocks regular players and allows staff', async () => {
    const regularApp = createTestApp({
        user: { id: 'user_1', permissions: { isStaff: false, isAdmin: false } }
    });
    const resBlocked = await makeRequest(regularApp, 'GET', '/api/test/staff-only');
    assert.equal(resBlocked.status, 403);

    const staffApp = createTestApp({
        user: { id: 'staff_1', permissions: { isStaff: true, isAdmin: false } }
    });
    const resAllowed = await makeRequest(staffApp, 'GET', '/api/test/staff-only');
    assert.equal(resAllowed.status, 200);
    assert.equal(resAllowed.data.ok, true);
});

test('requireAdmin middleware blocks staff who are not full admins', async () => {
    const staffApp = createTestApp({
        user: { id: 'gm_1', permissions: { isStaff: true, isAdmin: false } }
    });
    const resBlocked = await makeRequest(staffApp, 'GET', '/api/test/admin-only');
    assert.equal(resBlocked.status, 403);

    const adminApp = createTestApp({
        user: { id: 'admin_1', permissions: { isStaff: true, isAdmin: true } }
    });
    const resAllowed = await makeRequest(adminApp, 'GET', '/api/test/admin-only');
    assert.equal(resAllowed.status, 200);
    assert.equal(resAllowed.data.ok, true);
});

test('isCharacterOwner accurately detects ownership across slots 1 and 2', () => {
    const sessionUser = { id: '555111' };

    assert.equal(isCharacterOwner(sessionUser, '555111'), true); // Slot 1
    assert.equal(isCharacterOwner(sessionUser, '555111_2'), true); // Slot 2
    assert.equal(isCharacterOwner(sessionUser, '555111_3'), false);
    assert.equal(isCharacterOwner(sessionUser, '999999'), false);
    assert.equal(isCharacterOwner(null, '555111'), false);
});

test('sanitizeCharacter strips sensitive economy data from public views', () => {
    const fullCharacter = {
        id: '123456',
        public_id: 'ch_aonami',
        slug: 'aonami',
        slot: 1,
        character_name: 'Аонами',
        character_avatar: 'avatar.png',
        character_url: 'https://example.com/sheet',
        attribute_name: 'Хищник',
        has_attribute: true,
        ap: 120,
        krw: 47000000,
        yen: 5000000,
        weekly_salary: { currency: 'yen', amount: 450000 },
        salary_multiplier: 150,
        ap_multiplier: 120,
        sp_multiplier: 100,
        reputation: 420,
        reputation_tier: { name: 'Квартальный уровень' },
        physical_stats: { punch_kg: 800, durability_kg: 2400 },
        cooldowns: { last_train: 1700000000 },
        styles: [{ name: 'Кровавое Тхэквондо', sp: 350, rank: 'Владелец' }],
        total_sp: 350
    };

    // Public view
    const publicView = sanitizeCharacter(fullCharacter, false, false);
    assert.equal(publicView.character_name, 'Аонами');
    assert.equal(publicView.slug, 'aonami');
    assert.equal(publicView.id, 'aonami');
    assert.equal(publicView.attribute_name, 'Хищник');
    assert.equal(publicView.is_owner, false);
    assert.equal(publicView.krw, undefined, 'KRW balance must not be in public view');
    assert.equal(publicView.yen, undefined, 'YEN balance must not be in public view');
    assert.equal(publicView.weekly_salary, undefined, 'Salary must not be in public view');
    assert.equal(publicView.cooldowns, undefined, 'Cooldowns must not be in public view');
    assert.equal(publicView.salary_multiplier, undefined);

    // Owner view
    const ownerView = sanitizeCharacter(fullCharacter, true, false);
    assert.equal(ownerView.is_owner, true);
    assert.equal(ownerView.krw, 47000000);
    assert.equal(ownerView.yen, 5000000);
    assert.equal(ownerView.weekly_salary.amount, 450000);
    assert.ok(ownerView.cooldowns);
});
