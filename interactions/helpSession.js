import { MessageFlags } from "discord.js";
import { buildHelpPages, countHelpCommands } from "../utils/helpCatalog.js";
import { createHelpComponents, HELP_SELECT_ID } from "../utils/helpComponents.js";
import { saveInteractionSession } from "../utils/interactionSessions.js";

export const HELP_NAMESPACE = "help";
export const HELP_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createHelpSessionState({ pageId }) {
  return { page_id: pageId };
}

/**
 * Собирает страницы из живого реестра команд клиента. Реестр — тот же источник,
 * из которого команды уезжают в Discord, поэтому справка не может отстать.
 */
export function helpPagesFor(client) {
  const commands = [...(client?.commands?.values?.() || [])].map((command) => ({
    name: command?.data?.name,
    description: command?.data?.description,
  }));
  const pages = buildHelpPages(commands);
  return { pages, total: countHelpCommands(pages) };
}

export function renderHelp(client, state, { disabled = false } = {}) {
  const { pages, total } = helpPagesFor(client);
  return createHelpComponents({
    pages,
    activeId: state.page_id,
    total,
    disabled,
  });
}

async function handleComponent({ interaction, session }) {
  if (interaction.customId !== HELP_SELECT_ID || !interaction.isStringSelectMenu()) {
    return interaction.deferUpdate().catch(() => {});
  }

  const { pages } = helpPagesFor(interaction.client);
  const requested = interaction.values[0];
  if (!pages.some((page) => page.id === requested)) {
    return interaction.deferUpdate().catch(() => {});
  }
  if (requested === session.state.page_id) {
    return interaction.deferUpdate().catch(() => {});
  }

  const state = { ...session.state, page_id: requested };
  await saveInteractionSession(
    session.message_id,
    session.revision,
    state,
    { ttlMs: HELP_SESSION_TTL_MS },
  );

  return interaction.update({
    components: renderHelp(interaction.client, state),
  }).catch(() => {});
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    content: "Это меню справки открыто для другого игрока. Наберите `/help`.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    content: "Меню справки больше не активно. Наберите `/help` ещё раз.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

export const helpInteractionHandler = {
  namespace: HELP_NAMESPACE,
  handleComponent,
  renderForeign,
  renderExpired,
};
