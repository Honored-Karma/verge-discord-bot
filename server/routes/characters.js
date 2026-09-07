import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getPlayerByPublicIdentifier, getUserCharacters, isCharacterOwner, sanitizeCharacter } from '../../services/playerService.js';
import { getCharacterInventory } from '../../services/inventoryService.js';

export function createCharactersRouter() {
    const router = Router();

    // GET /api/characters/me - Get active character of authenticated user (full private data)
    router.get('/me', requireAuth, async (req, res, next) => {
        try {
            const userId = req.session?.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized', message: 'Требуется авторизация через Discord' });
            }

            const userChars = await getUserCharacters(userId);
            if (!userChars.activeCharacter) {
                return res.status(404).json({
                    error: 'NoCharacter',
                    message: 'У вас ещё нет созданного персонажа в активном слоте.',
                    activeSlot: userChars.activeSlot,
                    hasCharacters: userChars.hasCharacters,
                    slot1: userChars.slot1 ? sanitizeCharacter(userChars.slot1, true, true) : null,
                    slot2: userChars.slot2 ? sanitizeCharacter(userChars.slot2, true, true) : null
                });
            }

            res.json({
                activeSlot: userChars.activeSlot,
                character: sanitizeCharacter(userChars.activeCharacter, true, true),
                slot1: userChars.slot1 ? sanitizeCharacter(userChars.slot1, true, true) : null,
                slot2: userChars.slot2 ? sanitizeCharacter(userChars.slot2, true, true) : null
            });
        } catch (error) {
            next(error);
        }
    });

    // GET /api/characters/:id - View character by public_id or slug (public/private field filtering)
    router.get('/:id', async (req, res, next) => {
        try {
            const { id } = req.params;
            if (!id || typeof id !== 'string' || id.length < 2) {
                return res.status(400).json({ error: 'InvalidId', message: 'Некорректный идентификатор персонажа' });
            }

            const rawCharacter = await getPlayerByPublicIdentifier(id);
            if (!rawCharacter) {
                return res.status(404).json({
                    error: 'CharacterNotFound',
                    message: `Персонаж "${id}" не найден.`
                });
            }

            // Check if requester is owner or staff
            const currentUser = req.session?.user;
            const isOwner = isCharacterOwner(currentUser, rawCharacter);
            const isStaff = Boolean(currentUser?.permissions?.isStaff);

            const character = sanitizeCharacter(rawCharacter, isOwner, isStaff);

            res.json({ character });
        } catch (error) {
            next(error);
        }
    });

    // GET /api/characters/:id/inventory - Private character inventory (Owner or Staff only)
    router.get('/:id/inventory', async (req, res, next) => {
        try {
            const { id } = req.params;
            if (!id || typeof id !== 'string') {
                return res.status(400).json({ error: 'InvalidId', message: 'Некорректный идентификатор персонажа' });
            }

            // Strict authentication requirement
            const currentUser = req.session?.user;
            if (!currentUser || !currentUser.id) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Требуется авторизация для просмотра инвентаря.'
                });
            }

            const rawCharacter = await getPlayerByPublicIdentifier(id);
            if (!rawCharacter) {
                return res.status(404).json({
                    error: 'CharacterNotFound',
                    message: `Персонаж "${id}" не найден.`
                });
            }

            // Ownership and Staff permission check
            const isOwner = isCharacterOwner(currentUser, rawCharacter);
            const isStaff = Boolean(currentUser.permissions?.isStaff);

            if (!isOwner && !isStaff) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Инвентарь персонажа является приватным.'
                });
            }

            const internalPlayerId = rawCharacter.player_id || rawCharacter.id;
            const inventoryData = await getCharacterInventory(internalPlayerId);

            res.json({
                character: {
                    id: rawCharacter.slug || rawCharacter.public_id,
                    public_id: rawCharacter.public_id,
                    slug: rawCharacter.slug,
                    name: rawCharacter.character_name,
                    avatar: rawCharacter.character_avatar,
                    slot: rawCharacter.slot,
                    organization: rawCharacter.organization,
                    rank: rawCharacter.rank
                },
                inventory: inventoryData
            });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
