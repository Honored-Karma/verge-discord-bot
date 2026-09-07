import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { getDB } from '../utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Canonical Categories Definition (Source of Truth)
export const WIKI_CATEGORIES = [
    {
        id: 'world',
        slug: 'world',
        name: 'Мир и история',
        shortDescription: 'Катастрофа «Генезис», геополитическое противостояние, экономика и репутация.',
        icon: 'Globe',
        sortOrder: 1
    },
    {
        id: 'phenomena',
        slug: 'phenomena',
        name: 'Аномальные явления',
        shortDescription: 'Скважины, черные сферы, энергия Маджин, аномалии и артефакты иных миров.',
        icon: 'Sparkles',
        sortOrder: 2
    },
    {
        id: 'attributes',
        slug: 'attributes',
        name: 'Атрибуты и способности',
        shortDescription: 'Система Атрибутов, развитие AP, Олицетворение и запрещенные концепции.',
        icon: 'Flame',
        sortOrder: 3
    },
    {
        id: 'biology-and-stats',
        slug: 'biology-and-stats',
        name: 'Физиология и характеристики',
        shortDescription: 'Физические параметры, лимиты тела, Пробуждение, Одаренности и система Трейтов.',
        icon: 'Activity',
        sortOrder: 4
    },
    {
        id: 'martial-arts',
        slug: 'martial-arts',
        name: 'Боевые искусства',
        shortDescription: 'Энергия Ци, уровни владения стилями боя SP, кастомные искусства и техники.',
        icon: 'Shield',
        sortOrder: 5
    },
    {
        id: 'organizations',
        slug: 'organizations',
        name: 'Организации',
        shortDescription: 'Тенрью, Стражи Мира, синдикаты Мрачный Блеск и Затмение.',
        icon: 'Users',
        sortOrder: 6
    },
    {
        id: 'characters',
        slug: 'characters',
        name: 'Личности канона',
        shortDescription: 'Ключевые герои рангов S и I, чемпионы фестивалей и легендарные деятели.',
        icon: 'UserCheck',
        sortOrder: 7
    },
    {
        id: 'rules',
        slug: 'rules',
        name: 'Правила и системы',
        shortDescription: 'Шаблоны анкет, тренировки, Level Pass, ролевые награды и услуги проекта.',
        icon: 'BookOpen',
        sortOrder: 8
    }
];

// Load normalized canonical source dataset from data layer
let cachedNormalizedArticles = null;

export function loadNormalizedLoreArticles() {
    if (cachedNormalizedArticles) {
        return cachedNormalizedArticles;
    }
    const dataPath = join(__dirname, '..', 'data', 'wiki', 'canonical_articles.json');
    if (existsSync(dataPath)) {
        try {
            const raw = readFileSync(dataPath, 'utf-8');
            cachedNormalizedArticles = JSON.parse(raw);
            return cachedNormalizedArticles;
        } catch (err) {
            console.error('⚠️ Failed to read data/wiki/canonical_articles.json:', err);
        }
    }
    return [];
}

export const CANONICAL_LORE_ARTICLES = loadNormalizedLoreArticles();

/**
 * Generate a deterministic opaque public_id for a wiki article
 */
export function generateWikiPublicId(slug) {
    const hash = crypto.createHash('sha256').update(`verge_wiki_${slug}`).digest('hex');
    return `wiki_${hash.slice(0, 10)}`;
}

/**
 * Compute sha256 checksum of content for provenance
 */
export function computeSourceHash(content) {
    return crypto.createHash('sha256').update(String(content || '').trim()).digest('hex');
}

/**
 * Public serializer for list view (Summary DTO)
 */
export function sanitizeWikiArticleSummary(article) {
    if (!article || article.status !== 'published') return null;

    return {
        public_id: article.public_id || generateWikiPublicId(article.slug),
        slug: article.slug,
        category: article.category,
        title: article.title,
        summary: article.summary || '',
        tags: article.tags || [],
        sort_order: article.sort_order || 0
    };
}

/**
 * Public serializer for detail view (Detail DTO)
 */
export function sanitizeWikiArticleDetail(article) {
    if (!article || article.status !== 'published') return null;

    return {
        public_id: article.public_id || generateWikiPublicId(article.slug),
        slug: article.slug,
        category: article.category,
        title: article.title,
        summary: article.summary || '',
        content: article.content || '',
        sections: article.sections || [],
        aliases: article.aliases || [],
        tags: article.tags || [],
        related_articles: article.related_articles || [],
        related_characters: (article.related_characters || []).map(c => ({
            slug: c.slug,
            name: c.name,
            role: c.role || ''
        })),
        source_note: 'Канонический архив Verge TRP',
        updated_at: article.updated_at || article.created_at || null
    };
}

/**
 * Get all categories with article counts
 */
export async function getWikiCategories() {
    const db = getDB();
    let publishedArticles = [];

    if (db) {
        try {
            publishedArticles = await db.collection('wiki_articles')
                .find({ status: 'published' }, { projection: { category: 1, slug: 1 } })
                .toArray();
        } catch (err) {
            console.error('Error fetching categories from DB, using fallback:', err);
            publishedArticles = CANONICAL_LORE_ARTICLES;
        }
    } else {
        publishedArticles = CANONICAL_LORE_ARTICLES;
    }

    const categoryCounts = {};
    for (const art of publishedArticles) {
        categoryCounts[art.category] = (categoryCounts[art.category] || 0) + 1;
    }

    return WIKI_CATEGORIES.map(cat => ({
        ...cat,
        article_count: categoryCounts[cat.id] || 0
    }));
}

