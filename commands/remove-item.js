import { SlashCommandBuilder } from "discord.js";
import {
  getActiveSlot,
  getPlayer,
  getPlayerInventory,
  removeItem,
} from "../utils/dataManager.js";
import { createErrorEmbed, createSuccessEmbed } from "../utils/embeds.js";
import { hasCommandPermission, isAdmin } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { logCommand } from "../utils/logs.js";
import { autoDeleteMessageShort, checkGlobalCooldown } from "../utils/cooldowns.js";
import { makePlayerKey } from "../utils/playerKey.js";
import { listCatalogItems } from "../utils/itemSystem.js";

export const data = new SlashCommandBuilder()
  .setName("remove-item")
  .setDefaultMemberPermissions(null)
  .setDMPermission(false)
  .setDescription("[АДМИН] Удалить предмет из инвентаря персонажа")
  .addUserOption((option) => option
    .setName("user")
    .setDescription("Игрок, у которого нужно удалить предмет")
    .setRequired(true))
  .addStringOption((option) => option
    .setName("item")
    .setDescription("Название предмета для удаления")
    .setAutocomplete(true)
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(true))
  .addIntegerOption((option) => option
    .setName("quantity")
    .setDescription("Количество предметов (по умолчанию 1)")
    .setMinValue(1)
    .setMaxValue(1_000_000)
    .setRequired(false))
  .addBooleanOption((option) => option
    .setName("all")
    .setDescription("Удалить всю стопку предмета целиком (игнорирует количество)")
    .setRequired(false))
  .addIntegerOption((option) => option
    .setName("slot")
    .setDescription("Слот персонажа — по умолчанию активный")
    .setRequired(false)
    .addChoices(
      { name: "Слот 1", value: 1 },
      { name: "Слот 2", value: 2 },
      { name: "Слот 3", value: 3 },
    ))
  .addStringOption((option) => option
    .setName("reason")
    .setDescription("Причина удаления предмета")
    .setMaxLength(200)
    .setRequired(false));

export async function autocomplete(interaction) {
  try {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== "item") return;

    const query = String(focusedOption.value || "").trim().toLowerCase();
    const userOption = interaction.options.get("user");
    const targetUserId = userOption?.value;
    const slotOption = interaction.options.get("slot")?.value;

    let items = [];
    if (targetUserId) {
      let slot = slotOption;
      if (!slot) {
        slot = await getActiveSlot(targetUserId).catch(() => 1);
      }
      if (![1, 2, 3].includes(slot)) slot = 1;

      const playerId = makePlayerKey(targetUserId, slot);
      const inventory = await getPlayerInventory(playerId).catch(() => []);
      items = (inventory || [])
        .filter((item) => item.item_name && Number(item.qty) > 0)
        .map((item) => ({
          name: `${item.item_name} (${Number(item.qty).toLocaleString("ru-RU")} шт.)`.slice(0, 100),
          value: item.item_name.slice(0, 100),
        }));
    }

    if (items.length === 0) {
      items = listCatalogItems().map((item) => ({
        name: item.name.slice(0, 100),
        value: item.name.slice(0, 100),
      }));
    }

    let filtered = items;
    if (query) {
      filtered = items.filter(
        (choice) =>
          choice.value.toLowerCase().includes(query)
          || choice.name.toLowerCase().includes(query),
      );
    }

    return await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error("Error handling remove-item autocomplete:", error);
    return interaction.respond([]).catch(() => {});
  }
}

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!hasCommandPermission(member, "remove-item") && !isAdmin(member)) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Эта команда доступна только администраторам и ГМам.",
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const msg = await interaction.reply({
      content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const itemName = interaction.options.getString("item", true).trim();
  const quantity = interaction.options.getInteger("quantity") || 1;
  const removeAll = interaction.options.getBoolean("all") || false;
  const reason = interaction.options.getString("reason") || null;

  let slot = interaction.options.getInteger("slot");
  if (!slot) {
    slot = await getActiveSlot(targetUser.id);
  }
  if (![1, 2, 3].includes(slot)) slot = 1;

  const playerId = makePlayerKey(targetUser.id, slot);
  const player = await getPlayer(playerId);
  if (!player) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Пустой слот",
          `В слоте ${slot} у <@${targetUser.id}> нет персонажа.`,
        ),
      ],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const characterName = player.character_name || player.username || targetUser.username;

  const result = await removeItem(playerId, itemName, quantity, interaction.user.id, {
    removeAll,
    reason,
  });

  if (!result.success) {
    let errorTitle = "Ошибка удаления";
    let errorMessage = "Не удалось удалить предмет из инвентаря.";

    if (result.reason === "not_found") {
      errorTitle = "Предмет не найден";
      errorMessage = `В инвентаре **${characterName}** (слот ${slot}) нет предмета «**${itemName}**».`;
    } else if (result.reason === "insufficient_quantity") {
      errorTitle = "Недостаточно предметов";
      errorMessage =
        `В инвентаре **${characterName}** только **${result.available} шт.** предмета «**${result.itemName || itemName}**» (запрошено к списанию: **${quantity} шт.**).\n\n`
        + "💡 Включите параметр `all: True`, чтобы удалить всю стопку, или укажите меньшее количество.";
    } else if (result.reason === "invalid_quantity") {
      errorTitle = "Некорректное количество";
      errorMessage = "Количество предметов должно быть целым положительным числом.";
    } else if (result.reason === "inventory_busy") {
      errorTitle = "Инвентарь занят";
      errorMessage = "Инвентарь персонажа сейчас обновляется другой операцией. Попробуйте снова через секунду.";
    }

    const msg = await interaction.reply({
      embeds: [createErrorEmbed(errorTitle, errorMessage)],
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const remainingText = result.remainingQuantity > 0
    ? `Осталось в инвентаре: **${result.remainingQuantity.toLocaleString("ru-RU")} шт.**`
    : "Предмет полностью удалён из инвентаря.";
  const reasonText = reason ? `\n📝 Причина: *${reason}*` : "";

  const successDescription =
    `Из инвентаря **${characterName}** (слот ${slot}) удалено:\n\n`
    + `📦 Предмет: **${result.itemName}**\n`
    + `🔢 Списано: **${result.removedQuantity.toLocaleString("ru-RU")} шт.**\n`
    + `📊 ${remainingText}${reasonText}`;

  const msg = await interaction.reply({
    embeds: [createSuccessEmbed("Предмет удалён", successDescription, "inventory")],
    fetchReply: true,
  });
  autoDeleteMessageShort(msg);

  try {
    await logCommand({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      command: "remove-item",
      targetId: playerId,
      targetTag: `${characterName} · слот ${slot} <@${targetUser.id}>`,
      extra: {
        item: result.itemName,
        removed_quantity: result.removedQuantity,
        remaining_quantity: result.remainingQuantity,
        all: removeAll,
        reason,
      },
    });
  } catch (e) {
    console.error("Error logging remove-item command:", e);
  }
}
