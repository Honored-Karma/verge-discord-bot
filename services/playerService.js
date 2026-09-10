import { getDB } from '../utils/db.js';
import { getWeeklySalary, normalizeOrganization, normalizeRank } from '../utils/rankSystem.js';
import { isValidSafeUrl } from '../utils/urlHelper.js';
import { isDiscordCdnUrl } from '../utils/avatarStorage.js';
import { isSlot3Unlocked } from '../utils/dataManager.js';
import crypto from 'crypto';

// Cyrillic transliteration map for clean slugs
const RU_TO_LATIN_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    ' ': '-', '_': '-'
};

export function slugifyCharacterName(name) {
    if (!name || typeof name !== 'string') return 'unnamed-character';
    
    const cleaned = name.trim().toLowerCase();
    let result = '';
    
    for (const char of cleaned) {
        if (RU_TO_LATIN_MAP[char] !== undefined) {
            result += RU_TO_LATIN_MAP[char];
        } else if (/[a-z0-9\-]/.test(char)) {
            result += char;
        }
    }
    
    const slug = result.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug || 'character';
}

/**
 * Generate a deterministic or random opaque public ID (e.g. "ch_kF82xP9q")
 */
export function generatePublicId(internalId = '', slot = 1) {
    if (internalId) {
        // Deterministic hash to keep ID stable across restarts if not yet saved in DB
        const hash = crypto.createHash('sha256').update(`${internalId}_${slot}_verge_salt`).digest('hex').slice(0, 10);
        return `ch_${hash}`;
    }
    return `ch_${crypto.randomBytes(5).toString('hex')}`;
}

const PLAYER_DEFAULTS = {
    character_avatar: null,
    character_banner: null,
    character_name: null,
    character_url: null,
    attribute_name: null,
    krw: 0,
    yen: 0,
    ap: 0,
    rank: null,
    organization: null,
    custom_org: null,
    salary_multiplier: 100,
    ap_multiplier: 100,
    sp_multiplier: 100,
    ap_multiplier_expires_at: 0,
    sp_multiplier_expires_at: 0,
    last_train_timestamp: 0,
    last_socialrp_timestamp: 0,
    last_sp_train_timestamp: 0,
    reputation: 20,
    punch_strength_kg: null,
    lifting_strength_kg: null,
    speed_kmh: null,
    stamina_percent: 100,
    reaction_ms: null,
    physical_stats_registered: false
};

export const SAMPLE_DEMO_CHARACTERS = {
    'demo_user': {
        id: 'demo_user',
        public_id: 'ch_hana_kami',
        slug: 'hana-kami',
        username: 'hana_kami',
        character_name: 'Хана Ками',
        character_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces',
        character_banner: 'https://iili.io/BP3OOut.png',
        character_url: 'https://discord.com/channels/demo/sheets/hana-kami',
        attribute_name: 'Ангел',
        krw: 5000000,
        yen: 120000,
        ap: 1050,
        organization: 'TENRYU',
        rank: 'S',
        punch_strength_kg: 13200,
        lifting_strength_kg: 800,
        speed_kmh: 570,
        stamina_percent: 200,
        reaction_ms: 15,
        reputation: 1550,
        physical_stats_registered: true,
        styles: [
            { name: 'Стиль сонной луны', sp: 1200, rank: 'Эксперт', progress: 80, nextSp: 2500 },
            { name: 'Кровавое Тхэквондо', sp: 450, rank: 'Владелец', progress: 30, nextSp: 1000 }
        ]
    },
    'demo_user_2': {
        id: 'demo_user_2',
        public_id: 'ch_reime_eul',
        slug: 'reime-eul',
        username: 'reime_eul',
        character_name: 'Рейме (Еул)',
        character_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=faces',
        character_banner: 'https://s.iimg.su/s/22/ufkWBu0xWZJ35E1dhmIFfmTwEoXZtvP8zOPqXpsI.jpg',
        character_url: 'https://discord.com/channels/demo/sheets/reime',
        attribute_name: 'Тень',
        krw: 1850000,
        yen: 45000,
        ap: 340,
        organization: 'Не состоит',
        rank: '—',
        punch_strength_kg: 950,
        lifting_strength_kg: 180,
        speed_kmh: 28,
        stamina_percent: 100,
        reaction_ms: 120,
        reputation: 820,
        physical_stats_registered: true,
        styles: [
            { name: 'Стиль сонной луны', sp: 320, rank: 'Новичок', progress: 91, nextSp: 350 }
        ]
    }
};

