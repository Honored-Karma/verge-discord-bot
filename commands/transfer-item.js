import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  getActiveSlot,
  getPlayer,
  getPlayerInventory,
  transferItem,
} from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import {
  createItemTransferListComponents,
  createItemTransferPreviewComponents,
  createItemTransferReceiptComponents,
  createItemTransferStatusComponents,
  getItemTransferPageCount,
  ITEM_TRANSFER_BACK_ID,
  ITEM_TRANSFER_CANCEL_ID,
  ITEM_TRANSFER_CONFIRM_ID,
  ITEM_TRANSFER_NEXT_ID,
  ITEM_TRANSFER_PREV_ID,
  ITEM_TRANSFER_SELECT_ID,
} from "../utils/itemTransferComponents.js";
import { logCommand } from "../utils/logs.js";
import { makePlayerKey } from "../utils/playerKey.js";

const SESSION_DURATION = 3 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("transfer-item")
  .setDescription("Передать предмет другому персонажу")
  .addUserOption((option) => option
    .setName("user")
    .setDescription("Кому передать предмет")
    .setRequired(true))
  .addIntegerOption((option) => option
    .setName("quantity")
    .setDescription("Количество — по умолчанию 1")
    .setMinValue(1)
    .setMaxValue(1_000_000)
    .setRequired(false))
  .addIntegerOption((option) => option
    .setName("slot")
    .setDescription("Слот получателя — по умолчанию активный")
    .setRequired(false)
    .addChoices(
      { name: "Слот 1", value: 1 },
      { name: "Слот 2", value: 2 },
      { name: "Слот 3", value: 3 },
    ));

function visibleInventory(items, quantity) {
  return items.filter((item) => (
    String(item.item_name || "").trim()
    && Number.isSafeInteger(Number(item.qty))
    && Number(item.qty) >= quantity
  ));
}

