/**
 * CSRF Protection Middleware for Same-Origin Session Architecture.
 * Validates Origin, Referer, and Sec-Fetch-Site headers on all state-changing requests.
 */
export function csrfProtection(req, res, next) {
    const method = req.method.toUpperCase();
    
    // Safe read-only methods are excluded from CSRF checks
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        return next();
    }

    const host = req.get('host');
    const origin = req.get('origin');
    const referer = req.get('referer');
    const secFetchSite = req.get('sec-fetch-site');

    // 1. If Sec-Fetch-Site explicitly indicates cross-site request, block immediately
    if (secFetchSite === 'cross-site') {
        return res.status(403).json({
            error: 'CSRFError',
            message: 'Запрос заблокирован политикой безопасности (Cross-Site Request Blocked)'
        });
    }

    // 2. Validate Origin header if present
    if (origin) {
        try {
            const originUrl = new URL(origin);
            const isLocal = (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1');
            const isSameHost = originUrl.host === host;
            const isDevVite = isLocal && (originUrl.port === '5173' || originUrl.port === '3000');
            const isConfiguredAllowed = process.env.ALLOWED_ORIGINS 
                ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(origin)
                : false;

            if (!isSameHost && !isDevVite && !isConfiguredAllowed) {
                return res.status(403).json({
                    error: 'CSRFError',
                    message: 'Недопустимый источник запроса (Origin Mismatch)'
                });
            }

            return next();
        } catch {
            return res.status(403).json({
                error: 'CSRFError',
                message: 'Некорректный заголовок Origin'
            });
        }
    }

    // 3. Fallback: Validate Referer header if Origin is not present
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            const isLocal = (refererUrl.hostname === 'localhost' || refererUrl.hostname === '127.0.0.1');
            const isSameHost = refererUrl.host === host;
            const isDevVite = isLocal && (refererUrl.port === '5173' || refererUrl.port === '3000');

            if (!isSameHost && !isDevVite) {
                return res.status(403).json({
                    error: 'CSRFError',
                    message: 'Недопустимый заголовок Referer'
                });
            }

            return next();
        } catch {
            return res.status(403).json({
                error: 'CSRFError',
                message: 'Некорректный заголовок Referer'
            });
        }
    }

    // In non-browser / test environments where Origin/Referer might not be attached,
    // allow if explicit custom header is present or if running in test environment
    const customHeader = req.get('x-requested-with') || req.get('x-csrf-protection');
    if (customHeader || process.env.NODE_ENV === 'test') {
        return next();
    }

    // Strict default for production browser requests
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'CSRFError',
            message: 'Отсутствуют обязательные заголовки источника запроса (Origin/Referer)'
        });
    }

    next();
}
