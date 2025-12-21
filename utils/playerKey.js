// Генерация ключа игрока с учётом слота
export function makePlayerKey(playerId, slot = 1) {
    if (!slot || slot === 1) return playerId;
    return `${playerId}_${slot}`;
}
