import { Router } from 'express';
import { getCharacterAvatarData, saveCharacterAvatar } from '../../utils/avatarStorage.js';
import { getDB } from '../../utils/db.js';

function generateFallbackAvatarSvg(name = 'V') {
    const raw = String(name || 'V').trim();
    const initial = (raw.charAt(0) || 'V').toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <defs>
            <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#8b5cf6"/>
                <stop offset="50%" stop-color="#6d28d9"/>
                <stop offset="100%" stop-color="#4c1d95"/>
            </linearGradient>
        </defs>
        <rect width="128" height="128" rx="32" fill="url(#avatarGrad)"/>
        <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
        <text x="64" y="74" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="46" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initial}</text>
    </svg>`;
}

export function createAvatarRouter(discordClient = null) {
    const router = Router();

    router.get('/:playerId', async (req, res, next) => {
        try {
            let playerId = req.params.playerId;
            if (!playerId) {
                return res.status(400).json({ error: 'BadRequest', message: 'ID игрока обязателен' });
            }

            // Strip optional extension like .png, .jpg, .webp, .svg
            playerId = playerId.replace(/\.(png|jpe?g|webp|gif|svg)$/i, '');

            // 1. Try to get avatar data by direct ID
            let avatarData = await getCharacterAvatarData(playerId);
            let playerDoc = null;

            // 2. If not found, check player in DB by id, public_id, or slug
            const db = getDB();
            if (db) {
                playerDoc = await db.collection('players').findOne({
                    $or: [
                        { id: playerId },
                        { public_id: playerId },
                        { slug: playerId }
                    ]
                });

                if (!avatarData && playerDoc?.id && playerDoc.id !== playerId) {
                    avatarData = await getCharacterAvatarData(playerDoc.id);
                }

                // 3. Self-healing: if avatar is not yet cached, but player has character_avatar URL
                if (!avatarData && playerDoc && playerDoc.character_avatar && /^https?:\/\//i.test(playerDoc.character_avatar)) {
                    try {
                        const targetId = playerDoc.id || playerId;
                        const saveRes = await saveCharacterAvatar(targetId, playerDoc.character_avatar, discordClient);
                        if (saveRes.success) {
                            avatarData = await getCharacterAvatarData(targetId);
                        }
                    } catch (healErr) {
                        console.warn(`Self-healing avatar failed for ${playerId}:`, healErr.message);
                    }
                }
            }

            // 4. If avatar binary exists, return it with cache headers
            if (avatarData && avatarData.data) {
                const etag = `W/"${playerId}-${avatarData.updatedAt ? avatarData.updatedAt.getTime() : 0}"`;
                if (req.headers['if-none-match'] === etag) {
                    return res.status(304).end();
                }

                res.setHeader('Content-Type', avatarData.contentType || 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
                res.setHeader('ETag', etag);
                if (avatarData.updatedAt) {
                    res.setHeader('Last-Modified', avatarData.updatedAt.toUTCString());
                }

                return res.send(avatarData.data);
            }

            // 5. If character exists in database but has no avatar or avatar failed to download:
            // return stylish SVG fallback avatar instead of broken 404
            if (playerDoc) {
                const charName = playerDoc.character_name || playerDoc.username || 'V';
                const svgContent = generateFallbackAvatarSvg(charName);
                const svgBuffer = Buffer.from(svgContent, 'utf-8');

                res.setHeader('Content-Type', 'image/svg+xml');
                res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
                return res.send(svgBuffer);
            }

            // 6. Unknown non-existent player
            return res.status(404).json({ error: 'NotFound', message: 'Аватар не найден' });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
