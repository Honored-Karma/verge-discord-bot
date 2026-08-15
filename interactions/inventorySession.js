import { MessageFlags } from "discord.js";
import { getPlayer, getPlayerInventory, useItem } from "../utils/dataManager.js";
import {
  createInventoryComponents,
  createInventoryEmptyComponents,
  createInventoryItemComponents,
  createItemUsedComponents,
  getInventoryPageCount,
  INVENTORY_BACK_ID,
  INVENTORY_NEXT_ID,
  INVENTORY_PREV_ID,
  INVENTORY_SELECT_ID,
  INVENTORY_USE_ALL_ID,
  INVENTORY_USE_ONE_ID,
} from "../utils/inventoryComponents.js";
import {
  claimInteractionSession,
  releaseInteractionSession,
  saveInteractionSession,
  SESSION_STATUS,
} from "../utils/interactionSessions.js";
import { logCommand } from "../utils/logs.js";

export const INVENTORY_NAMESPACE = "inventory";
export const INVENTORY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function visibleInventory(items) {
  return items.filter(
    (item) => String(item.item_name || "").trim() && Number(item.qty || 0) > 0,
  );
}

export function useErrorMessage(result) {
  switch (result.reason) {
    case "not_found":
      return "Предмета больше нет в инвентаре.";
    case "insufficient_quantity":
      return `В инвентаре осталось только ${Number(result.available || 0).toLocaleString("ru-RU")} шт.`;
    case "style_not_found":
      return "Боевой стиль из этого свитка больше не существует. Предмет сохранён.";
    case "style_not_owned":
      return "Сначала изучите стиль из этого свитка. Предмет сохранён.";
    case "not_usable":
      return "Это коллекционный предмет — бот не станет его расходовать.";
    case "invalid_quantity":
    case "amount_too_large":
      return "Число слишком велико для безопасного начисления. Используйте меньшую стопку или попросите администратора заменить предмет.";
    default:
      return "Не удалось применить предмет. Он не был потрачен — попробуйте ещё раз.";
  }
}

export function createInventorySessionState({
  playerId,
  characterName,
  avatarUrl,
  canUse,
}) {
  return {
    player_id: playerId,
    character_name: characterName,
    avatar_url: avatarUrl,
    can_use: Boolean(canUse),
    page: 0,
    selected_item: null,
    view: "list",
  };
}

/**
 * Рендер строится из свежего инвентаря, а не из списка, снятого при открытии:
 * за сутки жизни панели предметы могли уйти на передачу или в использование.
 */
export async function renderInventory(state, { disabled = false } = {}) {
  const inventory = visibleInventory(await getPlayerInventory(state.player_id));
  const identity = {
    characterName: state.character_name,
    avatarUrl: state.avatar_url,
  };

  if (inventory.length === 0) {
    return { components: createInventoryEmptyComponents(state.character_name, state.avatar_url), inventory };
  }

  const pageCount = getInventoryPageCount(inventory);
  const page = Math.min(Math.max(0, Number(state.page || 0)), pageCount - 1);

  if (state.view === "detail" && state.selected_item) {
    const item = inventory.find((entry) => entry.item_name === state.selected_item);
    if (item) {
      return {
        components: createInventoryItemComponents({
          ...identity,
          item,
          canUse: state.can_use,
          disabled,
        }),
        inventory,
      };
    }
  }

  return {
    components: createInventoryComponents({
      ...identity,
      inventory,
      page,
      canUse: state.can_use,
      disabled,
    }),
    inventory,
  };
}

async function applyNavigation(interaction, state, inventory) {
  const customId = interaction.customId;
  const pageCount = getInventoryPageCount(inventory);

  if (customId === INVENTORY_PREV_ID) {
    state.page = Math.max(0, Number(state.page || 0) - 1);
    state.selected_item = null;
    state.view = "list";
    return true;
  }

  if (customId === INVENTORY_NEXT_ID) {
    state.page = Math.min(pageCount - 1, Number(state.page || 0) + 1);
    state.selected_item = null;
    state.view = "list";
    return true;
  }

  if (customId === INVENTORY_BACK_ID) {
    state.page = Math.min(Number(state.page || 0), pageCount - 1);
    state.selected_item = null;
    state.view = "list";
    return true;
  }

  if (customId === INVENTORY_SELECT_ID && interaction.isStringSelectMenu()) {
    const index = Number(interaction.values[0]);
    const item = Number.isSafeInteger(index) ? inventory[index] : null;
    if (!item) {
      return {
        notice: "Список предметов изменился. Вернитесь назад и выберите предмет снова.",
      };
    }
    state.selected_item = item.item_name;
    state.view = "detail";
    return true;
  }

  return false;
}

