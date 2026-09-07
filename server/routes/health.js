import { Router } from 'express';
import { getDB } from '../../utils/db.js';

export function createHealthRouter(discordClient) {
    const router = Router();
    const isProduction = process.env.NODE_ENV === 'production';

    // GET /api/health - Liveness Check
    router.get('/', async (req, res) => {
        let dbConnected = false;
        try {
            const db = getDB();
            if (db) {
                await db.command({ ping: 1 });
                dbConnected = true;
            }
        } catch {
            dbConnected = false;
        }

        const isDiscordReady = Boolean(discordClient?.isReady?.());

        // In test/dev mode without MongoDB, treat as simulated OK
        const isHealthy = isProduction ? dbConnected : true;

        res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'ok' : 'degraded',
            service: 'verge-portal-api',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            checks: {
                database: dbConnected ? 'connected' : (isProduction ? 'disconnected' : 'simulated'),
                discord: isDiscordReady ? 'ready' : (isProduction ? 'disconnected' : 'simulated')
            }
        });
    });

    // GET /api/health/ready - Kubernetes / Platform Readiness Probe
    router.get('/ready', async (req, res) => {
        let dbConnected = false;
        try {
            const db = getDB();
            if (db) {
                await db.command({ ping: 1 });
                dbConnected = true;
            }
        } catch {
            dbConnected = false;
        }

        const isDiscordReady = Boolean(discordClient?.isReady?.());
        const isReady = isProduction ? (dbConnected && isDiscordReady) : true;

        res.status(isReady ? 200 : 503).json({
            status: isReady ? 'ready' : 'not_ready',
            database: dbConnected ? 'ready' : 'not_ready',
            discord: isDiscordReady ? 'ready' : 'not_ready'
        });
    });

    return router;
}
