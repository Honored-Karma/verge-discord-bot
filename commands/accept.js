import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getPlayer } from "../utils/dataManager.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { createErrorEmbed } from "../utils/embeds.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { makeTargetPlayerId } from "../utils/physicalStats.js";
import { saveCharacterAvatar } from "../utils/avatarStorage.js";
import {
  ACCEPT_APPLICATION_NAMESPACE,
  ACCEPT_APPLICATION_TTL_MS,
  createAcceptApplicationComponents,
  createAcceptApplicationPreviewEmbed,
  createAcceptApplicationState,
} from "../interactions/acceptApplicationSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("[АНКЕТОЛОГ] Принять анкету игрока, заполнить профиль и выдать роль")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Игрок, чья анкета принимается")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("character_name")
      .setDescription("Имя персонажа (можно ввести сразу или позже через кнопку)")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("slot")
      .setDescription("Номер слота персонажа (по умолчанию: 1)")
      .setRequired(false)
      .addChoices(
        { name: "Слот 1", value: 1 },
        { name: "Слот 2", value: 2 },
        { name: "Слот 3", value: 3 }
      )
  )
  .addAttachmentOption((option) =>
    option
      .setName("avatar")
      .setDescription("Аватар или изображение внешности персонажа")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("attribute_name")
      .setDescription("Название атрибута (например: Пепел, Гром, Тень, Ангел)")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("character_url")
      .setDescription("Ссылка на анкету персонажа")
      .setRequired(false)
  );

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!hasCommandPermission(member, "accept")) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Команда доступна анкетологам, гейм-мастерам и администраторам сервера."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    return interaction.reply({
      content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const targetUser = interaction.options.getUser("user", true);
  const requestedSlot = interaction.options.getInteger("slot");
  const slot = requestedSlot && [1, 2, 3].includes(requestedSlot) ? requestedSlot : 1;
  const playerId = makeTargetPlayerId(targetUser.id, slot);

  // Check if player profile already exists in this slot
  const existingPlayer = await getPlayer(playerId);

  const characterNameOpt = interaction.options.getString("character_name");
  const attributeNameOpt = interaction.options.getString("attribute_name");
  const characterUrlOpt = interaction.options.getString("character_url");
  const avatarAttachment = interaction.options.getAttachment("avatar");

  let avatarUrl = existingPlayer?.character_avatar || null;
  if (avatarAttachment && avatarAttachment.contentType?.startsWith("image/")) {
    try {
      const saveRes = await saveCharacterAvatar(playerId, avatarAttachment);
      if (saveRes.success && saveRes.avatarUrl) {
        avatarUrl = saveRes.avatarUrl;
      } else {
        avatarUrl = avatarAttachment.url;
      }
    } catch {
      avatarUrl = avatarAttachment.url;
    }
  }

  const state = createAcceptApplicationState({
    target_user_id: targetUser.id,
    target_username: targetUser.username,
    slot,
    player_id: playerId,
    character_name: characterNameOpt || existingPlayer?.character_name || "",
    attribute_name: attributeNameOpt || existingPlayer?.attribute_name || "",
    organization: existingPlayer?.organization || "",
    rank: existingPlayer?.rank || "",
    character_avatar: avatarUrl,
    character_url: characterUrlOpt || existingPlayer?.physical_stats?.character_url || "",
    stats: existingPlayer?.physical_stats || {},
  });

  const previewEmbed = createAcceptApplicationPreviewEmbed(state);
  const components = createAcceptApplicationComponents();

  const response = await interaction.reply({
    embeds: [previewEmbed],
    components,
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const messageId = response.id;

  await createInteractionSession({
    messageId,
    namespace: ACCEPT_APPLICATION_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: ACCEPT_APPLICATION_TTL_MS,
  });
}
