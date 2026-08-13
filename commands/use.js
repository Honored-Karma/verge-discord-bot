import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getActiveSlot } from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { createInventoryErrorComponents } from "../utils/inventoryComponents.js";
import { openInventory } from "../utils/inventoryFlow.js";
import { makePlayerKey } from "../utils/playerKey.js";

export const data = new SlashCommandBuilder()
  .setName("use")
  .setDescription("Выбрать и использовать предмет из своего инвентаря");

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    return interaction.reply({
      components: createInventoryErrorComponents(
        "Предметы пока недоступны",
        `Попробуйте снова <t:${retryAt}:R>.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const slot = await getActiveSlot(interaction.user.id);
  return openInventory({
    interaction,
    targetUser: interaction.user,
    playerId: makePlayerKey(interaction.user.id, slot),
    slot,
    ephemeral: true,
  });
}
