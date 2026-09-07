/**
 * Safe URL validation to prevent XSS, SSRF, and protocol injection.
 * Only allows https: and http: (with dev-only localhost exception).
 * Strictly forbids javascript:, data:, file:, vbscript:, blob:, etc.
 */
export function isValidSafeUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;

    const trimmed = urlString.trim();
    if (trimmed.length > 2048) return false;

    // Reject dangerous protocol prefixes before URL parser
    const lower = trimmed.toLowerCase();
    if (
        lower.startsWith('javascript:') || 
        lower.startsWith('data:') || 
        lower.startsWith('file:') || 
        lower.startsWith('vbscript:') ||
        lower.startsWith('blob:')
    ) {
        return false;
    }

    try {
        const parsed = new URL(trimmed);
        
        if (parsed.protocol === 'https:') {
            return true;
        }

        if (parsed.protocol === 'http:') {
            // Only allow http for localhost/127.0.0.1 in development/testing
            const isLocal = parsed.hostname === 'localhost' || 
                            parsed.hostname === '127.0.0.1' || 
                            parsed.hostname === '::1';
            return isLocal || process.env.NODE_ENV !== 'production';
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Sanitize URL for safe HTML / JSX rendering
 */
export function sanitizeSafeUrl(urlString, fallback = null) {
    if (isValidSafeUrl(urlString)) {
        return urlString.trim();
    }
    return fallback;
}
