import { config } from 'dotenv';
import crypto from 'crypto';

config();

const DISCORD_API_ENDPOINT = 'https://discord.com/api/v10';

export function getOAuthConfig() {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI || `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/api/auth/discord/callback`;
    const guildId = process.env.GUILD_ID;
    const botToken = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;

    return {
        clientId,
        clientSecret,
        redirectUri,
        guildId,
        botToken,
        isConfigured: Boolean(clientId && clientSecret)
    };
}

/**
 * Generate Discord OAuth2 authorize URL with CSRF state
 */
export function generateAuthUrl(state) {
    const { clientId, redirectUri } = getOAuthConfig();
    if (!clientId) {
        throw new Error('DISCORD_CLIENT_ID is not configured');
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify guilds.members.read',
        state: state
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = getOAuthConfig();
    if (!clientId || !clientSecret) {
        throw new Error('Discord OAuth2 credentials are not configured');
    }

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
    });

    const response = await fetch(`${DISCORD_API_ENDPOINT}/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to exchange code: ${response.status} ${errorText}`);
    }

    return await response.json();
}

/**
 * Fetch authenticated Discord user info
 */
export async function fetchDiscordUser(accessToken) {
    const response = await fetch(`${DISCORD_API_ENDPOINT}/users/@me`, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Discord user: ${response.status}`);
    }

    return await response.json();
}

/**
 * Fetch guild member roles for the user (using bot token for highest reliability)
 */
export async function fetchGuildMember(userId, { strict = false } = {}) {
    const { guildId, botToken } = getOAuthConfig();
    if (!guildId || !botToken) {
        if (strict) throw new Error('Discord membership verification is not configured');
        return null;
    }

    try {
        const response = await fetch(`${DISCORD_API_ENDPOINT}/guilds/${guildId}/members/${userId}`, {
            signal: AbortSignal.timeout(5000),
            headers: {
                Authorization: `Bot ${botToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                // User is not in the guild
                return null;
            }
            if (strict) throw new Error(`Guild member fetch returned ${response.status}`);
            console.warn(`[OAuth] Guild member fetch returned ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        if (strict) throw error;
        console.error('[OAuth] Error fetching guild member:', error.message);
        return null;
    }
}

import { loadAdminConfigFile } from '../config/adminConfig.js';

/**
 * Resolve staff permissions based on user ID and guild roles
 */
export function resolveUserPermissions(userId, guildMember) {
    const adminConfigFile = loadAdminConfigFile();
    const envAdminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const adminIds = Array.from(new Set([...envAdminIds, ...adminConfigFile.adminUserIds]));

    const envAdminRoleIds = (process.env.ADMIN_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const adminRoleIds = Array.from(new Set([...envAdminRoleIds, ...adminConfigFile.adminRoleIds]));

    const gmRoleIds = (process.env.GM_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const envAnketologRoleIds = (process.env.ANKETOLOG_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const anketologRoleIds = Array.from(new Set([...envAnketologRoleIds, ...adminConfigFile.anketologRoleIds]));
    const moderatorRoleIds = (process.env.MODERATOR_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const limitedAdminRoleIds = (process.env.LIMITED_ADMIN_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

    const isExplicitAdminId = adminIds.includes(String(userId));
    const memberRoles = Array.isArray(guildMember?.roles) ? guildMember.roles : [];

    const hasAdminRole = adminRoleIds.some(roleId => memberRoles.includes(roleId));
    const hasGmRole = gmRoleIds.some(roleId => memberRoles.includes(roleId));
    const hasAnketologRole = anketologRoleIds.some(roleId => memberRoles.includes(roleId));
    const hasModeratorRole = moderatorRoleIds.some(roleId => memberRoles.includes(roleId));
    const hasLimitedAdminRole = limitedAdminRoleIds.some(roleId => memberRoles.includes(roleId));

    const isAdmin = isExplicitAdminId || hasAdminRole;
    const isGM = isAdmin || hasGmRole;
    const isAnketolog = isAdmin || hasAnketologRole;
    const isModerator = isAdmin || hasModeratorRole;
    const isStaff = isAdmin || isGM || isAnketolog || isModerator || hasLimitedAdminRole;

    return {
        isMemberOfGuild: Boolean(guildMember),
        isAdmin,
        isGM,
        isAnketolog,
        isModerator,
        isStaff,
        roles: memberRoles
    };
}
