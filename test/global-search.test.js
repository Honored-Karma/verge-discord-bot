import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSearchRouter } from '../server/routes/search.js';
import { 
    searchPublicEcosystem, 
    calculateRelevanceScore, 
    escapeRegex 
} from '../services/globalSearchService.js';

function createSearchTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/search', createSearchRouter());
    return app;
}

async function makeSearchRequest(app, queryParams) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const res = await fetch(`http://127.0.0.1:${port}/api/search?${queryParams}`);
                const data = await res.json();
                server.close(() => resolve({ status: res.status, data }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('1. Exact character name search finds character with top relevance score', async () => {
    const res = await searchPublicEcosystem({ query: 'Хана Ками', type: 'all' });
    
    assert.ok(res.results.length > 0);
    const char = res.results.find(r => r.type === 'character' && r.title === 'Хана Ками');
    assert.ok(char);
    assert.equal(char.id, 'hana-kami');
    assert.equal(char.url, '/characters/hana-kami');
    assert.ok(char.score >= 80);
});

test('2. Character partial search by attribute finds matching character', async () => {
    const res = await searchPublicEcosystem({ query: 'Ангел', type: 'characters' });
    
    assert.ok(res.results.length > 0);
    assert.equal(res.results[0].type, 'character');
    assert.equal(res.results[0].id, 'hana-kami');
});

test('3. Wiki alias search resolves to canonical article', async () => {
    const res = await searchPublicEcosystem({ query: 'Маджин', type: 'wiki' });
    
    assert.ok(res.results.length > 0);
    const boreholeArt = res.results.find(r => r.id === 'boreholes');
    assert.ok(boreholeArt);
    assert.equal(boreholeArt.url, '/wiki/phenomena/boreholes');
});

test('4. Application search returns accepted applications with public URLs', async () => {
    const res = await searchPublicEcosystem({ query: 'Хана', type: 'applications' });
    
    assert.ok(res.results.length > 0);
    const app = res.results.find(r => r.type === 'application');
    assert.ok(app);
    assert.equal(app.url, '/applications/hana-kami');
    assert.ok(!app.url.includes('123456789')); // No Discord ID in URL
});

test('5. Search results strictly exclude private fields and internal IDs', async () => {
    const res = await searchPublicEcosystem({ query: 'Хана', type: 'all' });
    
    for (const r of res.results) {
        assert.equal(r._id, undefined);
        assert.equal(r.discord_id, undefined);
        assert.equal(r.discordUserId, undefined);
        assert.equal(r.krw, undefined);
        assert.equal(r.yen, undefined);
        assert.equal(r.inventory, undefined);
        assert.equal(r.token, undefined);
    }
});

test('6. Regex characters are safely escaped and do not throw', async () => {
    const dangerousQuery = '.*+?^${}()|[]\\';
    const res = await searchPublicEcosystem({ query: dangerousQuery, type: 'all' });
    
    assert.ok(res);
    assert.equal(typeof res.total, 'number');
});

test('7. Mongo operator inputs are treated as literal text and cause no injection', async () => {
    const app = createSearchTestApp();
    const res = await makeSearchRequest(app, 'q=%24where&type=all');
    
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.results));
});

test('8. Short query (< 2 characters) returns empty results without full scan', async () => {
    const res = await searchPublicEcosystem({ query: 'a', type: 'all' });
    
    assert.equal(res.total, 0);
    assert.equal(res.results.length, 0);
});

test('9. Empty query returns empty results', async () => {
    const res = await searchPublicEcosystem({ query: '', type: 'all' });
    
    assert.equal(res.total, 0);
    assert.equal(res.results.length, 0);
});

test('10. Ranking formula prioritizes exact title over content match', () => {
    const query = 'скважины';
    const exactItem = { title: 'Скважины', summary: 'Описание' };
    const contentItem = { title: 'Другая статья', summary: 'Тут упоминаются скважины' };

    const scoreExact = calculateRelevanceScore(query, exactItem);
    const scoreContent = calculateRelevanceScore(query, contentItem);

    assert.ok(scoreExact > scoreContent, `Exact (${scoreExact}) should be higher than content (${scoreContent})`);
});

test('11. Global search limit is strictly respected', async () => {
    const res = await searchPublicEcosystem({ query: 'а', limit: 5 });
    
    assert.ok(res.results.length <= 5);
});

test('12. GET /api/search HTTP endpoint returns valid public search DTO', async () => {
    const app = createSearchTestApp();
    const res = await makeSearchRequest(app, 'q=тенрью&limit=10');
    
    assert.equal(res.status, 200);
    assert.equal(res.data.query, 'тенрью');
    assert.ok(Array.isArray(res.data.results));
    assert.ok(res.data.results.length > 0);
});
