import ms from 'ms';

// Global command cooldown tracker (3 seconds between commands per user)
const globalCooldowns = new Map();
const GLOBAL_COOLDOWN_MS = 3000;
const AUTO_DELETE_MS = 3 * 60 * 1000;
const AUTO_DELETE_SHORT_MS = 3 * 60 * 1000;
const AUTO_DELETE_LONG_MS = 3 * 60 * 1000;

export function checkGlobalCooldown(userId) {
    const now = Date.now();
    const userCooldown = globalCooldowns.get(userId);
    
    if (userCooldown && now - userCooldown < GLOBAL_COOLDOWN_MS) {
        const remaining = GLOBAL_COOLDOWN_MS - (now - userCooldown);
        return {
            onCooldown: true,
            remaining,
            remainingFormatted: `${Math.ceil(remaining / 1000)}с`
        };
    }
    
    globalCooldowns.set(userId, now);
    return { onCooldown: false };
}

export function autoDeleteMessage(message) {
    if (message && message.delete) {
        setTimeout(() => {
            message.delete().catch(() => {});
        }, AUTO_DELETE_MS);
    }
}

export function autoDeleteMessageShort(message) {
    if (message && message.delete) {
        setTimeout(() => {
            message.delete().catch(() => {});
        }, AUTO_DELETE_SHORT_MS);
    }
}

export function autoDeleteMessageLong(message) {
    if (message && message.delete) {
        setTimeout(() => {
            message.delete().catch(() => {});
        }, AUTO_DELETE_LONG_MS);
    }
}

export function checkCooldown(lastTimestamp, cooldownMs) {
    const now = Math.floor(Date.now() / 1000);
    const cooldownSeconds = cooldownMs / 1000;
    const normalizedLastTimestamp = Number(lastTimestamp || 0);
    const elapsed = now - normalizedLastTimestamp;
    
    if (elapsed < cooldownSeconds) {
        const remaining = cooldownSeconds - elapsed;
        return {
            onCooldown: true,
            remaining: remaining * 1000,
            remainingFormatted: formatTime(remaining * 1000)
        };
    }
    
    return { onCooldown: false };
}

export function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return `${hours}ч ${remainingMinutes}м`;
    } else if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return `${minutes}м ${remainingSeconds}с`;
    } else {
        return `${seconds}с`;
    }
}

export function validateTrainingText(text) {
    if (text.length < 800) {
        return { valid: false, reason: `Текст тренировки должен содержать минимум 800 символов. Сейчас: ${text.length}` };
    }
    
    const letterDigitSpaceCount = (text.match(/[a-zA-Zа-яА-ЯёЁ0-9\s]/g) || []).length;
    const percentage = (letterDigitSpaceCount / text.length) * 100;
    
    if (percentage < 50) {
        return { valid: false, reason: 'Текст должен содержать минимум 50% букв, цифр или пробелов. Запрещен спам ссылками или символами.' };
    }
    
    return { valid: true };
}
