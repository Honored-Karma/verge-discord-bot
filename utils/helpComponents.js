import { RESPONSE_COLORS, splitResponseText } from "./responseStyle.js";
import { COMMAND_HELP } from "./helpCatalog.js";
import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";

export const HELP_SELECT_ID = "help_page_select";

const HELP_COLOR = RESPONSE_COLORS.brand;

function clean(value, maxLength = 100) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Список команд раздела. Описание берётся из самой команды, поэтому справка
 * всегда совпадает с тем, что Discord показывает в подсказке.
 */
function commandLines(commands) {
  return commands
    .map((command) => {
      const description = clean(command.description, 90) || "без описания";
      return command.type === 3
        ? `**${command.name}** (меню сообщения → Приложения) — ${description}`
        : `**/${command.name}** — ${description}${COMMAND_HELP[command.name] ? `\n-# ${COMMAND_HELP[command.name]}` : ""}`;
    })
    .join("\n");
}

function createPageSelect(pages, activeId, disabled) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_SELECT_ID)
      .setPlaceholder("Выберите раздел справки")
      .setDisabled(disabled)
      .addOptions(pages.slice(0, 25).map((page) => new StringSelectMenuOptionBuilder()
        .setValue(page.id)
        .setLabel(clean(page.label, 80))
        .setDescription(clean(`${page.commands.length} команд · ${page.description}`, 100))
        .setEmoji(page.emoji)
        .setDefault(page.id === activeId))),
  );
}

export function createHelpComponents({ pages, activeId, total, disabled = false }) {
  const page = pages.find((candidate) => candidate.id === activeId) || pages[0];
  if (!page) {
    return [
      new ContainerBuilder()
        .setAccentColor(HELP_COLOR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          "## Справка недоступна\nКоманды ещё не загружены. Попробуйте позже.",
        )),
    ];
  }

  return [
    new ContainerBuilder()
      .setAccentColor(HELP_COLOR)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${page.emoji} ${page.label}\n`
        + `-# ${page.description} · всего команд у бота: ${total}`,
      ))
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(splitResponseText(commandLines(page.commands)).map(text => new TextDisplayBuilder().setContent(text)))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "-# Команды доступны в пределах ваших прав. Игровые решения и последствия сцен определяют игроки и ГМ.",
      ))
      .addActionRowComponents(createPageSelect(pages, page.id, disabled)),
  ];
}
