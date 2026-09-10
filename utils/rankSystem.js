export const ORGANIZATIONS = {
    TENRYU: 'TENRYU',
    GUARDIANS: 'GUARDIANS'
};

export const RANK_SETS = {
    [ORGANIZATIONS.TENRYU]: ['F', 'E', 'D', 'C', 'B', 'A', 'S'],
    [ORGANIZATIONS.GUARDIANS]: ['VI', 'V', 'IV', 'III', 'II', 'I']
};

// Monthly salary values converted to weekly payouts by dividing by 4.
const MONTHLY_SALARY = {
    [ORGANIZATIONS.TENRYU]: {
        F: { currency: 'yen', amount: 180000 },
        E: { currency: 'yen', amount: 240000 },
        D: { currency: 'yen', amount: 320000 },
        C: { currency: 'yen', amount: 450000 },
        B: { currency: 'yen', amount: 600000 },
        A: { currency: 'yen', amount: 1050000 },
        S: { currency: 'yen', amount: 1900000 }
    },
    [ORGANIZATIONS.GUARDIANS]: {
        VI: { currency: 'krw', amount: 1850000 },
        V: { currency: 'krw', amount: 2850000 },
        IV: { currency: 'krw', amount: 4500000 },
        III: { currency: 'krw', amount: 7000000 },
        II: { currency: 'krw', amount: 11500000 },
        I: { currency: 'krw', amount: 17500000 }
    }
};

export const RANK_TIERS = {
    // Корейские ранги (Стражи Мира: VI - I)
    VI: 1,
    V: 2,
    IV: 3,
    III: 4,
    II: 5,
    I: 7, // Высший ранг в Корее, приравнивается к национальному уровню S

    // Японские ранги (Тенрью: F - S)
    F: 1,
    E: 2,
    D: 3,
    C: 4,
    B: 5,
    A: 6,
    S: 7,
};

export const RANK_METADATA = {
    VI: { origin: 'korea', label: 'Ранг VI', desc: 'Новобранцы и выше', flag: '🇰🇷' },
    V: { origin: 'korea', label: 'Ранг V', desc: 'Патрульная служба районов и выше', flag: '🇰🇷' },
    IV: { origin: 'korea', label: 'Ранг IV', desc: 'Областные командиры и выше', flag: '🇰🇷' },
    III: { origin: 'korea', label: 'Ранг III', desc: 'Опытные городские оперативники и выше', flag: '🇰🇷' },
    II: { origin: 'korea', label: 'Ранг II', desc: 'Живые спецотряды и выше', flag: '🇰🇷' },
    I: { origin: 'korea', label: 'Ранг I', desc: 'Высшая боевая единица, советники', flag: '🇰🇷' },

    F: { origin: 'japan', label: 'Ранг F', desc: 'Новички и выше', flag: '🇯🇵' },
    E: { origin: 'japan', label: 'Ранг E', desc: 'Начальный уровень и выше', flag: '🇯🇵' },
    D: { origin: 'japan', label: 'Ранг D', desc: 'Полевые оперативники и выше', flag: '🇯🇵' },
    C: { origin: 'japan', label: 'Ранг C', desc: 'Продвинутые герои и выше', flag: '🇯🇵' },
    B: { origin: 'japan', label: 'Ранг B', desc: 'Боевые специалисты и выше', flag: '🇯🇵' },
    A: { origin: 'japan', label: 'Ранг A', desc: 'Профессионалы и выше', flag: '🇯🇵' },
    S: { origin: 'japan', label: 'Ранг S', desc: 'Национальные герои', flag: '🇯🇵' },
};

