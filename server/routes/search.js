import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchPublicEcosystem } from '../../services/globalSearchService.js';

// Search rate limiter (120 searches per minute per IP)
const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests', message: 'Слишком много поисковых запросов. Пожалуйста, подождите минуту.' }
});

export function createSearchRouter() {
    const router = Router();

    // GET /api/search?q=...&type=all|characters|applications|wiki&limit=20
    router.get('/', searchLimiter, async (req, res) => {
        try {
            const { q = '', type = 'all', limit = 20 } = req.query;

            const validTypes = ['all', 'characters', 'applications', 'wiki'];
            const targetType = validTypes.includes(type) ? type : 'all';

            const result = await searchPublicEcosystem({
                query: String(q),
                type: targetType,
                limit: parseInt(limit, 10) || 20
            });

            res.json(result);
        } catch (error) {
            console.error('Error in search endpoint:', error);
            res.status(500).json({
                error: 'InternalServerError',
                message: 'Ошибка при выполнении поиска'
            });
        }
    });

    return router;
}