function avatarUrl(player, user) {
  const custom = String(player.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
}

function errorMessage(result) {
  switch (result.reason) {
    case "not_found":
      return "Предмета больше нет в инвентаре.";
    case "insufficient_quantity":
      return `Осталось только **${Number(result.available || 0).toLocaleString("ru-RU")} шт.**`;
    case "recipient_not_found":
      return "Персонаж получателя больше не существует.";
    case "sender_not_found":
      return "Активный персонаж отправителя больше не существует.";
    case "quantity_too_large":
      return "Стопка получателя станет слишком большой. Передайте меньше предметов.";
    case "inventory_changed":
      return "Инвентарь изменился во время подтверждения. Выберите предмет заново.";
    case "rollback_failed":
      return "Передача остановлена из-за ошибки синхронизации. Обратитесь к администратору для проверки инвентаря.";
    default:
      return "Не удалось передать предмет. Инвентарь не изменён — повторите действие.";
  }
}

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + cooldown.remaining) / 1000);
    return interaction.reply({
      components: createItemTransferStatusComponents(
        "Подождите перед передачей",
        `Попробуйте снова <t:${retryAt}:R>.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const recipientUser = interaction.options.getUser("user", true);
  const quantity = interaction.options.getInteger("quantity") || 1;
  const [senderSlot, defaultRecipientSlot] = await Promise.all([
    getActiveSlot(interaction.user.id),
    getActiveSlot(recipientUser.id),
  ]);
  const recipientSlot = interaction.options.getInteger("slot") || defaultRecipientSlot;
  const senderId = makePlayerKey(interaction.user.id, senderSlot);
  const recipientId = makePlayerKey(recipientUser.id, recipientSlot);

  if (senderId === recipientId) {
    return interaction.reply({
      components: createItemTransferStatusComponents(
        "Выберите другого персонажа",
        "Нельзя передать предмет тому же персонажу. Для своего второго слота явно выберите другой слот.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const [sender, recipient] = await Promise.all([
    getPlayer(senderId),
    getPlayer(recipientId),
  ]);
  if (!sender || !recipient) {
    return interaction.reply({
      components: createItemTransferStatusComponents(
        "Передача недоступна",
        !sender
          ? "Создайте персонажа в активном слоте через `/register`."
          : `В слоте ${recipientSlot} у ${recipientUser.username} нет персонажа.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  let inventory = visibleInventory(await getPlayerInventory(senderId), quantity);
  if (inventory.length === 0) {
    return interaction.reply({
      components: createItemTransferStatusComponents(
        "Нет подходящих предметов",
        `В активном инвентаре нет предметов в количестве **${quantity.toLocaleString("ru-RU")} шт.** Уменьшите количество или получите предметы.`,
        "neutral",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const senderName = sender.character_name || sender.username || interaction.user.username;
  const recipientName = recipient.character_name || recipient.username || recipientUser.username;
  const senderAvatarUrl = avatarUrl(sender, interaction.user);
  let page = 0;
  let selectedItemName = null;
  let busy = false;
  let completed = false;
  let currentView = "list";
  let lastResult = null;

  const selectedItem = () => inventory.find((item) => item.item_name === selectedItemName);
  const list = (disabled = false) => createItemTransferListComponents({
    senderName,
    senderAvatarUrl,
    recipientName,
    recipientSlot,
    inventory,
    quantity,
    page,
    disabled,
  });
  const preview = (disabled = false) => createItemTransferPreviewComponents({
    senderName,
    senderAvatarUrl,
    recipientName,
    recipientSlot,
    item: selectedItem(),
    quantity,
    disabled,
  });
  const receipt = (disabled = false) => createItemTransferReceiptComponents({
    senderName,
    senderAvatarUrl,
    recipientName,
    recipientSlot,
    result: lastResult,
    disabled,
  });

  await interaction.reply({
    components: list(),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
  const response = await interaction.fetchReply();
  const collector = response.createMessageComponentCollector({ time: SESSION_DURATION });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (busy) {
      await componentInteraction.reply({
        components: createItemTransferStatusComponents(
          "Передача уже выполняется",
          "Дождитесь результата текущей операции.",
          "warning",
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
    let transferCompleted = false;
    try {
      if (componentInteraction.customId === ITEM_TRANSFER_PREV_ID) {
        page = Math.max(0, page - 1);
        await componentInteraction.update({ components: list() });
        return;
      }
      if (componentInteraction.customId === ITEM_TRANSFER_NEXT_ID) {
        page = Math.min(getItemTransferPageCount(inventory) - 1, page + 1);
        await componentInteraction.update({ components: list() });
        return;
      }
      if (componentInteraction.customId === ITEM_TRANSFER_BACK_ID) {
        inventory = visibleInventory(await getPlayerInventory(senderId), quantity);
        if (inventory.length === 0) {
          completed = true;
          collector.stop("empty");
          await componentInteraction.update({
            components: createItemTransferStatusComponents(
              "Инвентарь изменился",
              "Предметов для новой передачи больше не осталось.",
              "neutral",
            ),
          });
          return;
        }
        selectedItemName = null;
        lastResult = null;
        currentView = "list";
        page = Math.min(page, getItemTransferPageCount(inventory) - 1);
        await componentInteraction.update({ components: list() });
        return;
      }
      if (componentInteraction.customId === ITEM_TRANSFER_CANCEL_ID) {
        completed = true;
        collector.stop("cancelled");
        await componentInteraction.update({
          components: createItemTransferStatusComponents(
            "Передача отменена",
            "Инвентари персонажей не изменены.",
            "neutral",
          ),
        });
        return;
      }
      if (componentInteraction.isStringSelectMenu()
        && componentInteraction.customId === ITEM_TRANSFER_SELECT_ID) {
        const item = inventory[Number(componentInteraction.values[0])];
        if (!item) {
          await componentInteraction.reply({
            components: createItemTransferStatusComponents(
              "Список изменился",
              "Вернитесь к списку и выберите предмет заново.",
            ),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }
        selectedItemName = item.item_name;
        currentView = "preview";
        await componentInteraction.update({ components: preview() });
        return;
      }
      if (componentInteraction.customId !== ITEM_TRANSFER_CONFIRM_ID
        || !selectedItemName) return;

      busy = true;
      await componentInteraction.deferUpdate();
      const result = await transferItem(senderId, recipientId, selectedItemName, quantity);
      if (!result.success) {
        busy = false;
        inventory = visibleInventory(await getPlayerInventory(senderId), quantity);
        if (inventory.length === 0) {
          completed = true;
          collector.stop("empty");
          await interaction.editReply({
            components: createItemTransferStatusComponents(
              "Инвентарь изменился",
              errorMessage(result),
              "warning",
            ),
          });
          return;
        }
        await interaction.editReply({
          components: selectedItem() ? preview() : list(),
        });
        await componentInteraction.followUp({
          components: createItemTransferStatusComponents(
            "Предмет не передан",
            errorMessage(result),
          ),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

      lastResult = result;
      transferCompleted = true;
      currentView = "receipt";
      await interaction.editReply({ components: receipt() });
      busy = false;
      await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: senderId,
        userTag: interaction.user.tag,
        command: "transfer-item",
        targetId: recipientId,
        targetTag: recipientName,
        extra: {
          item: result.itemName,
          quantity: result.quantity,
          sender_slot: senderSlot,
          recipient_slot: recipientSlot,
          mode: result.mode,
        },
      }).catch((error) => console.error("Error logging item transfer:", error));
    } catch (error) {
      busy = false;
      console.error("Error handling item transfer:", error);
      if (transferCompleted) {
        completed = true;
        collector.stop("transferred");
        await componentInteraction.followUp({
          components: createItemTransferStatusComponents(
            "Предмет передан",
            "Инвентари уже изменены, но квитанцию не удалось обновить. Проверьте `/inventory` перед новой передачей.",
            "warning",
          ),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }
      await componentInteraction.followUp({
        components: createItemTransferStatusComponents(
          "Предмет не передан",
          "Не удалось завершить операцию. Инвентарь не изменён — повторите действие.",
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  });

  collector.on("end", async () => {
    if (completed) return;
    try {
      await interaction.editReply({
        components: currentView === "receipt" && lastResult
          ? receipt(true)
          : currentView === "preview" && selectedItem()
            ? preview(true)
            : list(true),
      });
    } catch {}
  });

  return response;
}
