import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getPlayer, isSlot3Unlocked } from "../utils/dataManager.js";
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

export function resolveAcceptanceSlot({
  requestedSlot,
  slot1Player,
  slot2Player,
  slot3Player,
  isSlot3Unlocked = false,
  targetUserId,
}) {
  const userMention = targetUserId ? `<@${targetUserId}>` : "пользователя";

  if (requestedSlot !== null && requestedSlot !== undefined) {
    const slotNum = Number(requestedSlot);
    if (![1, 2, 3].includes(slotNum)) {
      return {
        ok: false,
        title: "Неверный слот",
        message: "Доступны слоты: 1, 2 или 3.",
      };
    }

    // Slot 3 restriction: requires administrator grant
    if (slotNum === 3 && !isSlot3Unlocked) {
      return {
        ok: false,
        title: "Слот 3 заблокирован",
        message: `Доступ к 3-му слоту персонажа у ${userMention} заблокирован.\n\nВыдача 3-го слота осуществляется администрацией сервера через команду \`/grant-slot\`.`,
      };
    }

    // Sequential registration policy:
    // Slot 2 requires Slot 1 to exist.
    if (slotNum === 2 && !slot1Player) {
      return {
        ok: false,
        title: "Сначала примите слот 1",
        message: `Нельзя принять персонажа в слот 2, пока у ${userMention} нет персонажа в слоте 1.`,
      };
    }

    // Slot 3 requires Slot 1 and Slot 2 to exist.
    if (slotNum === 3) {
      if (!slot1Player) {
        return {
          ok: false,
          title: "Сначала примите слот 1",
          message: `Нельзя принять персонажа в слот 3, пока у ${userMention} нет персонажа в слоте 1.`,
        };
      }
      if (!slot2Player) {
        return {
          ok: false,
          title: "Сначала примите слот 2",
          message: `Нельзя принять персонажа в слот 3, пока у ${userMention} нет персонажа в слоте 2.`,
        };
      }
    }

    // Check if requested slot is occupied
    const occupiedPlayer = slotNum === 1 ? slot1Player : slotNum === 2 ? slot2Player : slot3Player;
    if (occupiedPlayer) {
      const charName = occupiedPlayer.character_name || occupiedPlayer.username || "Персонаж";
      return {
        ok: false,
        title: "Слот занят",
        message: `В слоте **${slotNum}** у ${userMention} уже есть персонаж (**${charName}**).\n\nПринятие анкеты на уже занятый слот запрещено во избежание удаления существующего персонажа. Укажите свободный слот.`,
      };
    }

    return { ok: true, slot: slotNum };
  }

  // Automatically determine next free slot in sequence (1 -> 2 -> 3)
  if (!slot1Player) {
    return { ok: true, slot: 1 };
  } else if (!slot2Player) {
    return { ok: true, slot: 2 };
  } else if (!isSlot3Unlocked) {
    return {
      ok: false,
      title: "Лимит слотов достигнут",
      message: `У ${userMention} уже заняты все стандартные слоты (1 и 2).\n\nДоступ к 3-му слоту персонажа выдаётся администрацией сервера через команду \`/grant-slot\`.`,
    };
  } else if (!slot3Player) {
    return { ok: true, slot: 3 };
  } else {
    return {
      ok: false,
      title: "Все слоты заняты",
      message: `У ${userMention} уже созданы персонажи во всех трёх слотах (1, 2 и 3).\n\nНельзя принять новую анкету, пока один из слотов не будет освобождён.`,
    };
  }
}

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
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
      .setDescription("Номер слота персонажа (по умолчанию: следующий свободный)")
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

  const [slot1Player, slot2Player, slot3Player, slot3Unlocked] = await Promise.all([
    getPlayer(makeTargetPlayerId(targetUser.id, 1)),
    getPlayer(makeTargetPlayerId(targetUser.id, 2)),
    getPlayer(makeTargetPlayerId(targetUser.id, 3)),
    isSlot3Unlocked(targetUser.id),
  ]);

  const slotResolution = resolveAcceptanceSlot({
    requestedSlot,
    slot1Player,
    slot2Player,
    slot3Player,
    isSlot3Unlocked: slot3Unlocked,
    targetUserId: targetUser.id,
  });

  if (!slotResolution.ok) {
    return interaction.reply({
      embeds: [createErrorEmbed(slotResolution.title, slotResolution.message)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const slot = slotResolution.slot;
  const playerId = makeTargetPlayerId(targetUser.id, slot);

  const characterNameOpt = interaction.options.getString("character_name");
  const attributeNameOpt = interaction.options.getString("attribute_name");
  const characterUrlOpt = interaction.options.getString("character_url");
  const avatarAttachment = interaction.options.getAttachment("avatar");

  let avatarUrl = null;
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
    character_name: characterNameOpt || "",
    attribute_name: attributeNameOpt || "",
    organization: "",
    rank: "",
    character_avatar: avatarUrl,
    character_url: characterUrlOpt || "",
    stats: {},
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
