import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import {
  createAPItemName,
  createSPItemName,
  getItemDefinition,
  listCatalogItems,
} from "../utils/itemSystem.js";
import {
  getActiveSlot,
  getLearnedPlayerStyles,
  getPlayer,
  getStyleById,
  giveItem,
  listStyles,
} from "../utils/dataManager.js";
import {
  createGiveItemAPModal,
  createGiveItemCenterComponents,
  createGiveItemCollectibleModal,
  createGiveItemCustomModal,
  createGiveItemPreviewComponents,
  createGiveItemQuantityModal,
  createGiveItemReceiptComponents,
  createGiveItemSPModal,
  createGiveItemStatusComponents,
  createGiveItemStyleComponents,
  getGiveItemCatalogPageCount,
  getGiveItemStylePageCount,
  GIVE_ITEM_AMOUNT_INPUT_ID,
  GIVE_ITEM_AP_MODAL_PREFIX,
  GIVE_ITEM_BACK_ID,
  GIVE_ITEM_CANCEL_ID,
  GIVE_ITEM_CATALOG_NEXT_ID,
  GIVE_ITEM_CATALOG_PREV_ID,
  GIVE_ITEM_CATALOG_SELECT_ID,
  GIVE_ITEM_COLLECTIBLE_ID,
  GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX,
  GIVE_ITEM_CONFIRM_ID,
  GIVE_ITEM_CUSTOM_ID,
  GIVE_ITEM_CUSTOM_MODAL_PREFIX,
  GIVE_ITEM_CUSTOM_AP_ID,
  GIVE_ITEM_CUSTOM_SP_ID,
  GIVE_ITEM_NAME_INPUT_ID,
  GIVE_ITEM_QUANTITY_ID,
  GIVE_ITEM_QUANTITY_INPUT_ID,
  GIVE_ITEM_QUANTITY_MODAL_PREFIX,
  GIVE_ITEM_REPEAT_ID,
  GIVE_ITEM_SP_MODAL_PREFIX,
  GIVE_ITEM_STYLE_NEXT_ID,
  GIVE_ITEM_STYLE_PREV_ID,
  GIVE_ITEM_STYLE_SELECT_ID,
} from "../utils/giveItemComponents.js";
import { checkGlobalCooldown } from "../utils/cooldowns.js";
import { logCommand } from "../utils/logs.js";
import { resolveMember } from "../utils/memberHelper.js";
import { makePlayerKey } from "../utils/playerKey.js";

const SESSION_DURATION = 3 * 60 * 1000;
const MAX_ITEM_VALUE = 1_000_000_000;

export const modalCustomIdPrefix = GIVE_ITEM_AP_MODAL_PREFIX;

export const data = new SlashCommandBuilder()
  .setName("give-item")
  .setDescription("[АДМИН] Открыть центр выдачи предметов")
  .addUserOption((option) => option
    .setName("user")
    .setDescription("Кому выдать предмет")
    .setRequired(true))
  .addStringOption((option) => option
    .setName("item")
    .setDescription("Точное название — сразу открыть подтверждение")
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(false))
  .addIntegerOption((option) => option
    .setName("quantity")
    .setDescription("Количество предметов — по умолчанию 1")
    .setMinValue(1)
    .setMaxValue(1_000_000)
    .setRequired(false))
  .addIntegerOption((option) => option
    .setName("slot")
    .setDescription("Слот персонажа — по умолчанию активный")
    .setRequired(false)
    .addChoices(
      { name: "Слот 1", value: 1 },
      { name: "Слот 2", value: 2 },
      { name: "Слот 3", value: 3 },
    ));

function resolveAvatar(player, user) {
  const custom = String(player.character_avatar || "").trim();
  return /^https?:\/\//i.test(custom)
    ? custom
    : user.displayAvatarURL({ extension: "png", size: 256 });
}

function encodeContext(userId, slot, quantity, styleId = null) {
  return [userId, slot, quantity, styleId].filter((value) => value !== null).join(":");
}