/**
 * Get Wiki Home Data
 */
export async function getWikiHomeData() {
    const categories = await getWikiCategories();
    const db = getDB();
    let featured = [];

    if (db) {
        try {
            const docs = await db.collection('wiki_articles')
                .find({ status: 'published' })
                .sort({ sort_order: 1 })
                .limit(6)
                .toArray();
            featured = docs.map(sanitizeWikiArticleSummary).filter(Boolean);
        } catch {
            featured = CANONICAL_LORE_ARTICLES.slice(0, 6).map(sanitizeWikiArticleSummary).filter(Boolean);
        }
    } else {
        featured = CANONICAL_LORE_ARTICLES.slice(0, 6).map(sanitizeWikiArticleSummary).filter(Boolean);
    }

    return {
        wiki_title: 'Архив мира Verge TRP',
        wiki_tagline: 'Единая энциклопедия ролевого мира: история Генезиса, феномен Скважин, боевые искусства, организации и канон.',
        categories,
        featured_articles: featured
    };
}

/**
 * Get all published articles in a given category
 */
export async function getCategoryArticles(categorySlug) {
    const db = getDB();
    const category = String(categorySlug).toLowerCase().trim();

    if (db) {
        try {
            const docs = await db.collection('wiki_articles')
                .find({ category, status: 'published' })
                .sort({ sort_order: 1, title: 1 })
                .toArray();
            return docs.map(sanitizeWikiArticleSummary).filter(Boolean);
        } catch (err) {
            console.error(`Error querying category ${category}:`, err);
        }
    }

    // Fallback to in-memory normalized lore
    return CANONICAL_LORE_ARTICLES
        .filter(a => a.category === category && a.status === 'published')
        .map(sanitizeWikiArticleSummary);
}

/**
 * Get a single published article by slug or public_id
 */
export async function getArticleBySlug(slugOrPublicId) {
    const db = getDB();
    const target = String(slugOrPublicId).toLowerCase().trim();

    if (db) {
        try {
            const doc = await db.collection('wiki_articles').findOne({
                $or: [{ slug: target }, { public_id: target }],
                status: 'published'
            });
            if (doc) {
                return sanitizeWikiArticleDetail(doc);
            }
        } catch (err) {
            console.error(`Error querying article ${target}:`, err);
        }
    }

    // Fallback
    const local = CANONICAL_LORE_ARTICLES.find(
        a => (a.slug === target || a.public_id === target) && a.status === 'published'
    );
    return local ? sanitizeWikiArticleDetail(local) : null;
}

/**
 * ReDoS-safe and sanitized search over published Wiki articles
 */
export async function searchWiki(searchQuery, limit = 15) {
    if (!searchQuery || typeof searchQuery !== 'string') {
        return [];
    }

    const safeQuery = searchQuery.trim().slice(0, 100);
    if (!safeQuery) return [];

    const db = getDB();
    const escapedQuery = safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');

    if (db) {
        try {
            const docs = await db.collection('wiki_articles')
                .find({
                    status: 'published',
                    $or: [
                        { title: { $regex: regex } },
                        { aliases: { $regex: regex } },
                        { tags: { $regex: regex } },
                        { summary: { $regex: regex } },
                        { content: { $regex: regex } }
                    ]
                })
                .limit(limit)
                .toArray();

            return docs.map(sanitizeWikiArticleSummary).filter(Boolean);
        } catch (err) {
            console.error('Error searching in DB:', err);
        }
    }

    // Fallback in-memory search
    const lower = safeQuery.toLowerCase();
    return CANONICAL_LORE_ARTICLES
        .filter(art => {
            if (art.status !== 'published') return false;
            if (art.title && art.title.toLowerCase().includes(lower)) return true;
            if (art.aliases && art.aliases.some(a => a.toLowerCase().includes(lower))) return true;
            if (art.tags && art.tags.some(t => t.toLowerCase().includes(lower))) return true;
            if (art.summary && art.summary.toLowerCase().includes(lower)) return true;
            if (art.content && art.content.toLowerCase().includes(lower)) return true;
            return false;
        })
        .slice(0, limit)
        .map(sanitizeWikiArticleSummary);
}

/**
 * Integrity test helper: checks all cross-links in the normalized canonical lore dataset
 */
export function validateWikiIntegrity() {
    const articles = loadNormalizedLoreArticles();
    const allSlugs = new Set(articles.map(a => a.slug));
    const allCategories = new Set(WIKI_CATEGORIES.map(c => c.id));
    const issues = [];

    for (const art of articles) {
        if (!allCategories.has(art.category)) {
            issues.push(`Article "${art.slug}" has invalid category "${art.category}"`);
        }

        for (const rel of art.related_articles || []) {
            if (!allSlugs.has(rel.slug)) {
                issues.push(`Article "${art.slug}" references non-existent related_article "${rel.slug}"`);
            }
        }

        for (const char of art.related_characters || []) {
            if (!char.slug || /^\d{17,20}$/.test(char.slug)) {
                issues.push(`Article "${art.slug}" references invalid or Discord ID character slug "${char.slug}"`);
            }
        }
    }

    return {
        valid: issues.length === 0,
        issues,
        totalArticles: articles.length
    };
}
