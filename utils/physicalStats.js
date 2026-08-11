export const PHYSICAL_STAT_OPTIONS = [
  ["punch_kg", "punch_strength_kg"],
  ["lift_kg", "lifting_strength_kg"],
  ["speed_kmh", "speed_kmh"],
  ["stamina_percent", "stamina_percent"],
  ["reaction_ms", "reaction_ms"],
];

export function getPhysicalStatsFromInteraction(interaction) {
  const stats = {};
  for (const [optionName, fieldName] of PHYSICAL_STAT_OPTIONS) {
    const value = interaction.options.getNumber(optionName);
    if (value !== null) stats[fieldName] = value;
  }

  const characterUrl = interaction.options.getString("character_url");
  if (characterUrl !== null) stats.character_url = characterUrl.trim();
  return stats;
}

export function isValidCharacterUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function makeTargetPlayerId(userId, slot) {
  return slot === 2 ? `${userId}_2` : userId;
}

export function physicalStatsSummary(stats) {
  return [
    `🔹 **Сила удара: [${formatNumber(stats.punch_strength_kg)} кг]**`,
    `🔹 **Сила на подъём: [${formatNumber(stats.lifting_strength_kg)} кг]**`,
    `🔹 **Скорость: [${formatNumber(stats.speed_kmh)} км/ч]**`,
    `🔹 **Стамина: [${formatNumber(stats.stamina_percent)}%]**`,
    `🔹 **Реакция: [${formatNumber(stats.reaction_ms)} мс]**`,
  ].join("\n");
}

function formatNumber(value) {
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
