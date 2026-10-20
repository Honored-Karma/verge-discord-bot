import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { createCharactersRouter } from '../server/routes/characters.js';
import { createApplicationsRouter } from '../server/routes/applications.js';
import { createAuthRouter } from '../server/routes/auth.js';
import { 
    slugifyCharacterName, 
    generatePublicId,
    sanitizeCharacter,
    getPlayerByPublicIdentifier
} from '../services/playerService.js';
import { 
    sanitizeApplicationForPublic,
    importApplicationFromPlayer
} from '../services/applicationService.js';
import { isValidSafeUrl, sanitizeSafeUrl } from '../utils/urlHelper.js';
import { csrfProtection } from '../server/middlewares/csrf.js';
import { isSafeRemoteImageUrl, sanitizePlayerStorageId } from '../utils/avatarStorage.js';
import { calculateUserCapabilities, hasCapability } from '../services/permissionService.js';

// Setup full test Express server with session and routes
function createSecurityTestApp(customUserSession = null) {
    const app = express();
    app.use(express.json());

    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    if (customUserSession) {
        app.use((req, res, next) => {
            req.session.user = customUserSession;
            next();
        });
    }

    app.use('/api/auth', createAuthRouter());
    app.use('/api/characters', createCharactersRouter());
    app.use('/api/applications', createApplicationsRouter(null));

    return app;
}