let localActiveSlot = 1;

function getReputationTier(rtg) {
    const value = Number(rtg || 0);
    if (value >= 5000) return { name: 'Мировой уровень', min: 5000, class: 'tier-world' };
    if (value >= 3000) return { name: 'Известность в стране', min: 3000, class: 'tier-country' };
    if (value >= 1500) return { name: 'Городская известность', min: 1500, class: 'tier-city' };
    if (value >= 800) return { name: 'Районный авторитет', min: 800, class: 'tier-district' };
    if (value >= 400) return { name: 'Квартальный уровень', min: 400, class: 'tier-block' };
    if (value < 0) return { name: 'Отверженный', min: -100, class: 'tier-outcast' };
    return { name: 'Начальный уровень', min: 0, class: 'tier-novice' };
}

function getStyleMastery(spValue) {
    const sp = Number(spValue || 0);
    if (sp >= 2500) {
        return { rank: 'Мастер', minSp: 2500, nextSp: null, progress: 100 };
    }
    if (sp >= 1000) {
        return { rank: 'Эксперт', minSp: 1000, nextSp: 2500, progress: Math.min(100, Math.round(((sp - 1000) / 1500) * 100)) };
    }
    if (sp >= 350) {
        return { rank: 'Владелец', minSp: 350, nextSp: 1000, progress: Math.min(100, Math.round(((sp - 350) / 650) * 100)) };
    }
    return { rank: 'Новичок', minSp: 0, nextSp: 350, progress: Math.min(100, Math.round((sp / 350) * 100)) };
}

/**
 * Check if a session user owns the target character slot
 */
export function isCharacterOwner(user, characterOrPlayerId) {
    if (!user || !user.id || !characterOrPlayerId) return false;
    
    const userId = String(user.id).trim();
    
    if (typeof characterOrPlayerId === 'object') {
        const internalId = String(characterOrPlayerId.player_id || characterOrPlayerId.id || '').trim();
        return internalId === userId || internalId === `${userId}_2`;
    }

    const normalizedTarget = String(characterOrPlayerId).trim();
    return normalizedTarget === userId || normalizedTarget === `${userId}_2`;
}

/**
 * Format and normalize raw player database document
 */
