import { getDB } from './db.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AVATAR_DIR = join(__dirname, '..', 'data', 'avatars');
const MAX_AVATAR_BYTES = 8 * 1024 * 1024; // 8 MB limit
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

// In-memory cache for ultra-fast repeated profile card renderings
// Map<playerId, { data: Buffer, contentType: string, updatedAt: number }>
const memoryCache = new Map();
const MEMORY_CACHE_LIMIT = 200;

function ensureCacheDir() {
  try {
    if (!existsSync(AVATAR_DIR)) {
      mkdirSync(AVATAR_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create avatar cache dir:', err);
  }
}

/**
 * Validates image buffer magic bytes to ensure it is really an image
 */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 4) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }
  // WEBP: 52 49 46 46 .... 57 45 42 50 (RIFF....WEBP)
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

/**
 * Checks if a string is a Discord CDN attachment URL
 */
export function isDiscordCdnUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('cdn.discordapp.com/attachments/') ||
         url.includes('media.discordapp.net/attachments/');
}

/**
 * Checks if a Discord CDN URL has expired based on the `ex` query param
 */
export function isExpiredDiscordCdnUrl(url) {
  if (!isDiscordCdnUrl(url)) return false;
  try {
    const urlObj = new URL(url);
    const exHex = urlObj.searchParams.get('ex');
    if (!exHex) return false;
    const exSec = parseInt(exHex, 16);
    if (isNaN(exSec)) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    // Expired or will expire in less than 5 minutes
    return exSec <= nowSec + 300;
  } catch {
    return false;
  }
}

/**
 * Refreshes an expired Discord CDN attachment URL using Discord's REST API
 */
export async function refreshDiscordAttachmentUrl(url, client = null) {
  if (!isDiscordCdnUrl(url)) return url;
  
  const token = client?.token || process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
  if (!token) return url;

  try {
    const response = await fetch('https://discord.com/api/v10/attachments/refresh-urls', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ attachment_urls: [url] }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return url;

    const data = await response.json();
    const refreshed = data.refreshed_urls?.[0]?.refreshed;
    return refreshed || url;
  } catch (error) {
    console.warn('Failed to refresh Discord attachment URL:', error.message);
    return url;
  }
}

/**
 * Downloads image bytes from a URL or Attachment
 */
export async function fetchImageBuffer(source, client = null) {
  let url = '';
  if (typeof source === 'string') {
    url = source.trim();
  } else if (source && typeof source === 'object' && source.url) {
    url = source.url;
  } else if (Buffer.isBuffer(source)) {
    const detectedType = detectImageType(source);
    if (!detectedType) {
      throw new Error('Некорректный формат изображения (поддерживаются PNG, JPEG, WEBP, GIF)');
    }
    if (source.length > MAX_AVATAR_BYTES) {
      throw new Error('Размер изображения превышает лимит 8 МБ');
    }
    return { buffer: source, contentType: detectedType };
  } else {
    throw new Error('Не указан источник изображения');
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL должен начинаться с http:// или https://');
  }

  // Pre-refresh Discord CDN URLs if expired
  if (isDiscordCdnUrl(url) && isExpiredDiscordCdnUrl(url)) {
    try {
      url = await refreshDiscordAttachmentUrl(url, client);
    } catch (err) {
      console.warn('Pre-refresh Discord attachment URL failed:', err.message);
    }
  }

  let response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': 'Verge-Discord-Bot/2.0'
    }
  }).catch(err => ({ ok: false, status: 0, statusText: err.message }));

  // If failed and is a Discord CDN URL, attempt a force refresh via Discord API
  if (!response.ok && isDiscordCdnUrl(url)) {
    try {
      const refreshed = await refreshDiscordAttachmentUrl(url, client);
      if (refreshed && refreshed !== url) {
        url = refreshed;
        response = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Verge-Discord-Bot/2.0'
          }
        }).catch(err => ({ ok: false, status: 0, statusText: err.message }));
      }
    } catch {}
  }

  if (!response.ok) {
    throw new Error(`Не удалось загрузить изображение (HTTP ${response.status} ${response.statusText})`);
  }

  const arrayBuf = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error('Размер изображения превышает лимит 8 МБ');
  }

  // Validate real magic bytes
  let contentType = detectImageType(buffer);
  if (!contentType) {
    const headerType = response.headers?.get ? response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() : null;
    if (headerType && ALLOWED_CONTENT_TYPES.has(headerType)) {
      contentType = headerType;
    }
  }

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Недопустимый формат файла. Поддерживаются только изображения (PNG, JPEG, WEBP, GIF)');
  }

  return { buffer, contentType, originalUrl: url };
}

/**
 * Saves character avatar permanently into MongoDB and local cache
 *
 * @param {string} playerId Character/Player ID (e.g. "123456" or "123456_2")
 * @param {string|Buffer|object} source URL string, Attachment object, or Buffer
 * @param {object|null} client Optional Discord client
 * @returns {Promise<{ success: boolean, avatarUrl: string, error?: string }>}
 */
