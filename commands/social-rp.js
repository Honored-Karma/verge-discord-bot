import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  completeSocialRP,
  getActiveSlot,
  getPlayer,
} from "../utils/dataManager.js";
import {
  autoDeleteMessageLong,
  autoDeleteMessageShort,
  checkCooldown,
  checkGlobalCooldown,
  validateSocialRPText,
} from "../utils/cooldowns.js";
import {
  createCooldownEmbed,
  createErrorEmbed,
  createTrainingBlockedEmbed,
} from "../utils/embeds.js";
import { checkTrainingBlock, TRAINING_TYPES } from "../utils/trainingBlocks.js";
import { logCommand } from "../utils/logs.js";
import { makePlayerKey } from "../utils/playerKey.js";
import {
  createSocialRPModal,
  createSocialRPSuccessComponents,
  createAPActivityErrorComponents,
  SOCIAL_RP_MODAL_PREFIX,
  SOCIAL_RP_TEXT_INPUT_ID,
} from "../utils/trainingComponents.js";

const SOCIAL_RP_COOLDOWN = 12 * 60 * 60 * 1000;
const SOCIAL_RP_AP_REWARD = 10;

export const modalCustomIdPrefix = SOCIAL_RP_MODAL_PREFIX;

export const data = new SlashCommandBuilder()
  .setName("social-rp")
  .setDescription("Отыграть социальную сцену персонажа и получить AP");

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    return interaction.reply({
      embeds: [createCooldownEmbed("Социальное RP", retryAt)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const slot = await getActiveSlot(interaction.user.id);
  const playerId = makePlayerKey(interaction.user.id, slot);
  const player = await getPlayer(playerId);

  if (!player) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Пустой слот",
          "Сначала создайте персонажа в активном слоте через `/register`.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const blockCheck = await checkTrainingBlock(
    interaction.user.id,
    slot,
    TRAINING_TYPES.SOCIAL_RP,
  );
  if (blockCheck.blocked) {
    return interaction.reply({
      embeds: [createTrainingBlockedEmbed(blockCheck)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const cooldown = checkCooldown(
    player.last_socialrp_timestamp,
    SOCIAL_RP_COOLDOWN,
  );
  if (cooldown.onCooldown) {
    const retryAt =
      Math.floor(Date.now() / 1000) + Math.ceil(cooldown.remaining / 1000);
    return interaction.reply({
      embeds: [createCooldownEmbed("Социальное RP", retryAt)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.showModal(createSocialRPModal(slot));
}

export function handlesModal(interaction) {
  return interaction.customId.startsWith(SOCIAL_RP_MODAL_PREFIX);
}

async function editComponentsReply(interaction, components) {
  return interaction.editReply({
    content: null,
    embeds: [],
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

export async function handleModalSubmit(interaction) {
  const slot = Number(interaction.customId.slice(SOCIAL_RP_MODAL_PREFIX.length));
  await interaction.deferReply();

  if (![1, 2, 3].includes(slot)) {
    const msg = await editComponentsReply(
      interaction,
      createAPActivityErrorComponents(
        "Не удалось определить персонажа",
        "Закройте это окно и снова запустите `/social-rp`.",
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const blockCheck = await checkTrainingBlock(
    interaction.user.id,
    slot,
    TRAINING_TYPES.SOCIAL_RP,
  );
  if (blockCheck.blocked) {
    const msg = await interaction.editReply({
      content: null,
      embeds: [createTrainingBlockedEmbed(blockCheck)],
      components: [],
    });
    autoDeleteMessageLong(msg);
    return;
  }

  const socialText = interaction.fields
    .getTextInputValue(SOCIAL_RP_TEXT_INPUT_ID)
    .trim();
  const validation = validateSocialRPText(socialText);
  if (!validation.valid) {
    const msg = await editComponentsReply(
      interaction,
      createAPActivityErrorComponents(
        "Социальная сцена не принята",
        `${validation.reason}\n\nЗапустите \`/social-rp\` ещё раз и исправьте текст.`,
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const playerId = makePlayerKey(interaction.user.id, slot);
  const player = await getPlayer(playerId);
  if (!player) {
    const msg = await editComponentsReply(
      interaction,
      createAPActivityErrorComponents(
        "Персонаж не найден",
        `В слоте ${slot} больше нет персонажа. Выберите нужный слот и снова запустите \`/social-rp\`.`,
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const result = await completeSocialRP(
    playerId,
    SOCIAL_RP_AP_REWARD,
    SOCIAL_RP_COOLDOWN,
  );

  if (!result.success) {
    const components = result.reason === "cooldown"
      ? createAPActivityErrorComponents(
          "Социальное RP пока недоступно",
          `Следующую сцену можно провести <t:${result.retryAt}:R>.`,
        )
      : createAPActivityErrorComponents(
          "Не удалось завершить социальную сцену",
          "Проверьте соединение и попробуйте снова. Награда не начислена.",
        );
    const msg = await editComponentsReply(interaction, components);
    autoDeleteMessageShort(msg);
    return;
  }

  const characterName = player.character_name || player.username;
  const avatarUrl = player.character_avatar
    || interaction.user.displayAvatarURL({ extension: "png", size: 256 });
  const msg = await editComponentsReply(
    interaction,
    createSocialRPSuccessComponents({
      characterName,
      avatarUrl,
      baseReward: SOCIAL_RP_AP_REWARD,
      gained: result.gained,
      multiplier: result.multiplier,
      dynamicBonus: result.dynamicBonus,
      shopBonus: result.shopBonus,
      newAP: result.newAP,
      retryAt: result.retryAt,
      activityText: socialText,
    }),
  );
  autoDeleteMessageLong(msg);

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.username,
    command: "social-rp",
    extra: {
      text: socialText,
      slot,
      character_name: characterName,
      ap_gained: result.gained,
      multiplier: result.multiplier,
    },
  });
}