export function normalizePlayer(doc, slotNumber = 1) {
    if (!doc) return null;

    const base = { ...PLAYER_DEFAULTS, ...doc };
    const internalId = String(base.id);
    const punchKg = base.punch_strength_kg !== null && base.punch_strength_kg !== undefined ? Number(base.punch_strength_kg) : null;
    const liftKg = base.lifting_strength_kg !== null && base.lifting_strength_kg !== undefined ? Number(base.lifting_strength_kg) : null;
    const speedKmh = base.speed_kmh !== null && base.speed_kmh !== undefined ? Number(base.speed_kmh) : null;
    const reactionMs = base.reaction_ms !== null && base.reaction_ms !== undefined ? Number(base.reaction_ms) : null;
    const staminaPercent = base.stamina_percent !== null && base.stamina_percent !== undefined ? Number(base.stamina_percent) : 100;
    
    // Lore calculation: durability is 3x punch strength
    const durabilityKg = punchKg !== null ? punchKg * 3 : null;

    const org = normalizeOrganization(base.organization) || base.organization;
    const rank = normalizeRank(base.rank) || base.rank;
    const weeklySalary = org && rank ? getWeeklySalary(org, rank) : null;
    const reputation = Number(base.reputation ?? 20);

    const publicId = base.public_id || generatePublicId(internalId, slotNumber);
    const slug = base.slug || slugifyCharacterName(base.character_name || 'character');

    let resolvedAvatar = base.character_avatar || null;
    if (resolvedAvatar && isDiscordCdnUrl(resolvedAvatar)) {
        resolvedAvatar = `/api/avatar/${slug || publicId || internalId}`;
    }

    return {
        // Internal ID preserved for bot/database operations, but hidden by sanitizeCharacter
        player_id: internalId,
        public_id: publicId,
        slug: slug,
        id: slug, // Default public identifier
        slot: slotNumber,
        character_name: base.character_name || 'Безымянный персонаж',
        character_avatar: resolvedAvatar,
        character_banner: base.character_banner || base.banner_url || null,
        banner_url: base.character_banner || base.banner_url || null,
        character_url: isValidSafeUrl(base.character_url) ? base.character_url : null,
        attribute_name: base.attribute_name || null,
        has_attribute: Boolean(base.attribute_name),
        krw: Number(base.krw || 0),
        yen: Number(base.yen || 0),
        ap: Number(base.ap || 0),
        organization: org,
        custom_org: base.custom_org || null,
        rank: rank,
        weekly_salary: weeklySalary,
        reputation: reputation,
        reputation_tier: getReputationTier(reputation),
        ap_multiplier: Number(base.ap_multiplier || 100),
        sp_multiplier: Number(base.sp_multiplier || 100),
        salary_multiplier: Number(base.salary_multiplier ?? 100),
        physical_stats: {
            is_registered: Boolean(base.physical_stats_registered || punchKg !== null),
            punch_kg: punchKg,
            lifting_kg: liftKg,
            speed_kmh: speedKmh,
            stamina_percent: staminaPercent,
            reaction_ms: reactionMs,
            durability_kg: durabilityKg
        },
        cooldowns: {
            last_train: Number(base.last_train_timestamp || 0),
            last_socialrp: Number(base.last_socialrp_timestamp || 0),
            last_sp_train: Number(base.last_sp_train_timestamp || 0)
        },
        styles: base.styles || []
    };
}

/**
 * Sanitize character output according to access control policy:
 * - Owners and Staff receive full private details (balances, salary, multipliers, cooldowns).
 * - Public visitors receive only RP/Lore public profile attributes.
 * - Discord User ID is NEVER exposed in the public JSON representation!
 */
export function sanitizeCharacter(player, isOwner = false, isStaff = false) {
    if (!player) return null;

    const publicIdentifier = player.slug || player.public_id || 'ch_unknown';

    if (isOwner || isStaff) {
        return {
            id: publicIdentifier,
            public_id: player.public_id,
            slug: player.slug,
            slot: player.slot,
            character_name: player.character_name,
            character_avatar: player.character_avatar,
            character_banner: player.character_banner || player.banner_url || null,
            banner_url: player.character_banner || player.banner_url || null,
            character_url: player.character_url,
            attribute_name: player.attribute_name,
            has_attribute: player.has_attribute,
            krw: player.krw,
            yen: player.yen,
            ap: player.ap,
            organization: player.organization,
            custom_org: player.custom_org,
            rank: player.rank,
            weekly_salary: player.weekly_salary,
            reputation: player.reputation,
            reputation_tier: player.reputation_tier,
            ap_multiplier: player.ap_multiplier,
            sp_multiplier: player.sp_multiplier,
            salary_multiplier: player.salary_multiplier,
            physical_stats: player.physical_stats,
            cooldowns: player.cooldowns,
            styles: player.styles || [],
            total_sp: player.total_sp || 0,
            is_owner: isOwner,
            is_staff_view: !isOwner && isStaff
        };
    }

    // Public View: Strip sensitive economy, multipliers & internal cooldown data
    return {
        id: publicIdentifier,
        public_id: player.public_id,
        slug: player.slug,
        slot: player.slot,
        character_name: player.character_name,
        character_avatar: player.character_avatar,
        character_banner: player.character_banner || player.banner_url || null,
        banner_url: player.character_banner || player.banner_url || null,
        character_url: player.character_url,
        attribute_name: player.attribute_name,
        has_attribute: player.has_attribute,
        ap: player.ap,
        organization: player.organization,
        rank: player.rank,
        reputation: player.reputation,
        reputation_tier: player.reputation_tier,
        physical_stats: player.physical_stats,
        styles: player.styles || [],
        total_sp: player.total_sp || 0,
        is_owner: false
    };
}

