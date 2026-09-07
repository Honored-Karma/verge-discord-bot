import { Router } from 'express';
import { requireAdmin } from '../middlewares/auth.js';
import { csrfProtection } from '../middlewares/csrf.js';
import { 
    getPublicApplications, 
    getApplicationBySlugOrId, 
    batchImportApplications 
} from '../../services/applicationService.js';

export function createApplicationsRouter(discordClient = null) {
    const router = Router();

    // GET /api/applications - Public list of accepted applications with search & pagination
    router.get('/', async (req, res, next) => {
        try {
            const { page, limit, search, attribute, organization } = req.query;

            const result = await getPublicApplications({
                page,
                limit,
                search,
                attribute,
                organization
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    // GET /api/applications/:slug - View accepted character application by slug or ID
    router.get('/:slug', async (req, res, next) => {
        try {
            const { slug } = req.params;
            if (!slug || typeof slug !== 'string' || slug.length < 2) {
                return res.status(400).json({ error: 'InvalidSlug', message: 'Некорректный идентификатор анкеты' });
            }

            const application = await getApplicationBySlugOrId(slug);
            if (!application) {
                return res.status(404).json({
                    error: 'ApplicationNotFound',
                    message: `Принятая анкета "${slug}" не найдена в реестре.`
                });
            }

            res.json({ application });
        } catch (error) {
            next(error);
        }
    });

    // POST /api/applications/sync - Admin-only batch sync of applications from player records with CSRF
    router.post('/sync', csrfProtection, requireAdmin, async (req, res, next) => {
        try {
            const report = await batchImportApplications(discordClient);
            res.json({ success: true, report });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
