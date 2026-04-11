export function progressBar(current, max, length = 20) {
    const percentage = Math.min(100, Math.max(0, (current / max) * 100));
    const filledBlocks = Math.floor((percentage / 100) * length);
    const emptyBlocks = length - filledBlocks;
    
    const filled = '█'.repeat(filledBlocks);
    const empty = '░'.repeat(emptyBlocks);
    
    return `${filled}${empty} ${percentage.toFixed(0)}% (${current}/${max})`;
}

export function getAPProgress(currentAP) {
    const nextMilestone = Math.ceil(currentAP / 100) * 100;
    const previousMilestone = Math.floor(currentAP / 100) * 100;
    const progressInCurrentRange = currentAP - previousMilestone;
    
    return {
        current: progressInCurrentRange,
        max: 100,
        nextMilestone
    };
}

export function getSPRank(sp) {
    if (sp >= 2500) return { rank: 'Master', color: 0xFF0000 };
    if (sp >= 1000) return { rank: 'Expert', color: 0xFF6B00 };
    if (sp >= 350) return { rank: 'Owner', color: 0xFFD700 };
    return { rank: 'Novice', color: 0x808080 };
}
