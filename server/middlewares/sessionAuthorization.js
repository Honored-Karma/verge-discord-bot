import { fetchGuildMember, resolveUserPermissions } from '../../services/authService.js';

const ROLE_CACHE_MS = 60_000;

// Session identity is durable; authorization is refreshed independently. Every
// mutation checks Discord again, while read requests use a short role cache.
export function createSessionAuthorization({ lookupMember = fetchGuildMember, now = Date.now } = {}) {
    return async (req, res, next) => {
        // Logging out and starting a fresh login must work even when Discord is
        // unavailable. These routes do not grant access using the old session.
        if (['/auth/logout', '/auth/discord', '/auth/discord/callback', '/health', '/health/ready'].includes(req.path)) {
            return next();
        }
        const user = req.session?.user;
        if (!user?.id) return next();
        if (process.env.NODE_ENV === 'development' && !process.env.MONGODB_URI && user.id === 'demo_user') {
            return next();
        }
        const timestamp = now();
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        try {
            let member;
            if (mutation || !user.authorization_checked_at || timestamp - user.authorization_checked_at >= ROLE_CACHE_MS) {
                member = await lookupMember(user.id, { strict: true });
                user.authorization_checked_at = timestamp;
                user.is_member_of_guild = Boolean(member);
                user.roles = Array.isArray(member?.roles) ? member.roles.map(String) : [];
            } else {
                member = user.is_member_of_guild ? { roles: user.roles || [] } : null;
            }
            // Recompute even on cached reads: configuration changes must not be
            // overridden by is_admin / permissions flags from an older login.
            user.permissions = resolveUserPermissions(user.id, member);
            if (!member) {
                user.permissions = { isMemberOfGuild: false, isAdmin: false, isGM: false,
                    isAnketolog: false, isModerator: false, isStaff: false, roles: [] };
            }
            user.is_admin = user.permissions.isAdmin;
            user.is_staff = user.permissions.isStaff;
            next();
        } catch (error) {
            user.authorization_checked_at = 0;
            user.roles = [];
            user.is_member_of_guild = false;
            user.is_admin = false;
            user.is_staff = false;
            user.permissions = {};
            console.error('[authorization] Discord membership check failed:', error.message);
            res.status(503).json({ error: 'AuthorizationUnavailable', message: 'Не удалось проверить права. Попробуйте ещё раз.' });
        }
    };
}
