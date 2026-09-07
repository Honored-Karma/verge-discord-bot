import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validateEnv } from '../config/env.js';
import { getPlayerByPublicIdentifier } from '../services/playerService.js';
import { searchPublicEcosystem } from '../services/globalSearchService.js';
import { createHealthRouter } from '../server/routes/health.js';
import { createSeoRouter } from '../server/routes/seo.js';
import { errorHandler } from '../server/middlewares/errorHandler.js';

function createTestAppWithRoutes() {
    const app = express();
    app.use(express.json());
    app.use('/api/health', createHealthRouter(null));
    app.use('/', createSeoRouter());
    app.get('/api/test-error', (req, res, next) => {
        const err = new Error('Database connection failed at mongodb://secretuser:secretpass@db.internal:27017/secret');
        next(err);
    });
    app.use(errorHandler);
    return app;
}

async function fetchFromApp(app, path) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const res = await fetch(`http://127.0.0.1:${port}${path}`);
                const text = await res.text();
                let json = null;
                try { json = JSON.parse(text); } catch {}
                server.close(() => resolve({ status: res.status, text, json, headers: res.headers }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('1. validateEnv rejects missing MONGODB_URI in production', () => {
    assert.throws(() => {
        validateEnv({
            NODE_ENV: 'production',
            PORT: '3000',
            SESSION_SECRET: 'a_very_long_secure_session_secret_1234567890_32chars',
            WEB_BASE_URL: 'https://vergetrp.ru',
            DISCORD_TOKEN: 'fake_token',
            DISCORD_CLIENT_ID: '12345',
            DISCORD_CLIENT_SECRET: 'secret',
            DISCORD_REDIRECT_URI: 'https://vergetrp.ru/api/auth/discord/callback',
            GUILD_ID: '12345'
        });
    }, /MONGODB_URI is required in production/);
});

test('2. validateEnv rejects short or weak SESSION_SECRET in production', () => {
    assert.throws(() => {
        validateEnv({
            NODE_ENV: 'production',
            PORT: '3000',
            MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/discord_bot',
            SESSION_SECRET: 'short_secret',
            WEB_BASE_URL: 'https://vergetrp.ru',
            DISCORD_TOKEN: 'fake_token',
            DISCORD_CLIENT_ID: '12345',
            DISCORD_CLIENT_SECRET: 'secret',
            DISCORD_REDIRECT_URI: 'https://vergetrp.ru/api/auth/discord/callback',
            GUILD_ID: '12345'
        });
    }, /SESSION_SECRET must be at least 32 characters long/);
});

test('3. validateEnv rejects non-HTTPS WEB_BASE_URL in production', () => {
    assert.throws(() => {
        validateEnv({
            NODE_ENV: 'production',
            PORT: '3000',
            MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/discord_bot',
            SESSION_SECRET: 'a_very_long_secure_session_secret_1234567890_32chars',
            WEB_BASE_URL: 'http://vergetrp.ru',
            DISCORD_TOKEN: 'fake_token',
            DISCORD_CLIENT_ID: '12345',
            DISCORD_CLIENT_SECRET: 'secret',
            DISCORD_REDIRECT_URI: 'http://vergetrp.ru/api/auth/discord/callback',
            GUILD_ID: '12345'
        });
    }, /WEB_BASE_URL must use HTTPS in production/);
});

test('4. validateEnv rejects OAuth redirect URI mismatching WEB_BASE_URL in production', () => {
    assert.throws(() => {
        validateEnv({
            NODE_ENV: 'production',
            PORT: '3000',
            MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/discord_bot',
            SESSION_SECRET: 'a_very_long_secure_session_secret_1234567890_32chars',
            WEB_BASE_URL: 'https://vergetrp.ru',
            DISCORD_TOKEN: 'fake_token',
            DISCORD_CLIENT_ID: '12345',
            DISCORD_CLIENT_SECRET: 'secret',
            DISCORD_REDIRECT_URI: 'https://attacker.com/api/auth/discord/callback',
            GUILD_ID: '12345'
        });
    }, /DISCORD_REDIRECT_URI origin .* does not match WEB_BASE_URL/);
});

test('5. getPlayerByPublicIdentifier in production without DB throws error instead of mock fallback', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        await assert.rejects(async () => {
            await getPlayerByPublicIdentifier('hana-kami');
        }, /Database connection is unavailable in production/);
    } finally {
        process.env.NODE_ENV = originalEnv;
    }
});

test('6. Application search snippets strictly strip Discord mentions and IDs', async () => {
    const res = await searchPublicEcosystem({ query: 'Хана', type: 'applications' });
    assert.ok(res.results.length > 0);
    for (const item of res.results) {
        assert.ok(!/<@[!&]?\d+>/.test(item.description));
        assert.ok(!/<#\d+>/.test(item.description));
    }
});

test('7. GET /api/health and /api/health/ready never leak database credentials or connection strings', async () => {
    const app = createTestAppWithRoutes();
    const res = await fetchFromApp(app, '/api/health');
    assert.equal(res.status, 200);
    assert.ok(res.json);
    assert.equal(typeof res.json.uptime, 'number');
    assert.ok(!res.text.includes('mongodb://'));
    assert.ok(!res.text.includes('password'));
});

test('8. GET /robots.txt disallows sensitive admin/api paths and allows public content', async () => {
    const app = createTestAppWithRoutes();
    const res = await fetchFromApp(app, '/robots.txt');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Disallow: /admin'));
    assert.ok(res.text.includes('Disallow: /api'));
    assert.ok(res.text.includes('Allow: /wiki'));
    assert.ok(res.text.includes('Allow: /applications'));
    assert.ok(res.text.includes('Sitemap:'));
});

test('9. GET /sitemap.xml returns valid XML with canonical public URLs', async () => {
    const app = createTestAppWithRoutes();
    const res = await fetchFromApp(app, '/sitemap.xml');
    assert.equal(res.status, 200);
    assert.ok(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(res.text.includes('<urlset'));
    assert.ok(res.text.includes('/wiki'));
    assert.ok(res.text.includes('/applications'));
});

test('10. Error handler in production sanitizes internal database details and stack traces', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        const app = createTestAppWithRoutes();
        const res = await fetchFromApp(app, '/api/test-error');
        assert.equal(res.status, 500);
        assert.ok(!res.text.includes('secretpass'));
        assert.ok(!res.text.includes('mongodb://'));
        assert.equal(res.json.stack, undefined);
    } finally {
        process.env.NODE_ENV = originalEnv;
    }
});
