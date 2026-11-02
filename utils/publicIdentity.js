import crypto from 'node:crypto';

const RU_TO_LATIN = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', ' ': '-', '_': '-',
};

export function slugifyCharacterName(name) {
    if (!name || typeof name !== 'string') return 'unnamed-character';
    return [...name.trim().toLowerCase()].map(char =>
        RU_TO_LATIN[char] ?? (/[a-z0-9-]/.test(char) ? char : '')
    ).join('').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'character';
}

export function generatePublicId(internalId = '', slot = 1) {
    return internalId
        ? `ch_${crypto.createHash('sha256').update(`${internalId}_${slot}_verge_salt`).digest('hex').slice(0, 10)}`
        : `ch_${crypto.randomBytes(12).toString('hex')}`;
}

export function createPlayerIdentity(id, name, slot = 1) {
    const publicId = generatePublicId(id, slot);
    return { public_id: publicId, slug: `${slugifyCharacterName(name)}-${publicId.slice(3)}` };
}
