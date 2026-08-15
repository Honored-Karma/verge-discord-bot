import { AttachmentBuilder, MessageFlags } from "discord.js";
import {
  getAllPlayerSP,
  getPlayer,
  getRecentProgressionHistory,
  getReputationTier,
  getTotalSP,
} from "../utils/dataManager.js";
import { getProfileMultipliers } from "../utils/embeds.js";
import { renderPhysicalCard, renderProfileCard } from "../utils/profileCard.js";
import { createProfileV2Components } from "../utils/profileComponents.js";
import { saveInteractionSession } from "../utils/interactionSessions.js";

export const PROFILE_NAMESPACE = "profile";
export const PROFILE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const PAGE_BY_BUTTON = {
  profile_main: "main",
  profile_physical: "physical",
  profile_history: "history",
};

const IMAGE_BY_PAGE = {
  main: "profile-main.png",
  physical: "physical-stats.png",
};

export function createProfileSessionState({ playerId, targetUserId, slot }) {
  return {
    player_id: playerId,
    target_user_id: targetUserId,
    slot,
    page: "main",
  };
}

function avatarUrls(player, targetUser) {
  const fallback = targetUser?.displayAvatarURL?.({ extension: "png", size: 512 }) || null;
  const custom = String(player?.character_avatar || "").trim();
  return {
    avatarUrl: /^https?:\/\//i.test(custom) ? custom : fallback,
    fallbackAvatarUrl: fallback,
  };
}

/**
 * Собирает страницу профиля. Данные читаются заново на каждый показ, поэтому
 * панель не устаревает, даже если её открыли сутки назад.
 *
 * Картинка рисуется только для тех страниц, где она видна: у истории карточки
 * нет, и гонять канвас ради неё незачем.
 */
export async function renderProfilePage(state, targetUser, { disabled = false } = {}) {
  const player = await getPlayer(state.player_id);
  if (!player) return null;

  const page = IMAGE_BY_PAGE[state.page] ? state.page : "history";
  const [history, styles, totalSP] = await Promise.all([
    getRecentProgressionHistory(state.player_id, 8),
    getAllPlayerSP(state.player_id),
    getTotalSP(state.player_id),
  ]);

  const { avatarUrl, fallbackAvatarUrl } = avatarUrls(player, targetUser);
  const characterName = player.character_name || player.username;
  const multipliers = getProfileMultipliers(player);

  let buffer = null;
  if (state.page === "main") {
    buffer = await renderProfileCard({
      characterName,
      avatarUrl,
      fallbackAvatarUrl,
      styles,
      attributeName: player.attribute_name || null,
      ap: player.ap,
      totalSP,
      apMultiplier: multipliers.ap,
      spMultiplier: multipliers.sp,
      salaryMultiplier: Number(player.salary_multiplier ?? 100),
      krw: player.krw,
      yen: player.yen,
      reputation: player.reputation,
      reputationTier: getReputationTier(player.reputation).name,
      orgName: player.organization || player.custom_org || null,
      orgRank: player.rank || null,
      playerId: player.id,
      slot: state.slot,
    }).catch((error) => {
      console.error("Profile card render error:", error);
      return null;
    });
  } else if (state.page === "physical" && player.physical_stats) {
    buffer = await renderPhysicalCard({
      characterName,
      stats: player.physical_stats,
      playerId: player.id,
      slot: state.slot,
    }).catch((error) => {
      console.error("Physical card render error:", error);
      return null;
    });
  }

  const imageName = buffer ? IMAGE_BY_PAGE[state.page] : null;

  return {
    components: createProfileV2Components({
      page: state.page,
      player,
      user: targetUser,
      slot: state.slot,
      totalSP,
      history,
      imageName,
      disabled,
    }),
    files: buffer ? [new AttachmentBuilder(buffer, { name: imageName })] : [],
  };
}

async function resolveTargetUser(interaction, state) {
  if (state.target_user_id === interaction.user.id) return interaction.user;
  try {
    return await interaction.client.users.fetch(state.target_user_id);
  } catch {
    return interaction.user;
  }
}

async function handleComponent({ interaction, session }) {
  const nextPage = PAGE_BY_BUTTON[interaction.customId];
  if (!nextPage) return interaction.deferUpdate().catch(() => {});
  if (nextPage === session.state.page) return interaction.deferUpdate().catch(() => {});

  const state = { ...session.state, page: nextPage };

  // Рендер карточки занимает заметное время, поэтому подтверждаем нажатие
  // сразу, а содержимое досылаем правкой.
  await interaction.deferUpdate();

  const targetUser = await resolveTargetUser(interaction, state);
  const view = await renderProfilePage(state, targetUser);

  if (!view) {
    return interaction.editReply({
      components: createProfileV2Components({
        page: "history",
        player: { id: state.player_id, character_name: "Персонаж удалён" },
        user: targetUser,
        slot: state.slot,
        totalSP: 0,
        history: [],
        imageName: null,
        disabled: true,
      }),
      files: [],
      attachments: [],
    }).catch(() => {});
  }

  await saveInteractionSession(
    session.message_id,
    session.revision,
    state,
    { ttlMs: PROFILE_SESSION_TTL_MS },
  );

  await interaction.editReply({
    components: view.components,
    files: view.files,
    attachments: [],
  }).catch((error) => console.error("Profile page update error:", error));
}

async function renderForeign({ interaction }) {
  return interaction.reply({
    content: "Это не ваш интерфейс профиля. Откройте свой командой `/profile`.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

async function renderExpired({ interaction }) {
  return interaction.reply({
    content: "Эта панель профиля больше не активна. Откройте `/profile` ещё раз.",
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

export const profileInteractionHandler = {
  namespace: PROFILE_NAMESPACE,
  handleComponent,
  renderForeign,
  renderExpired,
};

export const __testables = { PAGE_BY_BUTTON, IMAGE_BY_PAGE, avatarUrls };
