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
  createSPStyleSelectionComponents,
  createSPTrainingErrorComponents,
  createSPTrainingModal,
  createSPTrainingSuccessComponents,
  getSPStylePageCount,
  SP_STYLE_NEXT_ID,
  SP_STYLE_PREV_ID,
  SP_STYLE_SELECT_ID,
  SP_TRAINING_MODAL_PREFIX,
  SP_TRAINING_TEXT_INPUT_ID,
} from "../utils/spTrainingComponents.js";

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

  const characterName = player.character_name || player.username;
  let currentPage = 0;
  let selectionCompleted = false;

  const response = await interaction.reply({
    components: createSPStyleSelectionComponents({
      characterName,
      styles,
      page: currentPage,
    }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    fetchReply: true,
  });

  const collector = response.createMessageComponentCollector({ time: 3 * 60 * 1000 });
  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) {
      await componentInteraction.reply({
        content: "Это меню выбора стиля открыто для другого игрока.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (componentInteraction.customId === SP_STYLE_PREV_ID) {
      currentPage = Math.max(0, currentPage - 1);
      await componentInteraction.update({
        components: createSPStyleSelectionComponents({
          characterName,
          styles,
          page: currentPage,
        }),
      });
      return;
    }

    if (componentInteraction.customId === SP_STYLE_NEXT_ID) {
      currentPage = Math.min(
        getSPStylePageCount(styles) - 1,
        currentPage + 1,
      );
      await componentInteraction.update({
        components: createSPStyleSelectionComponents({
          characterName,
          styles,
          page: currentPage,
        }),
      });
      return;
    }

    if (!componentInteraction.isStringSelectMenu()
      || componentInteraction.customId !== SP_STYLE_SELECT_ID) return;

    const styleId = Number(componentInteraction.values[0]);
    const style = styles.find((candidate) => Number(candidate.id) === styleId);
    if (!style) {
      await componentInteraction.reply({
        content: "Стиль больше недоступен. Запустите `/train-sp` ещё раз.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    selectionCompleted = true;
    collector.stop("selected");
    await componentInteraction.showModal(createSPTrainingModal(slot, style));
  });

  collector.on("end", async () => {
    try {
      await interaction.editReply({
        components: createSPStyleSelectionComponents({
          characterName,
          styles,
          page: currentPage,
          disabled: true,
        }),
      });
    } catch {}

    if (!selectionCompleted) autoDeleteMessageShort(response);
  });
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
    userId: playerId,
    userTag: interaction.user.username,
    command: "train-sp",
    extra: {
      text: trainingText,
      slot,
      style: result.style.name,
      sp_gained: result.gained,
      multiplier: result.multiplier,
    },
  });
}