export const RANK_REQUIREMENT_OPTIONS = [
    {
        label: 'Без ограничений',
        value: 'none',
        emoji: '🌐',
        description: 'В миссию может вступить персонаж любого ранга',
    },
    // ── Корейские ранги (Стражи Мира) ─────────────────────────────────────────
    {
        label: 'Ранг VI (Корея)',
        value: 'VI',
        emoji: '🇰🇷',
        description: 'Новобранцы и выше',
    },
    {
        label: 'Ранг V (Корея)',
        value: 'V',
        emoji: '🇰🇷',
        description: 'Патрульная служба районов и выше',
    },
    {
        label: 'Ранг IV (Корея)',
        value: 'IV',
        emoji: '🇰🇷',
        description: 'Областные командиры и выше',
    },
    {
        label: 'Ранг III (Корея)',
        value: 'III',
        emoji: '🇰🇷',
        description: 'Опытные городские оперативники и выше',
    },
    {
        label: 'Ранг II (Корея)',
        value: 'II',
        emoji: '🇰🇷',
        description: 'Живые спецотряды и выше',
    },
    {
        label: 'Ранг I (Корея)',
        value: 'I',
        emoji: '🇰🇷',
        description: 'Высшая боевая единица, советники',
    },
    // ── Японские ранги (Тенрью) ───────────────────────────────────────────────
    {
        label: 'Ранг F (Япония)',
        value: 'F',
        emoji: '🇯🇵',
        description: 'Новички и выше',
    },
    {
        label: 'Ранг E (Япония)',
        value: 'E',
        emoji: '🇯🇵',
        description: 'Начальный уровень и выше',
    },
    {
        label: 'Ранг D (Япония)',
        value: 'D',
        emoji: '🇯🇵',
        description: 'Полевые оперативники и выше',
    },
    {
        label: 'Ранг C (Япония)',
        value: 'C',
        emoji: '🇯🇵',
        description: 'Продвинутые герои и выше',
    },
    {
        label: 'Ранг B (Япония)',
        value: 'B',
        emoji: '🇯🇵',
        description: 'Боевые специалисты и выше',
    },
    {
        label: 'Ранг A (Япония)',
        value: 'A',
        emoji: '🇯🇵',
        description: 'Профессионалы и выше',
    },
    {
        label: 'Ранг S (Япония)',
        value: 'S',
        emoji: '🇯🇵',
        description: 'Национальные герои',
    },
];

export function normalizeOrganization(input) {
    const value = String(input || '').trim().toUpperCase();
    if (value === ORGANIZATIONS.TENRYU || value === 'TENRYŪ' || value === 'ТЕНРЮ') return ORGANIZATIONS.TENRYU;
    if (value === ORGANIZATIONS.GUARDIANS || value === 'СТРАЖИ' || value === 'СТРАЖИ МИРА') return ORGANIZATIONS.GUARDIANS;
    return null;
}

export function normalizeRank(input) {
    if (!input) return '';
    let rank = String(input)
        .trim()
        .toUpperCase()
        .replace(/^(?:РАНГ|RANK)[:\s\-_]*/i, '')
        .trim();

    if (rank === 'Ⅰ') return 'I';
    if (rank === 'Ⅱ') return 'II';
    if (rank === 'Ⅲ') return 'III';
    if (rank === 'Ⅳ') return 'IV';
    if (rank === 'Ⅴ') return 'V';
    if (rank === 'Ⅵ') return 'VI';
    return rank;
}

export function isRankSufficient(playerRank, requiredRank) {
    const normRequired = normalizeRank(requiredRank);
    if (!normRequired || normRequired === 'NONE') return true;

    const normPlayer = normalizeRank(playerRank);
    if (!normPlayer) return false;

    if (normPlayer === normRequired) return true;

    const koreanRanks = RANK_SETS[ORGANIZATIONS.GUARDIANS];
    const japaneseRanks = RANK_SETS[ORGANIZATIONS.TENRYU];

    const pIsKorean = koreanRanks.includes(normPlayer);
    const rIsKorean = koreanRanks.includes(normRequired);
    const pIsJapanese = japaneseRanks.includes(normPlayer);
    const rIsJapanese = japaneseRanks.includes(normRequired);

    // Если оба ранга из корейской системы
    if (pIsKorean && rIsKorean) {
        return koreanRanks.indexOf(normPlayer) >= koreanRanks.indexOf(normRequired);
    }

    // Если оба ранга из японской системы
    if (pIsJapanese && rIsJapanese) {
        return japaneseRanks.indexOf(normPlayer) >= japaneseRanks.indexOf(normRequired);
    }

    // Кросс-ранговое сравнение по ранговому тиру (1–7)
    const pTier = RANK_TIERS[normPlayer] || 0;
    const rTier = RANK_TIERS[normRequired] || 0;
    if (!pTier || !rTier) return false;

    return pTier >= rTier;
}

export function formatRankRequirement(rank) {
    const norm = normalizeRank(rank);
    if (!norm || norm === 'NONE') return '🌐 Любой ранг';

    const meta = RANK_METADATA[norm];
    if (meta) {
        return `${meta.flag} ${meta.label} (${meta.desc})`;
    }
    return `Ранг ${norm}`;
}

export function isValidRankForOrganization(org, rank) {
    const normalizedOrg = normalizeOrganization(org);
    const normalizedRank = normalizeRank(rank);
    if (!normalizedOrg) return false;
    return RANK_SETS[normalizedOrg].includes(normalizedRank);
}

export function getWeeklySalary(org, rank) {
    const normalizedOrg = normalizeOrganization(org);
    const normalizedRank = normalizeRank(rank);
    if (!normalizedOrg || !normalizedRank) return null;
    const monthly = MONTHLY_SALARY[normalizedOrg]?.[normalizedRank];
    if (!monthly) return null;
    return {
        currency: monthly.currency,
        amount: Math.floor(monthly.amount / 4)
    };
}