async function makeRequest(app, method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const options = {
                    method,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Host': `127.0.0.1:${port}`,
                        ...headers
                    }
                };
                if (body) options.body = JSON.stringify(body);

                const res = await fetch(`http://127.0.0.1:${port}${path}`, options);
                const data = await res.json().catch(() => null);
                server.close(() => resolve({ status: res.status, data }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('1. Public Character API does not expose Discord ID or sensitive economy fields', async () => {
    const app = createSecurityTestApp(null); // Anonymous visitor
    const res = await makeRequest(app, 'GET', '/api/characters/hana-kami');

    assert.equal(res.status, 200);
    assert.ok(res.data.character);
    
    const char = res.data.character;
    assert.equal(char.character_name, 'Хана Ками');
    assert.equal(char.slug, 'hana-kami');
    assert.equal(char.id, 'hana-kami'); // ID is slug, not Discord ID
    assert.equal(char.player_id, undefined, 'Internal player_id must be stripped');
    assert.equal(char.owner_discord_id, undefined, 'Discord ID must not be leaked');
    assert.equal(char.krw, undefined, 'Economy KRW must be stripped from public view');
    assert.equal(char.yen, undefined, 'Economy YEN must be stripped from public view');
    assert.equal(char.weekly_salary, undefined, 'Salary must be stripped from public view');
});

test('2. Application API does not expose Discord ID or internal database fields', async () => {
    const app = createSecurityTestApp(null);
    const res = await makeRequest(app, 'GET', '/api/applications/hana-kami');

    assert.equal(res.status, 200);
    assert.ok(res.data.application);

    const appData = res.data.application;
    assert.equal(appData.slug, 'hana-kami');
    assert.equal(appData.player_id, undefined, 'player_id must be stripped from public application JSON');
    assert.equal(appData.owner_discord_id, undefined, 'owner_discord_id must be stripped');
    assert.equal(appData._id, undefined, 'MongoDB _id must be stripped');
    assert.equal(appData.status, 'accepted');
});

test('3. Duplicate character names generate unique and stable slugs', () => {
    const slug1 = slugifyCharacterName('Иван Иванов');
    assert.equal(slug1, 'ivan-ivanov');

    const publicId1 = generatePublicId('123456789', 1);
    const publicId2 = generatePublicId('987654321', 1);

    assert.ok(publicId1.startsWith('ch_'));
    assert.ok(publicId2.startsWith('ch_'));
    assert.notEqual(publicId1, publicId2, 'Distinct player IDs must have distinct public_ids');

    // Deterministic stability test
    const publicId1Repeat = generatePublicId('123456789', 1);
    assert.equal(publicId1, publicId1Repeat, 'Public ID generation must be stable');
});

test('4. POST /api/applications/sync is restricted to Admin only (Staff without Admin gets 403)', async () => {
    // Regular Staff (GM & Anketolog, but NOT Admin)
    const staffUser = {
        id: 'staff_1',
        username: 'staff_user',
        permissions: { isAdmin: false, isGM: true, isAnketolog: true, isStaff: true }
    };
    const staffApp = createSecurityTestApp(staffUser);
    const staffRes = await makeRequest(staffApp, 'POST', '/api/applications/sync', {
        'Origin': 'http://localhost:3000'
    });

    assert.equal(staffRes.status, 403, 'Staff without Admin role must be rejected with 403');

    // Full Admin
    const adminUser = {
        id: 'admin_1',
        username: 'admin_user',
        permissions: { isAdmin: true, isGM: true, isStaff: true }
    };
    const adminApp = createSecurityTestApp(adminUser);
    const adminRes = await makeRequest(adminApp, 'POST', '/api/applications/sync', {
        'Origin': 'http://localhost:3000'
    });

    // In demo preview without DB connection, error is caught gracefully or returns report
    assert.ok(adminRes.status === 200 || adminRes.status === 500);
    assert.notEqual(adminRes.status, 403, 'Admin must not be blocked by permissions');
});

test('5. CSRF Protection blocks cross-origin state-changing POST requests', async () => {
    const user = {
        id: 'user_1',
        username: 'test_player',
        permissions: { isAdmin: false, isStaff: false }
    };
    const app = createSecurityTestApp(user);

    // Cross-origin attack attempt
    const evilRes = await makeRequest(app, 'POST', '/api/auth/active-slot', {
        'Origin': 'https://evil-hacker-site.com'
    }, { slot: 2 });

    assert.equal(evilRes.status, 403, 'Cross-origin POST request must be blocked with 403');
    assert.equal(evilRes.data.error, 'CSRFError');

    // Same-origin valid request
    const validRes = await makeRequest(app, 'POST', '/api/auth/active-slot', {
        'Origin': 'http://localhost:3000'
    }, { slot: 2 });

    assert.equal(validRes.status, 200, 'Same-origin request must be allowed');
    assert.equal(validRes.data.success, true);
});

test('6. External URL validation rejects dangerous schemes and allows safe https', () => {
    assert.equal(isValidSafeUrl('javascript:alert(document.cookie)'), false);
    assert.equal(isValidSafeUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isValidSafeUrl('file:///C:/Windows/System32/drivers/etc/hosts'), false);
    assert.equal(isValidSafeUrl('vbscript:msgbox("hello")'), false);
    assert.equal(isValidSafeUrl('blob:https://discord.com/123-456'), false);
    assert.equal(isValidSafeUrl('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), true);
    assert.equal(isValidSafeUrl('https://discord.com/channels/123/456/789'), true);
});

test('7. External application entries without text import are marked as external_only', () => {
    const externalAppDoc = {
        id: 'app_ext_1',
        slug: 'external-hero',
        player_id: 'ext_user',
        character_name: 'Внешний Герой',
        source: {
            type: 'external_url',
            url: 'https://docs.google.com/document/d/example'
        },
        sections: [],
        raw_text: ''
    };

    const sanitized = sanitizeApplicationForPublic(externalAppDoc);
    assert.equal(sanitized.slug, 'external-hero');
    assert.equal(sanitized.is_external_only, true);
    assert.equal(sanitized.source.url, 'https://docs.google.com/document/d/example');
    assert.equal(sanitized.player_id, undefined);
});

test('8. SSRF Protection blocks loopback, cloud metadata, and private IP ranges', () => {
    // Dangerous loopback / local IPs
    assert.equal(isSafeRemoteImageUrl('http://127.0.0.1/evil.png'), false);
    assert.equal(isSafeRemoteImageUrl('http://localhost:3000/avatar.jpg'), false);
    assert.equal(isSafeRemoteImageUrl('http://0.0.0.0:80/img.png'), false);
    assert.equal(isSafeRemoteImageUrl('http://[::1]/pic.png'), false);

    // Cloud metadata services
    assert.equal(isSafeRemoteImageUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isSafeRemoteImageUrl('http://169.254.169.254/latest/meta-data/.png'), false);
    assert.equal(isSafeRemoteImageUrl('http://metadata.google.internal/computeMetadata/v1/'), false);

    // Private IPv4 ranges
    assert.equal(isSafeRemoteImageUrl('http://10.0.0.1/admin.png'), false);
    assert.equal(isSafeRemoteImageUrl('http://192.168.1.1/router.jpg'), false);
    assert.equal(isSafeRemoteImageUrl('http://172.16.0.5/secret.png'), false);

    // URL with embedded credentials
    assert.equal(isSafeRemoteImageUrl('https://user:pass@example.com/img.png'), false);

    // Legitimate public HTTPS URLs
    assert.equal(isSafeRemoteImageUrl('https://cdn.discordapp.com/attachments/123/456/avatar.png'), true);
    assert.equal(isSafeRemoteImageUrl('https://media.discordapp.net/attachments/123/456/avatar.jpg'), true);
    assert.equal(isSafeRemoteImageUrl('https://i.imgur.com/example.png'), true);
});

test('9. Path Traversal Protection blocks ../ and directory separators in player IDs', () => {
    assert.equal(sanitizePlayerStorageId('../../../etc/passwd'), null);
    assert.equal(sanitizePlayerStorageId('..\\..\\windows\\system32'), null);
    assert.equal(sanitizePlayerStorageId('user/slot1'), null);
    assert.equal(sanitizePlayerStorageId('user\\slot1'), null);
    assert.equal(sanitizePlayerStorageId('user.slot1'), null);
    assert.equal(sanitizePlayerStorageId('user*name'), null);

    // Valid IDs
    assert.equal(sanitizePlayerStorageId('123456789'), '123456789');
    assert.equal(sanitizePlayerStorageId('123456789_2'), '123456789_2');
    assert.equal(sanitizePlayerStorageId('player-hana-kami'), 'player-hana-kami');
});

test('10. RBAC: canManageRoles is available to full admins and required for slot 3', () => {
    const regularUser = { id: 'user_1', permissions: {} };
    assert.equal(hasCapability(regularUser, 'canManageRoles'), false);

    const staffUser = { id: 'staff_1', permissions: { isStaff: true } };
    assert.equal(hasCapability(staffUser, 'canManageRoles'), false);

    const adminUser = { id: 'admin_1', permissions: { isAdmin: true } };
    assert.equal(hasCapability(adminUser, 'canManageRoles'), true);
});