async function handleUse({ interaction, session }) {
  const useAll = interaction.customId === INVENTORY_USE_ALL_ID;

  if (!session.state.can_use || !session.state.selected_item) {
    return interaction.reply({
      content: "Этот предмет нельзя использовать из текущего меню.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }

  // Использование предмета расходует его, поэтому двойной клик защищаем
  // атомарным захватом сессии, а не флагом в памяти процесса.
  const claimed = await claimInteractionSession(session.message_id, session.revision);
  if (!claimed) {
    return interaction.reply({
      content: "Предмет уже применяется — одну секунду.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }

  const state = { ...claimed.state };
  await interaction.deferUpdate();

  try {
    const inventory = visibleInventory(await getPlayerInventory(state.player_id));
    const item = inventory.find((entry) => entry.item_name === state.selected_item);
    const quantity = useAll ? Number(item?.qty || 0) : 1;
    const result = item && quantity > 0
      ? await useItem(state.player_id, state.selected_item, quantity)
      : { success: false, reason: "not_found" };

    if (!result.success) {
      state.view = "list";
      state.selected_item = null;
      await releaseInteractionSession(session.message_id, state);
      await interaction.followUp({
        content: useErrorMessage(result),
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      const view = await renderInventory(state);
      return interaction.editReply({ components: view.components }).catch(() => {});
    }

    state.view = "list";
    state.selected_item = null;
    await releaseInteractionSession(session.message_id, state);

    await interaction.editReply({
      components: createItemUsedComponents({
        characterName: state.character_name,
        avatarUrl: state.avatar_url,
        result,
      }),
    }).catch(() => {});

    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      command: "use",
      targetId: state.player_id,
      targetTag: state.character_name,
      extra: {
        item: result.itemName ?? state.selected_item,
        quantity: result.quantity ?? quantity,
      },
    }).catch((error) => console.error("Error logging item use:", error));
  } catch (error) {
    console.error("Error using inventory item:", error);
    await releaseInteractionSession(session.message_id, state);
    await interaction.followUp({
      content: "Не удалось применить предмет. Проверьте инвентарь перед повторной попыткой.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

async function handleComponent({ interaction, session }) {
  if (interaction.customId === INVENTORY_USE_ONE_ID
    || interaction.customId === INVENTORY_USE_ALL_ID) {
    return handleUse({ interaction, session });
  }

  if (session.status === SESSION_STATUS.working) {
    return interaction.reply({
      content: "Предмет уже применяется — одну секунду.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }

  const state = { ...session.state };
  const inventory = visibleInventory(await getPlayerInventory(state.player_id));
  const outcome = await applyNavigation(interaction, state, inventory);

  if (outcome && outcome.notice) {
    return interaction.reply({
      content: outcome.notice,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }

  if (!outcome) return interaction.deferUpdate().catch(() => {});

  const saved = await saveInteractionSession(
    session.message_id,
    session.revision,
    state,
    { ttlMs: INVENTORY_SESSION_TTL_MS },
  );
  const effective = saved.success ? saved.session.state : (saved.session?.state || state);
  const view = await renderInventory(effective);

  return interaction.update({ components: view.components }).catch(() => {});
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    content: "Это меню инвентаря открыто для другого игрока.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    content: "Эта панель инвентаря больше не активна. Откройте `/inventory` ещё раз.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

export const inventoryInteractionHandler = {
  namespace: INVENTORY_NAMESPACE,
  handleComponent,
  renderForeign,
  renderExpired,
};

export const __testables = { applyNavigation };
