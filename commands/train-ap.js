import { TRAINING_RULES } from "../utils/trainingRules.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  completeAPTraining,
  getActiveSlot,
  getPlayer,
} from "../utils/dataManager.js";
import {
  checkCooldown,
  checkGlobalCooldown,
  validateTrainingText,
  autoDeleteMessageShort,
  autoDeleteMessageLong,
} from "../utils/cooldowns.js";
import {
  createCooldownEmbed,
  createErrorEmbed,
  createTrainingBlockedEmbed,
} from "../utils/embeds.js";
import { checkTrainingBlock, TRAINING_TYPES } from "../utils/trainingBlocks.js";
import { logCommand } from "../utils/logs.js";
import { makePlayerKey } from "../utils/playerKey.js";
import { checkTrainingChannelBlocked } from "../utils/trainingChannelBlocks.js";
import {
  createAPActivityErrorComponents,
  createTrainingModal,
  createTrainingSuccessComponents,
  TRAINING_MODAL_PREFIX,
  TRAINING_TEXT_INPUT_ID,
} from "../utils/trainingComponents.js";

const TRAIN_COOLDOWN = TRAINING_RULES.ap.cooldownMs;
const TRAIN_AP_REWARD = TRAINING_RULES.ap.reward;

export const modalCustomIdPrefix = TRAINING_MODAL_PREFIX;

export const data = new SlashCommandBuilder()
  .setName("train-ap")
  .setDescription("Провести физическую тренировку персонажа и получить AP");

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    return interaction.reply({
      embeds: [createCooldownEmbed("Тренировка AP", retryAt)],
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

  if (await checkTrainingChannelBlocked(interaction)) return;

  const blockCheck = await checkTrainingBlock(
    interaction.user.id,
    slot,
    TRAINING_TYPES.TRAIN_AP,
  );
  if (blockCheck.blocked) {
    return interaction.reply({
      embeds: [createTrainingBlockedEmbed(blockCheck)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const cooldown = checkCooldown(player.last_train_timestamp, TRAIN_COOLDOWN);
  if (cooldown.onCooldown) {
    const retryAt =
      Math.floor(Date.now() / 1000) + Math.ceil(cooldown.remaining / 1000);
    return interaction.reply({
      embeds: [createCooldownEmbed("Тренировка AP", retryAt)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.showModal(createTrainingModal(slot));
}

export function handlesModal(interaction) {
  return interaction.customId.startsWith(TRAINING_MODAL_PREFIX);
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
  const slot = Number(interaction.customId.slice(TRAINING_MODAL_PREFIX.length));
  await interaction.deferReply();

  if (![1, 2, 3].includes(slot)) {
    const msg = await editComponentsReply(
      interaction,
      createAPActivityErrorComponents(
        "Не удалось определить персонажа",
        "Закройте это окно и снова запустите `/train-ap`.",
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const playerId = makePlayerKey(interaction.user.id, slot);
  if (await checkTrainingChannelBlocked(interaction)) return;

  const blockCheck = await checkTrainingBlock(
    interaction.user.id,
    slot,
    TRAINING_TYPES.TRAIN_AP,
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

  const trainingText = interaction.fields
    .getTextInputValue(TRAINING_TEXT_INPUT_ID)
    .trim();
  const validation = validateTrainingText(trainingText);
  if (!validation.valid) {
    const msg = await editComponentsReply(
      interaction,
      createAPActivityErrorComponents(
        "Тренировка не принята",
        `${validation.reason}\n\nЗапустите \`/train-ap\` ещё раз и исправьте текст.`,
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const player = await getPlayer(playerId);
  if (!player) {
    const msg = await editComponentsReply(
      interaction,
      createAPActivityErrorComponents(
        "Персонаж не найден",
        `В слоте ${slot} больше нет персонажа. Выберите нужный слот и снова запустите \`/train-ap\`.`,
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const result = await completeAPTraining(
    playerId,
    TRAIN_AP_REWARD,
    TRAIN_COOLDOWN,
    { guildId: interaction.guildId, channelId: interaction.channelId },
  );

  if (!result.success) {
    const components = result.reason === "cooldown"
      ? createAPActivityErrorComponents(
          "Тренировка пока недоступна",
          `Следующую тренировку можно провести <t:${result.retryAt}:R>.`,
        )
      : createAPActivityErrorComponents(
          "Не удалось завершить тренировку",
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
    createTrainingSuccessComponents({
      characterName,
      avatarUrl,
      baseReward: TRAIN_AP_REWARD,
      gained: result.gained,
      multiplier: result.multiplier,
      dynamicBonus: result.dynamicBonus,
      shopBonus: result.shopBonus,
      locationFactor: result.locationFactor,
      newAP: result.newAP,
      retryAt: result.retryAt,
      activityText: trainingText,
    }),
  );
  autoDeleteMessageLong(msg);

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag || interaction.user.username,
    command: "train-ap",
    extra: {
      text: trainingText,
      slot,
      character_name: characterName,
      ap_gained: result.gained,
      multiplier: result.multiplier,
      location_repeats: result.locationRepeats,
    },
  }).catch(err => console.error("[train-ap] logCommand error:", err));
}
