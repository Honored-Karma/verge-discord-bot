import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import { buildHelpPages, countHelpCommands, isStaffCommand } from "../utils/helpCatalog.js";
import { createHelpComponents, HELP_SELECT_ID } from "../utils/helpComponents.js";

/** Реестр команд собираем так же, как это делает index.js при старте. */
async function loadRegistry() {
  const commands = [];
  for (const file of readdirSync("commands").filter((name) => name.endsWith(".js"))) {
    const module = await import(`../commands/${file}`);
    if (module?.data?.name) {
      commands.push({
        name: module.data.name,
        description: module.data.description || module.description,
        type: module.data.type,
      });
    }
  }
  return commands;
}

test("справка покрывает каждую команду бота", async () => {
  const registry = await loadRegistry();
  assert.ok(registry.length > 40, `команд подозрительно мало: ${registry.length}`);

  const pages = buildHelpPages(registry);
  assert.equal(
    countHelpCommands(pages),
    registry.length,
    "каждая команда обязана попасть ровно в один раздел",
  );

  // Ни одна команда не должна встречаться дважды.
  const seen = pages.flatMap((page) => page.commands.map((command) => command.name));
  assert.equal(new Set(seen).size, seen.length, "команда попала в два раздела");

  // Раздел «Прочее» — предохранитель. Если он не пуст, значит появилась команда,
  // которую забыли отнести к разделу: именно так /help однажды и отстал от бота.
  const other = pages.find((page) => page.id === "other");
  assert.equal(
    other,
    undefined,
    `нераспределённые команды: ${other?.commands.map((c) => c.name).join(", ")}`,
  );
});

test("справка не теряет игровые команды среди админских", async () => {
  const registry = await loadRegistry();
  const pages = buildHelpPages(registry);
  const playerPages = pages.filter((page) => page.id !== "staff");
  const playerCommands = playerPages.flatMap((page) => page.commands.map((c) => c.name));

  // Именно эти команды отсутствовали в рукописной справке целиком.
  for (const name of ["reputation", "ranks-info", "slot", "slots"]) {
    assert.ok(playerCommands.includes(name), `${name} должна быть в игровых разделах`);
  }

  // Служебные команды не должны попадать в игровые разделы.
  for (const page of playerPages) {
    for (const command of page.commands) {
      assert.equal(
        isStaffCommand(command),
        false,
        `${command.name} служебная, но лежит в разделе «${page.label}»`,
      );
    }
  }
});

test("описания в справке берутся из самих команд", async () => {
  const registry = await loadRegistry();
  const pages = buildHelpPages(registry);
  const byName = new Map(registry.map((command) => [command.name, command.description]));

  for (const page of pages) {
    for (const command of page.commands) {
      assert.equal(
        command.description,
        String(byName.get(command.name) || "").trim(),
        `${command.name}: описание разошлось с реестром`,
      );
    }
  }
});

test("панель справки собирается и переключается селектом", async () => {
  const registry = await loadRegistry();
  const pages = buildHelpPages(registry);
  const total = countHelpCommands(pages);

  for (const page of pages) {
    const json = createHelpComponents({ pages, activeId: page.id, total })[0].toJSON();
    const text = JSON.stringify(json);

    assert.ok(text.includes(page.label), `${page.id}: нет заголовка раздела`);
    assert.ok(text.includes(String(total)), `${page.id}: нет общего числа команд`);
    // Каждая команда раздела видна на странице.
    for (const command of page.commands.slice(0, 5)) {
      assert.ok(text.includes(command.type === 3 ? command.name : `/${command.name}`), `${page.id}: нет ${command.name}`);
    }

    const row = json.components.find((component) => component.type === 1);
    const select = row.components[0];
    assert.equal(select.custom_id, HELP_SELECT_ID);
    assert.equal(select.options.length, pages.length);
    // Активный раздел помечен как выбранный.
    assert.equal(select.options.filter((option) => option.default).length, 1);
    assert.equal(select.options.find((option) => option.default).value, page.id);
  }

  // Неизвестный раздел не должен ломать рендер — открывается первый.
  const fallback = createHelpComponents({ pages, activeId: "нет-такого", total })[0].toJSON();
  assert.ok(JSON.stringify(fallback).includes(pages[0].label));

  // Пустой реестр не должен ронять команду.
  const empty = createHelpComponents({ pages: [], activeId: "start", total: 0 })[0].toJSON();
  assert.ok(JSON.stringify(empty).includes("Справка недоступна"));
});