/**
 * Get character by public identifier (slug or public_id)
 */
export async function getPlayerByPublicIdentifier(publicIdOrSlug) {
    if (!publicIdOrSlug || typeof publicIdOrSlug !== 'string') return null;

    const identifier = publicIdOrSlug.trim();
    const db = getDB();

    if (!db) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Database connection is unavailable in production');
        }
        const demoKey = Object.keys(SAMPLE_DEMO_CHARACTERS).find(k => {
            const c = SAMPLE_DEMO_CHARACTERS[k];
            return c.slug === identifier || c.public_id === identifier || c.id === identifier;
        });

        if (!demoKey) return null;
        const demoDoc = SAMPLE_DEMO_CHARACTERS[demoKey];
        const slotMatch = String(demoDoc.id).match(/_(\d+)$/);
        const slot = slotMatch ? Number(slotMatch[1]) : 1;
        const player = normalizePlayer(demoDoc, slot);
        player.total_sp = (player.styles || []).reduce((acc, curr) => acc + (curr.sp || 0), 0);
        return player;
    }

    // 1. Try finding by slug or public_id
    let doc = await db.collection('players').findOne({
        $or: [
            { slug: identifier },
            { public_id: identifier }
        ]
    });

    // 2. Fallback for internal player_id lookups (e.g. staff or backwards compatibility)
    if (!doc && /^\d+(_\d+)?$/.test(identifier)) {
        doc = await db.collection('players').findOne({ id: identifier });
    }

    if (!doc) return null;

    const slotMatch = String(doc.id).match(/_(\d+)$/);
    const slot = slotMatch ? Number(slotMatch[1]) : 1;
    const player = normalizePlayer(doc, slot);

    const styles = await db.collection('player_sp').find({ player_id: String(doc.id) }).toArray();
    player.styles = styles.map(s => {
        const mastery = getStyleMastery(s.sp);
        return {
            name: s.style_name || s.style_id,
            sp: Number(s.sp || 0),
            rank: mastery.rank,
            progress: mastery.progress,
            next_sp: mastery.nextSp
        };
    });

    player.total_sp = player.styles.reduce((acc, curr) => acc + curr.sp, 0);

    return player;
}

/**
 * Get sanitized public profile of a character by public identifier
 */
export async function getPublicCharacterProfile(slugOrId) {
    const player = await getPlayerByPublicIdentifier(slugOrId);
    if (!player) return null;
    return sanitizeCharacter(player, false, false);
}

/**
 * Get single player document by exact internal ID (e.g. "123456789" or "123456789_2")
 */
export async function getPlayerById(playerId) {
    return getPlayerByPublicIdentifier(playerId);
}

/**
 * Get all slots and active character for a Discord User ID
 */
