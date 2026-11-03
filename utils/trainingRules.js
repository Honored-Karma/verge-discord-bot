// Shared by command validation, forms and help. Values preserve the existing rules.
export const TRAINING_RULES = Object.freeze({
  ap: Object.freeze({ minLength: 800, maxLength: 4000, reward: 10, cooldownMs: 5 * 60 * 60 * 1000 }),
  sp: Object.freeze({ minLength: 500, maxLength: 4000, reward: 10, cooldownMs: 5 * 60 * 60 * 1000 }),
  social: Object.freeze({ minLength: 50, maxLength: 4000, reward: 10, cooldownMs: 12 * 60 * 60 * 1000 }),
});
export function trainingRequirements(kind) {
  const rule = TRAINING_RULES[kind];
  return `${rule.minLength.toLocaleString("ru-RU")}–${rule.maxLength.toLocaleString("ru-RU")} символов · ${rule.reward} ${kind === "sp" ? "SP" : "AP"} × множитель · раз в ${rule.cooldownMs / 3600000} ч.`;
}
