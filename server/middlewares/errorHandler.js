import { logger } from '../../utils/logger.js';

export function errorHandler(err, req, res, next) {
    logger.error(`[API Error] ${req.method} ${req.originalUrl}:`, err);

    if (res.headersSent) {
        return next(err);
    }

    const isDev = process.env.NODE_ENV === 'development';
    const status = err.status || err.statusCode || 500;

    // Sanitize production message to avoid leaking database internals or paths
    let publicMessage = err.message || 'Произошла внутренняя ошибка сервера';
    if (process.env.NODE_ENV === 'production' && status === 500) {
        publicMessage = 'Внутренняя ошибка сервера. Пожалуйста, попробуйте позже.';
    }

    res.status(status).json({
        error: err.name || 'InternalServerError',
        message: publicMessage,
        ...(isDev ? { stack: err.stack } : {})
    });
}
