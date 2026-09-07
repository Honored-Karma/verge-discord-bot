/**
 * Centralized Environment & Configuration Validator for Verge TRP
 */

const FORBIDDEN_SESSION_SECRETS = new Set([
    'secret',
    'session_secret',
    'keyboard cat',
    'development_secret',
    'changeme',
    '1234567890',
    'verge_secret'
]);

export function validateEnv(customEnv = process.env) {
    const env = customEnv;
    const nodeEnv = env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';
    const isTest = nodeEnv === 'test';

    const errors = [];
    const warnings = [];

    // 1. Port
    const port = parseInt(env.PORT, 10) || 3000;
    if (isNaN(port) || port < 1 || port > 65535) {
        errors.push(`PORT must be a valid number between 1 and 65535, received: ${env.PORT}`);
    }

    // 2. MongoDB URI
    const mongoUri = env.MONGODB_URI || '';
    if (isProduction) {
        if (!mongoUri) {
            errors.push('MONGODB_URI is required in production');
        } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
            errors.push('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string');
        }
    } else if (!mongoUri) {
        warnings.push('MONGODB_URI is not set; running in local in-memory simulation mode.');
    }

    // 3. Discord Bot Token
    const discordToken = env.DISCORD_TOKEN || env.BOT_TOKEN || '';
    if (isProduction && !discordToken) {
        errors.push('DISCORD_TOKEN (or BOT_TOKEN) is required in production');
    } else if (!discordToken && !isTest) {
        warnings.push('DISCORD_TOKEN is missing; Discord Bot features will be disabled.');
    }

    // 4. Session Secret
    const sessionSecret = env.SESSION_SECRET || '';
    if (isProduction) {
        if (!sessionSecret) {
            errors.push('SESSION_SECRET is required in production');
        } else if (sessionSecret.length < 32) {
            errors.push(`SESSION_SECRET must be at least 32 characters long in production (current length: ${sessionSecret.length})`);
        } else if (FORBIDDEN_SESSION_SECRETS.has(sessionSecret.toLowerCase())) {
            errors.push('SESSION_SECRET cannot be a common default placeholder string');
        }
    } else if (!sessionSecret) {
        warnings.push('SESSION_SECRET is not set; using local development session fallback.');
    }

    // 5. Web Base URL
    const webBaseUrl = env.WEB_BASE_URL || (isProduction ? '' : `http://localhost:${port}`);
    if (isProduction) {
        if (!webBaseUrl) {
            errors.push('WEB_BASE_URL is required in production');
        } else {
            try {
                const parsed = new URL(webBaseUrl);
                if (parsed.protocol !== 'https:') {
                    errors.push(`WEB_BASE_URL must use HTTPS in production, received: ${webBaseUrl}`);
                }
            } catch {
                errors.push(`WEB_BASE_URL is not a valid URL: ${webBaseUrl}`);
            }
        }
    }

    // 6. Discord OAuth credentials
    const discordClientId = env.DISCORD_CLIENT_ID || '';
    const discordClientSecret = env.DISCORD_CLIENT_SECRET || '';
    const discordRedirectUri = env.DISCORD_REDIRECT_URI || '';

    if (isProduction) {
        if (!discordClientId) errors.push('DISCORD_CLIENT_ID is required in production for OAuth');
        if (!discordClientSecret) errors.push('DISCORD_CLIENT_SECRET is required in production for OAuth');
        if (!discordRedirectUri) {
            errors.push('DISCORD_REDIRECT_URI is required in production for OAuth');
        } else {
            try {
                const parsedRedirect = new URL(discordRedirectUri);
                if (parsedRedirect.protocol !== 'https:') {
                    errors.push(`DISCORD_REDIRECT_URI must use HTTPS in production: ${discordRedirectUri}`);
                }
                if (webBaseUrl) {
                    const parsedBase = new URL(webBaseUrl);
                    if (parsedRedirect.origin !== parsedBase.origin) {
                        errors.push(`DISCORD_REDIRECT_URI origin (${parsedRedirect.origin}) does not match WEB_BASE_URL origin (${parsedBase.origin})`);
                    }
                }
            } catch {
                errors.push(`DISCORD_REDIRECT_URI is not a valid URL: ${discordRedirectUri}`);
            }
        }
    }

    // 7. Guild ID
    const guildId = env.GUILD_ID || '';
    if (isProduction && !guildId) {
        errors.push('GUILD_ID is required in production to verify user server membership');
    }

    // 8. Trust Proxy setting
    let trustProxy = 1; // Default to 1 hop for typical reverse proxy
    if (env.TRUST_PROXY !== undefined) {
        if (env.TRUST_PROXY === 'false' || env.TRUST_PROXY === '0') {
            trustProxy = false;
        } else if (env.TRUST_PROXY === 'true') {
            trustProxy = true;
        } else {
            const parsedNum = parseInt(env.TRUST_PROXY, 10);
            trustProxy = isNaN(parsedNum) ? env.TRUST_PROXY : parsedNum;
        }
    }

    if (errors.length > 0) {
        const message = `[FATAL] Production Environment Validation Failed:\n  - ${errors.join('\n  - ')}`;
        throw new Error(message);
    }

    return {
        NODE_ENV: nodeEnv,
        isProduction,
        isTest,
        PORT: port,
        MONGODB_URI: mongoUri,
        DISCORD_TOKEN: discordToken,
        DISCORD_CLIENT_ID: discordClientId,
        DISCORD_CLIENT_SECRET: discordClientSecret,
        DISCORD_REDIRECT_URI: discordRedirectUri,
        SESSION_SECRET: sessionSecret || 'local_development_fallback_secret_32_characters_long!',
        WEB_BASE_URL: webBaseUrl || `http://localhost:${port}`,
        GUILD_ID: guildId,
        TRUST_PROXY: trustProxy,
        warnings
    };
}
