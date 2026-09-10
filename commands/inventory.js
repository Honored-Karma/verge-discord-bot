import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getActiveSlot } from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { createInventoryErrorComponents } from "../utils/inventoryComponents.js";
import { openInventory } from "../utils/inventoryFlow.js";
import { makePlayerKey } from "../utils/playerKey.js";

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("Открыть интерактивный инвентарь персонажа")
  .addUserOption((option) => option
    .setName("user")
    .setDescription("Чей инвентарь показать — по умолчанию ваш")
    .setRequired(false))
  .addIntegerOption((option) => option
    .setName("slot")
    .setDescription("Слот персонажа — по умолчанию активный")
    .setRequired(false)
    .addChoices(
      { name: "Слот 1", value: 1 },
      { name: "Слот 2", value: 2 },
      { name: "Слот 3", value: 3 },
    ));

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    return interaction.reply({
      components: createInventoryErrorComponents(
        "Инвентарь пока недоступен",
        `Попробуйте снова <t:${retryAt}:R>.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const targetUser = interaction.options.getUser("user") || interaction.user;
  let slot = interaction.options.getInteger("slot")
    || await getActiveSlot(targetUser.id);
  if (![1, 2, 3].includes(slot)) slot = 1;

  return openInventory({
    interaction,
    targetUser,
    playerId: makePlayerKey(targetUser.id, slot),
    slot,
  });
}
