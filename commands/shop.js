import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getActiveSlot, getPlayer } from "../utils/dataManager.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { makePlayerKey } from "../utils/playerKey.js";
import { createShopStatusComponents } from "../utils/shopComponents.js";
import {
  createShopSessionState,
  preferredCurrency,
  renderShopComponents,
  SHOP_NAMESPACE,
  SHOP_SESSION_TTL_MS,
} from "../interactions/shopSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Открыть магазин расходников и редких заказов")
  .setDMPermission(false);

function avatarUrl(player, user) {
  const custom = String(player?.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
}

export async function execute(interaction) {
  const cooldown = checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + cooldown.remaining) / 1000);
    return interaction.reply({
      components: createShopStatusComponents(
        "Магазин пока недоступен",
        `Попробуйте снова <t:${retryAt}:R>.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const slot = await getActiveSlot(interaction.user.id);
  const playerId = makePlayerKey(interaction.user.id, slot);
  const player = await getPlayer(playerId);
  if (!player) {
    return interaction.reply({
      components: createShopStatusComponents(
        "Персонаж не найден",
        "Создайте персонажа в активном слоте через `/register`, затем снова откройте `/shop`.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const state = createShopSessionState({
    playerId,
    characterName: player.character_name || player.username,
    characterAvatarUrl: avatarUrl(player, interaction.user),
    currency: preferredCurrency(player),
  });

  const response = await interaction.reply({
    components: await renderShopComponents(state),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const messageId = response?.id || (await interaction.fetchReply()).id;

  const created = await createInteractionSession({
    messageId,
    namespace: SHOP_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: SHOP_SESSION_TTL_MS,
  });

  // Without a session the panel would be inert, so say so instead of leaving
  // the player clicking dead buttons.
  if (!created.success) {
    await interaction.editReply({
      components: createShopStatusComponents(
        "Витрину не удалось открыть",
        "Не удалось сохранить состояние магазина. Попробуйте выполнить `/shop` ещё раз.",
      ),
    }).catch(() => {});
  }

  return response;
}