export async function getUserCharacters(discordUserId) {
    const db = getDB();
    if (!db) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Database connection is unavailable in production');
        }
        const slot1 = normalizePlayer(SAMPLE_DEMO_CHARACTERS['demo_user'], 1);
        slot1.total_sp = (slot1.styles || []).reduce((acc, curr) => acc + (curr.sp || 0), 0);
        
        const slot2 = normalizePlayer(SAMPLE_DEMO_CHARACTERS['demo_user_2'], 2);
        slot2.total_sp = (slot2.styles || []).reduce((acc, curr) => acc + (curr.sp || 0), 0);

        const slot3 = SAMPLE_DEMO_CHARACTERS['demo_user_3']
            ? normalizePlayer(SAMPLE_DEMO_CHARACTERS['demo_user_3'], 3)
            : null;
        if (slot3) {
            slot3.total_sp = (slot3.styles || []).reduce((acc, curr) => acc + (curr.sp || 0), 0);
        }

        const activeCharacter = localActiveSlot === 3 ? slot3 : (localActiveSlot === 2 ? slot2 : slot1);
        const slot3Unlocked = await isSlot3Unlocked(discordUserId);

        return {
            activeSlot: localActiveSlot,
            hasCharacters: true,
            slot1,
            slot2,
            slot3,
            slot3Unlocked,
            activeCharacter
        };
    }

    const userId = String(discordUserId);

    const settings = await db.collection('user_settings').findOne({ id: userId });
    const rawActive = Number(settings?.active_slot);
    const activeSlot = [1, 2, 3].includes(rawActive) ? rawActive : 1;

    const slot1Id = userId;
    const slot2Id = `${userId}_2`;
    const slot3Id = `${userId}_3`;

    const [slot1Doc, slot2Doc, slot3Doc] = await Promise.all([
        db.collection('players').findOne({ id: slot1Id }),
        db.collection('players').findOne({ id: slot2Id }),
        db.collection('players').findOne({ id: slot3Id })
    ]);

    const slot1 = slot1Doc ? normalizePlayer(slot1Doc, 1) : null;
    const slot2 = slot2Doc ? normalizePlayer(slot2Doc, 2) : null;
    const slot3 = slot3Doc ? normalizePlayer(slot3Doc, 3) : null;

    const playerIds = [slot1 ? slot1Id : null, slot2 ? slot2Id : null, slot3 ? slot3Id : null].filter(Boolean);
    if (playerIds.length > 0) {
        const allStyles = await db.collection('player_sp').find({ player_id: { $in: playerIds } }).toArray();
        const populateStyles = (char, pId) => {
            if (!char) return;
            char.styles = allStyles.filter(s => s.player_id === pId).map(s => ({
                name: s.style_name || s.style_id,
                sp: Number(s.sp || 0),
                ...getStyleMastery(s.sp)
            }));
            char.total_sp = char.styles.reduce((a, c) => a + c.sp, 0);
        };
        populateStyles(slot1, slot1Id);
        populateStyles(slot2, slot2Id);
        populateStyles(slot3, slot3Id);
    }

    const activeCharacter = activeSlot === 3 ? slot3 : (activeSlot === 2 ? slot2 : slot1);
    const slot3Unlocked = await isSlot3Unlocked(userId);

    return {
        activeSlot,
        hasCharacters: Boolean(slot1 || slot2 || slot3),
        slot1,
        slot2,
        slot3,
        slot3Unlocked,
        activeCharacter
    };
}

/**
 * Switch active slot for a user
 */
export async function setUserActiveSlot(discordUserId, slot) {
    const rawSlot = Number(slot);
    let targetSlot = [1, 2, 3].includes(rawSlot) ? rawSlot : 1;

    if (targetSlot === 3) {
        const unlocked = await isSlot3Unlocked(discordUserId);
        if (!unlocked) {
            targetSlot = 1;
        }
    }

    localActiveSlot = targetSlot;

    const db = getDB();
    if (!db) {
        return targetSlot;
    }

    const userId = String(discordUserId);
    await db.collection('user_settings').updateOne(
        { id: userId },
        { $set: { id: userId, active_slot: targetSlot } },
        { upsert: true }
    );

    return targetSlot;
}
