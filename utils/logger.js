/**
 * Structured Logger for Verge TRP with automatic sensitive data redaction
 */

function redactSensitive(text) {
    if (typeof text !== 'string') return text;

    return text
        // Redact Mongo credentials
        .replace(/mongodb(\+srv)?:\/\/[^:]+:[^@]+@/gi, 'mongodb$1://[REDACTED_USER]:[REDACTED_PASSWORD]@')
        // Redact Authorization headers / Bearer tokens
        .replace(/(Bearer|Bot)\s+[A-Za-z0-9_\-.]+/gi, '$1 [REDACTED_TOKEN]')
        // Redact client secrets
        .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]')
        // Redact session cookie signatures
        .replace(/connect\.sid=[^;\s]+/gi, 'connect.sid=[REDACTED]');
}

function formatLog(level, message, meta) {
    const timestamp = new Date().toISOString();
    const cleanMsg = redactSensitive(typeof message === 'string' ? message : JSON.stringify(message));
    
    if (meta && Object.keys(meta).length > 0) {
        const cleanMeta = JSON.parse(redactSensitive(JSON.stringify(meta)));
        return `[${timestamp}] [${level}] ${cleanMsg} ${JSON.stringify(cleanMeta)}`;
    }
    return `[${timestamp}] [${level}] ${cleanMsg}`;
}

export const logger = {
    info(message, meta) {
        console.log(formatLog('INFO', message, meta));
    },
    warn(message, meta) {
        console.warn(formatLog('WARN', message, meta));
    },
    error(message, errorOrMeta) {
        if (errorOrMeta instanceof Error) {
            const cleanStack = redactSensitive(errorOrMeta.stack || errorOrMeta.message);
            console.error(formatLog('ERROR', message, { error: cleanStack }));
        } else {
            console.error(formatLog('ERROR', message, errorOrMeta));
        }
    },
    debug(message, meta) {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(formatLog('DEBUG', message, meta));
        }
    }
};
