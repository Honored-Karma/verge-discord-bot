import { MessageFlags } from "discord.js";
import { isAdmin, hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { getActiveSlot, getAllPlayerSP, getPlayer, getPlayers } from "../utils/dataManager.js";
import { makePlayerKey } from "../utils/playerKey.js";
import { formatRankRequirement } from "../utils/rankSystem.js";
import {
  cancelMission,
  deliverMissionRewards,
  getMissionByMessageId,
  getMissionByPublicId,
  joinMission,
  kickParticipantFromMission,
  leaveMission,
  MISSION_STATUS,
  setMissionThreadId,
  startMission,
  unkickParticipantFromMission,
} from "../utils/missionStore.js";
import {
  createCompletionActionRows,
  createCompletionConfirmationEmbed,
  createKickMemberSelectRow,
  createMemberProfileSelectRow,
  createMissionActionRows,
  createMissionCardEmbed,
  createMissionDetailsComponents,
  MISSION_BTN_DETAILS,
  createPartyListEmbed,
  createPublicProfileEmbed,
  createRetryDeliveryActionRow,
  createRewardReportEmbed,
  createUnkickMemberSelectRow,
  MISSION_BTN_ABORT_FINISH,
  MISSION_BTN_CANCEL,
  MISSION_BTN_CONFIRM_FINISH,
  MISSION_BTN_FINISH,
  MISSION_BTN_JOIN,
  MISSION_BTN_KICK,
  MISSION_BTN_LEAVE,
  MISSION_BTN_PARTY,
  MISSION_BTN_PROFILES,
  MISSION_BTN_RETRY_REWARDS,
  MISSION_BTN_START,
  MISSION_SELECT_KICK,
  MISSION_SELECT_MEMBER,
  MISSION_SELECT_UNKICK,
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
  return (
    hasCommandPermission(member, "mission") ||
    hasCommandPermission(member, "mission-create")
  );
}

/**
 * Enriches mission participants with the latest data from database (reputation, rank, org).
 * Falls back safely to existing participant fields if database is unavailable.
 */
export async function enrichMissionParticipants(mission) {
  if (!mission || !Array.isArray(mission.participants) || mission.participants.length === 0) {
    return mission;
  }
  const playerIds = mission.participants.map((p) => p.player_id).filter(Boolean);
  if (playerIds.length === 0) return mission;

  let players = [];
  try {
    players = await getPlayers(playerIds);
  } catch {
    players = [];
  }
  const playerMap = new Map((players || []).map((pl) => [pl.id, pl]));

  const enrichedParticipants = mission.participants.map((p) => {
    const pl = playerMap.get(p.player_id);
    const rep =
      pl && typeof pl.reputation === "number"
        ? pl.reputation
        : (typeof p.reputation === "number" ? p.reputation : 20);
    return {
      ...p,
      reputation: rep,
      character_name: pl?.character_name || p.character_name,
      organization_name: pl?.organization || pl?.custom_org || p.organization_name,
      rank: pl?.rank || p.rank,
    };
  });

  return {
    ...mission,
    participants: enrichedParticipants,
  };
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
    if (customId === MISSION_BTN_DETAILS) return interaction.reply({
      components: createMissionDetailsComponents(mission),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });

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
        reputation: typeof player.reputation === "number" ? player.reputation : 20,
      });

      if (!result.success) {
        let msg = "Не удалось вступить в миссию.";
        if (result.reason === "already_joined") {
          msg = "Вы уже состоите в пати этой миссии.";
        } else if (result.reason === "kicked") {
          msg = "⛔ Организатор миссии исключил вас из состава участников. Повторный вход заблокирован.";
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
      const enriched = await enrichMissionParticipants(fresh);
      return interaction.editReply({
        embeds: [createPartyListEmbed(enriched, interaction.client)],
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. ПРОФИЛИ УЧАСТНИКОВ (МЕНЮ ВЫБОРА)
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_PROFILES) {
      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      const enriched = await enrichMissionParticipants(fresh);
      const selectRow = createMemberProfileSelectRow(enriched);
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
      const enriched = await enrichMissionParticipants(fresh);
      const selectRow = createMemberProfileSelectRow(enriched);

      return interaction.editReply({
        content: "📋 Профиль участника:",
        embeds: [profileEmbed],
        components: selectRow ? [selectRow] : [],
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5.1 ИСКЛЮЧЕНИЕ УЧАСТНИКА ИЗ ПАТИ (ТОЛЬКО ГМ / СОЗДАТЕЛЬ / АДМИН)
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_KICK) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Исключать участников может только организатор миссии (ГМ) или администратор."
        );
      }

      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      if (fresh.status !== MISSION_STATUS.recruiting) {
        return sendNotice(
          interaction,
          "Исключать участников из пати можно только на этапе набора."
        );
      }

      const enriched = await enrichMissionParticipants(fresh);
      const kickRow = createKickMemberSelectRow(enriched);
      if (!kickRow) {
        return sendNotice(
          interaction,
          "В пати пока нет участников для исключения."
        );
      }

      const components = [kickRow];
      const unkickRow = createUnkickMemberSelectRow(fresh);
      if (unkickRow) {
        components.push(unkickRow);
      }

      const reply = await interaction.reply({
        content:
          "👢 **Управление составом пати:**\n" +
          "• Выберите участника из верхнего списка, чтобы исключить его из пати (повторный вход будет заблокирован).\n" +
          (unkickRow ? "• Выберите игрока из нижнего списка, если хотите снять с него блокировку." : ""),
        components,
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
    // 5.2 ПОДТВЕРЖДЕНИЕ ИСКЛЮЧЕНИЯ УЧАСТНИКА
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_SELECT_KICK) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Исключать участников может только организатор миссии (ГМ) или администратор."
        );
      }

      const targetPlayerId = interaction.values?.[0];
      if (!targetPlayerId) {
        return sendNotice(interaction, "Участник не выбран.");
      }

      await interaction.deferUpdate();

      const result = await kickParticipantFromMission({
        publicId: mission.public_id,
        targetPlayerId,
        actorId: interaction.user.id,
        actorUsername: interaction.user.username,
      });

      if (!result.success) {
        let msg = "Не удалось исключить участника.";
        if (result.reason === "not_in_party") {
          msg = "Этот персонаж уже не состоит в пати.";
        } else if (result.reason === "invalid_status") {
          msg = "Исключать участников можно только на этапе набора.";
        }
        return interaction.editReply({
          content: `❌ ${msg}`,
          components: [],
        });
      }

      await updateMissionCardMessage(interaction, result.mission);

      // Notify thread if available
      try {
        const thread = await resolveOrCreateMissionThread(interaction, result.mission, { createIfMissing: false });
        if (thread && typeof thread.send === "function") {
          await thread.send(
            `👢 Участник **${result.kickedParticipant.character_name}** (<@${result.kickedParticipant.user_id}>) был исключён из состава миссии организатором.`
          ).catch(() => {});
        }
      } catch (threadErr) {
        console.warn("Could not post kick notice in thread:", threadErr?.message);
      }

      const updatedKickRow = createKickMemberSelectRow(result.mission);
      const updatedUnkickRow = createUnkickMemberSelectRow(result.mission);
      const newComponents = [];
      if (updatedKickRow) newComponents.push(updatedKickRow);
      if (updatedUnkickRow) newComponents.push(updatedUnkickRow);

      return interaction.editReply({
        content: `👢 Персонаж **${result.kickedParticipant.character_name}** (<@${result.kickedParticipant.user_id}>) успешно исключён из пати. Повторный вход для него заблокирован.`,
        components: newComponents,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5.3 СНЯТИЕ БЛОКИРОВКИ С ИСКЛЮЧЕННОГО ИГРОКА
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_SELECT_UNKICK) {
      const isCreator = mission.created_by?.user_id === interaction.user.id;
      if (!isCreator && !isGMOrAdmin(member)) {
        return sendNotice(
          interaction,
          "⛔ Управлять доступом может только организатор миссии (ГМ) или администратор."
        );
      }

      const targetUserId = interaction.values?.[0];
      if (!targetUserId) {
        return sendNotice(interaction, "Игрок не выбран.");
      }

      await interaction.deferUpdate();

      const result = await unkickParticipantFromMission({
        publicId: mission.public_id,
        targetUserId,
        actorId: interaction.user.id,
        actorUsername: interaction.user.username,
      });

      if (!result.success) {
        return interaction.editReply({
          content: "❌ Не удалось снять блокировку.",
          components: [],
        });
      }

      const updatedKickRow = createKickMemberSelectRow(result.mission);
      const updatedUnkickRow = createUnkickMemberSelectRow(result.mission);
      const newComponents = [];
      if (updatedKickRow) newComponents.push(updatedKickRow);
      if (updatedUnkickRow) newComponents.push(updatedUnkickRow);

      return interaction.editReply({
        content: `🔓 Блокировка с пользователя <@${targetUserId}> успешно снята. Он снова может вступить в пати.`,
        components: newComponents,
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

      // Immediately remove/clear buttons to prevent rapid double-clicks
      try {
        await interaction.update({
          content: "⏳ **Выдача наград...** Пожалуйста, подождите.",
          embeds: [],
          components: [],
        });
      } catch {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }
      }

      const result = await deliverMissionRewards({
        publicId: mission.public_id,
        actorId: interaction.user.id,
        actorUsername: interaction.user.username,
      });

      if (!result.success) {
        if (result.reason === "already_delivering") {
          return interaction.editReply({
            content: "⏳ Выдача наград для этой миссии уже выполняется. Пожалуйста, подождите завершения.",
            embeds: [],
            components: [],
          });
        }
        return interaction.editReply({
          content: `Не удалось завершить миссию: ${result.message || result.reason}`,
          embeds: [],
          components: [],
        });
      }

      const fresh = (await getMissionByPublicId(mission.public_id)) || result.mission;

      if (result.alreadyCompleted) {
        if (session?.message_id) {
          await closeInteractionSession(session.message_id);
        }
        await updateMissionCardMessage(interaction, fresh);
        return interaction.editReply({
          content: "ℹ️ Эта миссия уже была успешно завершена, и все награды выданы ранее.",
          embeds: [],
          components: [],
        });
      }

      // Always update public mission card
      await updateMissionCardMessage(interaction, fresh);

      // Notify mission thread if available
      try {
        const thread = await resolveOrCreateMissionThread(interaction, fresh, { createIfMissing: false });
        if (thread && typeof thread.send === "function") {
          const deliveries = fresh.reward_delivery || {};
          const items = Array.isArray(fresh.reward?.items) && fresh.reward.items.length > 0
            ? fresh.reward.items
            : (fresh.reward?.item?.item_name ? [fresh.reward.item] : []);

          const randomWinnerLines = [];
          items.forEach((it, idx) => {
            if (it.distribution === "random") {
              const winnerKey = `mission:${fresh.public_id}:item:${idx}:winner`;
              const winner = deliveries[winnerKey];
              if (winner?.winner_character_name) {
                randomWinnerLines.push(
                  `• 🎲 **${it.item_name}** ×${it.quantity || 1} достался: **${winner.winner_character_name}** (<@${winner.winner_user_id}>)`
                );
              }
            }
          });

          const winnerText = randomWinnerLines.length > 0
            ? `\n\n**Результаты розыгрыша случайного лута:**\n${randomWinnerLines.join("\n")}`
            : "";

          await thread.send(
            `🏆 **Миссия «${fresh.title}» успешно завершена!**\nВсе награды начислены участникам.${winnerText}`
          ).catch(() => {});
        }
      } catch (threadErr) {
        console.warn("Could not post mission completion notice in thread:", threadErr?.message);
      }

      // If all delivered, close interaction session and show report without buttons
      if (result.allDelivered) {
        if (session?.message_id) {
          await closeInteractionSession(session.message_id);
        }
        return interaction.editReply({
          content: null,
          embeds: [createRewardReportEmbed(fresh, result)],
          components: [],
        });
      }

      // If there were partial failures, keep session alive so retry button can be clicked
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
