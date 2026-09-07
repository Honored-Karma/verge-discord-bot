import { getDB } from '../utils/db.js';
import { getPlayerByPublicIdentifier, slugifyCharacterName, generatePublicId } from './playerService.js';
import { isValidSafeUrl, sanitizeSafeUrl } from '../utils/urlHelper.js';
import { saveCharacterAvatar } from '../utils/avatarStorage.js';

export { slugifyCharacterName };

/**
 * Robust section parser that identifies standard character sheet headers
 */
export function parseApplicationSections(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return [];
    }

    const lines = rawText.split('\n');
    const sections = [];
    let currentSection = {
        key: 'overview',
        title: 'Общая информация',
        contentLines: []
    };

    const sectionPatterns = [
        { key: 'appearance', regex: /^(?:#{1,4}\s*|\*{0,2}\s*)(?:внешность|внешний вид|appearance)(?:\*{0,2}\s*:?|\s*:?)(.*)$/i, title: 'Внешность' },
        { key: 'personality', regex: /^(?:#{1,4}\s*|\*{0,2}\s*)(?:характер|личность|personality)(?:\*{0,2}\s*:?|\s*:?)(.*)$/i, title: 'Характер' },
        { key: 'biography', regex: /^(?:#{1,4}\s*|\*{0,2}\s*)(?:биография|история|предыстория|прошлое|backstory|biography)(?:\*{0,2}\s*:?|\s*:?)(.*)$/i, title: 'Биография' },
        { key: 'abilities', regex: /^(?:#{1,4}\s*|\*{0,2}\s*)(?:способности|атрибут|навыки|магия|боевой стиль|силы|abilities|powers)(?:\*{0,2}\s*:?|\s*:?)(.*)$/i, title: 'Способности и Атрибут' },
        { key: 'equipment', regex: /^(?:#{1,4}\s*|\*{0,2}\s*)(?:снаряжение|инвентарь|оружие|вещи|предметы|equipment|items)(?:\*{0,2}\s*:?|\s*:?)(.*)$/i, title: 'Снаряжение' },
        { key: 'other', regex: /^(?:#{1,4}\s*|\*{0,2}\s*)(?:прочее|дополнительно|примечания|факты|other)(?:\*{0,2}\s*:?|\s*:?)(.*)$/i, title: 'Дополнительные сведения' }
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        let matched = false;
        for (const pattern of sectionPatterns) {
            const match = trimmed.match(pattern.regex);
            if (match) {
                if (currentSection.contentLines.length > 0) {
                    sections.push({
                        key: currentSection.key,
                        title: currentSection.title,
                        content: currentSection.contentLines.join('\n').trim()
                    });
                }

                currentSection = {
                    key: pattern.key,
                    title: pattern.title,
                    contentLines: []
                };

                const inlineContent = (match[1] || '').trim();
                if (inlineContent) {
                    currentSection.contentLines.push(inlineContent);
                }

                matched = true;
                break;
            }
        }

        if (!matched) {
            currentSection.contentLines.push(line);
        }
    }

    if (currentSection.contentLines.length > 0) {
        sections.push({
            key: currentSection.key,
            title: currentSection.title,
            content: currentSection.contentLines.join('\n').trim()
        });
    }

    return sections.filter(s => s.content.length > 0);
}

/**
 * Public serializer for applications:
 * Strictly isolates Discord ID, tokens, moderation notes, and unsafe URLs.
 */
export function sanitizeApplicationForPublic(app) {
    if (!app) return null;

    const publicSlug = String(app.slug || app.id || 'character');
    const publicId = String(app.public_id || app.character_public_id || `ch_${publicSlug}`);
    const safeSourceUrl = sanitizeSafeUrl(app.source?.url);

    return {
        id: publicSlug,
        slug: publicSlug,
        character_id: publicSlug,
        character_public_id: publicId,
        slot: Number(app.slot || 1),
        character_name: app.character_name || 'Безымянный',
        character_avatar: app.character_avatar || null,
        banner_url: app.banner_url || app.character_banner || null,
        attribute_name: app.attribute_name || null,
        organization: app.organization || null,
        rank: app.rank || null,
        reputation: Number(app.reputation ?? 20),
        status: app.status || 'accepted',
        moderator_notes: app.moderator_notes || null,
        physical_stats: app.physical_stats || null,
        is_external_only: Boolean(app.is_external_only || app.source?.type === 'external_url'),
        source: {
            type: app.source?.type || 'discord_message',
            url: safeSourceUrl
        },
        sections: Array.isArray(app.sections) ? app.sections.map(s => ({
            key: s.key,
            title: s.title,
            content: s.content
        })) : [],
        raw_text: app.raw_text || '',
        created_at: app.created_at || new Date().toISOString(),
        updated_at: app.updated_at || new Date().toISOString()
    };
}

// Built-in Lore character sheets for demo / test environment
let SAMPLE_ACCEPTED_APPLICATIONS = [
    {
        id: 'app-hana-kami',
        public_id: 'ch_hana_kami',
        slug: 'hana-kami',
        player_id: 'demo_user',
        slot: 1,
        character_name: 'Хана Ками',
        character_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop&crop=faces',
        banner_url: 'https://iili.io/BP3OOut.png',
        attribute_name: 'Ангел',
        organization: 'TENRYU',
        rank: 'S',
        reputation: 1550,
        status: 'accepted',
        moderator_notes: 'Анкета полностью утверждена Главным Анкетологом. Каноничный высший ранг.',
        physical_stats: {
            punch_kg: 13200,
            durability_kg: 39600,
            lifting_kg: 800,
            speed_kmh: 570,
            reaction_ms: 15,
            stamina_percent: 200,
            is_registered: true
        },
        is_external_only: false,
        source: {
            type: 'discord_message',
            url: 'https://discord.com/channels/demo/sheets/hana-kami'
        },
        sections: [
            {
                key: 'overview',
                title: 'Общая информация',
                content: '• Имя: Хана Ками (Hana Kami)\n• Возраст: 24 года\n• Пол: Женский\n• Статус: Действующий герой ранга S в ассоциации Тенрью\n• Эпицентр проявления: Инцидент на Цусиме (2020)'
            },
            {
                key: 'appearance',
                title: 'Внешность',
                content: 'Высокая девушка с пепельно-серебристыми волосами и пронзительным взглядом янтарных глаз. Носит модифицированную униформу высшего эшелона Тенрью из светопоглощающей ткани с фиолетовыми руническими вставками. При активации Атрибута за её спиной материализуются полупрозрачные крылья из чистой плазменной энергии Ци.'
            },
            {
                key: 'personality',
                title: 'Характер',
                content: 'Сдержанная, методичная и предельно собранная в боевых условиях. За внешней холодностью скрывается глубокая преданность защите гражданских лиц, переживших катастрофу Генезиса. Не терпит лицемерия Центрального Совета и скептически относится к милитаризации Стражей Мира.'
            },
            {
                key: 'biography',
                title: 'Биография',
                content: 'Родилась в префектуре Нагасаки. В момент катастрофы 01.01.2020 находилась в непосредственной близости от пролива Цусима. Пережив первый всплеск Пробоя, пробудила Атрибут высшего порядка «Ангел». В 2023 году вошла в состав штурмового корпуса Тенрью. В 2026 году участвовала в закрытии Токийской Скважины в Гинзе, где спасла более двухсот человек.'
            },
            {
                key: 'abilities',
                title: 'Способности и Атрибут',
                content: '• Атрибут «Ангел»: Высокоплотная манипуляция священной плазмой. Позволяет создавать защитные барьеры абсолютного отражения и наносить сверхзвуковые рассекающие удары.\n• Боевое искусство «Стиль сонной луны» (Ранг: Эксперт, 1200 SP): Акупунктурные удары Ци, мгновенно парализующие проводящие каналы противника.'
            }
        ],
        raw_text: 'АНКЕТА ПЕРСОНАЖА: ХАНА КАМИ\n\nВнешность:\nВысокая девушка с пепельно-серебристыми волосами...',
        created_at: '2026-02-15T12:00:00Z',
        updated_at: '2026-08-18T10:00:00Z'
    },
    {
        id: 'app-reime-eul',
        public_id: 'ch_reime_eul',
        slug: 'reime-eul',
        player_id: 'demo_user_2',
        slot: 2,
        character_name: 'Рейме (Еул)',
        character_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop&crop=faces',
        banner_url: 'https://s.iimg.su/s/22/ufkWBu0xWZJ35E1dhmIFfmTwEoXZtvP8zOPqXpsI.jpg',
        attribute_name: 'Тень',
        organization: 'Не состоит',
        rank: '—',
        reputation: 820,
        status: 'accepted',
        moderator_notes: 'Анкета наёмника. Характеристики согласованы.',
        physical_stats: {
            punch_kg: 950,
            durability_kg: 2850,
            lifting_kg: 180,
            speed_kmh: 28,
            reaction_ms: 120,
            stamina_percent: 100,
            is_registered: true
        },
        is_external_only: false,
        source: {
            type: 'discord_message',
            url: 'https://discord.com/channels/demo/sheets/reime'
        },
        sections: [
            {
                key: 'overview',
                title: 'Общая информация',
                content: '• Имя: Рейме (позывной «Еул»)\n• Возраст: 21 год\n• Принадлежность: Независимый наёмник, теневой посредник в квартале Кабукичо'
            },
            {
                key: 'appearance',
                title: 'Внешность',
                content: 'Атлетическое телосложение, короткие темные волосы с выбритыми висками. Предпочитает неприметную уличную одежду темных тонов с водоотталкивающим покрытием. Лицо часто скрыто респиратором с угольным фильтром.'
            },
            {
                key: 'personality',
                title: 'Характер',
                content: 'Прагматик и одиночка. Оценивает любую ситуацию с точки зрения личной выгоды и коэффициента риска. Обладает обострённым чутьем на засады и аномалии Скважин.'
            },
            {
                key: 'biography',
                title: 'Биография',
                content: 'Вырос в трущобах Сеула в период после первого раскола. Нелегально перебрался в Токио после столкновений между Стражами Мира и Затмением в 2024 году. Выполняет заказные контракты на разведку заброшенных подземных комплексов.'
            },
            {
                key: 'abilities',
                title: 'Способности и Атрибут',
                content: '• Атрибут «Тень»: Слияние с неосвещенными поверхностями, локальное поглощение звуковых колебаний в радиусе 15 метров.\n• Стиль боя «Стиль сонной луны» (Новичок, 320 SP).'
            }
        ],
        raw_text: 'АНКЕТА ПЕРСОНАЖА: РЕЙМЕ (ЕУЛ)...',
        created_at: '2026-04-10T14:00:00Z',
        updated_at: '2026-08-18T10:00:00Z'
    }
];

/**
 * Fetch paginated list of public accepted applications
 */
export async function getPublicApplications({ page = 1, limit = 20, search = '', attribute = '', organization = '', status = 'accepted' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const db = getDB();
    if (!db) {
        let filtered = [...SAMPLE_ACCEPTED_APPLICATIONS];
        if (status && status !== 'all') {
            filtered = filtered.filter(a => (a.status || 'accepted') === status);
        }

        if (search) {
            const q = search.trim().toLowerCase();
            filtered = filtered.filter(a => 
                a.character_name.toLowerCase().includes(q) || 
                (a.attribute_name && a.attribute_name.toLowerCase().includes(q)) ||
                (a.organization && a.organization.toLowerCase().includes(q))
            );
        }

        if (attribute) {
            filtered = filtered.filter(a => a.attribute_name && a.attribute_name.toLowerCase() === attribute.toLowerCase());
        }

        if (organization) {
            filtered = filtered.filter(a => a.organization && a.organization.toLowerCase() === organization.toLowerCase());
        }

        const total = filtered.length;
        const items = filtered.slice(skip, skip + limitNum).map(sanitizeApplicationForPublic);

        return {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
            items
        };
    }

    const query = {};
    if (status && status !== 'all') {
        query.status = status;
    }

    if (search && search.trim()) {
        const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
            { character_name: { $regex: safeSearch, $options: 'i' } },
            { attribute_name: { $regex: safeSearch, $options: 'i' } },
            { organization: { $regex: safeSearch, $options: 'i' } }
        ];
    }

    if (attribute && attribute.trim()) {
        query.attribute_name = { $regex: `^${attribute.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }

    if (organization && organization.trim()) {
        query.organization = { $regex: `^${organization.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }

    const [total, docs] = await Promise.all([
        db.collection('applications').countDocuments(query),
        db.collection('applications').find(query).sort({ reputation: -1, created_at: -1 }).skip(skip).limit(limitNum).toArray()
    ]);

    const items = docs.map(sanitizeApplicationForPublic);

    return {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
        items
    };
}

/**
 * Get single application by public slug or public ID
 */
export async function getApplicationBySlugOrId(slugOrId) {
    if (!slugOrId || typeof slugOrId !== 'string') return null;

    const identifier = slugOrId.trim();
    const db = getDB();

    if (!db) {
        const doc = SAMPLE_ACCEPTED_APPLICATIONS.find(a => 
            (a.slug === identifier || a.public_id === identifier || a.id === identifier || a.player_id === identifier) && a.status === 'accepted'
        );
        return doc ? sanitizeApplicationForPublic(doc) : null;
    }

    const doc = await db.collection('applications').findOne({
        $and: [
            { status: 'accepted' },
            { $or: [{ slug: identifier }, { public_id: identifier }, { id: identifier }, { player_id: identifier }] }
        ]
    });

    if (!doc) return null;

    return sanitizeApplicationForPublic(doc);
}

export const getApplicationBySlug = getApplicationBySlugOrId;

/**
 * Get application with full administrative details (regardless of status)
 */
export async function getApplicationForAdmin(slugOrId) {
    if (!slugOrId || typeof slugOrId !== 'string') return null;

    const identifier = slugOrId.trim();
    const db = getDB();

    if (!db) {
        const doc = SAMPLE_ACCEPTED_APPLICATIONS.find(a => 
            a.slug === identifier || a.public_id === identifier || a.id === identifier || a.player_id === identifier
        );
        return doc ? { ...doc } : null;
    }

    const doc = await db.collection('applications').findOne({
        $or: [
            { slug: identifier },
            { public_id: identifier },
            { id: identifier },
            { player_id: identifier }
        ]
    });

    return doc || null;
}

/**
 * Update an existing character application
 */
export async function updateApplication(slugOrId, updates = {}, actor = null) {
    if (!slugOrId || typeof slugOrId !== 'string') {
        throw new Error('Некорректный идентификатор анкеты');
    }

    const identifier = slugOrId.trim();
    const db = getDB();

    const allowedStatus = ['pending', 'needs_revision', 'accepted', 'rejected', 'archived'];
    const now = new Date().toISOString();

    const safeUpdates = {
        updated_at: now
    };

    if (updates.character_name && typeof updates.character_name === 'string') {
        safeUpdates.character_name = updates.character_name.trim().slice(0, 100);
    }
    if (updates.character_avatar !== undefined) {
        safeUpdates.character_avatar = typeof updates.character_avatar === 'string' && updates.character_avatar.trim() 
            ? updates.character_avatar.trim() 
            : null;
    }
    if (updates.banner_url !== undefined) {
        safeUpdates.banner_url = typeof updates.banner_url === 'string' && updates.banner_url.trim() 
            ? updates.banner_url.trim() 
            : null;
    }
    if (updates.attribute_name !== undefined) {
        safeUpdates.attribute_name = typeof updates.attribute_name === 'string' ? updates.attribute_name.trim().slice(0, 60) : null;
    }
    if (updates.organization !== undefined) {
        safeUpdates.organization = typeof updates.organization === 'string' ? updates.organization.trim().slice(0, 60) : null;
    }
    if (updates.rank !== undefined) {
        safeUpdates.rank = typeof updates.rank === 'string' ? updates.rank.trim().slice(0, 20) : null;
    }
    if (updates.status && allowedStatus.includes(updates.status)) {
        safeUpdates.status = updates.status;
    }
    if (updates.moderator_notes !== undefined) {
        safeUpdates.moderator_notes = typeof updates.moderator_notes === 'string' ? updates.moderator_notes.trim().slice(0, 2000) : null;
    }
    if (Array.isArray(updates.sections)) {
        safeUpdates.sections = updates.sections.map(s => ({
            key: String(s.key || 'section').trim().slice(0, 50),
            title: String(s.title || 'Раздел').trim().slice(0, 100),
            content: String(s.content || '').slice(0, 50000)
        }));
    }
    if (updates.physical_stats && typeof updates.physical_stats === 'object') {
        safeUpdates.physical_stats = {
            punch_kg: updates.physical_stats.punch_kg !== null && updates.physical_stats.punch_kg !== undefined ? Number(updates.physical_stats.punch_kg) : null,
            durability_kg: updates.physical_stats.durability_kg !== null && updates.physical_stats.durability_kg !== undefined ? Number(updates.physical_stats.durability_kg) : null,
            lifting_kg: updates.physical_stats.lifting_kg !== null && updates.physical_stats.lifting_kg !== undefined ? Number(updates.physical_stats.lifting_kg) : null,
            speed_kmh: updates.physical_stats.speed_kmh !== null && updates.physical_stats.speed_kmh !== undefined ? Number(updates.physical_stats.speed_kmh) : null,
            reaction_ms: updates.physical_stats.reaction_ms !== null && updates.physical_stats.reaction_ms !== undefined ? Number(updates.physical_stats.reaction_ms) : null,
            stamina_percent: updates.physical_stats.stamina_percent !== null && updates.physical_stats.stamina_percent !== undefined ? Number(updates.physical_stats.stamina_percent) : 100,
            is_registered: Boolean(updates.physical_stats.is_registered)
        };
    }
    if (updates.slot !== undefined) {
        safeUpdates.slot = Number(updates.slot) === 2 ? 2 : 1;
    }

    if (!db) {
        const idx = SAMPLE_ACCEPTED_APPLICATIONS.findIndex(a => 
            a.slug === identifier || a.public_id === identifier || a.id === identifier || a.player_id === identifier
        );
        if (idx === -1) {
            throw new Error(`Анкета «${identifier}» не найдена`);
        }
        SAMPLE_ACCEPTED_APPLICATIONS[idx] = {
            ...SAMPLE_ACCEPTED_APPLICATIONS[idx],
            ...safeUpdates
        };
        return SAMPLE_ACCEPTED_APPLICATIONS[idx];
    }

    const query = {
        $or: [
            { slug: identifier },
            { public_id: identifier },
            { id: identifier },
            { player_id: identifier }
        ]
    };

    const existing = await db.collection('applications').findOne(query);
    if (!existing) {
        throw new Error(`Анкета «${identifier}» не найдена`);
    }

    await db.collection('applications').updateOne({ _id: existing._id }, { $set: safeUpdates });
    const updated = await db.collection('applications').findOne({ _id: existing._id });

    // If sync_to_player requested and player exists, update player record
    if (updates.sync_to_player && existing.player_id) {
        const playerUpdates = {};
        if (safeUpdates.character_name) playerUpdates.character_name = safeUpdates.character_name;
        if (safeUpdates.character_avatar !== undefined) {
            playerUpdates.character_avatar = safeUpdates.character_avatar;
            if (safeUpdates.character_avatar) {
                saveCharacterAvatar(existing.player_id, safeUpdates.character_avatar).catch(() => {});
            }
        }
        if (safeUpdates.banner_url !== undefined) playerUpdates.character_banner = safeUpdates.banner_url;
        if (safeUpdates.attribute_name !== undefined) playerUpdates.attribute_name = safeUpdates.attribute_name;
        if (safeUpdates.organization !== undefined) playerUpdates.organization = safeUpdates.organization;
        if (safeUpdates.rank !== undefined) playerUpdates.rank = safeUpdates.rank;
        if (safeUpdates.physical_stats) {
            if (safeUpdates.physical_stats.punch_kg !== null && safeUpdates.physical_stats.punch_kg !== undefined) playerUpdates.punch_strength_kg = safeUpdates.physical_stats.punch_kg;
            if (safeUpdates.physical_stats.lifting_kg !== null && safeUpdates.physical_stats.lifting_kg !== undefined) playerUpdates.lifting_strength_kg = safeUpdates.physical_stats.lifting_kg;
            if (safeUpdates.physical_stats.speed_kmh !== null && safeUpdates.physical_stats.speed_kmh !== undefined) playerUpdates.speed_kmh = safeUpdates.physical_stats.speed_kmh;
            if (safeUpdates.physical_stats.reaction_ms !== null && safeUpdates.physical_stats.reaction_ms !== undefined) playerUpdates.reaction_ms = safeUpdates.physical_stats.reaction_ms;
            if (safeUpdates.physical_stats.stamina_percent !== null && safeUpdates.physical_stats.stamina_percent !== undefined) playerUpdates.stamina_percent = safeUpdates.physical_stats.stamina_percent;
            playerUpdates.physical_stats_registered = Boolean(safeUpdates.physical_stats.is_registered);
        }

        if (Object.keys(playerUpdates).length > 0) {
            await db.collection('players').updateOne(
                { id: existing.player_id },
                { $set: playerUpdates }
            ).catch(err => console.warn('Failed to sync to player:', err));
        }
    }

    return updated;
}

/**
 * Create a new character application
 */
export async function createApplication(data = {}, actor = null) {
    const db = getDB();
    const characterName = String(data.character_name || 'Новый персонаж').trim().slice(0, 100);
    const baseSlug = slugifyCharacterName(characterName);
    const publicId = generatePublicId(characterName);
    const now = new Date().toISOString();

    const allowedStatus = ['pending', 'needs_revision', 'accepted', 'rejected', 'archived'];
    const status = allowedStatus.includes(data.status) ? data.status : 'pending';

    const newApp = {
        id: `app_${publicId}`,
        public_id: publicId,
        slug: data.slug ? slugifyCharacterName(data.slug) : (db ? await generateUniqueSlug(db, characterName) : `${baseSlug}-${Date.now().toString().slice(-4)}`),
        slot: Number(data.slot) === 2 ? 2 : 1,
        character_name: characterName,
        character_avatar: data.character_avatar || null,
        banner_url: data.banner_url || null,
        attribute_name: data.attribute_name || null,
        organization: data.organization || 'Не состоит',
        rank: data.rank || '—',
        reputation: Number(data.reputation ?? 20),
        status: status,
        moderator_notes: data.moderator_notes || null,
        author_username: actor?.username || data.author_username || 'Admin',
        author_discord_id: actor?.id || data.author_discord_id || null,
        physical_stats: data.physical_stats || {
            punch_kg: null,
            durability_kg: null,
            lifting_kg: null,
            speed_kmh: null,
            reaction_ms: null,
            stamina_percent: 100,
            is_registered: false
        },
        sections: Array.isArray(data.sections) && data.sections.length > 0 ? data.sections : [
            { key: 'overview', title: 'Общая информация', content: '' },
            { key: 'appearance', title: 'Внешность', content: '' },
            { key: 'personality', title: 'Характер', content: '' },
            { key: 'biography', title: 'Биография', content: '' },
            { key: 'abilities', title: 'Способности и Атрибут', content: '' },
            { key: 'equipment', title: 'Снаряжение', content: '' }
        ],
        raw_text: data.raw_text || '',
        created_at: now,
        updated_at: now
    };

    if (!db) {
        SAMPLE_ACCEPTED_APPLICATIONS.unshift(newApp);
        return newApp;
    }

    await db.collection('applications').insertOne(newApp);
    return newApp;
}

/**
 * Delete or archive an application
 */
export async function deleteApplication(slugOrId, actor = null) {
    const identifier = String(slugOrId).trim();
    const db = getDB();

    if (!db) {
        const idx = SAMPLE_ACCEPTED_APPLICATIONS.findIndex(a => 
            a.slug === identifier || a.public_id === identifier || a.id === identifier
        );
        if (idx !== -1) {
            SAMPLE_ACCEPTED_APPLICATIONS.splice(idx, 1);
            return { success: true };
        }
        throw new Error('Анкета не найдена');
    }

    const res = await db.collection('applications').deleteOne({
        $or: [
            { slug: identifier },
            { public_id: identifier },
            { id: identifier }
        ]
    });

    if (res.deletedCount === 0) {
        throw new Error('Анкета не найдена');
    }

    return { success: true };
}

/**
 * Generate unique slug across DB with collision handling
 */
export async function generateUniqueSlug(db, characterName, currentPlayerId = null) {
    const baseSlug = slugifyCharacterName(characterName);
    let finalSlug = baseSlug;
    let counter = 2;

    if (!db) return finalSlug;

    while (true) {
        const existing = await db.collection('applications').findOne({ slug: finalSlug });
        if (!existing || existing.player_id === currentPlayerId) {
            break;
        }
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
    }

    return finalSlug;
}

/**
 * Import or update application from player record (Idempotent)
 */
export async function importApplicationFromPlayer(playerDoc, discordClient = null) {
    if (!playerDoc || !playerDoc.id) return { status: 'skipped', reason: 'invalid_player' };

    const playerId = String(playerDoc.id);
    const characterName = playerDoc.character_name || playerDoc.username || 'Безымянный';
    const characterUrl = playerDoc.character_url || null;

    if (!characterUrl || !isValidSafeUrl(characterUrl)) {
        return { status: 'skipped', reason: 'invalid_or_missing_character_url', playerId };
    }

    const db = getDB();
    if (!db) return { status: 'skipped', reason: 'no_db', playerId };

    const existing = await db.collection('applications').findOne({ player_id: playerId });

    let rawText = '';
    let sourceType = 'external_url';
    let isExternalOnly = true;
    let discordInfo = {};

    const discordMatch = characterUrl.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i);

    if (discordMatch && discordClient) {
        sourceType = 'discord_message';
        const [, guildId, channelId, messageId] = discordMatch;
        discordInfo = { guild_id: guildId, channel_id: channelId, message_id: messageId };

        try {
            const channel = await discordClient.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(messageId);
                if (message && message.content) {
                    rawText = message.content;
                    isExternalOnly = false;
                }
            }
        } catch (discordErr) {
            console.warn(`[Application Import] Discord fetch failed for ${playerId} (${messageId}):`, discordErr.message);
        }
    }

    // Generate or maintain stable slug and public_id
    const finalSlug = existing?.slug || await generateUniqueSlug(db, characterName, playerId);
    const publicId = existing?.public_id || playerDoc.public_id || generatePublicId(playerId, playerId.endsWith('_2') ? 2 : 1);

    const sections = parseApplicationSections(rawText);

    const appRecord = {
        id: `app_${playerId}`,
        public_id: publicId,
        slug: finalSlug,
        player_id: playerId,
        slot: playerId.endsWith('_2') ? 2 : 1,
        character_name: characterName,
        character_avatar: playerDoc.character_avatar || null,
        attribute_name: playerDoc.attribute_name || null,
        organization: playerDoc.organization || null,
        rank: playerDoc.rank || null,
        reputation: Number(playerDoc.reputation ?? 20),
        status: 'accepted',
        is_external_only: isExternalOnly,
        source: {
            type: sourceType,
            url: characterUrl,
            ...discordInfo
        },
        sections: sections.length > 0 ? sections : [
            {
                key: 'overview',
                title: 'Общая информация',
                content: isExternalOnly 
                    ? `Анкета персонажа **${characterName}** одобрена и хранится во внешнем источнике.`
                    : `Анкета персонажа **${characterName}** принята и зарегистрирована в реестре Verge TRP.`
            }
        ],
        raw_text: rawText || `Оригинал анкеты доступен по ссылке: ${characterUrl}`,
        updated_at: new Date()
    };

    if (existing) {
        await db.collection('applications').updateOne({ player_id: playerId }, { $set: appRecord });
        return { status: 'updated', slug: finalSlug, playerId, characterName };
    } else {
        appRecord.created_at = new Date();
        await db.collection('applications').insertOne(appRecord);
        return { status: 'imported', slug: finalSlug, playerId, characterName };
    }
}

/**
 * Batch import all eligible players into applications collection
 */
export async function batchImportApplications(discordClient = null) {
    const db = getDB();
    if (!db) throw new Error('Database not connected');

    const players = await db.collection('players').find({ character_url: { $exists: true, $ne: null } }).toArray();

    const report = {
        totalFound: players.length,
        imported: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        failed: 0,
        details: []
    };

    for (const player of players) {
        try {
            const res = await importApplicationFromPlayer(player, discordClient);
            if (res.status === 'imported') report.imported++;
            else if (res.status === 'updated') report.updated++;
            else if (res.status === 'unchanged') report.unchanged++;
            else if (res.status === 'skipped') report.skipped++;
            
            report.details.push(res);
        } catch (err) {
            report.failed++;
            report.details.push({ status: 'failed', playerId: player.id, error: err.message });
        }
    }

    return report;
}
