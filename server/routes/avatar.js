import { Router } from 'express';
import { getCharacterAvatarData } from '../../utils/avatarStorage.js';
import { getDB } from '../../utils/db.js';

export function createAvatarRouter() {
    const router = Router();

    router.get('/:playerId', async (req, res, next) => {
        try {
            let playerId = req.params.playerId;
            if (!playerId) {
                return res.status(400).json({ error: 'BadRequest', message: 'ID игрока обязателен' });
            }

            // Strip optional extension like .png, .jpg, .webp
            playerId = playerId.replace(/\.(png|jpe?g|webp|gif)$/i, '');

            // 1. Try to get avatar data by direct ID
            let avatarData = await getCharacterAvatarData(playerId);

            // 2. If not found, player might be referenced by public_id or slug
            if (!avatarData) {
                const db = getDB();
                if (db) {
                    const player = await db.collection('players').findOne({
                        $or: [
                            { id: playerId },
                            { public_id: playerId },
                            { slug: playerId }
                        ]
                    });

                    if (player?.id && player.id !== playerId) {
                        avatarData = await getCharacterAvatarData(player.id);
                    }
                }
            }

            if (!avatarData || !avatarData.data) {
                return res.status(404).json({ error: 'NotFound', message: 'Аватар не найден' });
            }

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
        } catch (error) {
            next(error);
        }
    });

    return router;
}
