import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { 
    escapeHtml, 
    sanitizeImageUrl, 
    resolvePathMeta, 
    buildMetaHtml 
} from '../server/middlewares/metaInjector.js';
import { 
    loadNormalizedLoreArticles, 
    validateWikiIntegrity,
    computeSourceHash
} from '../services/wikiService.js';
import { importWikiArticles } from '../scripts/import-wiki.js';

test('1. escapeHtml strictly escapes HTML and quotes and strips newlines', () => {
    const malicious = '<script>alert("XSS")</script>\n<meta property="evil" content=\'injected\'> & "quote"';
    const escaped = escapeHtml(malicious);

    assert.ok(!escaped.includes('<script>'));
    assert.ok(!escaped.includes('</script>'));
    assert.ok(!escaped.includes('"'));
    assert.ok(!escaped.includes("'"));
    assert.ok(!escaped.includes('\n'));
    assert.ok(escaped.includes('&lt;script&gt;'));
    assert.ok(escaped.includes('&quot;quote&quot;'));
    assert.ok(escaped.includes('&#39;injected&#39;'));
});

test('2. sanitizeImageUrl allows valid https/http and blocks javascript: or data: URIs', () => {
    assert.equal(sanitizeImageUrl('https://cdn.discordapp.com/avatars/123/abc.png'), 'https://cdn.discordapp.com/avatars/123/abc.png');
    assert.equal(sanitizeImageUrl('http://example.com/avatar.jpg'), 'http://example.com/avatar.jpg');
    assert.equal(sanitizeImageUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeImageUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(sanitizeImageUrl('not-a-url'), null);
    assert.equal(sanitizeImageUrl(null), null);
});

test('3. resolvePathMeta for Wiki article returns correct title and canonical URL', async () => {
    const req = {
        get: () => 'verge-trp.com',
        protocol: 'https'
    };
    const meta = await resolvePathMeta('/wiki/phenomena/boreholes', req);

    assert.ok(meta.title.includes('Скважины'));
    assert.equal(meta.type, 'article');
    assert.equal(meta.canonicalUrl, 'https://verge-trp.com/wiki/phenomena/boreholes');
    assert.ok(meta.description.toLowerCase().includes('сфер') || meta.description.toLowerCase().includes('скважин'));
});

test('4. resolvePathMeta for missing entity returns fallback meta', async () => {
    const req = {
        get: () => 'verge-trp.com',
        protocol: 'https'
    };
    const meta = await resolvePathMeta('/wiki/phenomena/non-existent-borehole-xyz', req);

    assert.equal(meta.title, 'Verge TRP — Портал Ролевого Проекта');
    assert.equal(meta.type, 'website');
    assert.equal(meta.canonicalUrl, 'https://verge-trp.com/wiki/phenomena/non-existent-borehole-xyz');
});

test('5. buildMetaHtml safely encodes malicious meta properties', () => {
    const maliciousMeta = {
        title: '"><script>alert(1)</script>',
        description: 'Attack "><img src=x onerror=alert(1)>',
        type: 'website" onclick="evil()',
        canonicalUrl: 'https://verge-trp.com/characters/evil-slug',
        imageUrl: 'https://cdn.discordapp.com/avatars/123/avatar.png" onload="alert(1)',
        siteName: 'Verge & Co "><evil>'
    };

    const html = buildMetaHtml(maliciousMeta);

    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('onclick="evil()'));
    assert.ok(!html.includes('onload="alert(1)'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&quot;&gt;&lt;img src=x'));
});

test('6. Canonical lore integrity: all cross-links resolve to existing published slugs', () => {
    const integrity = validateWikiIntegrity();

    assert.equal(integrity.valid, true, `Integrity issues found: ${integrity.issues.join(', ')}`);
    assert.ok(integrity.totalArticles >= 20);
    assert.equal(integrity.issues.length, 0);
});

test('7. Source provenance: all canonical articles have source metadata and hashes', () => {
    const articles = loadNormalizedLoreArticles();

    for (const art of articles) {
        assert.ok(art.provenance, `Article ${art.slug} missing provenance`);
        assert.equal(art.provenance.type, 'verge_lore_document');
        assert.ok(art.provenance.source_file);
        assert.ok(Array.isArray(art.provenance.source_sections));
        assert.ok(art.provenance.source_sections.length > 0);
        assert.ok(art.provenance.source_hash);
        assert.equal(typeof art.provenance.source_hash, 'string');
        assert.ok(art.provenance.source_hash.length >= 32);
    }
});

test('8. Importer idempotency: repeated execution maintains unchanged state', async () => {
    const report1 = await importWikiArticles(null);
    assert.equal(report1.failed, 0);
    assert.ok(report1.total >= 20);

    const report2 = await importWikiArticles(null);
    assert.equal(report2.failed, 0);
    assert.ok(report2.total >= 20);
});
