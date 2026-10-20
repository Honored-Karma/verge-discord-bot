import express from 'express';
import rateLimit from 'express-rate-limit';
import { 
    calculateUserCapabilities, 
    hasCapability 
} from '../../services/permissionService.js';
import { 
    requireAuth, 
    requireCapability 
} from '../middlewares/auth.js';
import { csrfProtection } from '../middlewares/csrf.js';
import { logAdminAction, getAuditLogs } from '../../services/auditService.js';
import { 
    WIKI_CATEGORIES, 
    generateWikiPublicId,
    loadNormalizedLoreArticles
} from '../../services/wikiService.js';
import { getDB } from '../../utils/db.js';
import { 
    getPlayerByPublicIdentifier, 
    slugifyCharacterName 
} from '../../services/playerService.js';
import { 
    batchImportApplications, 
    getPublicApplications,
    getApplicationBySlugOrId,
    getApplicationForAdmin,
    updateApplication,
    createApplication,
    deleteApplication
} from '../../services/applicationService.js';
import { isValidSafeUrl } from '../../utils/urlHelper.js';
import { isDiscordCdnUrl, saveCharacterAvatar } from '../../utils/avatarStorage.js';
import { isSlot3Unlocked, setSlot3Unlocked } from '../../utils/dataManager.js';

// Mutex lock for batch sync operations
let isSyncRunning = false;

// Admin mutation rate limiter (60 mutations per 15 minutes)
const adminMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests', message: 'Слишком много административных операций. Пожалуйста, подождите.' }
});

