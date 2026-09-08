import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { isAdmin } from "../utils/adminCheck.js";
import {
  closeInteractionSession,
  createInteractionSession,
  getInteractionSession,
  releaseInteractionSession,
} from "../utils/interactionSessions.js";
import { buildModalCustomId } from "../utils/interactionRouter.js";
import { modernizeResponsePayload } from "../utils/modernResponses.js";

export const ANNOUNCE_BUILDER_NAMESPACE = "announce_builder";
export const ANNOUNCE_BUILDER_TTL_MS = 2 * 60 * 60 * 1000;

export const ANN_SELECT_TARGET = "ann_select_target";
export const ANN_SELECT_USER = "ann_select_user";

export const ANN_BTN_TEXT = "ann_btn_text";
export const ANN_BTN_STYLE = "ann_btn_style";
export const ANN_BTN_SEND = "ann_btn_send";
export const ANN_BTN_CANCEL = "ann_btn_cancel";

export const ANN_INPUT_TITLE = "ann_input_title";
export const ANN_INPUT_MESSAGE = "ann_input_message";
export const ANN_INPUT_FOOTER = "ann_input_footer";

export const ANN_INPUT_COLOR = "ann_input_color";
export const ANN_INPUT_IMAGE = "ann_input_image";
export const ANN_INPUT_THUMBNAIL = "ann_input_thumbnail";

const HEX_COLOR_REGEX = /^#([0-9A-F]{3}){1,2}$/i;

export function createAnnounceState({
  title = "📢 Объявление",
  message = "",
  color = "#b209d4",
  image = "",
  thumbnail = "",
  footer = "",
  target = "channel", // "channel" | "all" | "single"
  target_user_id = null,
  target_channel_id = null,
} = {}) {
  return {
    title: String(title || "📢 Объявление").slice(0, 100),
    message: String(message || "").slice(0, 4000),
    color: HEX_COLOR_REGEX.test(color) ? color : "#b209d4",
    image: String(image || "").slice(0, 500),
    thumbnail: String(thumbnail || "").slice(0, 500),
    footer: String(footer || "").slice(0, 100),
    target: ["channel", "all", "single"].includes(target) ? target : "channel",
    target_user_id: target_user_id ? String(target_user_id) : null,
    target_channel_id: target_channel_id ? String(target_channel_id) : null,
  };
}

export function createAnnouncePreviewEmbed(state, guildName = "Сервер") {
  const footerText = state.footer?.trim() || guildName;
  const descriptionText = state.message?.trim()
    ? state.message.trim()
    : "*(Текст объявления пока не заполнен — нажмите кнопку 【📝 Текст и Заголовок】 ниже)*";

  let targetNotice = "";
  if (state.target === "channel") {
    targetNotice = `📢 **Куда будет отправлено:** В текущий канал <#${state.target_channel_id}>`;
  } else if (state.target === "all") {
    targetNotice = `🌐 **Куда будет отправлено:** В личные сообщения всем участникам сервера`;
  } else if (state.target === "single") {
    targetNotice = state.target_user_id
      ? `👤 **Куда будет отправлено:** В личные сообщения участнику <@${state.target_user_id}>`
      : `👤 **Куда будет отправлено:** В ЛС участнику *(выберите пользователя в меню ниже)*`;
  }

  const embed = new EmbedBuilder()
    .setColor(HEX_COLOR_REGEX.test(state.color) ? state.color : "#b209d4")
    .setTitle(state.title?.trim() || "📢 Объявление")
    .setDescription(`${descriptionText}\n\n-# ${targetNotice}`)
    .setFooter({ text: footerText })
    .setTimestamp();

  if (state.image?.trim()) {
    try {
      new URL(state.image.trim());
      embed.setImage(state.image.trim());
    } catch {}
  }

  if (state.thumbnail?.trim()) {
    try {
      new URL(state.thumbnail.trim());
      embed.setThumbnail(state.thumbnail.trim());
    } catch {}
  }

  return embed;
}

export function createAnnounceComponents(state, disabled = false) {
  const rows = [];

  // Row 1: Выбор получателей
  const targetMenu = new StringSelectMenuBuilder()
    .setCustomId(ANN_SELECT_TARGET)
    .setPlaceholder("Получатели объявления")
    .setDisabled(disabled)
    .addOptions([
      {
        label: "В текущий канал",
        value: "channel",
        emoji: "📢",
        description: "Опубликовать объявление в текущем канале",
        default: state.target === "channel",
      },
      {
        label: "В ЛС всем участникам",
        value: "all",
        emoji: "🌐",
        description: "Разослать в личные сообщения всем участникам",
        default: state.target === "all",
      },
      {
        label: "В ЛС одному участнику",
        value: "single",
        emoji: "👤",
        description: "Отправить в личные сообщения конкретному человеку",
        default: state.target === "single",
      },
    ]);

  rows.push(new ActionRowBuilder().addComponents(targetMenu));

  // Row 2: Если режим single — селектор пользователя
  if (state.target === "single") {
    const userMenu = new UserSelectMenuBuilder()
      .setCustomId(ANN_SELECT_USER)
      .setPlaceholder("Выберите пользователя для отправки")
      .setDisabled(disabled);

    if (state.target_user_id) {
      userMenu.setDefaultUsers(state.target_user_id);
    }
    rows.push(new ActionRowBuilder().addComponents(userMenu));
  }

  // Row 3: Кнопки действий
  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ANN_BTN_TEXT)
      .setLabel("Текст и Заголовок")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ANN_BTN_STYLE)
      .setLabel("Оформление")
      .setEmoji("🎨")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ANN_BTN_SEND)
      .setLabel("Отправить")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(ANN_BTN_CANCEL)
      .setLabel("Отмена")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  rows.push(buttonsRow);
  return rows;
}

