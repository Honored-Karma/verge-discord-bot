import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { createAdminRouter } from '../server/routes/admin.js';
import { createWikiRouter } from '../server/routes/wiki.js';
import { calculateUserCapabilities } from '../services/permissionService.js';
import { logAdminAction, getAuditLogs } from '../services/auditService.js';
import { sanitizeImageUrl } from '../server/middlewares/metaInjector.js';

function createAdminTestApp(mockUser = null) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'admin-test-secret',
        resave: false,
        saveUninitialized: true
    }));

    // Inject session user
    app.use((req, res, next) => {
        if (mockUser) {
            req.session.user = mockUser;
        }
        next();
    });

    app.use('/api/admin', createAdminRouter(null));
    app.use('/api/wiki', createWikiRouter());
    return app;
}

async function makeRequest(app, method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const reqOptions = {
                    method,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        ...headers
                    }
                };
                if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                    reqOptions.body = JSON.stringify(body);
                }
                const res = await fetch(`http://127.0.0.1:${port}${path}`, reqOptions);
                const data = await res.json().catch(() => null);
                server.close(() => resolve({ status: res.status, data }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('1. Unauthenticated request to /api/admin returns 401', async () => {
    const app = createAdminTestApp(null);
    const res = await makeRequest(app, 'GET', '/api/admin/overview');

    assert.equal(res.status, 401);
});

test('2. Regular player without staff permissions gets 403 on /api/admin', async () => {
    const regularUser = {
        id: '123456789012345678',
        username: 'regular_player',
        roles: [],
        permissions: { isStaff: false, isAdmin: false }
    };
    const app = createAdminTestApp(regularUser);
    const res = await makeRequest(app, 'GET', '/api/admin/overview');

    assert.equal(res.status, 403);
});

test('3. Permission calculation grants granular capabilities according to roles', () => {
    const regular = calculateUserCapabilities({ id: '123', roles: [] });
    assert.equal(regular.canAccessAdmin, false);
    assert.equal(regular.canManageWiki, false);
    assert.equal(regular.canManageEconomy, false);

    const anketolog = calculateUserCapabilities({ id: '456', roles: [], is_staff: true, permissions: { isStaff: true } });
    assert.equal(anketolog.canAccessAdmin, true);

    const admin = calculateUserCapabilities({ id: '789', roles: [], is_admin: true, permissions: { isAdmin: true } });
    assert.equal(admin.canAccessAdmin, true);
    assert.equal(admin.canManageWiki, true);
    assert.equal(admin.canManageApplications, true);
    assert.equal(admin.canManageCharacters, true);
    assert.equal(admin.canManageEconomy, true);
    assert.equal(admin.canViewAuditLog, true);
});

test('4. Admin can create a Wiki draft and public API blocks it until published', async () => {
    const adminUser = {
        id: '999999999999999999',
        username: 'head_admin',
        is_admin: true
    };
    const app = createAdminTestApp(adminUser);

    // Create Draft
    const draftPayload = {
        title: 'Секретный эксперимент в Гинзе',
        slug: 'secret-ginza-experiment',
        category: 'phenomena',
        summary: 'Черновик исследования квантовых аномалий.',
        content: '### Засекреченный протокол\nДанные находятся в разработке.',
        tags: ['Черновик', 'Эксперимент']
    };

    const resCreate = await makeRequest(app, 'POST', '/api/admin/wiki', draftPayload);
    assert.equal(resCreate.status, 201);
    assert.equal(resCreate.data.article.status, 'draft');
    assert.equal(resCreate.data.article.origin, 'manual');

    // Verify public API returns 404 for draft
    const resPublic = await makeRequest(app, 'GET', '/api/wiki/articles/secret-ginza-experiment');
    assert.equal(resPublic.status, 404);
});

test('5. Invalid Wiki inputs (bad slug, invalid category, Mongo operator injection) are rejected', async () => {
    const adminUser = { id: 'admin1', username: 'admin1', is_admin: true };
    const app = createAdminTestApp(adminUser);

    // Invalid category
    const badCatRes = await makeRequest(app, 'POST', '/api/admin/wiki', {
        title: 'Статья',
        slug: 'valid-slug',
        category: 'non-existent-cat'
    });
    assert.equal(badCatRes.status, 400);

    // Too short title
    const shortTitleRes = await makeRequest(app, 'POST', '/api/admin/wiki', {
        title: 'A',
        slug: 'valid-slug',
        category: 'world'
    });
    assert.equal(shortTitleRes.status, 400);
});

test('6. Audit log records admin mutations without secrets', async () => {
    const log = await logAdminAction({
        actor: { id: 'admin123', username: 'alex', global_name: 'Alex Leader' },
        action: 'wiki_publish',
        entity_type: 'wiki_article',
        entity_id: 'test-article',
        details: 'Опубликована статья'
    });

    assert.ok(log);
    assert.equal(log.actor.discord_id, 'admin123');
    assert.equal(log.action, 'wiki_publish');
    assert.equal(log.source, 'web_admin');
    assert.equal(log.token, undefined);
    assert.equal(log.session, undefined);
});

test('7. Optimistic concurrency check detects conflicting timestamps', async () => {
    const adminUser = { id: 'admin1', username: 'admin1', is_admin: true };
    const app = createAdminTestApp(adminUser);

    // Try patching with an outdated expected timestamp
    const resConflict = await makeRequest(app, 'PATCH', '/api/admin/wiki/boreholes', {
        title: 'Обновленные Скважины',
        expected_updated_at: '2020-01-01T00:00:00.000Z'
    });

    assert.equal(resConflict.status, 409);
    assert.equal(resConflict.data.error, 'Conflict');
});

test('8. sanitizeImageUrl rejects Unsplash placeholders and invalid schemes', () => {
    assert.equal(sanitizeImageUrl('https://images.unsplash.com/photo-12345'), null);
    assert.equal(sanitizeImageUrl('https://via.placeholder.com/150'), null);
    assert.equal(sanitizeImageUrl('https://cdn.discordapp.com/avatars/123/abc.png'), 'https://cdn.discordapp.com/avatars/123/abc.png');
});
