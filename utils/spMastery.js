const MASTERY_LEVELS = [
  { rank: "Новичок", emoji: "⚪", threshold: 0 },
  { rank: "Владелец", emoji: "🟡", threshold: 350 },
  { rank: "Эксперт", emoji: "🟠", threshold: 1000 },
  { rank: "Мастер", emoji: "🔴", threshold: 2500 },
];

export function getSPMastery(value) {
  const sp = Math.max(0, Number(value) || 0);
  let index = MASTERY_LEVELS.length - 1;

  for (let i = 0; i < MASTERY_LEVELS.length; i += 1) {
    const next = MASTERY_LEVELS[i + 1];
    if (!next || sp < next.threshold) {
      index = i;
      break;
    }
  }

  const current = MASTERY_LEVELS[index];
  const next = MASTERY_LEVELS[index + 1] || null;
  const range = next ? next.threshold - current.threshold : 0;
  const progress = next ? sp - current.threshold : range;

  return {
    sp,
    rank: current.rank,
    emoji: current.emoji,
    currentThreshold: current.threshold,
    nextRank: next?.rank || null,
    nextThreshold: next?.threshold || current.threshold,
    remaining: next ? Math.max(0, next.threshold - sp) : 0,
    ratio: next ? Math.max(0, Math.min(1, progress / range)) : 1,
    isMax: !next,
  };
}

export function didMasteryRankChange(oldSP, newSP) {
  const before = getSPMastery(oldSP);
  const after = getSPMastery(newSP);
  return before.rank === after.rank ? null : { before, after };
}
