import { MessageFlags } from "discord.js";
import { isAdmin, hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { getActiveSlot, getAllPlayerSP, getPlayer } from "../utils/dataManager.js";
import { makePlayerKey } from "../utils/playerKey.js";
import {
  cancelMission,
  deliverMissionRewards,
  getMissionByMessageId,
  getMissionByPublicId,
  joinMission,
  leaveMission,
  MISSION_STATUS,
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
  if (interaction.replied || interaction.deferred) {
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
    if (interaction.message && typeof interaction.message.edit === "function") {
      await interaction.message.edit({
        embeds: [createMissionCardEmbed(mission)],
        components: createMissionActionRows(mission),
      });
    }
  } catch (error) {
    console.error(`Failed to update mission card for ${mission.public_id}:`, error);
  }
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
        } else if (result.reason === "not_recruiting") {
          msg = "Набор в эту миссию уже закрыт.";
        } else if (result.reason === "not_invited") {
          msg = "Эта миссия доступна только по приглашению организатора.";
        }
        return sendNotice(interaction, msg);
      }

      await updateMissionCardMessage(interaction, result.mission);
      return sendNotice(
        interaction,
        `✅ Вы успешно вступили в миссию «**${mission.title}**» персонажем **${characterName}**!`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. ПОКИНУТЬ ПАТИ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_LEAVE) {
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
      return sendNotice(interaction, `🚪 Вы вышли из пати миссии «**${mission.title}**».`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. СОСТАВ ПАТИ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_PARTY) {
      const fresh = (await getMissionByPublicId(mission.public_id)) || mission;
      return interaction.reply({
        embeds: [createPartyListEmbed(fresh)],
        flags: MessageFlags.Ephemeral,
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

      return interaction.reply({
        content: "📋 Выберите участника из списка, чтобы просмотреть его публичное досье:",
        components: [selectRow],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. ВЫБОР УЧАСТНИКА ИЗ СЕЛЕКТА ПРОФИЛЕЙ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_SELECT_MEMBER) {
      const targetPlayerId = interaction.values?.[0];
      if (!targetPlayerId) {
        return sendNotice(interaction, "Участник не выбран.");
      }

      const player = await getPlayer(targetPlayerId);
      if (!player) {
        return sendNotice(interaction, "Персонаж не найден в базе данных.");
      }

      const styles = await getAllPlayerSP(targetPlayerId);
      const profileEmbed = createPublicProfileEmbed(player, styles);

      return interaction.reply({
        embeds: [profileEmbed],
        flags: MessageFlags.Ephemeral,
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

      if (mission.status !== MISSION_STATUS.recruiting) {
        return sendNotice(
          interaction,
          `Миссия уже находится в статусе «${mission.status}».`
        );
      }

      let threadId = null;
      let threadNotice = "";

      // Attempt creating a public thread for RP
      try {
        if (
          interaction.message?.channel &&
          typeof interaction.message.startThread === "function"
        ) {
          const thread = await interaction.message.startThread({
            name: `Миссия: ${mission.title}`.slice(0, 95),
            autoArchiveDuration: 1440,
            reason: `RP ветка для миссии ${mission.public_id}`,
          });
          threadId = thread.id;
        }
      } catch (err) {
        console.warn("Could not create public thread for mission:", err.message);
        threadNotice =
          "\n⚠️ *Боту не удалось создать ветку (проверьте права CreatePublicThreads). Миссия всё равно запущена.*";
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
        `⚔️ Миссия «**${mission.title}**» успешно запущена! Состав участников зафиксирован.${threadNotice}`
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

      return interaction.reply({
        embeds: [createCompletionConfirmationEmbed(fresh)],
        components: createCompletionActionRows(),
        flags: MessageFlags.Ephemeral,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. ОТМЕНА ДИАЛОГА ЗАВЕРШЕНИЯ
    // ──────────────────────────────────────────────────────────────────────────
    if (customId === MISSION_BTN_ABORT_FINISH) {
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
      return sendNotice(interaction, `❌ Миссия «**${mission.title}**» отменена. Награды не выдавались.`);
    }
  },
};
