import { calculateUserCapabilities, hasCapability } from '../../services/permissionService.js';

export function requireAuth(req, res, next) {
    if (!req.session || !req.session.user || !req.session.user.id) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Требуется авторизация через Discord'
        });
    }
    next();
}

export function requireStaff(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Требуется авторизация через Discord'
        });
    }

    const caps = calculateUserCapabilities(req.session.user);
    if (!caps.canAccessAdmin) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Недостаточно прав доступа'
        });
    }

    next();
}

export function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Требуется авторизация через Discord'
        });
    }

    const caps = calculateUserCapabilities(req.session.user);
    const isFullAdmin = Boolean(
        caps.canManageEconomy ||
        caps.canManageRoles
    );
    if (!isFullAdmin) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Требуются полные права администратора'
        });
    }

    next();
}

/**
 * Granular capability requirement middleware
 */
export function requireCapability(capabilityName) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Требуется авторизация'
            });
        }

        const allowed = hasCapability(req.session.user, capabilityName);
        if (!allowed) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Недостаточно прав для выполнения действия (${capabilityName})`
            });
        }

        next();
    };
}
