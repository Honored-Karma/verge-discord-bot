import { getDB } from '../utils/db.js';
import { loadNormalizedLoreArticles, WIKI_CATEGORIES } from './wikiService.js';
import { SAMPLE_DEMO_CHARACTERS } from './playerService.js';
import { getPublicApplications } from './applicationService.js';
import { sanitizeImageUrl } from '../server/middlewares/metaInjector.js';

// In-memory TTL cache for public search (60s TTL, max 200 queries)
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL = 60 * 1000;
const MAX_SEARCH_CACHE = 200;

/**
 * Escapes regex special characters safely
 */
export function escapeRegex(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate relevance score for a search candidate
 * @param {string} query - Clean search term (lowercase)
 * @param {Object} item - Candidate object
 * @returns {number} Relevance score (higher is more relevant)
 */
export function calculateRelevanceScore(query, item) {
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    let score = 0;
    const title = (item.title || item.character_name || '').toLowerCase();
    const slug = (item.slug || '').toLowerCase();
    const aliases = (item.aliases || []).map(a => String(a).toLowerCase());
    const tags = (item.tags || []).map(t => String(t).toLowerCase());
    const org = (item.organization || '').toLowerCase();
    const attr = (item.attribute_name || '').toLowerCase();
    const summary = (item.summary || item.description || '').toLowerCase();
    const content = (item.content || '').toLowerCase();

    // 1. Exact title / slug match -> 100 pts
    if (title === q || slug === q) {
        score = Math.max(score, 100);
    }
    // 2. Starts with query -> 80 pts
    else if (title.startsWith(q) || slug.startsWith(q)) {
        score = Math.max(score, 80);
    }
    // 3. Exact alias match -> 75 pts
    else if (aliases.some(a => a === q)) {
        score = Math.max(score, 75);
    }
    // 4. Contains in title or alias -> 60 pts
    else if (title.includes(q) || aliases.some(a => a.includes(q))) {
        score = Math.max(score, 60);
    }
    // 5. Attribute / Organization / Tag match -> 40 pts
    else if (attr.includes(q) || org.includes(q) || tags.some(t => t.includes(q))) {
        score = Math.max(score, 40);
    }
    // 6. Summary match -> 25 pts
    else if (summary.includes(q)) {
        score = Math.max(score, 25);
    }
    // 7. Content / Body match -> 15 pts
    else if (content.includes(q)) {
        score = Math.max(score, 15);
    }

    return score;
}

/**
 * Search characters by public fields
 */
async function searchCharacters(rawQuery, limit) {
    const db = getDB();
    const safeRegex = new RegExp(escapeRegex(rawQuery), 'i');
    let matches = [];

    if (db) {
        const docs = await db.collection('players').find({
            $or: [
                { character_name: { $regex: safeRegex } },
                { slug: { $regex: safeRegex } },
                { attribute_name: { $regex: safeRegex } },
                { organization: { $regex: safeRegex } },
                { rank: { $regex: safeRegex } }
            ]
        }).limit(limit * 2).toArray();

        matches = docs;
    } else {
        matches = Object.values(SAMPLE_DEMO_CHARACTERS).filter(c => {
            const str = `${c.character_name || ''} ${c.slug || ''} ${c.attribute_name || ''} ${c.organization || ''} ${c.rank || ''}`;
            return safeRegex.test(str);
        });
    }

    return matches.map(char => {
        const slug = char.slug || char.public_id || 'unknown';
        const rankText = char.rank ? `Ранг ${char.rank}` : '';
        const orgText = char.organization && char.organization !== 'Не состоит' ? char.organization : '';
        const attrText = char.attribute_name ? `Атрибут: ${char.attribute_name}` : '';
        const subtitleParts = [orgText, rankText, attrText].filter(Boolean);

        return {
            id: slug,
            type: 'character',
            title: char.character_name || 'Персонаж',
            subtitle: subtitleParts.join(' · ') || 'Досье персонажа',
            description: attrText ? `Способность: ${char.attribute_name}` : 'Ролевой персонаж Verge TRP',
            url: `/characters/${slug}`,
            image: sanitizeImageUrl(char.character_avatar),
            score: calculateRelevanceScore(rawQuery, {
                title: char.character_name,
                slug: char.slug,
                organization: char.organization,
                attribute_name: char.attribute_name
            })
        };
    }).filter(res => res.score > 0);
}

/**
 * Search accepted applications by public fields
 */
async function searchApplications(rawQuery, limit) {
    const db = getDB();
    const safeRegex = new RegExp(escapeRegex(rawQuery), 'i');
    let matches = [];

    if (db) {
        const docs = await db.collection('applications').find({
            status: 'accepted',
            $or: [
                { character_name: { $regex: safeRegex } },
                { slug: { $regex: safeRegex } },
                { attribute_name: { $regex: safeRegex } },
                { organization: { $regex: safeRegex } },
                { 'sections.content': { $regex: safeRegex } }
            ]
        }).limit(limit * 2).toArray();

        matches = docs;
    } else {
        const appRes = await getPublicApplications({ search: rawQuery, limit: limit * 2, status: 'accepted' });
        matches = appRes.items || [];
    }

    return matches.map(app => {
        const slug = app.slug || app.public_id || 'unknown';
        const rankText = app.rank ? `Ранг ${app.rank}` : '';
        const orgText = app.organization || '';
        const subtitleParts = ['Принятая анкета', orgText, rankText].filter(Boolean);

        // Sanitize snippet to guarantee no Discord mentions or IDs leak
        const rawSnippet = app.sections && app.sections[0]?.content ? app.sections[0].content : '';
        const cleanSnippet = rawSnippet.replace(/<@[!&]?\d+>|<#\d+>|\b\d{17,20}\b/g, '').slice(0, 160).trim();

        return {
            id: slug,
            type: 'application',
            title: `Анкета: ${app.character_name}`,
            subtitle: subtitleParts.join(' · '),
            description: app.attribute_name ? `Атрибут: ${app.attribute_name}. Зарегистрированная квента.` : (cleanSnippet || 'Квента персонажа в архиве анкет.'),
            url: `/applications/${slug}`,
            image: sanitizeImageUrl(app.character_avatar),
            score: calculateRelevanceScore(rawQuery, {
                title: app.character_name,
                slug: app.slug,
                organization: app.organization,
                attribute_name: app.attribute_name,
                summary: cleanSnippet
            })
        };
    }).filter(res => res.score > 0);
}

/**
 * Search published Wiki articles
 */
async function searchWikiArticles(rawQuery, limit) {
    const db = getDB();
    const safeRegex = new RegExp(escapeRegex(rawQuery), 'i');
    let matches = [];

    if (db) {
        const docs = await db.collection('wiki_articles').find({
            status: 'published',
            $or: [
                { title: { $regex: safeRegex } },
                { slug: { $regex: safeRegex } },
                { aliases: { $regex: safeRegex } },
                { tags: { $regex: safeRegex } },
                { summary: { $regex: safeRegex } },
                { content: { $regex: safeRegex } }
            ]
        }).limit(limit * 2).toArray();

        matches = docs;
    } else {
        const local = loadNormalizedLoreArticles().filter(a => (a.status || 'published') === 'published');
        matches = local.filter(a => {
            const str = `${a.title} ${a.slug} ${(a.aliases || []).join(' ')} ${(a.tags || []).join(' ')} ${a.summary || ''} ${a.content || ''}`;
            return safeRegex.test(str);
        });
    }

    return matches.map(art => {
        const catObj = WIKI_CATEGORIES.find(c => c.id === art.category);
        const catName = catObj ? catObj.name : 'Энциклопедия';
        const url = `/wiki/${art.category || 'world'}/${art.slug}`;

        return {
            id: art.slug,
            type: 'wiki',
            title: art.title,
            subtitle: `Wiki · ${catName}`,
            description: art.summary || (art.content ? art.content.slice(0, 160) + '...' : 'Статья базы знаний Verge TRP'),
            url,
            image: null,
            category: art.category,
            score: calculateRelevanceScore(rawQuery, {
                title: art.title,
                slug: art.slug,
                aliases: art.aliases,
                tags: art.tags,
                summary: art.summary,
                content: art.content
            })
        };
    }).filter(res => res.score > 0);
}

/**
 * Unified Public Search Service across Characters, Applications, and Wiki
 * @param {Object} options
 * @param {string} options.query - Raw search query
 * @param {string} [options.type='all'] - 'all' | 'characters' | 'applications' | 'wiki'
 * @param {number} [options.limit=20] - Max total results
 * @returns {Promise<Object>} Formatted search response
 */
export async function searchPublicEcosystem({ query = '', type = 'all', limit = 20 }) {
    const cleanQuery = (query || '').trim();

    // 1. Validation & Empty handling
    if (!cleanQuery || cleanQuery.length < 2) {
        return {
            query: cleanQuery,
            type,
            total: 0,
            results: []
        };
    }

    // Limit query length to 100 characters
    const boundedQuery = cleanQuery.slice(0, 100);
    const maxLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    // 2. Check in-memory cache
    const cacheKey = `${boundedQuery.toLowerCase()}:${type}:${maxLimit}`;
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
        return cached.data;
    }

    // 3. Query Target Collections
    const searchPromises = [];
    const shouldSearchCharacters = type === 'all' || type === 'characters';
    const shouldSearchApplications = type === 'all' || type === 'applications';
    const shouldSearchWiki = type === 'all' || type === 'wiki';

    if (shouldSearchCharacters) {
        searchPromises.push(searchCharacters(boundedQuery, maxLimit));
    } else {
        searchPromises.push(Promise.resolve([]));
    }

    if (shouldSearchApplications) {
        searchPromises.push(searchApplications(boundedQuery, maxLimit));
    } else {
        searchPromises.push(Promise.resolve([]));
    }

    if (shouldSearchWiki) {
        searchPromises.push(searchWikiArticles(boundedQuery, maxLimit));
    } else {
        searchPromises.push(Promise.resolve([]));
    }

    const [chars, apps, wiki] = await Promise.all(searchPromises);

    // 4. Merge, rank and deduplicate
    const combined = [...chars, ...apps, ...wiki];

    // Sort by Score descending; tie-break by Title ascending
    combined.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.title.localeCompare(b.title, 'ru');
    });

    const finalResults = combined.slice(0, maxLimit);

    const response = {
        query: boundedQuery,
        type,
        total: combined.length,
        results: finalResults
    };

    // 5. Store in cache
    SEARCH_CACHE.set(cacheKey, { timestamp: Date.now(), data: response });
    if (SEARCH_CACHE.size > MAX_SEARCH_CACHE) {
        const oldestKey = SEARCH_CACHE.keys().next().value;
        SEARCH_CACHE.delete(oldestKey);
    }

    return response;
}
