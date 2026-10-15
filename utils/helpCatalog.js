/**
 * Справочник команд, который нельзя забыть обновить.
 *
 * Прежний /help был написан руками и разошёлся с ботом: из 51 команды в нём
 * упоминалось 32, а девятнадцати не было вовсе — включая игровые `/reputation`,
 * `/ranks-info`, `/slot`, `/slots`, `/physical-register`. Новичок физически не
 * мог узнать про треть бота.
 *
 * Поэтому страницы строятся из реального реестра команд: имя и описание берутся
 * оттуда же, откуда их берёт Discord. Забыть команду теперь невозможно — она
 * попадёт хотя бы в раздел «Прочее», а тест следит, чтобы этот раздел оставался
 * пустым.
 */

// Команды для игроков распределены вручную: это вопрос смысла, а не данных.
const PLAYER_GROUPS = [
  {
    id: "start",
    label: "Начало",
    emoji: "🚀",
    description: "Первые шаги: персонаж, слоты, профиль.",
    commands: ["register", "slot", "slots", "profile", "set-avatar", "help"],
  },
  {
    id: "growth",
    label: "Развитие",
    emoji: "⚡",
    description: "AP, SP, боевые стили, ранги и репутация.",
    commands: [
      "train-ap", "train-sp", "social-rp",
      "styles-list", "ranks-info", "reputation",
    ],
  },
  {
    id: "tabletop",
    label: "Броски",
    emoji: "🎲",
    description: "Кубики, случайный выбор и юмор.",
    commands: ["roll", "pick", "mission", "roast"],
  },
  {
    id: "economy",
    label: "Экономика",
    emoji: "💳",
    description: "Деньги, магазин и предметы.",
    commands: [
      "shop", "pay", "exchange",
      "inventory", "use", "transfer-item", "leaderboard",
    ],
  },
];

const STAFF_GROUP = {
  id: "staff",
  label: "Для персонала",
  emoji: "🛠️",
  description: "Команды администраторов, ГМ-ов и анкетологов.",
};

const OTHER_GROUP = {
  id: "other",
  label: "Прочее",
  emoji: "❔",
  description: "Команды, ещё не отнесённые к разделу.",
};

// Служебные команды отмечены прямо в описании, поэтому новая админская команда
// попадёт в раздел персонала сама, без правки этого файла.
const STAFF_MARKERS = ["[АДМИН", "[ГМ", "[ПЕРСОНАЛ", "[СОТРУДНИК", "[МОДЕР", "[АНКЕТОЛОГ"];

// Часть служебных команд описана без пометки в тексте, поэтому перечислены
// по имени. Если у команды появится пометка, строка отсюда станет лишней, но
// вреда не принесёт.
const STAFF_COMMANDS = new Set([
  "announce",
  "logs",
  "org",
  "send-json",
  "set-rank",
  "render-ui",
  "purge-offtop",
  "shop-admin",
]);

export function isStaffCommand(command) {
  if (STAFF_COMMANDS.has(String(command?.name || ""))) return true;
  const description = String(command?.description || "");
  return STAFF_MARKERS.some((marker) => description.includes(marker));
}

/**
 * @param {Array<{name: string, description: string}>} commands реальный реестр
 * @returns {Array<{id, label, emoji, description, commands}>} только непустые разделы
 */
export function buildHelpPages(commands) {
  const registry = new Map(
    (commands || [])
      .filter((command) => command?.name)
      .map((command) => [String(command.name), {
        name: String(command.name),
        description: String(command.description || "").trim(),
      }]),
  );

  const pages = [];
  const placed = new Set();

  for (const group of PLAYER_GROUPS) {
    const items = group.commands
      .map((name) => registry.get(name))
      .filter(Boolean);
    for (const item of items) placed.add(item.name);
    if (items.length > 0) pages.push({ ...group, commands: items });
  }

  const staff = [...registry.values()]
    .filter((command) => !placed.has(command.name) && isStaffCommand(command))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  for (const item of staff) placed.add(item.name);
  if (staff.length > 0) pages.push({ ...STAFF_GROUP, commands: staff });

  const rest = [...registry.values()]
    .filter((command) => !placed.has(command.name))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  if (rest.length > 0) pages.push({ ...OTHER_GROUP, commands: rest });

  return pages;
}

/** Сколько всего команд разложено по страницам — для проверки полноты. */
export function countHelpCommands(pages) {
  return pages.reduce((total, page) => total + page.commands.length, 0);
}

export const __testables = {
  PLAYER_GROUPS, STAFF_GROUP, OTHER_GROUP, STAFF_MARKERS, STAFF_COMMANDS,
};