function decodeContext(value) {
  const [userId, rawSlot, rawQuantity, rawStyleId] = String(value || "").split(":");
  const slot = Number(rawSlot);
  const quantity = Number(rawQuantity);
  const styleId = rawStyleId === undefined ? null : Number(rawStyleId);
  if (!/^\d{15,25}$/.test(userId)
    || ![1, 2, 3].includes(slot)
    || !Number.isSafeInteger(quantity)
    || quantity < 1
    || quantity > 1_000_000
    || (styleId !== null && (!Number.isSafeInteger(styleId) || styleId < 1))) {
    return null;
  }
  return { userId, slot, quantity, styleId };
}

function parseItemValue(interaction) {
  const raw = interaction.fields.getTextInputValue(GIVE_ITEM_AMOUNT_INPUT_ID).trim();
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_ITEM_VALUE
    ? value
    : null;
}

async function authorized(interaction) {
  const member = await resolveMember(interaction);
  return hasCommandPermission(member, "give-item");
}

async function writeItemLog(interaction, context, characterName, result) {
  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    command: "give-item",
    targetId: makePlayerKey(context.userId, context.slot),
    targetTag: `${characterName} · слот ${context.slot} <@${context.userId}>`,
    extra: {
      item: result.itemName,
      quantity: result.quantity,
      total_quantity: result.totalQuantity,
      type: getItemDefinition(result.itemName).kind,
    },
  });
}

function itemFailureMessage(reason) {
  if (reason === "quantity_too_large") {
    return "Итоговое количество слишком велико. Уменьшите стопку и повторите выдачу.";
  }
  if (reason === "inventory_busy") {
    return "Инвентарь сейчас обновляется другой операцией. Повторите выдачу через пару секунд.";
  }
  if (reason === "player_not_found") {
    return "Персонаж был удалён. Выберите получателя заново.";
  }
  return "Не удалось сохранить предмет. Повторите выдачу; если ошибка останется, проверьте подключение к базе.";
}

