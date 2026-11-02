import { Router } from 'express';
import crypto from 'crypto';
import {
    getOAuthConfig,
    generateAuthUrl,
    exchangeCode,
    fetchDiscordUser,
    fetchGuildMember,
    resolveUserPermissions
} from '../../services/authService.js';
import { requireAuth } from '../middlewares/auth.js';
import { csrfProtection } from '../middlewares/csrf.js';
import { getUserCharacters, setUserActiveSlot, sanitizeCharacter } from '../../services/playerService.js';
import { calculateUserCapabilities } from '../../services/permissionService.js';

export function createAuthRouter() {
    const router = Router();

    // GET /api/auth/discord - Initiate Discord OAuth2 login
    router.get('/discord', (req, res) => {
        const { isConfigured } = getOAuthConfig();
        if (!isConfigured) {
            return res.status(503).json({
                error: 'OAuthConfigMissing',
                message: 'Discord OAuth2 не настроен на сервере. Укажите DISCORD_CLIENT_ID и DISCORD_CLIENT_SECRET в .env'
            });
        }

        const state = crypto.randomBytes(16).toString('hex');
        req.session.oauthState = state;

        try {
            const authUrl = generateAuthUrl(state);
            res.redirect(authUrl);
        } catch (error) {
            res.status(500).json({ error: 'AuthUrlError', message: error.message });
        }
    });

    // GET /api/auth/discord/callback - OAuth2 Callback with CSRF validation & Session Regeneration
    router.get('/discord/callback', async (req, res) => {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.warn(`[OAuth Error] ${error}: ${error_description}`);
            return res.redirect(`/login?error=${encodeURIComponent(error_description || error)}`);
        }

        if (!code || !state) {
            return res.redirect('/login?error=missing_code_or_state');
        }

        // Validate state for CSRF mitigation and immediately invalidate it
        const savedState = req.session.oauthState;
        delete req.session.oauthState;

        if (!savedState || savedState !== state) {
            console.warn('[OAuth Error] CSRF state mismatch or expired state');
            return res.redirect('/login?error=invalid_state');
        }

        try {
            // 1. Exchange code for access token
            const tokenData = await exchangeCode(code);

            // 2. Fetch Discord user
            const discordUser = await fetchDiscordUser(tokenData.access_token);

            // 3. Fetch server member info to resolve roles
            const guildMember = await fetchGuildMember(discordUser.id, { strict: true });

            // 4. Resolve permissions
            const permissions = resolveUserPermissions(discordUser.id, guildMember);

            // 5. Prevent Session Fixation: Regenerate session ID upon successful login
            req.session.regenerate((regenErr) => {
                if (regenErr) {
                    console.error('[OAuth Session Regeneration Error]:', regenErr);
                    return res.redirect('/login?error=session_error');
                }

                // Store only required safe user identity and permissions
                req.session.user = {
                    id: discordUser.id,
                    username: discordUser.username,
                    discriminator: discordUser.discriminator,
                    global_name: discordUser.global_name || discordUser.username,
                    avatar: discordUser.avatar,
                    avatarUrl: discordUser.avatar
                        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
                        : `https://cdn.discordapp.com/embed/avatars/${Number(discordUser.discriminator || 0) % 5}.png`,
                    permissions: permissions,
                    roles: permissions?.roles || [],
                    is_member_of_guild: Boolean(guildMember),
                    authorization_checked_at: Date.now(),
                    is_admin: Boolean(permissions?.isAdmin),
                    is_staff: Boolean(permissions?.isStaff)
                };

                // Save session before redirect
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('[OAuth Session Save Error]:', saveErr);
                        return res.redirect('/login?error=session_error');
                    }
                    res.redirect('/dashboard');
                });
            });
        } catch (err) {
            console.error('[OAuth Callback Exception]:', err);
            res.redirect(`/login?error=${encodeURIComponent('Ошибка авторизации: ' + err.message)}`);
        }
    });

    // GET /api/auth/me - Current user session info + character data
    router.get('/me', async (req, res) => {
        if (!req.session || !req.session.user || !req.session.user.id) {
            if (!process.env.MONGODB_URI && process.env.NODE_ENV === 'development') {
                // Fallback for visual review in offline preview mode only
                const demoUser = {
                    id: 'demo_user',
                    username: 'solok',
                    discriminator: '0',
                    global_name: 'Solok',
                    avatar: null,
                    avatarUrl: null,
                    is_admin: true,
                    is_staff: true,
                    permissions: { isAdmin: true, isGM: true, isAnketolog: true, isStaff: true },
                    roles: []
                };
                const demoCapabilities = calculateUserCapabilities(demoUser);
                demoUser.capabilities = demoCapabilities;
                req.session.user = demoUser;
                const characters = await getUserCharacters('demo_user');
                return res.json({
                    authenticated: true,
                    user: {
                        ...demoUser,
                        characters: {
                            activeSlot: characters.activeSlot,
                            hasCharacters: characters.hasCharacters,
                            slot1: characters.slot1 ? sanitizeCharacter(characters.slot1, true, true) : null,
                            slot2: characters.slot2 ? sanitizeCharacter(characters.slot2, true, true) : null,
                            slot3: characters.slot3 ? sanitizeCharacter(characters.slot3, true, true) : null,
                            slot3Unlocked: Boolean(characters.slot3Unlocked),
                            activeCharacter: characters.activeCharacter ? sanitizeCharacter(characters.activeCharacter, true, true) : null
                        }
                    }
                });
            }

            return res.json({
                authenticated: false,
                user: null
            });
        }

        try {
            const characters = await getUserCharacters(req.session.user.id);
            const capabilities = calculateUserCapabilities(req.session.user);

            res.json({
                authenticated: true,
                user: {
                    ...req.session.user,
                    capabilities,
                    characters: {
                        activeSlot: characters.activeSlot,
                        hasCharacters: characters.hasCharacters,
                        slot1: characters.slot1 ? sanitizeCharacter(characters.slot1, true, true) : null,
                        slot2: characters.slot2 ? sanitizeCharacter(characters.slot2, true, true) : null,
                        slot3: characters.slot3 ? sanitizeCharacter(characters.slot3, true, true) : null,
                        slot3Unlocked: Boolean(characters.slot3Unlocked),
                        activeCharacter: characters.activeCharacter ? sanitizeCharacter(characters.activeCharacter, true, true) : null
                    }
                }
            });
        } catch (error) {
            console.error('[Auth /me error]:', error);
            const capabilities = calculateUserCapabilities(req.session.user);
            res.json({
                authenticated: true,
                user: {
                    ...req.session.user,
                    capabilities,
                    characters: {
                        activeSlot: 1,
                        hasCharacters: false,
                        slot1: null,
                        slot2: null,
                        slot3: null,
                        activeCharacter: null
                    }
                }
            });
        }
    });

    // POST /api/auth/active-slot - Switch active slot for current user
    router.post('/active-slot', csrfProtection, async (req, res) => {
        const userId = req.session?.user?.id || (!process.env.MONGODB_URI && process.env.NODE_ENV === 'development' ? 'demo_user' : null);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Требуется авторизация' });
        }

        const slot = Number(req.body.slot);
        if (slot !== 1 && slot !== 2 && slot !== 3) {
            return res.status(400).json({ error: 'InvalidSlot', message: 'Номер слота должен быть 1, 2 или 3' });
        }

        try {
            await setUserActiveSlot(userId, slot);
            const characters = await getUserCharacters(userId);

            res.json({
                success: true,
                activeSlot: slot,
                characters: {
                    activeSlot: characters.activeSlot,
                    hasCharacters: characters.hasCharacters,
                    slot1: characters.slot1 ? sanitizeCharacter(characters.slot1, true, true) : null,
                    slot2: characters.slot2 ? sanitizeCharacter(characters.slot2, true, true) : null,
                    slot3: characters.slot3 ? sanitizeCharacter(characters.slot3, true, true) : null,
                    slot3Unlocked: Boolean(characters.slot3Unlocked),
                    activeCharacter: characters.activeCharacter ? sanitizeCharacter(characters.activeCharacter, true, true) : null
                }
            });
        } catch (error) {
            console.error('[Switch active slot error]:', error);
            res.status(500).json({ error: 'SlotSwitchError', message: error.message });
        }
    });

    // POST /api/auth/logout - Terminate session & clear cookies
    router.post('/logout', csrfProtection, (req, res) => {
        if (req.session) {
            req.session.destroy(err => {
                if (err) {
                    console.error('[Logout Error]:', err);
                    return res.status(500).json({ error: 'LogoutFailed', message: 'Не удалось завершить сессию' });
                }
                res.clearCookie('verge_session', { path: '/' });
                res.json({ success: true, message: 'Сессия завершена' });
            });
        } else {
            res.clearCookie('verge_session', { path: '/' });
            res.json({ success: true });
        }
    });

    return router;
}
