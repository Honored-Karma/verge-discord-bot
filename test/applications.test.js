import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApplicationsRouter } from '../server/routes/applications.js';
import { 
    slugifyCharacterName, 
    parseApplicationSections, 
    sanitizeApplicationForPublic,
    getPublicApplications,
    getApplicationBySlugOrId
} from '../services/applicationService.js';

// Helper for testing express router endpoints
function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/applications', createApplicationsRouter(null));
    return app;
}

async function makeRequest(app, method, path) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const res = await fetch(`http://127.0.0.1:${port}${path}`);
                const data = await res.json().catch(() => null);
                server.close(() => resolve({ status: res.status, data }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('slugifyCharacterName generates clean and URL-safe slugs', () => {
    assert.equal(slugifyCharacterName('Хана Ками'), 'khana-kami');
    assert.equal(slugifyCharacterName('Рейме (Еул)'), 'reyme-eul');
    assert.equal(slugifyCharacterName('Чжи-Хон Пак!'), 'chzhi-khon-pak');
    assert.equal(slugifyCharacterName('  Shadow   Walker  '), 'shadow-walker');
    assert.equal(slugifyCharacterName(''), 'unnamed-character');
});

test('parseApplicationSections parses structured markdown headings and headers', () => {
    const sheetText = `
# АНКЕТА ПЕРСОНАЖА

Внешность:
Высокий парень с темными волосами. Носит кожаную куртку.

Характер:
Спокойный и расчетливый.

Биография:
Родился в Токио до раскола. Пережил катастрофу 2020 года.

Способности:
Атрибут «Пламя». Создание тепловых волн.
    `;

    const sections = parseApplicationSections(sheetText);
    assert.ok(sections.length >= 4);
    
    const appearance = sections.find(s => s.key === 'appearance');
    assert.ok(appearance);
    assert.match(appearance.content, /темными волосами/);

    const biography = sections.find(s => s.key === 'biography');
    assert.ok(biography);
    assert.match(biography.content, /Токио/);

    const abilities = sections.find(s => s.key === 'abilities');
    assert.ok(abilities);
    assert.match(abilities.content, /Пламя/);
});

test('sanitizeApplicationForPublic strips internal Discord metadata and sensitive fields', () => {
    const rawApp = {
        _id: 'mongo_internal_id_123',
        id: 'app_1',
        slug: 'hana-kami',
        player_id: '555111',
        owner_discord_id: '555111',
        internal_staff_notes: 'Reviewed by GM Alex',
        character_name: 'Хана Ками',
        character_avatar: 'avatar.png',
        attribute_name: 'Ангел',
        organization: 'TENRYU',
        rank: 'S',
        reputation: 1550,
        status: 'accepted',
        source: {
            type: 'discord_message',
            url: 'https://discord.com/channels/1/2/3',
            channel_id: '2',
            message_id: '3'
        },
        sections: [{ key: 'appearance', title: 'Внешность', content: 'Описание' }],
        raw_text: 'Полный текст'
    };

    const sanitized = sanitizeApplicationForPublic(rawApp);

    assert.equal(sanitized.slug, 'hana-kami');
    assert.equal(sanitized.character_name, 'Хана Ками');
    assert.equal(sanitized.internal_staff_notes, undefined, 'Staff notes must be stripped');
    assert.equal(sanitized._id, undefined, 'MongoDB _id must be stripped');
    assert.equal(sanitized.status, 'accepted');
    assert.ok(sanitized.sections.length > 0);
});

test('GET /api/applications returns paginated list of accepted applications', async () => {
    const app = createTestApp();
    const res = await makeRequest(app, 'GET', '/api/applications?page=1&limit=10');

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.items));
    assert.ok(res.data.total >= 1);
    assert.equal(res.data.page, 1);
    assert.equal(res.data.limit, 10);
    
    // Ensure all returned items have status accepted
    for (const item of res.data.items) {
        assert.equal(item.status, 'accepted');
        assert.ok(item.slug);
        assert.ok(item.character_name);
    }
});

test('GET /api/applications supports search query by name or attribute', async () => {
    const app = createTestApp();
    const res = await makeRequest(app, 'GET', '/api/applications?search=Хана');

    assert.equal(res.status, 200);
    assert.ok(res.data.items.length >= 1);
    assert.match(res.data.items[0].character_name, /Хана/i);
});

test('GET /api/applications/:slug returns 404 for non-existent application', async () => {
    const app = createTestApp();
    const res = await makeRequest(app, 'GET', '/api/applications/non-existent-slug-xyz');

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'ApplicationNotFound');
});

test('GET /api/applications/:slug returns single character application', async () => {
    const app = createTestApp();
    const res = await makeRequest(app, 'GET', '/api/applications/hana-kami');

    assert.equal(res.status, 200);
    assert.ok(res.data.application);
    assert.equal(res.data.application.slug, 'hana-kami');
    assert.equal(res.data.application.character_name, 'Хана Ками');
    assert.equal(res.data.application.status, 'accepted');
    assert.ok(Array.isArray(res.data.application.sections));
});
