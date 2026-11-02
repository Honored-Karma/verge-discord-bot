import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createCharactersRouter } from './routes/characters.js';
import { createApplicationsRouter } from './routes/applications.js';
import { createWikiRouter } from './routes/wiki.js';
import { createAdminRouter } from './routes/admin.js';
import { createSearchRouter } from './routes/search.js';
import { createSeoRouter } from './routes/seo.js';
import { createAvatarRouter } from './routes/avatar.js';
import { createMetaInjectorMiddleware } from './middlewares/metaInjector.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { createSessionAuthorization } from './middlewares/sessionAuthorization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createExpressApp(discordClient) {
    const app = express();
    const isProduction = process.env.NODE_ENV === 'production';
    const mongoUri = process.env.MONGODB_URI;

    // Trust reverse proxy (Railway, Cloudflare, Fly.io, etc.)
    app.set('trust proxy', 1);

    // 1. Compression middleware (gzip/deflate for HTML, CSS, JS, JSON)
    app.use(compression());

    // 2. Helmet Security Headers & Content Security Policy
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
                imgSrc: [
                    "'self'", 
                    'data:', 
                    'blob:', 
                    'https:'
                ],
                connectSrc: ["'self'", 'https://discord.com'],
                frameAncestors: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: false,
        hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        frameguard: { action: 'deny' },
        noSniff: true
    }));

    // 3. Strict CORS Configuration:
    // In production, the SPA is served from the same origin; no open CORS needed.
    // In development, allow the local Vite dev server port.
    if (!isProduction) {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
            process.env.WEB_BASE_URL
        ].filter(Boolean);

        app.use(cors({
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true
        }));
    }

    // 4. Body parsers
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // 5. Rate limiters
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'TooManyRequests', message: 'Слишком много запросов. Пожалуйста, подождите.' }
    });

    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'TooManyRequests', message: 'Слишком много попыток входа. Подождите 15 минут.' }
    });

    app.use('/api/', apiLimiter);
    app.use('/api/auth/', authLimiter);

    // 6. Session store (MongoDB)
    const sessionSecret = process.env.SESSION_SECRET || 'verge_fallback_secret_change_in_production_key';

    const sessionStore = mongoUri
        ? MongoStore.create({
            mongoUrl: mongoUri,
            collectionName: 'sessions',
            ttl: 14 * 24 * 60 * 60, // 14 days
            autoRemove: 'native'
        })
        : undefined;

    app.use(session({
        name: 'verge_session',
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 14 * 24 * 60 * 60 * 1000,
            path: '/'
        }
    }));

    app.use('/api', createSessionAuthorization());

    // 7. SEO Routes (robots.txt & sitemap.xml)
    app.use('/', createSeoRouter());

    // 8. API Routes
    app.use('/api/health', createHealthRouter(discordClient));
    app.use('/api/auth', createAuthRouter());
    app.use('/api/characters', createCharactersRouter());
    app.use('/api/applications', createApplicationsRouter(discordClient));
    app.use('/api/wiki', createWikiRouter());
    app.use('/api/admin', createAdminRouter(discordClient));
    app.use('/api/search', createSearchRouter());
    app.use('/api/avatar', createAvatarRouter(discordClient));

    // 9. Static frontend serving & OpenGraph meta injection
    const distPath = join(__dirname, '..', 'web', 'dist');
    if (existsSync(distPath)) {
        app.use(createMetaInjectorMiddleware());
        app.use(express.static(distPath, {
            maxAge: 0,
            setHeaders: (res, path) => {
                if (path.includes('/assets/')) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                } else if (path.endsWith('index.html')) {
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                }
            }
        }));
        app.use((req, res, next) => {
            if (req.path.startsWith('/api')) return next();
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.sendFile(join(distPath, 'index.html'));
        });
    }

    // 10. Global Error handling
    app.use(errorHandler);

    return app;
}
