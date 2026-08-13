import { readFileSync } from "node:fs";

const RARITIES = {
  common: { name: "Обычный", emoji: "⚪", color: 0x94a3b8 },
  uncommon: { name: "Необычный", emoji: "🟢", color: 0x22c55e },
  rare: { name: "Редкий", emoji: "🔵", color: 0x3b82f6 },
  epic: { name: "Эпический", emoji: "🟣", color: 0xa855f7 },
  legendary: { name: "Легендарный", emoji: "🟠", color: 0xf59e0b },
};

function loadCatalog() {
  try {
    const file = readFileSync(
      new URL("../data/default_items.json", import.meta.url),
      "utf8",
    );
    const items = JSON.parse(file)?.items;
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error("Could not load the default item catalog:", error);
    return [];
  }
}

const ITEM_CATALOG = new Map(
  loadCatalog().map((item) => [
    String(item.name || "").trim().toLocaleLowerCase("en-US"),
    item,
  ]),
);

function rewardRarity(amount) {
  if (amount >= 250) return RARITIES.legendary;
  if (amount >= 100) return RARITIES.epic;
  if (amount >= 50) return RARITIES.rare;
  if (amount >= 25) return RARITIES.uncommon;
  return RARITIES.common;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function apDefinition(name, amount) {
  return {
    kind: "ap",
    usable: amount > 0,
    emoji: "📘",
    rarity: rewardRarity(amount),
    amount,
    title: name,
    description: `Расходник, который мгновенно добавляет **${amount.toLocaleString("ru-RU")} AP**.`,
    effectText: `+${amount.toLocaleString("ru-RU")} AP`,
  };
}

function spDefinition(name, styleName, amount) {
  return {
    kind: "sp",
    usable: Boolean(styleName) && amount > 0,
    emoji: "📜",
    rarity: rewardRarity(amount),
    amount,
    styleName,
    title: name,
    description: `Расходник для стиля **${styleName}**. Мгновенно добавляет **${amount.toLocaleString("ru-RU")} SP**.`,
    effectText: `+${amount.toLocaleString("ru-RU")} SP • ${styleName}`,
  };
}

function catalogDefinition(name) {
  const item = ITEM_CATALOG.get(name.toLocaleLowerCase("en-US"));
  const ap = positiveInteger(item?.effect?.ap, 0);
  if (ap > 0) return apDefinition(name, ap);

  const styleName = String(item?.effect?.sp?.style || "").trim();
  const sp = positiveInteger(item?.effect?.sp?.value, 0);
  if (styleName && sp > 0) return spDefinition(name, styleName, sp);
  return null;
}

export function getItemDefinition(itemName) {
  const name = String(itemName || "").trim();
  const catalogItem = catalogDefinition(name);
  if (catalogItem) return catalogItem;

  const apMatch = name.match(/^(?:AP\s*Tome|Том\s*AP)\s*\((\d+)\)$/iu);
  if (apMatch) return apDefinition(name, positiveInteger(apMatch[1], 0));

  const spWithAmount = name.match(/^(?:SP\s*Scroll|Свиток\s*SP)\s*:\s*(.+?)\s*\((\d+)\)$/iu);
  const spDefault = name.match(/^(?:SP\s*Scroll|Свиток\s*SP)\s*:\s*(.+)$/iu);
  const spMatch = spWithAmount || spDefault;
  if (spMatch) {
    const styleName = String(spMatch[1] || "").trim();
    const amount = spWithAmount
      ? positiveInteger(spWithAmount[2], 0)
      : 30;
    return spDefinition(name, styleName, amount);
  }

  return {
    kind: "collectible",
    usable: false,
    emoji: "💎",
    rarity: RARITIES.common,
    amount: 0,
    title: name || "Безымянный предмет",
    description: "Коллекционный или сюжетный предмет. Его нельзя расходовать автоматически.",
    effectText: "Не расходуется",
  };
}

export function formatItemEffect(itemName, quantity = 1) {
  const definition = getItemDefinition(itemName);
  const qty = Math.max(1, Number(quantity) || 1);
  if (!definition.usable) return definition.effectText;

  const total = definition.amount * qty;
  if (definition.kind === "ap") return `+${total.toLocaleString("ru-RU")} AP`;
  return `+${total.toLocaleString("ru-RU")} SP • ${definition.styleName}`;
}
