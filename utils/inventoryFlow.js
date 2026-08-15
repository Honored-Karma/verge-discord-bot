import { MessageFlags } from "discord.js";
import { getPlayer, getPlayerInventory } from "./dataManager.js";
import {
  createInventoryEmptyComponents,
  createInventoryErrorComponents,
} from "./inventoryComponents.js";
import {
  createInventorySessionState,
  INVENTORY_NAMESPACE,
  INVENTORY_SESSION_TTL_MS,
  renderInventory,
  visibleInventory,
} from "../interactions/inventorySession.js";
import { createInteractionSession } from "./interactionSessions.js";

function resolveAvatar(player, targetUser) {
  const candidate = String(player.character_avatar || "").trim();
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return targetUser.displayAvatarURL({ extension: "png", size: 256 });
}

/**
 * Открывает панель инвентаря. Общая точка входа для `/inventory` и `/use`.
 *
 * Состояние панели живёт в MongoDB, а не в коллекторе на три минуты: раньше
 * после рестарта бота кнопки в уже отправленном сообщении умирали, и игрок жал
 * их без всякого результата.
 */
export async function openInventory({
  interaction,
  targetUser,
  playerId,
  slot,
  ephemeral = false,
}) {
  const responseFlags = MessageFlags.IsComponentsV2
    | (ephemeral ? MessageFlags.Ephemeral : 0);

  const player = await getPlayer(playerId);
  if (!player) {
    return interaction.reply({
      components: createInventoryErrorComponents(
        "Пустой слот",
        "Сначала создайте персонажа в этом слоте через `/register`.",
      ),
      flags: responseFlags,
    });
  }

  const characterName = player.character_name || player.username || targetUser.username;
  const avatarUrl = resolveAvatar(player, targetUser);
  const inventory = visibleInventory(await getPlayerInventory(playerId));

  if (inventory.length === 0) {
    return interaction.reply({
      components: createInventoryEmptyComponents(characterName, avatarUrl),
      flags: responseFlags,
    });
  }

  const state = createInventorySessionState({
    playerId,
    characterName,
    avatarUrl,
    // Смотреть чужой инвентарь можно, использовать из него — нет.
    canUse: targetUser.id === interaction.user.id,
  });

  const view = await renderInventory(state);
  const response = await interaction.reply({
    components: view.components,
    flags: responseFlags,
    fetchReply: true,
  });

  const messageId = response?.id || (await interaction.fetchReply()).id;
  const created = await createInteractionSession({
    messageId,
    namespace: INVENTORY_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state: { ...state, slot },
    ttlMs: INVENTORY_SESSION_TTL_MS,
  });

  if (!created.success) {
    console.error("Inventory session was not stored:", created.reason);
  }

  return response;
}