export function createAdminRouter(discordClient) {
    const router = express.Router();

    // All admin routes require base authentication
    router.use(requireAuth);

    // ==========================================
    // 1. Current User Permissions & Capabilities
    // ==========================================
    router.get('/permissions', (req, res) => {
        const capabilities = calculateUserCapabilities(req.session.user);
        res.json({
            user: {
                id: req.session.user.id,
                username: req.session.user.username,
                global_name: req.session.user.global_name
            },
            capabilities
        });
    });

    // Guard all subsequent routes with canAccessAdmin
    router.use(requireCapability('canAccessAdmin'));

    // ==========================================
    // 2. Admin Overview Dashboard
    // ==========================================
    router.get('/overview', async (req, res) => {
        try {
            const db = getDB();
            let totalPlayers = 0;
            let wikiCounts = { total: 0, published: 0, draft: 0, archived: 0 };
            let totalApplications = 0;
            let recentAuditLogs = [];

            if (db) {
                const [playersCount, wikiDocs, appCount, auditDocs] = await Promise.all([
                    db.collection('players').countDocuments().catch(() => 0),
                    db.collection('wiki_articles').find({}, { projection: { status: 1 } }).toArray().catch(() => []),
                    db.collection('applications').countDocuments({ status: 'accepted' }).catch(() => 0),
                    db.collection('admin_actions').find({}).sort({ created_at: -1 }).limit(6).toArray().catch(() => [])
                ]);

                totalPlayers = playersCount;
                totalApplications = appCount;
                recentAuditLogs = auditDocs;

                for (const doc of wikiDocs) {
                    wikiCounts.total++;
                    const st = doc.status || 'published';
                    if (st === 'published') wikiCounts.published++;
                    else if (st === 'draft') wikiCounts.draft++;
                    else if (st === 'archived') wikiCounts.archived++;
                }
            } else {
                const localArticles = loadNormalizedLoreArticles();
                wikiCounts = {
                    total: localArticles.length,
                    published: localArticles.length,
                    draft: 0,
                    archived: 0
                };
                totalPlayers = 2;
                totalApplications = 2;
                const logs = await getAuditLogs({ limit: 6 });
                recentAuditLogs = logs.items;
            }

            const systemStatus = {
                database: db ? 'connected' : 'simulation_mode',
                discordBot: discordClient ? (typeof discordClient.isReady === 'function' ? (discordClient.isReady() ? 'online' : 'offline') : (discordClient.isReady ? 'online' : 'offline')) : 'offline',
                serverTime: new Date().toISOString(),
                nodeEnv: process.env.NODE_ENV || 'development'
            };

            res.json({
                stats: {
                    characters: totalPlayers,
                    wiki: wikiCounts,
                    applications: totalApplications
                },
                system: systemStatus,
                recentAudit: recentAuditLogs
            });
        } catch (error) {
            console.error('Error fetching admin overview:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить данные панели управления' });
        }
    });

    // ==========================================
    // 3. Wiki Admin Management
    // ==========================================
    router.get('/wiki', requireCapability('canManageWiki'), async (req, res) => {
        try {
            const { search = '', category = '', status = 'all', page = 1, limit = 50 } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
            const skip = (pageNum - 1) * limitNum;

            const db = getDB();
            if (!db) {
                let items = loadNormalizedLoreArticles();
                if (status !== 'all') items = items.filter(a => (a.status || 'published') === status);
                if (category) items = items.filter(a => a.category === category);
                if (search) {
                    const q = search.toLowerCase();
                    items = items.filter(a => a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
                }

                return res.json({
                    page: pageNum,
                    limit: limitNum,
                    total: items.length,
                    totalPages: Math.ceil(items.length / limitNum) || 1,
                    items: items.slice(skip, skip + limitNum)
                });
            }

            const query = {};
            if (status !== 'all') query.status = status;
            if (category) query.category = category;
            if (search && search.trim()) {
                const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.$or = [
                    { title: { $regex: safeSearch, $options: 'i' } },
                    { slug: { $regex: safeSearch, $options: 'i' } },
                    { aliases: { $regex: safeSearch, $options: 'i' } }
                ];
            }

            const [total, docs] = await Promise.all([
                db.collection('wiki_articles').countDocuments(query),
                db.collection('wiki_articles').find(query).sort({ sort_order: 1, title: 1 }).skip(skip).limit(limitNum).toArray()
            ]);

            res.json({
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1,
                items: docs
            });
        } catch (error) {
            console.error('Error fetching admin wiki articles:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить статьи Wiki' });
        }
    });

    router.get('/wiki/:id', requireCapability('canManageWiki'), async (req, res) => {
        try {
            const target = String(req.params.id).toLowerCase().trim();
            const db = getDB();

            if (db) {
                const doc = await db.collection('wiki_articles').findOne({
                    $or: [{ slug: target }, { public_id: target }]
                });
                if (doc) return res.json({ article: doc });
            }

            const local = loadNormalizedLoreArticles().find(a => a.slug === target || a.public_id === target);
            if (!local) {
                return res.status(404).json({ error: 'NotFound', message: 'Статья не найдена' });
            }

            res.json({ article: local });
        } catch (error) {
            console.error('Error fetching admin article detail:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось получить статью' });
        }
    });

    // Create Draft Wiki Article
    router.post('/wiki', requireCapability('canManageWiki'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const { 
                title, 
                slug, 
                category, 
                summary, 
                content, 
                aliases = [], 
                tags = [], 
                related_articles = [], 
                sort_order = 0,
                banner_url = null,
                image_url = null,
                infobox = null
            } = req.body;

            // Strict Validation
            if (!title || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 120) {
                return res.status(400).json({ error: 'ValidationError', message: 'Название статьи должно быть от 2 до 120 символов' });
            }

            const cleanSlug = slugifyCharacterName(slug || title);
            if (!cleanSlug || cleanSlug.length < 2 || cleanSlug.length > 80 || /[^a-z0-9\-]/.test(cleanSlug)) {
                return res.status(400).json({ error: 'ValidationError', message: 'Некорректный slug статьи (только латиница, цифры и дефис)' });
            }

            const validCat = WIKI_CATEGORIES.find(c => c.id === category);
            if (!validCat) {
                return res.status(400).json({ error: 'ValidationError', message: 'Указана несуществующая категория Wiki' });
            }

            const db = getDB();
            if (db) {
                const existing = await db.collection('wiki_articles').findOne({ slug: cleanSlug });
                if (existing) {
                    return res.status(409).json({ error: 'Conflict', message: `Статья со слагом «${cleanSlug}» уже существует` });
                }
            }

            const now = new Date().toISOString();
            const publicId = generateWikiPublicId(cleanSlug);

            const newArticle = {
                public_id: publicId,
                slug: cleanSlug,
                category: validCat.id,
                title: title.trim(),
                summary: (summary || '').slice(0, 500).trim(),
                content: (content || '').slice(0, 100000),
                banner_url: banner_url ? String(banner_url).trim() : null,
                image_url: image_url ? String(image_url).trim() : null,
                infobox: infobox && typeof infobox === 'object' ? infobox : null,
                sections: [],
                aliases: Array.isArray(aliases) ? aliases.filter(a => typeof a === 'string').map(a => a.trim()) : [],
                tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string').map(t => t.trim()) : [],
                related_articles: Array.isArray(related_articles) ? related_articles : [],
                related_characters: [],
                origin: 'manual',
                is_manually_overridden: false,
                status: 'draft',
                sort_order: Number(sort_order) || 0,
                created_at: now,
                updated_at: now
            };

            if (db) {
                await db.collection('wiki_articles').insertOne(newArticle);
            }

            await logAdminAction({
                actor: req.session.user,
                action: 'wiki_create',
                entity_type: 'wiki_article',
                entity_id: cleanSlug,
                changes: { before: null, after: { title: newArticle.title, status: 'draft' } },
                details: `Создан черновик статьи «${newArticle.title}» в категории ${newArticle.category}`
            });

            res.status(201).json({ article: newArticle });
        } catch (error) {
            console.error('Error creating wiki article:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при сохранении статьи' });
        }
    });

    // Update Wiki Article (with Optimistic Concurrency Control)
    router.patch('/wiki/:id', requireCapability('canManageWiki'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const target = String(req.params.id).toLowerCase().trim();
            const { 
                title, 
                summary, 
                content, 
                category, 
                aliases, 
                tags, 
                related_articles, 
                expected_updated_at, 
                sort_order,
                banner_url,
                image_url,
                infobox
            } = req.body;

            const db = getDB();
            let existingDoc = null;

            if (db) {
                existingDoc = await db.collection('wiki_articles').findOne({
                    $or: [{ slug: target }, { public_id: target }]
                });
            } else {
                existingDoc = loadNormalizedLoreArticles().find(a => a.slug === target || a.public_id === target);
            }

            if (!existingDoc) {
                return res.status(404).json({ error: 'NotFound', message: 'Статья для обновления не найдена' });
            }

            // Optimistic Lock Check
            if (expected_updated_at) {
                const currentUpdatedAt = existingDoc.updated_at || existingDoc.source?.imported_at || '2026-03-01T00:00:00.000Z';
                const dbTime = new Date(currentUpdatedAt).getTime();
                const reqTime = new Date(expected_updated_at).getTime();
                if (Math.abs(dbTime - reqTime) > 1000) {
                    return res.status(409).json({
                        error: 'Conflict',
                        message: 'Статья была изменена другим администратором. Пожалуйста, обновите страницу перед сохранением.',
                        current_updated_at: currentUpdatedAt
                    });
                }
            }

            const updates = {};
            if (title && typeof title === 'string') updates.title = title.trim().slice(0, 120);
            if (summary !== undefined) updates.summary = String(summary).trim().slice(0, 500);
            if (content !== undefined) updates.content = String(content).slice(0, 100000);
            if (category && WIKI_CATEGORIES.some(c => c.id === category)) updates.category = category;
            if (banner_url !== undefined) updates.banner_url = banner_url ? String(banner_url).trim() : null;
            if (image_url !== undefined) updates.image_url = image_url ? String(image_url).trim() : null;
            if (infobox !== undefined) updates.infobox = infobox && typeof infobox === 'object' ? infobox : null;
            if (Array.isArray(aliases)) updates.aliases = aliases.filter(a => typeof a === 'string').map(a => a.trim());
            if (Array.isArray(tags)) updates.tags = tags.filter(t => typeof t === 'string').map(t => t.trim());
            if (Array.isArray(related_articles)) updates.related_articles = related_articles;
            if (sort_order !== undefined) updates.sort_order = Number(sort_order) || 0;

            // Mark canon articles as manually overridden
            if (existingDoc.source?.type === 'verge_lore_document' || existingDoc.origin === 'lore_import') {
                updates.is_manually_overridden = true;
            }

            updates.updated_at = new Date().toISOString();

            if (db) {
                await db.collection('wiki_articles').updateOne(
                    { _id: existingDoc._id },
                    { $set: updates }
                );
            }

            await logAdminAction({
                actor: req.session.user,
                action: 'wiki_update',
                entity_type: 'wiki_article',
                entity_id: existingDoc.slug,
                changes: {
                    before: { title: existingDoc.title, summary: existingDoc.summary },
                    after: { title: updates.title || existingDoc.title, summary: updates.summary || existingDoc.summary }
                },
                details: `Обновлена статья «${updates.title || existingDoc.title}»`
            });

            res.json({
                article: {
                    ...existingDoc,
                    ...updates
                }
            });
        } catch (error) {
            console.error('Error updating wiki article:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при сохранении изменений статьи' });
        }
    });

    // Publish Article
    router.post('/wiki/:id/publish', requireCapability('canManageWiki'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const target = String(req.params.id).toLowerCase().trim();
            const db = getDB();
            const now = new Date().toISOString();

            if (db) {
                const resUpdate = await db.collection('wiki_articles').findOneAndUpdate(
                    { $or: [{ slug: target }, { public_id: target }] },
                    { $set: { status: 'published', updated_at: now } },
                    { returnDocument: 'after' }
                );
                if (!resUpdate) {
                    return res.status(404).json({ error: 'NotFound', message: 'Статья не найдена' });
                }
            }

            await logAdminAction({
                actor: req.session.user,
                action: 'wiki_publish',
                entity_type: 'wiki_article',
                entity_id: target,
                details: `Опубликована статья «${target}»`
            });

            res.json({ success: true, status: 'published' });
        } catch (error) {
            console.error('Error publishing wiki article:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка публикации статьи' });
        }
    });

    // Archive Article
    router.post('/wiki/:id/archive', requireCapability('canManageWiki'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const target = String(req.params.id).toLowerCase().trim();
            const db = getDB();
            const now = new Date().toISOString();

            if (db) {
                const resUpdate = await db.collection('wiki_articles').findOneAndUpdate(
                    { $or: [{ slug: target }, { public_id: target }] },
                    { $set: { status: 'archived', updated_at: now } },
                    { returnDocument: 'after' }
                );
                if (!resUpdate) {
                    return res.status(404).json({ error: 'NotFound', message: 'Статья не найдена' });
                }
            }

            await logAdminAction({
                actor: req.session.user,
                action: 'wiki_archive',
                entity_type: 'wiki_article',
                entity_id: target,
                details: `Архивирована статья «${target}»`
            });

            res.json({ success: true, status: 'archived' });
        } catch (error) {
            console.error('Error archiving wiki article:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка архивации статьи' });
        }
    });

    // ==========================================
    // 4. Applications Admin Management
    // ==========================================
    router.get('/applications', requireCapability('canManageApplications'), async (req, res) => {
        try {
            const { page = 1, limit = 30, search = '', status = 'accepted' } = req.query;
            const data = await getPublicApplications({ page, limit, search, status });
            res.json(data);
        } catch (error) {
            console.error('Error fetching admin applications:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить реестр анкет' });
        }
    });

    router.get('/applications/:id', requireCapability('canManageApplications'), async (req, res) => {
        try {
            const app = await getApplicationForAdmin(req.params.id);
            if (!app) {
                return res.status(404).json({ error: 'NotFound', message: 'Анкета не найдена' });
            }
            res.json({ application: app });
        } catch (error) {
            console.error('Error fetching admin application:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить анкету' });
        }
    });

    // Create New Character Application
    router.post('/applications', requireCapability('canManageApplications'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const newApp = await createApplication(req.body, req.session.user);

            await logAdminAction({
                actor: req.session.user,
                action: 'application_create',
                entity_type: 'application',
                entity_id: newApp.slug || newApp.public_id,
                details: `Создана новая анкета персонажа «${newApp.character_name}» (${newApp.slug})`
            });

            res.status(201).json({ success: true, application: newApp });
        } catch (error) {
            console.error('Error creating application:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при создании анкеты: ' + error.message });
        }
    });

    // Full Application Update (Sections, Media, Stats, Status, Notes)
    router.patch('/applications/:id', requireCapability('canManageApplications'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const targetId = req.params.id;
            const updated = await updateApplication(targetId, req.body, req.session.user);

            await logAdminAction({
                actor: req.session.user,
                action: 'application_update',
                entity_type: 'application',
                entity_id: updated.slug || updated.public_id,
                changes: {
                    status: updated.status,
                    character_name: updated.character_name,
                    attribute_name: updated.attribute_name,
                    organization: updated.organization,
                    rank: updated.rank
                },
                details: `Обновлена анкета персонажа «${updated.character_name}» (статус: ${updated.status})`
            });

            res.json({ success: true, application: updated });
        } catch (error) {
            console.error('Error updating application:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при сохранении анкеты: ' + error.message });
        }
    });

    // Delete or Archive Application
    router.delete('/applications/:id', requireCapability('canManageApplications'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            await deleteApplication(req.params.id, req.session.user);

            await logAdminAction({
                actor: req.session.user,
                action: 'application_delete',
                entity_type: 'application',
                entity_id: req.params.id,
                details: `Удалена/архивирована анкета «${req.params.id}»`
            });

            res.json({ success: true, message: 'Анкета удалена' });
        } catch (error) {
            console.error('Error deleting application:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при удалении анкеты: ' + error.message });
        }
    });

    // Batch Sync Applications from Discord (with Mutex lock)
    router.post('/applications/sync', requireCapability('canManageApplications'), adminMutationLimiter, csrfProtection, async (req, res) => {
        if (isSyncRunning) {
            return res.status(429).json({
                error: 'SyncInProgress',
                message: 'Синхронизация анкет уже выполняется в фоновом режиме. Пожалуйста, подождите.'
            });
        }

        isSyncRunning = true;
        try {
            const report = await batchImportApplications(discordClient);

            await logAdminAction({
                actor: req.session.user,
                action: 'application_sync',
                entity_type: 'application',
                entity_id: 'batch_sync',
                details: `Синхронизация анкет: создано ${report.created}, обновлено ${report.updated}, без изменений ${report.unchanged}, ошибок ${report.failed}`
            });

            res.json({
                success: true,
                report
            });
        } catch (error) {
            console.error('Error syncing applications:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при синхронизации анкет: ' + error.message });
        } finally {
            isSyncRunning = false;
        }
    });

    // ==========================================
    // 5. Characters Admin Inspection & Safe Moderation
    // ==========================================
    router.get('/characters', requireCapability('canViewPrivateCharacters'), async (req, res) => {
        try {
            const { search = '', rank = '', organization = '', page = 1, limit = 30 } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 30));
            const skip = (pageNum - 1) * limitNum;

            const db = getDB();
            if (!db) {
                return res.json({
                    page: 1,
                    limit: limitNum,
                    total: 2,
                    totalPages: 1,
                    items: [
                        {
                            id: 'hana-kami',
                            slug: 'hana-kami',
                            slot: 1,
                            character_name: 'Хана Ками',
                            organization: 'TENRYU',
                            rank: 'S',
                            reputation: 1540,
                            attribute_name: 'Ангел'
                        },
                        {
                            id: 'reime-eul',
                            slug: 'reime-eul',
                            slot: 2,
                            character_name: 'Рейме (Еул)',
                            organization: 'Не состоит',
                            rank: '—',
                            reputation: 820,
                            attribute_name: 'Тень'
                        }
                    ]
                });
            }

            const query = {};
            if (rank) query.rank = rank;
            if (organization) query.organization = organization;
            if (search && search.trim()) {
                const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.$or = [
                    { character_name: { $regex: safeSearch, $options: 'i' } },
                    { slug: { $regex: safeSearch, $options: 'i' } },
                    { attribute_name: { $regex: safeSearch, $options: 'i' } }
                ];
            }

            const [total, docs] = await Promise.all([
                db.collection('players').countDocuments(query),
                db.collection('players').find(query).sort({ reputation: -1, created_at: -1 }).skip(skip).limit(limitNum).toArray()
            ]);

            const items = docs.map(doc => {
                const charId = doc.slug || doc.public_id || doc.id;
                let avatar = doc.character_avatar || null;
                if (avatar && isDiscordCdnUrl(avatar)) {
                    avatar = `/api/avatar/${charId}`;
                }
                return {
                    id: charId,
                    slug: doc.slug,
                    public_id: doc.public_id,
                    slot: doc.slot || (String(doc.id).endsWith('_2') ? 2 : 1),
                    character_name: doc.character_name || 'Безымянный',
                    character_avatar: avatar,
                    organization: doc.organization || 'Не состоит',
                    rank: doc.rank || '—',
                    reputation: Number(doc.reputation || 0),
                    attribute_name: doc.attribute_name || 'Отсутствует',
                    has_sheet: Boolean(doc.character_url),
                    has_physical_stats: Boolean(doc.physical_stats_registered || doc.punch_kg)
                };
            });

            res.json({
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum) || 1,
                items
            });
        } catch (error) {
            console.error('Error fetching admin characters list:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить список персонажей' });
        }
    });

    router.get('/characters/:id', requireCapability('canViewPrivateCharacters'), async (req, res) => {
        try {
            const player = await getPlayerByPublicIdentifier(req.params.id);
            if (!player) {
                return res.status(404).json({ error: 'NotFound', message: 'Персонаж не найден' });
            }
            if (player.character_avatar && isDiscordCdnUrl(player.character_avatar)) {
                player.character_avatar = `/api/avatar/${player.slug || player.public_id || player.id}`;
            }
            res.json({ character: player });
        } catch (error) {
            console.error('Error fetching admin character detail:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить данные персонажа' });
        }
    });

    // Safe Character Moderation (Explicitly non-economy fields only)
    router.patch('/characters/:id', requireCapability('canManageCharacters'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const { 
                character_name, 
                character_avatar, 
                character_banner,
                banner_url,
                attribute_name,
                organization, 
                rank,
                punch_strength_kg,
                lifting_strength_kg,
                speed_kmh,
                reaction_ms,
                stamina_percent,
                physical_stats_registered
            } = req.body;
            const player = await getPlayerByPublicIdentifier(req.params.id);

            if (!player) {
                return res.status(404).json({ error: 'NotFound', message: 'Персонаж не найден' });
            }

            const updates = {};
            if (character_name && typeof character_name === 'string') {
                updates.character_name = character_name.trim().slice(0, 60);
            }
            if (character_avatar !== undefined) {
                const trimmedAvatar = typeof character_avatar === 'string' && character_avatar.trim() ? character_avatar.trim() : null;
                updates.character_avatar = trimmedAvatar;
                if (trimmedAvatar && player.id) {
                    saveCharacterAvatar(player.id, trimmedAvatar, discordClient).catch(() => {});
                }
            }
            const banner = character_banner !== undefined ? character_banner : banner_url;
            if (banner !== undefined) {
                updates.character_banner = typeof banner === 'string' && banner.trim() ? banner.trim() : null;
            }
            if (attribute_name !== undefined) {
                updates.attribute_name = typeof attribute_name === 'string' ? attribute_name.trim().slice(0, 60) : null;
            }
            if (organization !== undefined) {
                updates.organization = typeof organization === 'string' ? organization.trim().slice(0, 50) : null;
            }
            if (rank !== undefined) {
                updates.rank = typeof rank === 'string' ? rank.trim().slice(0, 10) : null;
            }
            if (punch_strength_kg !== undefined) {
                updates.punch_strength_kg = punch_strength_kg !== null ? Number(punch_strength_kg) : null;
            }
            if (lifting_strength_kg !== undefined) {
                updates.lifting_strength_kg = lifting_strength_kg !== null ? Number(lifting_strength_kg) : null;
            }
            if (speed_kmh !== undefined) {
                updates.speed_kmh = speed_kmh !== null ? Number(speed_kmh) : null;
            }
            if (reaction_ms !== undefined) {
                updates.reaction_ms = reaction_ms !== null ? Number(reaction_ms) : null;
            }
            if (stamina_percent !== undefined) {
                updates.stamina_percent = stamina_percent !== null ? Number(stamina_percent) : 100;
            }
            if (physical_stats_registered !== undefined) {
                updates.physical_stats_registered = Boolean(physical_stats_registered);
            }

            const db = getDB();
            if (db) {
                await db.collection('players').updateOne(
                    { id: player.id },
                    { $set: updates }
                );
            }

            await logAdminAction({
                actor: req.session.user,
                action: 'character_update',
                entity_type: 'character',
                entity_id: player.slug || player.public_id,
                changes: {
                    before: { character_name: player.character_name, rank: player.rank, organization: player.organization },
                    after: updates
                },
                details: `Модерация данных персонажа «${updates.character_name || player.character_name}»`
            });

            res.json({
                success: true,
                character: {
                    ...player,
                    ...updates
                }
            });
        } catch (error) {
            console.error('Error updating character:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Ошибка при обновлении персонажа' });
        }
    });

    // ==========================================
    // 6. Admin Audit Log Viewer
    // ==========================================
    router.get('/audit', requireCapability('canViewAuditLog'), async (req, res) => {
        try {
            const { page = 1, limit = 25, action = '', entity_type = '', actor_id = '' } = req.query;
            const logs = await getAuditLogs({ page, limit, action, entity_type, actor_id });
            res.json(logs);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось загрузить журнал аудита' });
        }
    });

    // ==========================================
    // 7. Slot 3 Access Management
    // ==========================================
    router.get('/users/:userId/slot3', requireCapability('canManageRoles'), async (req, res) => {
        try {
            const { userId } = req.params;
            const unlocked = await isSlot3Unlocked(userId);
            res.json({ userId, slot3Unlocked: unlocked });
        } catch (error) {
            console.error('Error fetching slot 3 status:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось получить статус слота' });
        }
    });

    router.post('/users/:userId/slot3', requireCapability('canManageRoles'), adminMutationLimiter, csrfProtection, async (req, res) => {
        try {
            const { userId } = req.params;
            const unlocked = Boolean(req.body.unlocked);
            await setSlot3Unlocked(userId, unlocked);

            await logAdminAction({
                actor: req.session.user,
                action: unlocked ? 'grant_slot_3' : 'revoke_slot_3',
                entity_type: 'user',
                entity_id: userId,
                details: `${unlocked ? 'Выдан' : 'Отозван'} доступ к 3-му слоту персонажа`
            });

            res.json({ success: true, userId, slot3Unlocked: unlocked });
        } catch (error) {
            console.error('Error setting slot 3 status:', error);
            res.status(500).json({ error: 'InternalServerError', message: 'Не удалось обновить статус слота' });
        }
    });

    return router;
}
