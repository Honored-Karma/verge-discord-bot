import express from 'express';
import {
    getWikiHomeData,
    getWikiCategories,
    getCategoryArticles,
    getArticleBySlug,
    searchWiki,
    WIKI_CATEGORIES
} from '../../services/wikiService.js';

export function createWikiRouter() {
    const router = express.Router();

    // 1. GET /api/wiki — Overview and featured lore for Wiki Home
    router.get('/', async (req, res) => {
        try {
            const data = await getWikiHomeData();
            res.json(data);
        } catch (error) {
            console.error('Error fetching wiki home:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить главную страницу Wiki' });
        }
    });

    // 2. GET /api/wiki/categories — List of all categories with counts
    router.get('/categories', async (req, res) => {
        try {
            const categories = await getWikiCategories();
            res.json({ categories });
        } catch (error) {
            console.error('Error fetching wiki categories:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить категории Wiki' });
        }
    });

    // 3. GET /api/wiki/search?q=... — Safe search
    router.get('/search', async (req, res) => {
        try {
            const query = typeof req.query.q === 'string' ? req.query.q : '';
            const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);

            if (!query.trim()) {
                return res.json({ query: '', count: 0, results: [] });
            }

            const results = await searchWiki(query, limit);
            res.json({
                query: query.trim().slice(0, 100),
                count: results.length,
                results
            });
        } catch (error) {
            console.error('Error searching wiki:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при выполнении поиска по Wiki' });
        }
    });

    // 4. GET /api/wiki/categories/:category — List of articles in category
    router.get('/categories/:category', async (req, res) => {
        try {
            const categorySlug = String(req.params.category).toLowerCase().trim();
            const categoryMeta = WIKI_CATEGORIES.find(c => c.slug === categorySlug);

            if (!categoryMeta) {
                return res.status(404).json({
                    error: 'CategoryNotFound',
                    message: `Категория «${req.params.category}» не найдена в энциклопедии`
                });
            }

            const articles = await getCategoryArticles(categorySlug);

            res.json({
                category: categoryMeta,
                articles
            });
        } catch (error) {
            console.error('Error fetching wiki category articles:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить статьи категории' });
        }
    });

    // 5. GET /api/wiki/articles/:slug — Single article by slug or public_id
    router.get('/articles/:slug', async (req, res) => {
        try {
            const slug = String(req.params.slug).toLowerCase().trim();
            const article = await getArticleBySlug(slug);

            if (!article) {
                return res.status(404).json({
                    error: 'ArticleNotFound',
                    message: `Статья «${req.params.slug}» не найдена или не опубликована`
                });
            }

            res.json({ article });
        } catch (error) {
            console.error('Error fetching wiki article:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить статью Wiki' });
        }
    });

    // 6. GET /api/wiki/:category/:slug — Alias for direct category-scoped article URLs
    router.get('/:category/:slug', async (req, res) => {
        try {
            const slug = String(req.params.slug).toLowerCase().trim();
            const article = await getArticleBySlug(slug);

            if (!article) {
                return res.status(404).json({
                    error: 'ArticleNotFound',
                    message: `Статья «${req.params.slug}» не найдена или не опубликована`
                });
            }

            res.json({ article });
        } catch (error) {
            console.error('Error fetching wiki article by path:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить статью Wiki' });
        }
    });

    return router;
}
