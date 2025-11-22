import ms from 'ms';

export function checkCooldown(lastTimestamp, cooldownMs) {
    const now = Math.floor(Date.now() / 1000);
    const cooldownSeconds = cooldownMs / 1000;
    const elapsed = now - lastTimestamp;
    
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
        return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${seconds}s`;
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
