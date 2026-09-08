/**
 * Safe Image & Avatar URL Helper for Verge TRP Web Portal
 */

export function isDiscordAttachmentUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('cdn.discordapp.com/attachments/') ||
         url.includes('media.discordapp.net/attachments/');
}

/**
 * Resolves avatar URL ensuring expired Discord attachment links are routed
 * through the backend self-healing proxy /api/avatar/:identifier.
 */
export function resolveAvatarUrl(avatarUrl, identifier = null) {
  if (!avatarUrl || typeof avatarUrl !== 'string') {
    if (identifier) {
      return `/api/avatar/${identifier}`;
    }
    return null;
  }

  const trimmed = avatarUrl.trim();
  if (isDiscordAttachmentUrl(trimmed) && identifier) {
    return `/api/avatar/${identifier}`;
  }

  return trimmed;
}

export const DEFAULT_AVATAR_FALLBACK = '/assets/character/hero_portrait.png';
