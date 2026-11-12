// Channel-repetition penalty was removed: training in the same channel always
// grants the full multiplier (factor: 1) regardless of previous channel usage.
export function getTrainingLocation() {
  return { factor: 1, repeats: 0, filter: {}, updates: {} };
}
