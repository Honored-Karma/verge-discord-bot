import { MessageFlags } from "discord.js";
import { getPlayer, getPlayerInventory, useItem } from "./dataManager.js";
import {
  createInventoryComponents,
  createInventoryEmptyComponents,
  createInventoryErrorComponents,
  createInventoryItemComponents,
  createItemUsedComponents,
  getInventoryPageCount,
  INVENTORY_BACK_ID,
  INVENTORY_NEXT_ID,
  INVENTORY_PREV_ID,
  INVENTORY_SELECT_ID,
  INVENTORY_USE_ALL_ID,
  INVENTORY_USE_ONE_ID,
} from "./inventoryComponents.js";
import { logCommand } from "./logs.js";

const SESSION_DURATION = 3 * 60 * 1000;

function visibleInventory(items) {
  return items.filter(
    (item) => String(item.item_name || "").trim() && Number(item.qty || 0) > 0,
  );
}

function errorMessage(result) {
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

function resolveAvatar(player, targetUser) {
  const candidate = String(player.character_avatar || "").trim();
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return targetUser.displayAvatarURL({ extension: "png", size: 256 });
}

export async function openInventory({
  interaction,
  targetUser,
  playerId,
  slot,
  ephemeral = false,
}) {
  const player = await getPlayer(playerId);
  const responseFlags = MessageFlags.IsComponentsV2
    | (ephemeral ? MessageFlags.Ephemeral : 0);

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
  const canUse = targetUser.id === interaction.user.id;
  let inventory = visibleInventory(await getPlayerInventory(playerId));

  if (inventory.length === 0) {
    return interaction.reply({
      components: createInventoryEmptyComponents(characterName, avatarUrl),
      flags: responseFlags,
    });
  }

  let page = 0;
  let selectedItemName = null;
  let finished = false;
  let busy = false;
  let currentView = "list";
  let lastUseResult = null;

  const listComponents = (disabled = false) => createInventoryComponents({
    characterName,
    avatarUrl,
    inventory,
    page,
    canUse,
    disabled,
  });

  const selectedItem = () => inventory.find(
    (item) => item.item_name === selectedItemName,
  );

  const detailComponents = (disabled = false) => {
    const item = selectedItem();
    return item
      ? createInventoryItemComponents({
          characterName,
          avatarUrl,
          item,
          canUse,
          disabled,
        })
      : listComponents(disabled);
  };

  const response = await interaction.reply({
    components: listComponents(),
    flags: responseFlags,
    fetchReply: true,
  });

  const collector = response.createMessageComponentCollector({
    time: SESSION_DURATION,
  });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({
        content: "Это меню инвентаря открыто для другого игрока.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (busy) {
      await componentInteraction.reply({
        content: "Предмет уже применяется — одну секунду.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (componentInteraction.customId === INVENTORY_PREV_ID) {
      page = Math.max(0, page - 1);
      selectedItemName = null;
      currentView = "list";
      await componentInteraction.update({ components: listComponents() });
      return;
    }

    if (componentInteraction.customId === INVENTORY_NEXT_ID) {
      page = Math.min(getInventoryPageCount(inventory) - 1, page + 1);
      selectedItemName = null;
      currentView = "list";
      await componentInteraction.update({ components: listComponents() });
      return;
    }

    if (componentInteraction.customId === INVENTORY_BACK_ID) {
      inventory = visibleInventory(await getPlayerInventory(playerId));
      page = Math.min(page, getInventoryPageCount(inventory) - 1);
      selectedItemName = null;
      currentView = "list";
      if (inventory.length === 0) {
        finished = true;
        collector.stop("empty");
        await componentInteraction.update({
          components: createInventoryEmptyComponents(characterName, avatarUrl),
        });
        return;
      }
      await componentInteraction.update({ components: listComponents() });
      return;
    }

    if (componentInteraction.isStringSelectMenu()
      && componentInteraction.customId === INVENTORY_SELECT_ID) {
      const inventoryIndex = Number(componentInteraction.values[0]);
      const item = Number.isSafeInteger(inventoryIndex)
        ? inventory[inventoryIndex]
        : null;
      if (!item) {
        await componentInteraction.reply({
          content: "Список предметов изменился. Вернитесь назад и выберите предмет снова.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      selectedItemName = item.item_name;
      currentView = "detail";
      await componentInteraction.update({ components: detailComponents() });
      return;
    }

    const useOne = componentInteraction.customId === INVENTORY_USE_ONE_ID;
    const useAll = componentInteraction.customId === INVENTORY_USE_ALL_ID;
    if (!useOne && !useAll) return;

    if (!canUse || !selectedItemName) {
      await componentInteraction.reply({
        content: "Этот предмет нельзя использовать из текущего меню.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    busy = true;
    await componentInteraction.deferUpdate();
    inventory = visibleInventory(await getPlayerInventory(playerId));
    const currentItem = selectedItem();
    const quantity = useAll ? Number(currentItem?.qty || 0) : 1;
    const result = currentItem && quantity > 0
      ? await useItem(playerId, selectedItemName, quantity)
      : { success: false, reason: "not_found" };

    if (!result.success) {
      busy = false;
      await componentInteraction.followUp({
        content: errorMessage(result),
        flags: MessageFlags.Ephemeral,
      });
      inventory = visibleInventory(await getPlayerInventory(playerId));
      if (inventory.length === 0) {
        finished = true;
        collector.stop("empty");
        await interaction.editReply({
          components: createInventoryEmptyComponents(characterName, avatarUrl),
        });
        return;
      }
      await interaction.editReply({
        components: selectedItem() ? detailComponents() : listComponents(),
      });
      return;
    }

    inventory = visibleInventory(await getPlayerInventory(playerId));
    lastUseResult = result;
    selectedItemName = null;
    currentView = "success";
    busy = false;
    await interaction.editReply({
      components: createItemUsedComponents({ characterName, avatarUrl, result }),
    });

    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: playerId,
      userTag: interaction.user.tag,
      command: "use",
      extra: {
        slot,
        item: result.itemName,
        quantity: result.quantity,
        reward: result.reward,
        resource: result.definition.kind.toUpperCase(),
      },
    });
  });

  collector.on("end", async () => {
    if (finished) return;
    try {
      await interaction.editReply({
        components: currentView === "success" && lastUseResult
          ? createItemUsedComponents({
              characterName,
              avatarUrl,
              result: lastUseResult,
              disabled: true,
            })
          : selectedItemName
            ? detailComponents(true)
            : listComponents(true),
      });
    } catch {}
  });

  return response;
}
