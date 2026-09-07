import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArticleBySlug } from '../../services/wikiService.js';
import { getPublicCharacterProfile } from '../../services/playerService.js';
import { getApplicationBySlug } from '../../services/applicationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In-memory TTL Cache for public meta resolution (5 minutes TTL, max 300 entries)
const META_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 300;

/**
 * HTML Attribute Escaping to strictly prevent HTML/attribute injection via user-controlled names/descriptions
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/[\r\n\t]+/g, ' ')
        .trim();
}

/**
 * Validate that an image URL is a safe HTTPS URL (e.g. Discord CDN or Google User Content)
 */
export function sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    // Reject third-party placeholder domains
    if (/unsplash\.com|placehold\.co|via\.placeholder|picsum\.photos/i.test(cleanUrl)) {
        return null;
    }
    try {
        const parsed = new URL(cleanUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Resolve base URL from environment or request headers
 */
export function resolveBaseUrl(req) {
    if (process.env.WEB_BASE_URL) {
        return process.env.WEB_BASE_URL.replace(/\/+$/, '');
    }
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    return `${protocol}://${host}`;
}

/**
 * Extract public meta for a requested path
 */
export async function resolvePathMeta(pathname, req) {
    const baseUrl = resolveBaseUrl(req);
    const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';

    // Check cache
    const cached = META_CACHE.get(cleanPath);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.meta;
    }

    const fallbackMeta = {
        title: 'Verge TRP — Портал Ролевого Проекта',
        description: 'Официальный веб-портал, досье персонажей, инвентарь и энциклопедия канонического мира Verge TRP.',
        type: 'website',
        canonicalUrl: `${baseUrl}${cleanPath}`,
        imageUrl: null,
        siteName: 'Verge TRP'
    };

    let resolvedMeta = { ...fallbackMeta };

    try {
        // 1. /wiki/:category/:slug or /wiki/articles/:slug or /wiki/:slug
        const wikiMatch = cleanPath.match(/^\/wiki(?:\/([^/]+))?\/([^/]+)$/);
        if (wikiMatch) {
            const slug = wikiMatch[2];
            const article = await getArticleBySlug(slug);
            if (article) {
                resolvedMeta = {
                    title: `${article.title} — Энциклопедия Verge TRP`,
                    description: article.summary || (article.content ? article.content.slice(0, 160) : fallbackMeta.description),
                    type: 'article',
                    canonicalUrl: `${baseUrl}/wiki/${article.category}/${article.slug}`,
                    imageUrl: null,
                    siteName: 'Verge TRP Wiki'
                };
            }
        } else if (cleanPath === '/wiki') {
            resolvedMeta = {
                title: 'Архив мира — Wiki Verge TRP',
                description: 'Единая энциклопедия ролевого мира Verge TRP: история Генезиса, феномен Скважин, боевые искусства, организации и канон.',
                type: 'website',
                canonicalUrl: `${baseUrl}/wiki`,
                imageUrl: null,
                siteName: 'Verge TRP Wiki'
            };
        } else if (cleanPath.startsWith('/characters/')) {
            // 2. /characters/:slug
            const charSlug = cleanPath.replace(/^\/characters\//, '').trim();
            const char = await getPublicCharacterProfile(charSlug);
            if (char) {
                const orgText = char.organization ? ` | ${char.organization}` : '';
                const attrText = char.attribute_name ? ` | Атрибут: ${char.attribute_name}` : '';
                resolvedMeta = {
                    title: `${char.character_name} — Досье персонажа | Verge TRP`,
                    description: `Ранг ${char.rank || 'F'}${orgText}${attrText}. Досье ролевого персонажа Verge TRP.`,
                    type: 'profile',
                    canonicalUrl: `${baseUrl}/characters/${char.slug || char.public_id}`,
                    imageUrl: sanitizeImageUrl(char.character_avatar),
                    siteName: 'Verge TRP'
                };
            }
        } else if (cleanPath.startsWith('/applications/')) {
            // 3. /applications/:slug
            const appSlug = cleanPath.replace(/^\/applications\//, '').trim();
            const appDoc = await getApplicationBySlug(appSlug);
            if (appDoc) {
                resolvedMeta = {
                    title: `Анкета: ${appDoc.character_name} — Verge TRP`,
                    description: `Анкета персонажа ${appDoc.character_name}. Ранг ${appDoc.rank || 'F'}, статус: ${appDoc.status}.`,
                    type: 'article',
                    canonicalUrl: `${baseUrl}/applications/${appDoc.slug || appDoc.public_id}`,
                    imageUrl: sanitizeImageUrl(appDoc.character_avatar),
                    siteName: 'Verge TRP'
                };
            }
        } else if (cleanPath === '/applications') {
            resolvedMeta = {
                title: 'Анкеты персонажей — Verge TRP',
                description: 'Каталог принятых и проверенных анкет персонажей мира Verge TRP.',
                type: 'website',
                canonicalUrl: `${baseUrl}/applications`,
                imageUrl: null,
                siteName: 'Verge TRP'
            };
        }
    } catch (err) {
        console.error('Error resolving path meta:', err);
    }

    // Cache management
    if (META_CACHE.size >= MAX_CACHE_SIZE) {
        const oldestKey = META_CACHE.keys().next().value;
        META_CACHE.delete(oldestKey);
    }
    META_CACHE.set(cleanPath, { meta: resolvedMeta, timestamp: Date.now() });

    return resolvedMeta;
}

/**
 * Generate OpenGraph, Twitter and Canonical HTML tags
 */
export function buildMetaHtml(meta) {
    const safeTitle = escapeHtml(meta.title);
    const safeDesc = escapeHtml(meta.description);
    const safeCanonical = escapeHtml(meta.canonicalUrl);
    const safeType = escapeHtml(meta.type || 'website');
    const safeSiteName = escapeHtml(meta.siteName || 'Verge TRP');

    let html = `
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}">
    <link rel="canonical" href="${safeCanonical}">
    
    <!-- OpenGraph / Facebook / Discord -->
    <meta property="og:site_name" content="${safeSiteName}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDesc}">
    <meta property="og:type" content="${safeType}">
    <meta property="og:url" content="${safeCanonical}">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="${meta.imageUrl ? 'summary_large_image' : 'summary'}">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDesc}">`;

    if (meta.imageUrl) {
        const safeImage = escapeHtml(meta.imageUrl);
        html += `
    <meta property="og:image" content="${safeImage}">
    <meta name="twitter:image" content="${safeImage}">`;
    }

    return html;
}

/**
 * Express middleware to inject dynamic meta tags into SPA index.html
 */
export function createMetaInjectorMiddleware() {
    const distPath = join(__dirname, '..', '..', 'web', 'dist');
    const indexHtmlPath = join(distPath, 'index.html');
    let templateHtml = null;

    if (existsSync(indexHtmlPath)) {
        try {
            templateHtml = readFileSync(indexHtmlPath, 'utf-8');
        } catch (err) {
            console.error('⚠️ Could not load template index.html for meta injection:', err);
        }
    }

    return async function metaInjectorMiddleware(req, res, next) {
        // Only handle GET requests for web pages (skip /api, static files, etc.)
        if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.includes('.')) {
            return next();
        }

        if (!templateHtml && existsSync(indexHtmlPath)) {
            try {
                templateHtml = readFileSync(indexHtmlPath, 'utf-8');
            } catch {
                templateHtml = null;
            }
        }

        if (!templateHtml) {
            return next();
        }

        try {
            const meta = await resolvePathMeta(req.path, req);
            const injectedTags = buildMetaHtml(meta);

            // Replace existing <title>...</title> if present or inject into <head>
            let modifiedHtml = templateHtml;
            if (modifiedHtml.includes('<title>')) {
                modifiedHtml = modifiedHtml.replace(/<title>[\s\S]*?<\/title>/i, '');
            }

            modifiedHtml = modifiedHtml.replace('</head>', `${injectedTags}\n  </head>`);

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(modifiedHtml);
        } catch (err) {
            console.error('Meta injection error:', err);
            next();
        }
    };
}
