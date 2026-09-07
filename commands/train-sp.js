import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  completeSPTraining,
  getActiveSlot,
  getLearnedPlayerStyles,
  getPlayer,
  getStyleById,
} from "../utils/dataManager.js";
import {
  autoDeleteMessageLong,
  autoDeleteMessageShort,
  checkCooldown,
  checkGlobalCooldown,
  validateSPTrainingText,
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
  createSPTrainingErrorComponents,
  createSPTrainingSuccessComponents,
  SP_TRAINING_MODAL_PREFIX,
  SP_TRAINING_TEXT_INPUT_ID,
} from "../utils/spTrainingComponents.js";
import {
  createTrainSpSessionState,
  renderStylePicker,
  TRAIN_SP_NAMESPACE,
  TRAIN_SP_SESSION_TTL_MS,
} from "../interactions/trainSpSession.js";
import { createInteractionSession } from "../utils/interactionSessions.js";

const SP_TRAINING_COOLDOWN = 5 * 60 * 60 * 1000;
const SP_TRAINING_REWARD = 10;

export const modalCustomIdPrefix = SP_TRAINING_MODAL_PREFIX;

export const data = new SlashCommandBuilder()
  .setName("train-sp")
  .setDescription("Тренировать изученный боевой стиль и получить SP");

export async function execute(interaction) {
  const globalCooldown = checkGlobalCooldown(interaction.user.id);
  if (globalCooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
    const msg = await interaction.reply({
      embeds: [createCooldownEmbed("Тренировка стиля", retryAt)],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const slot = await getActiveSlot(interaction.user.id);
  const playerId = makePlayerKey(interaction.user.id, slot);
  const player = await getPlayer(playerId);

  if (!player) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Пустой слот",
          "Сначала создайте персонажа в активном слоте через `/register`.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const blockCheck = await checkTrainingBlock(
    interaction.user.id,
    slot,
    TRAINING_TYPES.TRAIN_SP,
  );
  if (blockCheck.blocked) {
    const msg = await interaction.reply({
      embeds: [createTrainingBlockedEmbed(blockCheck)],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageLong(msg);
    return;
  }

  const cooldown = checkCooldown(
    player.last_sp_train_timestamp,
    SP_TRAINING_COOLDOWN,
  );
  if (cooldown.onCooldown) {
    const retryAt =
      Math.floor(Date.now() / 1000) + Math.ceil(cooldown.remaining / 1000);
    const msg = await interaction.reply({
      embeds: [createCooldownEmbed("Тренировка стиля", retryAt)],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const styles = await getLearnedPlayerStyles(playerId);
  if (styles.length === 0) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Нет изученных стилей",
          "Сначала получите боевой стиль у ответственного за развитие персонажей. После этого он появится в `/train-sp`.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const state = createTrainSpSessionState({
    playerId,
    slot,
    characterName: player.character_name || player.username,
  });

  const view = await renderStylePicker(state);
  const response = await interaction.reply({
    components: view.components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const messageId = response?.id || (await interaction.fetchReply()).id;
  const created = await createInteractionSession({
    messageId,
    namespace: TRAIN_SP_NAMESPACE,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    state,
    ttlMs: TRAIN_SP_SESSION_TTL_MS,
  });

  if (!created.success) {
    console.error("Train-SP session was not stored:", created.reason);
  }

  return response;
}

export function handlesModal(interaction) {
  return interaction.customId.startsWith(SP_TRAINING_MODAL_PREFIX);
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
  const idParts = interaction.customId
    .slice(SP_TRAINING_MODAL_PREFIX.length)
    .split(":");
  const slot = Number(idParts[0]);
  const styleId = Number(idParts[1]);
  await interaction.deferReply();

  if ((slot !== 1 && slot !== 2) || !Number.isSafeInteger(styleId)) {
    const msg = await editComponentsReply(
      interaction,
      createSPTrainingErrorComponents(
        "Не удалось определить тренировку",
        "Запустите `/train-sp` ещё раз и заново выберите стиль.",
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const blockCheck = await checkTrainingBlock(
    interaction.user.id,
    slot,
    TRAINING_TYPES.TRAIN_SP,
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
    .getTextInputValue(SP_TRAINING_TEXT_INPUT_ID)
    .trim();
  const validation = validateSPTrainingText(trainingText);
  if (!validation.valid) {
    const msg = await editComponentsReply(
      interaction,
      createSPTrainingErrorComponents(
        "Тренировка не принята",
        `${validation.reason}\n\nЗапустите \`/train-sp\` ещё раз и исправьте текст.`,
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const playerId = makePlayerKey(interaction.user.id, slot);
  const [player, style] = await Promise.all([
    getPlayer(playerId),
    getStyleById(styleId),
  ]);

  if (!player) {
    const msg = await editComponentsReply(
      interaction,
      createSPTrainingErrorComponents(
        "Персонаж не найден",
        `В слоте ${slot} больше нет персонажа. Выберите нужный слот и снова запустите \`/train-sp\`.`,
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  if (!style) {
    const msg = await editComponentsReply(
      interaction,
      createSPTrainingErrorComponents(
        "Стиль больше недоступен",
        "Выбранный стиль был удалён. Запустите `/train-sp` и выберите другой.",
      ),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const result = await completeSPTraining(
    playerId,
    styleId,
    SP_TRAINING_REWARD,
    SP_TRAINING_COOLDOWN,
  );

  if (!result.success) {
    let title = "Не удалось завершить тренировку";
    let message = "Проверьте соединение и попробуйте снова. SP не начислены.";

    if (result.reason === "cooldown") {
      title = "Тренировка пока недоступна";
      message = `Следующую тренировку стиля можно провести <t:${result.retryAt}:R>.`;
    } else if (result.reason === "style_not_owned") {
      title = "Стиль не изучен";
      message = "Этот стиль больше не принадлежит персонажу. Выберите другой через `/train-sp`.";
    } else if (result.reason === "style_not_found") {
      title = "Стиль больше недоступен";
      message = "Выбранный стиль был удалён. Запустите `/train-sp` и выберите другой.";
    }

    const msg = await editComponentsReply(
      interaction,
      createSPTrainingErrorComponents(title, message),
    );
    autoDeleteMessageShort(msg);
    return;
  }

  const characterName = player.character_name || player.username;
  const avatarUrl = player.character_avatar
    || interaction.user.displayAvatarURL({ extension: "png", size: 256 });
  const msg = await editComponentsReply(
    interaction,
    createSPTrainingSuccessComponents({
      characterName,
      avatarUrl,
      styleName: result.style.name,
      baseReward: SP_TRAINING_REWARD,
      gained: result.gained,
      multiplier: result.multiplier,
      dynamicBonus: result.dynamicBonus,
      shopBonus: result.shopBonus,
      oldSP: result.oldSP,
      newSP: result.newSP,
      retryAt: result.retryAt,
      trainingText,
    }),
  );
  autoDeleteMessageLong(msg);

  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.username,
    command: "train-sp",
    extra: {
      text: trainingText,
      slot,
      character_name: characterName,
      style: result.style.name,
      sp_gained: result.gained,
      multiplier: result.multiplier,
    },
  });
}
