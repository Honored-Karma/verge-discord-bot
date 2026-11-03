// Discord uses native typography and spacing. These are semantic tokens, not CSS.
export const RESPONSE_COLORS = Object.freeze({
  brand: 0xb209d4,
  info: 0xb209d4,
  success: 0x22c55e,
  warning: 0xf59e0b,
  confirm: 0xf59e0b,
  error: 0xef4444,
  unavailable: 0xf59e0b,
  empty: 0x64748b,
  closed: 0x64748b,
  expired: 0xf59e0b,
  neutral: 0x64748b,
});

export const RESPONSE_STATES = Object.freeze({
  info: { icon: "ℹ️", label: "Информация" },
  success: { icon: "✓", label: "Выполнено" },
  warning: { icon: "⚠️", label: "Внимание" },
  confirm: { icon: "◇", label: "Подтверждение" },
  error: { icon: "✕", label: "Ошибка" },
  unavailable: { icon: "⏳", label: "Недоступно" },
  empty: { icon: "○", label: "Пока пусто" },
  closed: { icon: "○", label: "Панель закрыта" },
  expired: { icon: "⏳", label: "Сессия завершена" },
  neutral: { icon: "○", label: "Информация" },
});

export function cleanText(value, maxLength = 100) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return truncateText(text, maxLength);
}

export function truncateText(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  // Avoid leaving half a UTF-16 surrogate at the end of a label.
  return `${text.slice(0, Math.max(0, maxLength - 1)).replace(/[\uD800-\uDBFF]$/, "")}…`;
}

export function markdownText(value, maxLength = 100) {
  return cleanText(value, maxLength).replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

export function formatNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString("ru-RU") : "не указано";
}

export function statusHeading(title, state = "info") {
  const status = RESPONSE_STATES[state] || RESPONSE_STATES.info;
  return `${status.icon} ${cleanText(title || status.label, 180)}`;
}

// Metadata stays on the builder, never in Discord's JSON payload.
const embedStates = new WeakMap();
export function setResponseState(embed, state) {
  if (!RESPONSE_STATES[state]) throw new TypeError(`Unknown response state: ${state}`);
  embedStates.set(embed, state);
  embed.setColor(RESPONSE_COLORS[state]);
  return embed;
}
export function getResponseState(embed) {
  return embed && typeof embed === "object" ? embedStates.get(embed) : undefined;
}

export function splitResponseText(value, limit = 3900) {
  const source = String(value || "").trim();
  if (!source) return [];

  const chunks = [];
  let remaining = source;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.55)) cut = remaining.lastIndexOf(" ", limit);
    if (cut < Math.floor(limit * 0.55)) cut = limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

