export function getAdaptiveProgressScale(value, minimumStep = 100) {
  const numericValue = Number(value);
  const current = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
  const safeMinimum = Math.max(1, Number(minimumStep) || 1);

  if (current === 0) {
    return { current, next: safeMinimum, step: safeMinimum, ratio: 0 };
  }

  const magnitude = 10 ** Math.floor(Math.log10(current));
  const step = Math.max(safeMinimum, magnitude);
  const next = (Math.floor(current / step) + 1) * step;

  return {
    current,
    next,
    step,
    ratio: Math.min(current / next, 1),
  };
}
