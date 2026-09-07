import { Router } from 'express';
import { getDB } from '../../utils/db.js';
import { loadNormalizedLoreArticles } from '../../services/wikiService.js';

export function createSeoRouter() {
    const router = Router();

    // GET /robots.txt
    router.get('/robots.txt', (req, res) => {
        const baseUrl = process.env.WEB_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const robotsContent = `User-agent: *
Allow: /
Allow: /wiki
Allow: /wiki/*
Allow: /applications
Allow: /applications/*
Allow: /characters/*
Allow: /search
Disallow: /admin
Disallow: /admin/*
Disallow: /login
Disallow: /dashboard
Disallow: /inventory
Disallow: /api
Disallow: /api/*

Sitemap: ${baseUrl}/sitemap.xml
`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(robotsContent);
    });

    // GET /sitemap.xml
    router.get('/sitemap.xml', async (req, res) => {
        try {
            const baseUrl = (process.env.WEB_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
            const urls = [
                { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' },
                { loc: `${baseUrl}/wiki`, priority: '0.9', changefreq: 'daily' },
                { loc: `${baseUrl}/applications`, priority: '0.8', changefreq: 'daily' }
            ];

            const db = getDB();

            // 1. Published Wiki Articles
            if (db) {
                const wikiDocs = await db.collection('wiki_articles')
                    .find({ status: 'published' }, { projection: { slug: 1, category: 1, updated_at: 1 } })
                    .toArray();
                
                for (const doc of wikiDocs) {
                    urls.push({
                        loc: `${baseUrl}/wiki/${doc.category || 'world'}/${doc.slug}`,
                        priority: '0.8',
                        changefreq: 'weekly',
                        lastmod: doc.updated_at ? new Date(doc.updated_at).toISOString().split('T')[0] : undefined
                    });
                }
            } else {
                const lore = loadNormalizedLoreArticles().filter(a => (a.status || 'published') === 'published');
                for (const doc of lore) {
                    urls.push({
                        loc: `${baseUrl}/wiki/${doc.category || 'world'}/${doc.slug}`,
                        priority: '0.8',
                        changefreq: 'weekly'
                    });
                }
            }

            // 2. Accepted Applications
            if (db) {
                const appDocs = await db.collection('applications')
                    .find({ status: 'accepted' }, { projection: { slug: 1, updated_at: 1 } })
                    .toArray();

                for (const doc of appDocs) {
                    if (doc.slug) {
                        urls.push({
                            loc: `${baseUrl}/applications/${doc.slug}`,
                            priority: '0.7',
                            changefreq: 'monthly',
                            lastmod: doc.updated_at ? new Date(doc.updated_at).toISOString().split('T')[0] : undefined
                        });
                    }
                }
            }

            // 3. Public Characters
            if (db) {
                const charDocs = await db.collection('players')
                    .find({ slug: { $exists: true, $ne: null } }, { projection: { slug: 1 } })
                    .toArray();

                for (const doc of charDocs) {
                    if (doc.slug) {
                        urls.push({
                            loc: `${baseUrl}/characters/${doc.slug}`,
                            priority: '0.6',
                            changefreq: 'weekly'
                        });
                    }
                }
            }

            const xmlEntries = urls.map(u => {
                let entry = `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n    <changefreq>${u.changefreq}</changefreq>`;
                if (u.lastmod) entry += `\n    <lastmod>${u.lastmod}</lastmod>`;
                entry += '\n  </url>';
                return entry;
            }).join('\n');

            const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;

            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.send(sitemapXml);
        } catch (error) {
            console.error('Error generating sitemap.xml:', error);
            res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
        }
    });

    return router;
}