export async function saveCharacterAvatar(playerId, source, client = null) {
  try {
    const { buffer, contentType, originalUrl } = await fetchImageBuffer(source, client);

    // 1. Update in-memory cache
    if (memoryCache.size >= MEMORY_CACHE_LIMIT) {
      const oldestKey = memoryCache.keys().next().value;
      memoryCache.delete(oldestKey);
    }
    memoryCache.set(playerId, {
      data: buffer,
      contentType,
      updatedAt: Date.now()
    });

    // 2. Persist to disk cache
    ensureCacheDir();
    const diskPath = join(AVATAR_DIR, `${playerId}.bin`);
    try {
      writeFileSync(diskPath, buffer);
    } catch (diskErr) {
      console.warn(`Failed to write avatar to disk cache for ${playerId}:`, diskErr.message);
    }

    // 3. Persist to MongoDB `character_avatars` collection
    const db = getDB();
    if (db) {
      await db.collection('character_avatars').updateOne(
        { _id: playerId },
        {
          $set: {
            data: buffer,
            contentType,
            originalUrl: originalUrl || null,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    // Generate public/stable URL
    const webBaseUrl = process.env.WEB_BASE_URL;
    let publicAvatarUrl = `/api/avatar/${playerId}`;
    if (webBaseUrl && /^https?:\/\//i.test(webBaseUrl) && !webBaseUrl.includes('localhost')) {
      publicAvatarUrl = `${webBaseUrl.replace(/\/+$/, '')}/api/avatar/${playerId}?v=${Date.now()}`;
    } else if (originalUrl && !isDiscordCdnUrl(originalUrl)) {
      publicAvatarUrl = originalUrl;
    }

    return {
      success: true,
      avatarUrl: publicAvatarUrl,
      contentType
    };
  } catch (error) {
    console.error(`Error saving avatar for ${playerId}:`, error.message);
    return {
      success: false,
      avatarUrl: null,
      error: error.message
    };
  }
}

/**
 * Retrieves avatar buffer for a character.
 * Checks memory cache -> disk cache -> MongoDB.
 *
 * @param {string} playerId
 * @returns {Promise<Buffer|null>}
 */
export async function getCharacterAvatarBuffer(playerId) {
  if (!playerId) return null;

  // 1. Memory cache
  if (memoryCache.has(playerId)) {
    return memoryCache.get(playerId).data;
  }

  // 2. Disk cache
  const diskPath = join(AVATAR_DIR, `${playerId}.bin`);
  if (existsSync(diskPath)) {
    try {
      const data = readFileSync(diskPath);
      const contentType = detectImageType(data) || 'image/png';
      memoryCache.set(playerId, { data, contentType, updatedAt: Date.now() });
      return data;
    } catch {}
  }

  // 3. MongoDB collection
  const db = getDB();
  if (db) {
    try {
      const doc = await db.collection('character_avatars').findOne({ _id: playerId });
      if (doc && doc.data) {
        const buffer = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer || doc.data);
        const contentType = doc.contentType || detectImageType(buffer) || 'image/png';
        
        // Populate caches
        memoryCache.set(playerId, { data: buffer, contentType, updatedAt: Date.now() });
        try {
          ensureCacheDir();
          writeFileSync(diskPath, buffer);
        } catch {}

        return buffer;
      }
    } catch (err) {
      console.error(`Error fetching avatar from DB for ${playerId}:`, err.message);
    }
  }

  return null;
}

/**
 * Retrieves avatar data (buffer + contentType + updatedAt) for HTTP endpoints.
 *
 * @param {string} playerId
 * @returns {Promise<{ data: Buffer, contentType: string, updatedAt: Date }|null>}
 */
export async function getCharacterAvatarData(playerId) {
  if (!playerId) return null;

  // 1. Memory cache
  if (memoryCache.has(playerId)) {
    const item = memoryCache.get(playerId);
    return {
      data: item.data,
      contentType: item.contentType,
      updatedAt: new Date(item.updatedAt)
    };
  }

  // 2. MongoDB
  const db = getDB();
  if (db) {
    try {
      const doc = await db.collection('character_avatars').findOne({ _id: playerId });
      if (doc && doc.data) {
        const buffer = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer || doc.data);
        const contentType = doc.contentType || detectImageType(buffer) || 'image/png';
        const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : new Date();

        memoryCache.set(playerId, { data: buffer, contentType, updatedAt: updatedAt.getTime() });
        return { data: buffer, contentType, updatedAt };
      }
    } catch (err) {
      console.error(`Error getting avatar data for ${playerId}:`, err.message);
    }
  }

  // 3. Disk cache
  const diskPath = join(AVATAR_DIR, `${playerId}.bin`);
  if (existsSync(diskPath)) {
    try {
      const data = readFileSync(diskPath);
      const contentType = detectImageType(data) || 'image/png';
      return { data, contentType, updatedAt: new Date() };
    } catch {}
  }

  return null;
}

/**
 * Deletes character avatar when player/character is deleted
 */
export async function deleteCharacterAvatar(playerId) {
  if (!playerId) return;

  memoryCache.delete(playerId);

  const diskPath = join(AVATAR_DIR, `${playerId}.bin`);
  if (existsSync(diskPath)) {
    try {
      unlinkSync(diskPath);
    } catch {}
  }

  const db = getDB();
  if (db) {
    try {
      await db.collection('character_avatars').deleteOne({ _id: playerId });
    } catch (err) {
      console.error(`Error deleting avatar for ${playerId}:`, err.message);
    }
  }
}
