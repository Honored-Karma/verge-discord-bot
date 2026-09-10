import { MessageFlags } from "discord.js";
import { isAdmin, hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { getActiveSlot, getAllPlayerSP, getPlayer } from "../utils/dataManager.js";
import { makePlayerKey } from "../utils/playerKey.js";
import { formatRankRequirement } from "../utils/rankSystem.js";
import {
  cancelMission,
  deliverMissionRewards,
  getMissionByMessageId,
  getMissionByPublicId,
  joinMission,
  leaveMission,
  MISSION_STATUS,
  setMissionThreadId,
  startMission,
} from "../utils/missionStore.js";
import {
  createCompletionActionRows,
  createCompletionConfirmationEmbed,
  createMemberProfileSelectRow,
  createMissionActionRows,
  createMissionCardEmbed,
  createPartyListEmbed,
  createPublicProfileEmbed,
  createRetryDeliveryActionRow,
  createRewardReportEmbed,
  MISSION_BTN_ABORT_FINISH,
  MISSION_BTN_CANCEL,
  MISSION_BTN_CONFIRM_FINISH,
  MISSION_BTN_FINISH,
  MISSION_BTN_JOIN,
  MISSION_BTN_LEAVE,
  MISSION_BTN_PARTY,
  MISSION_BTN_PROFILES,
  MISSION_BTN_RETRY_REWARDS,
  MISSION_BTN_START,
  MISSION_SELECT_MEMBER,
} from "../utils/missionComponents.js";

import {
  closeInteractionSession,
  createInteractionSession,
} from "../utils/interactionSessions.js";

export const MISSION_NAMESPACE = "mission";
export const MISSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Checks if a guild member is a GM or Administrator.
 */
export function isGMOrAdmin(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  return hasCommandPermission(member, "add-ap");
}

/**
 * Ephemeral notice helper.
 */
async function sendNotice(interaction, content, options = {}) {
  const payload = {
    content,
    flags: MessageFlags.Ephemeral,
    ...options,
  };
  if (interaction.deferred) {
    return interaction.editReply(payload).catch(() => {});
  }
  if (interaction.replied) {
    return interaction.followUp(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

/**
 * Resolves mission instance from session state or message ID.
 */
async function resolveMission(interaction, session) {
  const publicId = session?.state?.public_id;
  if (publicId) {
    const mission = await getMissionByPublicId(publicId);
    if (mission) return mission;
  }
  if (interaction.message?.id) {
    return await getMissionByMessageId(interaction.message.id);
  }
  return null;
}

/**
 * Updates the public mission card message in the channel.
 */
async function updateMissionCardMessage(interaction, mission) {
  try {
    if (interaction.message?.id === mission.message_id && typeof interaction.message.edit === "function") {
      await interaction.message.edit({
        embeds: [createMissionCardEmbed(mission, interaction.client)],
        components: createMissionActionRows(mission, interaction.client),
      });
      return;
    }

    if (mission.channel_id && mission.message_id) {
      const channel = interaction.guild?.channels
        ? await interaction.guild.channels.fetch(mission.channel_id).catch(() => null)
        : (interaction.client?.channels
          ? await interaction.client.channels.fetch(mission.channel_id).catch(() => null)
          : null);
      if (channel && typeof channel.messages?.fetch === "function") {
        const publicMessage = await channel.messages.fetch(mission.message_id).catch(() => null);
        if (publicMessage && typeof publicMessage.edit === "function") {
          await publicMessage.edit({
            embeds: [createMissionCardEmbed(mission, interaction.client)],
            components: createMissionActionRows(mission, interaction.client),
          });
        }
      }
    }
  } catch (error) {
    console.error(`Failed to update mission card for ${mission.public_id}:`, error);
  }
}

/**
 * Resolves an existing mission thread or creates a new public thread for the mission card.
 */
export async function resolveOrCreateMissionThread(
  interaction,
  mission,
  { createIfMissing = true } = {}
) {
  let thread = interaction.message?.thread || null;

  if (!thread && interaction.message?.hasThread && typeof interaction.message.fetchThread === "function") {
    thread = await interaction.message.fetchThread().catch(() => null);
  }

  // Check if thread ID is stored on mission document
  if (!thread && mission?.thread_id) {
    const channel = interaction.guild?.channels || interaction.client?.channels;
    if (channel && typeof channel.fetch === "function") {
      thread = await channel.fetch(mission.thread_id).catch(() => null);
    }
  }

  // If interaction.message is not the original public card, fetch the card message
  let cardMessage = interaction.message;
  if (
    !thread &&
    (!cardMessage || cardMessage.id !== mission.message_id) &&
    mission.channel_id &&
    mission.message_id
  ) {
    const channel = interaction.guild?.channels
      ? await interaction.guild.channels.fetch(mission.channel_id).catch(() => null)
      : (interaction.client?.channels
        ? await interaction.client.channels.fetch(mission.channel_id).catch(() => null)
        : null);
    if (channel && typeof channel.messages?.fetch === "function") {
      cardMessage = await channel.messages.fetch(mission.message_id).catch(() => null);
      if (cardMessage?.thread) {
        thread = cardMessage.thread;
      } else if (cardMessage?.hasThread && typeof cardMessage.fetchThread === "function") {
        thread = await cardMessage.fetchThread().catch(() => null);
      }
    }
  }

  // Create thread if missing and requested
  if (!thread && createIfMissing && cardMessage && typeof cardMessage.startThread === "function") {
    try {
      thread = await cardMessage.startThread({
        name: `Обсуждение: ${mission.title.slice(0, 80)}`,
        autoArchiveDuration: 1440,
        reason: `Ветка обсуждения для миссии ${mission.public_id}`,
      });
      if (thread?.id) {
        await setMissionThreadId(mission.public_id, thread.id).catch(() => {});
        mission.thread_id = thread.id;
      }
    } catch (err) {
      if (cardMessage?.hasThread && typeof cardMessage.fetchThread === "function") {
        thread = await cardMessage.fetchThread().catch(() => null);
      } else {
        console.warn("Could not create thread for mission:", err?.message);
      }
    }
  }

  // Unarchive if thread was archived
  if (thread?.archived && typeof thread.setArchived === "function") {
    await thread.setArchived(false).catch(() => {});
  }

  return thread;
}

export const missionInteractionHandler = {
  /**
   * Public buttons (Join, Leave, Party, Profiles) are usable by any player.
   * Privileged GM buttons (Start, Finish, Cancel) perform individual permission checks.
   */
  authorize: async () => true,

  handleComponent: async ({ interaction, session }) => {
    const mission = await resolveMission(interaction, session);
    if (!mission) {
      return sendNotice(
        interaction,
        "⚠️ Данные миссии не найдены в базе данных. Возможно, она была удалена."
      );
    }

    const member = await resolveMember(interaction);
    const customId = interaction.customId;

    // ──────────────────────────────────────────────────────────────────────────
    // 1. ВСТУПИТЬ В ПАТИ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_JOIN) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const slot = (await getActiveSlot(interaction.user.id)) || 1;
      const playerId = makePlayerKey(interaction.user.id, slot);
      const player = await getPlayer(playerId);

      if (!player) {
        return sendNotice(
          interaction,
          `⚠️ В слоте **${slot}** у вас нет зарегистрированного персонажа. Создайте его через \`/register\`.`
        );
      }

      const characterName = player.character_name || player.username || interaction.user.username;
      const orgName = player.organization || player.custom_org || null;
      const rank = player.rank || null;

      const result = await joinMission({
        publicId: mission.public_id,
        playerId,
        userId: interaction.user.id,
        characterName,
        organizationName: orgName,
        rank,
      });

      if (!result.success) {
        let msg = "Не удалось вступить в миссию.";
        if (result.reason === "already_joined") {
          msg = "Вы уже состоите в пати этой миссии.";
        } else if (result.reason === "party_full") {
          msg = "❌ Пати уже заполнена! Все доступные места заняты.";
        } else if (result.reason === "organization_mismatch") {
          msg = `❌ Эта миссия доступна только для участников организации **${result.requiredOrg}**.\nВаша организация: **${result.playerOrg}**.`;
        } else if (result.reason === "rank_required") {
          msg = `❌ Для участия в этой миссии требуется ранг **${formatRankRequirement(result.requiredRank)}**.\nУ вашего персонажа ещё нет установленного ранга.`;
        } else if (result.reason === "rank_too_low") {
          msg = `❌ Ваш ранг (**${result.playerRank}**) недостаточен для этой миссии.\nТребуется ранг: **${formatRankRequirement(result.requiredRank)}**.`;
        } else if (result.reason === "not_recruiting") {
          msg = "Набор в эту миссию уже закрыт.";
        } else if (result.reason === "not_invited") {
          msg = "Эта миссия доступна только по приглашению организатора.";
        }
        return sendNotice(interaction, msg);
      }

      await updateMissionCardMessage(interaction, result.mission);

      // Resolve thread, add participant to thread, and ping them
      let threadNotice = "";
      try {
        const thread = await resolveOrCreateMissionThread(interaction, result.mission);
        if (thread) {
          if (typeof thread.members?.add === "function") {
            await thread.members.add(interaction.user.id).catch(() => {});
          }
          if (typeof thread.send === "function") {
            await thread.send(
              `⚔️ <@${interaction.user.id}> (**${characterName}**) вступил(а) в лобби миссии!`
            ).catch(() => {});
          }
          threadNotice = `\n💬 Ветка обсуждения: <#${thread.id}>`;
        }
      } catch (threadErr) {
        console.warn(`Failed to ping member in mission thread:`, threadErr?.message);
      }

      return sendNotice(
        interaction,
        `✅ Вы успешно вступили в миссию **【${mission.title}】** персонажем **${characterName}**!${threadNotice}`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. ПОКИНУТЬ ПАТИ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_LEAVE) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const slot = (await getActiveSlot(interaction.user.id)) || 1;
      const playerId = makePlayerKey(interaction.user.id, slot);

      const result = await leaveMission({
        publicId: mission.public_id,
        playerId,
        userId: interaction.user.id,
      });

      if (!result.success) {
        let msg = "Не удалось покинуть миссию.";
        if (result.reason === "locked") {
          msg = "❌ Выход невозможен: набор закрыт и состав миссии зафиксирован.";
        } else if (result.reason === "not_in_party") {
          msg = "Вы не состоите в пати этой миссии.";
        }
        return sendNotice(interaction, msg);
      }

      await updateMissionCardMessage(interaction, result.mission);
      return sendNotice(interaction, `🚪 Вы вышли из пати миссии **【${mission.title}】**.`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. СОСТАВ ПАТИ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_PARTY) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      return interaction.editReply({
        embeds: [createPartyListEmbed(fresh, interaction.client)],
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. ПРОФИЛИ УЧАСТНИКОВ (МЕНЮ ВЫБОРА)
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_PROFILES) {
      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      const selectRow = createMemberProfileSelectRow(fresh);
      if (!selectRow) {
        return sendNotice(interaction, "В пати пока нет участников для просмотра.");
      }

      const reply = await interaction.reply({
        content: "📋 Выберите участника из списка, чтобы просмотреть его публичное досье:",
        components: [selectRow],
        flags: MessageFlags.Ephemeral,
        withResponse: true,
      });
      const message = reply?.resource?.message || (await interaction.fetchReply().catch(() => null));

      if (message?.id) {
        await createInteractionSession({
          messageId: message.id,
          namespace: MISSION_NAMESPACE,
          ownerId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          state: {
            public_id: fresh.public_id,
            mission_id: fresh._id?.toString?.() || fresh.public_id,
          },
          ttlMs: MISSION_SESSION_TTL_MS,
        });
      }

      return reply;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. ВЫБОР УЧАСТНИКА ИЗ СЕЛЕКТА ПРОФИЛЕЙ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_SELECT_MEMBER) {
      const targetPlayerId = interaction.values?.[0];
      if (!targetPlayerId) {
        return sendNotice(interaction, "Участник не выбран.");
      }

      await interaction.deferUpdate();

      const player = await getPlayer(targetPlayerId);
      if (!player) {
        return interaction.editReply({
          content: "Персонаж не найден в базе данных.",
          embeds: [],
          components: [],
        });
      }

      const styles = await getAllPlayerSP(targetPlayerId);
      const profileEmbed = createPublicProfileEmbed(player, styles);

      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      const selectRow = createMemberProfileSelectRow(fresh);

      return interaction.editReply({
        content: "📋 Профиль участника:",
        embeds: [profileEmbed],
        components: selectRow ? [selectRow] : [],
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. НАЧАТЬ МИССИЮ (ТОЛЬКО ГМ / СОЗДАТЕЛЬ / АДМИН)
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_START) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Запустить миссию может только её организатор (ГМ) или администратор."
        );
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (mission.status !== MISSION_STATUS.recruiting) {
        return sendNotice(
          interaction,
          `Миссия уже находится в статусе 【${mission.status}】.`
        );
      }

      let threadNotice = "";
      const thread = await resolveOrCreateMissionThread(interaction, mission);
      const threadId = thread?.id || mission.thread_id || null;

      if (thread && typeof thread.send === "function") {
        const mentions = (mission.participants || [])
          .map((p) => `<@${p.user_id}>`)
          .filter(Boolean)
          .join(" ");
        const pingLine = mentions ? `\nУчастники: ${mentions}` : "";
        await thread
          .send(`⚔️ **Миссия запущена!** Организатор зафиксировал состав участников. Удачи!${pingLine}`)
          .catch(() => {});
      } else if (!thread) {
        threadNotice =
          "\n⚠️ *Боту не удалось найти или создать ветку. Миссия всё равно запущена.*";
      }

      const result = await startMission({
        publicId: mission.public_id,
        actorId: interaction.user.id,
        actorUsername: interaction.user.username,
        threadId,
      });

      if (!result.success) {
        return sendNotice(interaction, "Не удалось перевести миссию в статус активной.");
      }

      await updateMissionCardMessage(interaction, result.mission);
      return sendNotice(
        interaction,
        `⚔️ Миссия **【${mission.title}】** успешно запущена! Состав участников зафиксирован.${threadNotice}`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. ЗАВЕРШИТЬ МИССИЮ: ЗАПРОС ПОДТВЕРЖДЕНИЯ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_FINISH) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Завершить миссию может только организатор (ГМ) или администратор."
        );
      }

      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      if (fresh.status === MISSION_STATUS.completed) {
        return sendNotice(interaction, "Эта миссия уже завершена.");
      }
      if (fresh.status === MISSION_STATUS.cancelled) {
        return sendNotice(interaction, "Эта миссия была отменена.");
      }

      const reply = await interaction.reply({
        embeds: [createCompletionConfirmationEmbed(fresh)],
        components: createCompletionActionRows(),
        flags: MessageFlags.Ephemeral,
        withResponse: true,
      });
      const message = reply?.resource?.message || (await interaction.fetchReply().catch(() => null));

      if (message?.id) {
        await createInteractionSession({
          messageId: message.id,
          namespace: MISSION_NAMESPACE,
          ownerId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          state: {
            public_id: fresh.public_id,
            mission_id: fresh._id?.toString?.() || fresh.public_id,
          },
          ttlMs: MISSION_SESSION_TTL_MS,
        });
      }

      return reply;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. ОТМЕНА ДИАЛОГА ЗАВЕРШЕНИЯ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_ABORT_FINISH) {
      if (session?.message_id) {
        await closeInteractionSession(session.message_id);
      }
      return interaction.update({
        content: "Завершение миссии отменено. Награды не выдавались.",
        embeds: [],
        components: [],
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. ПОДТВЕРЖДЕНИЕ ЗАВЕРШЕНИЯ И ВЫДАЧА НАГРАД
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_CONFIRM_FINISH || customId === MISSION_BTN_RETRY_REWARDS) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Подтвердить выдачу наград может только организатор (ГМ) или администратор."
        );
      }

      await interaction.deferUpdate();

      const result = await deliverMissionRewards({
        publicId: mission.public_id,
        actorId: interaction.user.id,
        actorUsername: interaction.user.username,
      });

      if (!result.success) {
        return interaction.editReply({
          content: `Не удалось завершить миссию: ${result.reason}`,
          embeds: [],
          components: [],
        });
      }

      const fresh = (await getMissionByPublicId(mission.public_id)) || result.mission;

      // If all delivered, update public mission card
      if (result.allDelivered) {
        if (session?.message_id) {
          await closeInteractionSession(session.message_id);
        }
        await updateMissionCardMessage(interaction, fresh);
        return interaction.editReply({
          content: null,
          embeds: [createRewardReportEmbed(fresh, result)],
          components: [],
        });
      }

      // If there were partial failures, offer retry button
      return interaction.editReply({
        content: null,
        embeds: [createRewardReportEmbed(fresh, result)],
        components: createRetryDeliveryActionRow(),
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10. ОТМЕНА МИССИИ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_CANCEL) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Отменить миссию может только организатор (ГМ) или администратор."
        );
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      if (fresh.status === MISSION_STATUS.completed) {
        return sendNotice(interaction, "Нельзя отменить уже завершённую миссию.");
      }

      const result = await cancelMission({
        publicId: mission.public_id,
        actorId: interaction.user.id,
        actorUsername: interaction.user.username,
        reason: "Отменена организатором/администрацией",
      });

      if (!result.success) {
        return sendNotice(interaction, "Не удалось отменить миссию.");
      }

      await updateMissionCardMessage(interaction, result.mission);
      return sendNotice(interaction, `❌ Миссия **【${mission.title}】** отменена. Награды не выдавались.`);
    }
  },
};