async function reportComponentError(
  interaction,
  componentInteraction,
  error,
  recoveryComponents,
) {
  console.error("Error handling give-item component:", error);
  const errorPayload = {
    components: createGiveItemStatusComponents(
      "Предмет не выдан",
      "Не удалось сохранить предмет. Повторите действие; если ошибка останется, проверьте подключение к базе.",
    ),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
  try {
    if (!componentInteraction.deferred && !componentInteraction.replied) {
      await componentInteraction.reply(errorPayload);
    } else if (typeof componentInteraction.followUp === "function") {
      await componentInteraction.followUp(errorPayload);
    }
    if (recoveryComponents) await interaction.editReply({ components: recoveryComponents });
  } catch {}
}

async function openModalConfirmation(interaction, context, itemName) {
  // Discord only permits EPHEMERAL on a deferred interaction response.
  // The Components V2 flag is added when the original response is edited below.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!await authorized(interaction)) {
    return interaction.editReply({
      components: createGiveItemStatusComponents(
        "Доступ изменился",
        "У вас больше нет права выдавать предметы.",
      ),
      flags: MessageFlags.IsComponentsV2,
    });
  }

  const targetUser = await interaction.client.users.fetch(context.userId).catch(() => null);
  const playerId = makePlayerKey(context.userId, context.slot);
  const player = await getPlayer(playerId);
  if (!targetUser || !player) {
    return interaction.editReply({
      components: createGiveItemStatusComponents(
        "Персонаж больше недоступен",
        "Закройте форму и запустите `/give-item` заново.",
      ),
      flags: MessageFlags.IsComponentsV2,
    });
  }

  const characterName = player.character_name || player.username || targetUser.username;
  const avatarUrl = resolveAvatar(player, targetUser);
  const definition = getItemDefinition(itemName);
  const learnedStyles = definition.kind === "sp"
    ? await getLearnedPlayerStyles(playerId)
    : [];
  const recipientOwnsStyle = definition.kind !== "sp"
    || learnedStyles.some((style) => style.name === definition.styleName);
  let completed = false;
  let busy = false;
  let lastResult = null;
  const response = await interaction.editReply({
    content: null,
    embeds: [],
    components: createGiveItemPreviewComponents({
      characterName,
      avatarUrl,
      slot: context.slot,
      itemName,
      quantity: context.quantity,
      recipientOwnsStyle,
    }),
    flags: MessageFlags.IsComponentsV2,
  });
  const collector = response.createMessageComponentCollector({ time: SESSION_DURATION });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (componentInteraction.customId === GIVE_ITEM_CANCEL_ID) {
      completed = true;
      collector.stop("cancelled");
      await componentInteraction.update({
        components: createGiveItemStatusComponents(
          "Выдача отменена",
          "Инвентарь персонажа не изменён.",
          "neutral",
        ),
      });
      return;
    }
    if (![GIVE_ITEM_CONFIRM_ID, GIVE_ITEM_REPEAT_ID].includes(componentInteraction.customId)
      || busy) return;
    busy = true;
    try {
      await componentInteraction.deferUpdate();
      if (!await authorized(componentInteraction)) {
        completed = true;
        collector.stop("forbidden");
        await interaction.editReply({
          components: createGiveItemStatusComponents(
            "Доступ изменился",
            "У вас больше нет права выдавать предметы. Инвентарь не изменён.",
          ),
        });
        return;
      }

      const result = await giveItem(
        playerId,
        itemName,
        context.quantity,
        interaction.user.id,
      );
      if (!result.success) {
        busy = false;
        await interaction.editReply({
          components: createGiveItemPreviewComponents({
            characterName,
            avatarUrl,
            slot: context.slot,
            itemName,
            quantity: context.quantity,
            recipientOwnsStyle,
          }),
        });
        await componentInteraction.followUp({
          components: createGiveItemStatusComponents(
            "Предмет не выдан",
            itemFailureMessage(result.reason),
          ),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

      await interaction.editReply({
        components: createGiveItemReceiptComponents({
          characterName,
          avatarUrl,
          slot: context.slot,
          result,
          allowBack: false,
        }),
      });
      lastResult = result;
      busy = false;
      await writeItemLog(interaction, context, characterName, result)
        .catch((error) => console.error("Error logging give-item:", error));
    } catch (error) {
      busy = false;
      await reportComponentError(
        interaction,
        componentInteraction,
        error,
        createGiveItemPreviewComponents({
          characterName,
          avatarUrl,
          slot: context.slot,
          itemName,
          quantity: context.quantity,
          recipientOwnsStyle,
        }),
      );
    }
  });

  collector.on("end", async () => {
    if (completed) return;
    try {
      if (lastResult) {
        await interaction.editReply({
          components: createGiveItemReceiptComponents({
            characterName,
            avatarUrl,
            slot: context.slot,
            result: lastResult,
            disabled: true,
            allowBack: false,
          }),
        });
        return;
      }
      await interaction.editReply({
        components: createGiveItemStatusComponents(
          "Время подтверждения истекло",
          "Предмет не выдан. Запустите `/give-item` ещё раз.",
          "warning",
        ),
      });
    } catch {}
  });
  return response;
}

async function openGiveItemCenter(interaction, initial = null) {
  if (!await authorized(interaction)) {
    return interaction.reply({
      components: createGiveItemStatusComponents(
        "Доступ запрещён",
        "Команда доступна ГМам и администраторам.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const cooldown = initial ? { onCooldown: false } : checkGlobalCooldown(interaction.user.id);
  if (cooldown.onCooldown) {
    const retryAt = Math.floor((Date.now() + cooldown.remaining) / 1000);
    return interaction.reply({
      components: createGiveItemStatusComponents(
        "Подождите перед выдачей",
        `Попробуйте снова <t:${retryAt}:R>.`,
        "warning",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const targetUser = initial?.targetUser || interaction.options.getUser("user", true);
  const slot = initial?.slot || interaction.options.getInteger("slot")
    || await getActiveSlot(targetUser.id);
  const quantity = initial?.quantity || interaction.options.getInteger("quantity") || 1;
  const directItemName = initial?.itemName
    || interaction.options?.getString?.("item")?.trim()
    || null;
  const playerId = makePlayerKey(targetUser.id, slot);
  const player = await getPlayer(playerId);
  if (!player) {
    return interaction.reply({
      components: createGiveItemStatusComponents(
        "Персонаж не найден",
        `В слоте ${slot} нет персонажа. Сначала зарегистрируйте его через `/register`.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const catalog = listCatalogItems();
  const [styles, learnedStyles] = await Promise.all([
    listStyles(),
    getLearnedPlayerStyles(playerId),
  ]);
  const learnedStyleNames = new Set(learnedStyles.map((style) => style.name));
  const characterName = player.character_name || player.username || targetUser.username;
  const avatarUrl = resolveAvatar(player, targetUser);
  const context = { userId: targetUser.id, slot, quantity };
  let catalogPage = 0;
  let stylePage = 0;
  let selectedItemName = directItemName;
  let currentView = directItemName ? "preview" : "center";
  let completed = false;
  let busy = false;
  let modalStarted = false;

  const center = (disabled = false) => createGiveItemCenterComponents({
    characterName,
    avatarUrl,
    slot,
    quantity,
    catalog,
    page: catalogPage,
    disabled,
  });
  const styleSelection = (disabled = false) => createGiveItemStyleComponents({
    characterName,
    avatarUrl,
    slot,
    quantity,
    styles,
    page: stylePage,
    disabled,
  });
  const preview = (disabled = false) => createGiveItemPreviewComponents({
    characterName,
    avatarUrl,
    slot,
    itemName: selectedItemName,
    quantity,
    recipientOwnsStyle: getItemDefinition(selectedItemName).kind !== "sp"
      || learnedStyleNames.has(getItemDefinition(selectedItemName).styleName),
    disabled,
  });

  let lastResult = null;
  const receipt = (disabled = false) => createGiveItemReceiptComponents({
    characterName,
    avatarUrl,
    slot,
    result: lastResult,
    disabled,
  });
  await interaction.reply({
    components: selectedItemName ? preview() : center(),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
  const response = await interaction.fetchReply();
  const collector = response.createMessageComponentCollector({ time: SESSION_DURATION });

  collector.on("collect", async (componentInteraction) => {
    if (componentInteraction.user.id !== interaction.user.id) return;
    if (busy) return;
    try {

    if (componentInteraction.customId === GIVE_ITEM_CATALOG_PREV_ID) {
      catalogPage = Math.max(0, catalogPage - 1);
      await componentInteraction.update({ components: center() });
      return;
    }
    if (componentInteraction.customId === GIVE_ITEM_CATALOG_NEXT_ID) {
      catalogPage = Math.min(getGiveItemCatalogPageCount(catalog) - 1, catalogPage + 1);
      await componentInteraction.update({ components: center() });
      return;
    }
    if (componentInteraction.customId === GIVE_ITEM_STYLE_PREV_ID) {
      stylePage = Math.max(0, stylePage - 1);
      await componentInteraction.update({ components: styleSelection() });
      return;
    }
    if (componentInteraction.customId === GIVE_ITEM_STYLE_NEXT_ID) {
      stylePage = Math.min(getGiveItemStylePageCount(styles) - 1, stylePage + 1);
      await componentInteraction.update({ components: styleSelection() });
      return;
    }
    if (componentInteraction.customId === GIVE_ITEM_BACK_ID) {
      currentView = "center";
      selectedItemName = null;
      await componentInteraction.update({ components: center() });
      return;
    }

    if (componentInteraction.customId === GIVE_ITEM_QUANTITY_ID) {
      modalStarted = true;
      collector.stop("modal");
      await componentInteraction.showModal(
        createGiveItemQuantityModal(encodeContext(targetUser.id, slot, quantity), quantity),
      );
      return;
    }

    if (componentInteraction.customId === GIVE_ITEM_CUSTOM_ID) {
      modalStarted = true;
      collector.stop("modal");
      await componentInteraction.showModal(
        createGiveItemCustomModal(encodeContext(targetUser.id, slot, quantity)),
      );
      return;
    }

    if (componentInteraction.isStringSelectMenu()
      && componentInteraction.customId === GIVE_ITEM_CATALOG_SELECT_ID) {
      const item = catalog[Number(componentInteraction.values[0])];
      if (!item) return;
      selectedItemName = item.name;
      currentView = "preview";
      await componentInteraction.update({ components: preview() });
      return;
    }

    if (componentInteraction.customId === GIVE_ITEM_CUSTOM_SP_ID) {
      if (styles.length === 0) {
        await componentInteraction.reply({
          content: "Сначала создайте хотя бы один стиль через `/add-style`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      currentView = "styles";
      await componentInteraction.update({ components: styleSelection() });
      return;
    }

    if (componentInteraction.customId === GIVE_ITEM_CUSTOM_AP_ID) {
      modalStarted = true;
      collector.stop("modal");
      await componentInteraction.showModal(
        createGiveItemAPModal(encodeContext(targetUser.id, slot, quantity)),
      );
      return;
    }
    if (componentInteraction.customId === GIVE_ITEM_COLLECTIBLE_ID) {
      modalStarted = true;
      collector.stop("modal");
      await componentInteraction.showModal(
        createGiveItemCollectibleModal(encodeContext(targetUser.id, slot, quantity)),
      );
      return;
    }

    if (componentInteraction.isStringSelectMenu()
      && componentInteraction.customId === GIVE_ITEM_STYLE_SELECT_ID) {
      const styleId = Number(componentInteraction.values[0]);
      const style = styles.find((candidate) => Number(candidate.id) === styleId);
      if (!style) return;
      modalStarted = true;
      collector.stop("modal");
      await componentInteraction.showModal(
        createGiveItemSPModal(
          encodeContext(targetUser.id, slot, quantity, style.id),
          style.name,
        ),
      );
      return;
    }

    if (componentInteraction.customId === GIVE_ITEM_CANCEL_ID) {
      completed = true;
      collector.stop("cancelled");
      await componentInteraction.update({
        components: createGiveItemStatusComponents(
          "Выдача отменена",
          "Инвентарь персонажа не изменён.",
          "neutral",
        ),
      });
      return;
    }
    if (![GIVE_ITEM_CONFIRM_ID, GIVE_ITEM_REPEAT_ID].includes(componentInteraction.customId)
      || !selectedItemName) return;

    busy = true;
    await componentInteraction.deferUpdate();
    if (!await authorized(componentInteraction)) {
      completed = true;
      collector.stop("forbidden");
      await interaction.editReply({
        components: createGiveItemStatusComponents(
          "Доступ изменился",
          "У вас больше нет права выдавать предметы. Инвентарь не изменён.",
        ),
      });
      return;
    }
    const result = await giveItem(
      playerId,
      selectedItemName,
      quantity,
      interaction.user.id,
    );
    if (!result.success) {
      busy = false;
      await interaction.editReply({
        components: preview(),
      });
      await componentInteraction.followUp({
        components: createGiveItemStatusComponents(
          "Предмет не выдан",
          itemFailureMessage(result.reason),
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
    lastResult = result;
    currentView = "receipt";
    busy = false;
    await interaction.editReply({
      components: receipt(),
    });
    await writeItemLog(interaction, context, characterName, result)
      .catch((error) => console.error("Error logging give-item:", error));
    } catch (error) {
      busy = false;
      await reportComponentError(interaction, componentInteraction, error, preview());
    }
  });

  collector.on("end", async () => {
    if (completed) return;
    try {
      if (modalStarted) {
        await interaction.deleteReply();
        return;
      }
      const components = currentView === "receipt"
        ? receipt(true)
        : currentView === "preview"
        ? preview(true)
        : currentView === "styles"
          ? styleSelection(true)
          : center(true);
      await interaction.editReply({ components });
    } catch {}
  });
  return response;
}

export async function execute(interaction) {
  return openGiveItemCenter(interaction);
}

export function handlesModal(interaction) {
  return interaction.customId.startsWith(GIVE_ITEM_AP_MODAL_PREFIX)
    || interaction.customId.startsWith(GIVE_ITEM_SP_MODAL_PREFIX)
    || interaction.customId.startsWith(GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX)
    || interaction.customId.startsWith(GIVE_ITEM_CUSTOM_MODAL_PREFIX)
    || interaction.customId.startsWith(GIVE_ITEM_QUANTITY_MODAL_PREFIX);
}

export async function handleModalSubmit(interaction) {
  let prefix;
  if (interaction.customId.startsWith(GIVE_ITEM_AP_MODAL_PREFIX)) {
    prefix = GIVE_ITEM_AP_MODAL_PREFIX;
  } else if (interaction.customId.startsWith(GIVE_ITEM_SP_MODAL_PREFIX)) {
    prefix = GIVE_ITEM_SP_MODAL_PREFIX;
  } else if (interaction.customId.startsWith(GIVE_ITEM_CUSTOM_MODAL_PREFIX)) {
    prefix = GIVE_ITEM_CUSTOM_MODAL_PREFIX;
  } else if (interaction.customId.startsWith(GIVE_ITEM_QUANTITY_MODAL_PREFIX)) {
    prefix = GIVE_ITEM_QUANTITY_MODAL_PREFIX;
  } else {
    prefix = GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX;
  }
  const context = decodeContext(interaction.customId.slice(prefix.length));
  if (!context) {
    await interaction.reply({
      components: createGiveItemStatusComponents(
        "Форма устарела",
        "Закройте её и запустите `/give-item` ещё раз.",
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  if (prefix === GIVE_ITEM_QUANTITY_MODAL_PREFIX) {
    const raw = interaction.fields
      .getTextInputValue(GIVE_ITEM_QUANTITY_INPUT_ID)
      .trim();
    const quantity = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      await interaction.reply({
        components: createGiveItemStatusComponents(
          "Количество не изменено",
          "Укажите целое число от 1 до 1 000 000.",
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }
    const targetUser = await interaction.client.users.fetch(context.userId).catch(() => null);
    if (!targetUser) {
      await interaction.reply({
        components: createGiveItemStatusComponents(
          "Получатель не найден",
          "Запустите `/give-item` заново и выберите получателя.",
        ),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }
    return openGiveItemCenter(interaction, {
      targetUser,
      slot: context.slot,
      quantity,
    });
  }
  let itemName;
  if (prefix === GIVE_ITEM_AP_MODAL_PREFIX) {
    const amount = parseItemValue(interaction);
    itemName = amount ? createAPItemName(amount) : null;
  } else if (prefix === GIVE_ITEM_SP_MODAL_PREFIX) {
    const amount = parseItemValue(interaction);
    const style = amount ? await getStyleById(context.styleId) : null;
    itemName = style ? createSPItemName(style.name, amount) : null;
    if (itemName && itemName.length > 100) itemName = null;
  } else {
    itemName = interaction.fields
      .getTextInputValue(GIVE_ITEM_NAME_INPUT_ID)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!itemName || itemName.length > 100
      || (prefix === GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX
        && getItemDefinition(itemName).kind !== "collectible")) {
      itemName = null;
    }
  }

  if (!itemName) {
    await interaction.reply({
      components: createGiveItemStatusComponents(
        "Предмет не создан",
        prefix === GIVE_ITEM_COLLECTIBLE_MODAL_PREFIX
          ? "Используйте уникальное название, которое не совпадает с форматом AP-тома или SP-свитка."
          : prefix === GIVE_ITEM_CUSTOM_MODAL_PREFIX
            ? "Введите название длиной от 1 до 100 символов."
          : `Укажите целое значение от 1 до ${MAX_ITEM_VALUE.toLocaleString("ru-RU")}.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }
  return openModalConfirmation(interaction, context, itemName);
}