export function createAnnounceTextModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(ANNOUNCE_BUILDER_NAMESPACE, "text", messageId))
    .setTitle("Текст и заголовок объявления");

  const titleInput = new TextInputBuilder()
    .setCustomId(ANN_INPUT_TITLE)
    .setLabel("Заголовок объявления")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true)
    .setPlaceholder("📢 Объявление");

  if (state.title && state.title.trim()) {
    titleInput.setValue(state.title.trim());
  }

  const msgInput = new TextInputBuilder()
    .setCustomId(ANN_INPUT_MESSAGE)
    .setLabel("Текст объявления")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(4000)
    .setRequired(true)
    .setPlaceholder("Введите текст объявления… Поддерживается markdown-разметка.");

  if (state.message && state.message.trim()) {
    msgInput.setValue(state.message.trim());
  }

  const footerInput = new TextInputBuilder()
    .setCustomId(ANN_INPUT_FOOTER)
    .setLabel("Подпись / Footer (необязательно)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(false)
    .setPlaceholder("Например: Администрация сервера");

  if (state.footer && state.footer.trim()) {
    footerInput.setValue(state.footer.trim());
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(msgInput),
    new ActionRowBuilder().addComponents(footerInput)
  );

  return modal;
}

export function createAnnounceStyleModal(state, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(buildModalCustomId(ANNOUNCE_BUILDER_NAMESPACE, "style", messageId))
    .setTitle("Оформление объявления");

  const colorInput = new TextInputBuilder()
    .setCustomId(ANN_INPUT_COLOR)
    .setLabel("Цвет в формате HEX")
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(7)
    .setRequired(false)
    .setPlaceholder("#b209d4");

  if (state.color && state.color.trim()) {
    colorInput.setValue(state.color.trim());
  }

  const imgInput = new TextInputBuilder()
    .setCustomId(ANN_INPUT_IMAGE)
    .setLabel("URL большого изображения (необязательно)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder("https://example.com/banner.png");

  if (state.image && state.image.trim()) {
    imgInput.setValue(state.image.trim());
  }

  const thumbInput = new TextInputBuilder()
    .setCustomId(ANN_INPUT_THUMBNAIL)
    .setLabel("URL миниатюры (необязательно)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder("https://example.com/thumb.png");

  if (state.thumbnail && state.thumbnail.trim()) {
    thumbInput.setValue(state.thumbnail.trim());
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(imgInput),
    new ActionRowBuilder().addComponents(thumbInput)
  );

  return modal;
}

async function sendAnnouncement({ interaction, session }) {
  const state = session.state;

  if (!state.message || !state.message.trim()) {
    return interaction.reply({
      content: "❌ Заполните текст объявления перед отправкой (кнопка 【📝 Текст и Заголовок】).",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (state.target === "single" && !state.target_user_id) {
    return interaction.reply({
      content: "❌ Выберите пользователя для отправки в выпадающем меню.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  // Собираем Embed для финальной отправки
  const finalEmbed = new EmbedBuilder()
    .setColor(HEX_COLOR_REGEX.test(state.color) ? state.color : "#b209d4")
    .setTitle(state.title?.trim() || "📢 Объявление")
    .setDescription(state.message.trim())
    .setFooter({ text: state.footer?.trim() || interaction.guild?.name || "Сервер" })
    .setTimestamp();

  if (state.image?.trim()) {
    try {
      new URL(state.image.trim());
      finalEmbed.setImage(state.image.trim());
    } catch {}
  }
  if (state.thumbnail?.trim()) {
    try {
      new URL(state.thumbnail.trim());
      finalEmbed.setThumbnail(state.thumbnail.trim());
    } catch {}
  }

  await closeInteractionSession(session.message_id);

  // 1. Отправка в канал
  if (state.target === "channel") {
    const channelId = state.target_channel_id || interaction.channelId;
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.followUp({
        content: "❌ Не удалось найти целевой канал для публикации.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const sent = await channel.send(modernizeResponsePayload({ embeds: [finalEmbed] }));
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle("✅ Объявление опубликовано")
            .setDescription(`Объявление успешно отправлено в канал <#${channel.id}>. [Перейти к сообщению](${sent.url})`),
        ],
        components: [],
      });
    } catch (err) {
      return interaction.followUp({
        content: `❌ Ошибка при отправке в канал: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // 2. Отправка одному пользователю в ЛС
  if (state.target === "single") {
    try {
      const user = await interaction.client.users.fetch(state.target_user_id);
      await user.send(modernizeResponsePayload({ embeds: [finalEmbed] }));
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle("✅ Объявление отправлено")
            .setDescription(`Объявление успешно доставлено в ЛС пользователю <@${user.id}> (${user.tag}).`),
        ],
        components: [],
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("❌ Не удалось доставить объявление")
            .setDescription(`Пользователь <@${state.target_user_id}> закрыл личные сообщения или заблокировал бота: ${err.message}`),
        ],
        components: [],
      });
    }
  }

  // 3. Массовая рассылка всем в ЛС
  if (state.target === "all") {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle("⏳ Идёт массовая рассылка...")
          .setDescription("Рассылка запущена в фоновом режиме. По завершении вы получите отчёт."),
      ],
      components: [],
    });

    try {
      const members = await interaction.guild.members.fetch();
      const recipients = members.filter((m) => !m.user.bot).map((m) => m.user);

      let successCount = 0;
      let failCount = 0;

      for (const user of recipients) {
        try {
          await user.send(modernizeResponsePayload({ embeds: [finalEmbed] }));
          successCount++;
          await new Promise((r) => setTimeout(r, 400));
        } catch {
          failCount++;
        }
      }

      return interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(0x22c55e)
            .setTitle("📢 Рассылка завершена")
            .setDescription(
              `• Успешно доставлено: **${successCount}**\n` +
              `• Не удалось доставить (ЛС закрыты): **${failCount}**\n` +
              `• Всего обработано: **${recipients.length}**`
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return interaction.followUp({
        content: `❌ Ошибка при массовой рассылке: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

async function handleComponent({ interaction, session }) {
  const customId = interaction.customId;
  const state = { ...session.state };

  if (customId === ANN_SELECT_TARGET && interaction.isStringSelectMenu()) {
    state.target = interaction.values[0];
  }

  if (customId === ANN_SELECT_USER && interaction.isUserSelectMenu()) {
    state.target_user_id = interaction.values[0];
  }

  if (customId === ANN_BTN_TEXT) {
    const modal = createAnnounceTextModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Announce text modal error:", err);
    });
  }

  if (customId === ANN_BTN_STYLE) {
    const modal = createAnnounceStyleModal(state, session.message_id);
    return interaction.showModal(modal).catch((err) => {
      console.error("Announce style modal error:", err);
    });
  }

  if (customId === ANN_BTN_SEND) {
    return sendAnnouncement({ interaction, session });
  }

  if (customId === ANN_BTN_CANCEL) {
    await closeInteractionSession(session.message_id);
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("✖️ Объявление отменено")
          .setDescription("Панель создания объявления закрыта."),
      ],
      components: [],
    });
  }

  await releaseInteractionSession(session.message_id, state);

  const embed = createAnnouncePreviewEmbed(state, interaction.guild?.name);
  const components = createAnnounceComponents(state);

  await interaction.update({
    embeds: [embed],
    components,
  });
}

async function handleModal({ interaction, session, action }) {
  const state = { ...session.state };

  if (action === "text") {
    const title = interaction.fields.getTextInputValue(ANN_INPUT_TITLE)?.trim();
    const msg = interaction.fields.getTextInputValue(ANN_INPUT_MESSAGE)?.trim();
    const footer = interaction.fields.getTextInputValue(ANN_INPUT_FOOTER)?.trim();

    if (title) state.title = title.slice(0, 100);
    if (msg) state.message = msg.slice(0, 4000);
    state.footer = (footer || "").slice(0, 100);
  } else if (action === "style") {
    const color = interaction.fields.getTextInputValue(ANN_INPUT_COLOR)?.trim();
    const img = interaction.fields.getTextInputValue(ANN_INPUT_IMAGE)?.trim();
    const thumb = interaction.fields.getTextInputValue(ANN_INPUT_THUMBNAIL)?.trim();

    if (color && HEX_COLOR_REGEX.test(color)) state.color = color;
    state.image = img ? img.slice(0, 500) : "";
    state.thumbnail = thumb ? thumb.slice(0, 500) : "";
  }

  await releaseInteractionSession(session.message_id, state);

  const embed = createAnnouncePreviewEmbed(state, interaction.guild?.name);
  const components = createAnnounceComponents(state);

  await interaction.update({
    embeds: [embed],
    components,
  });
}

function authorize({ interaction, session }) {
  if (session.owner_id !== interaction.user.id) return false;
  return (
    isAdmin(interaction.member) ||
    Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.Administrator))
  );
}

export const announceInteractionHandler = {
  authorize,
  handleComponent,
  handleModal,
  renderForeign({ interaction }) {
    return interaction.reply({
      content: "Этот мастер объявлений редактируется другим администратором.",
      flags: MessageFlags.Ephemeral,
    });
  },
  renderExpired({ interaction }) {
    return interaction.reply({
      content: "Время действия мастера объявлений истекло. Запустите команду заново.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
