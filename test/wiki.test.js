import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWikiRouter } from '../server/routes/wiki.js';
import { 
    getWikiHomeData,
    getWikiCategories,
    getCategoryArticles,
    getArticleBySlug,
    searchWiki,
    sanitizeWikiArticleSummary,
    sanitizeWikiArticleDetail,
    CANONICAL_LORE_ARTICLES,
    WIKI_CATEGORIES
} from '../services/wikiService.js';
import { importWikiArticles } from '../scripts/import-wiki.js';
import { migratePublicIds } from '../scripts/migrate-public-ids.js';

function createWikiTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/wiki', createWikiRouter());
    return app;
}

async function makeRequest(app, method, path) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, async () => {
            const port = server.address().port;
            try {
                const res = await fetch(`http://127.0.0.1:${port}${path}`, {
                    method,
                    headers: { 'Accept': 'application/json' }
                });
                const data = await res.json().catch(() => null);
                server.close(() => resolve({ status: res.status, data }));
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

test('1. GET /api/wiki returns overview, categories, and featured articles without leaking internal fields', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki');

    assert.equal(res.status, 200);
    assert.ok(res.data.categories);
    assert.ok(res.data.featured_articles);
    assert.equal(res.data.categories.length, 8);

    // Ensure no internal DB fields leaked
    for (const feat of res.data.featured_articles) {
        assert.equal(feat._id, undefined);
        assert.equal(feat.owner_discord_id, undefined);
        assert.equal(feat.player_id, undefined);
        assert.ok(feat.slug);
        assert.ok(feat.title);
    }
});

test('2. GET /api/wiki/categories returns 8 categories with accurate article counts', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/categories');

    assert.equal(res.status, 200);
    assert.equal(res.data.categories.length, 8);

    const worldCat = res.data.categories.find(c => c.id === 'world');
    assert.ok(worldCat);
    assert.ok(worldCat.article_count >= 5);
});

test('3. GET /api/wiki/categories/:category returns articles in category', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/categories/phenomena');

    assert.equal(res.status, 200);
    assert.equal(res.data.category.id, 'phenomena');
    assert.ok(Array.isArray(res.data.articles));
    assert.ok(res.data.articles.some(a => a.slug === 'boreholes'));
});

test('4. GET /api/wiki/articles/:slug returns full article details and TOC anchors', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/articles/boreholes');

    assert.equal(res.status, 200);
    const art = res.data.article;
    assert.equal(art.slug, 'boreholes');
    assert.equal(art.title, 'Скважины');
    assert.ok(art.content.includes('Скважина'));
    assert.ok(Array.isArray(art.sections));
    assert.ok(art.sections.length > 0);
    assert.ok(art.related_articles.some(r => r.slug === 'anomalies'));
});

test('5. Non-existent category returns 404', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/categories/non-existent-category-123');

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'CategoryNotFound');
});

test('6. Non-existent article returns 404', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/articles/fake-article-slug-xyz');

    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'ArticleNotFound');
});

test('7. Search finds articles by title, aliases, and content', async () => {
    const app = createWikiTestApp();
    
    // Search by title/term
    const res = await makeRequest(app, 'GET', '/api/wiki/search?q=Генезис');
    assert.equal(res.status, 200);
    assert.ok(res.data.results.length > 0);
    assert.ok(res.data.results.some(r => r.slug === 'general-history'));

    // Search by martial art
    const resTaekwondo = await makeRequest(app, 'GET', '/api/wiki/search?q=Тхэквондо');
    assert.equal(resTaekwondo.status, 200);
    assert.ok(resTaekwondo.data.results.some(r => r.slug === 'blood-taekwondo'));
});

test('8. Search query with regex special chars does not crash and sanitizes properly', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/search?q=.*+?^${}()|[]\\');

    assert.equal(res.status, 200);
    assert.equal(res.data.count, 0);
    assert.deepEqual(res.data.results, []);
});

test('9. Draft and archived articles are blocked by public sanitizer', () => {
    const draftArticle = {
        slug: 'secret-draft',
        title: 'Черновик',
        status: 'draft'
    };
    const archivedArticle = {
        slug: 'old-lore',
        title: 'Архивный лор',
        status: 'archived'
    };
    const publishedArticle = {
        slug: 'clean-article',
        title: 'Чистая статья',
        status: 'published',
        content: 'Текст'
    };

    assert.equal(sanitizeWikiArticleSummary(draftArticle), null);
    assert.equal(sanitizeWikiArticleDetail(draftArticle), null);
    assert.equal(sanitizeWikiArticleSummary(archivedArticle), null);
    assert.equal(sanitizeWikiArticleDetail(archivedArticle), null);
    assert.ok(sanitizeWikiArticleSummary(publishedArticle));
    assert.ok(sanitizeWikiArticleDetail(publishedArticle));
});

test('10. Related character links use public slugs, NEVER internal Discord IDs', async () => {
    const app = createWikiTestApp();
    const res = await makeRequest(app, 'GET', '/api/wiki/articles/tenryu');

    assert.equal(res.status, 200);
    const art = res.data.article;
    assert.ok(art.related_characters);
    for (const char of art.related_characters) {
        assert.equal(char.id, undefined);
        assert.equal(char.player_id, undefined);
        assert.ok(char.slug);
        assert.equal(/^\d{17,20}$/.test(char.slug), false, 'Slug must not be a raw Discord ID');
    }
});

test('11. Lore import simulation runs idempotently without errors', async () => {
    const report1 = await importWikiArticles(null);
    assert.ok(report1.total >= 20);
    assert.equal(report1.failed, 0);

    const report2 = await importWikiArticles(null);
    assert.ok(report2.total >= 20);
    assert.equal(report2.failed, 0);
});

test('12. Public ID migration runs idempotently without errors', async () => {
    const report = await migratePublicIds(null);
    assert.equal(report.failed, 0);
});
