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

export function normalizeOrganization(input) {
    const value = String(input || '').trim().toUpperCase();
    if (value === ORGANIZATIONS.TENRYU || value === 'ТЕНРЮ') return ORGANIZATIONS.TENRYU;
    if (value === ORGANIZATIONS.GUARDIANS || value === 'СТРАЖИ') return ORGANIZATIONS.GUARDIANS;
    return null;
}

export function normalizeRank(input) {
    const rank = String(input || '').trim().toUpperCase();
    if (rank === 'Ⅰ') return 'I';
    if (rank === 'Ⅱ') return 'II';
    if (rank === 'Ⅲ') return 'III';
    if (rank === 'Ⅳ') return 'IV';
    if (rank === 'Ⅴ') return 'V';
    if (rank === 'Ⅵ') return 'VI';
    return rank;
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
