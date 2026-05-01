import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("Отправить объявление в личные сообщения участникам сервера")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) =>
    option
      .setName("message")
      .setDescription("Текст объявления")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("target")
      .setDescription("Кому отправить")
      .setRequired(true)
      .addChoices(
        { name: "Всем участникам сервера", value: "all" },
        { name: "Выбранному участнику", value: "single" },
        { name: "Выбранным участникам", value: "multiple" }
      )
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Пользователь для отправки (для режима 'single')")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("users")
      .setDescription("ID пользователей через запятую (для режима 'multiple')")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("title")
      .setDescription("Заголовок объявления (по умолчанию: 📢 Объявление)")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("color")
      .setDescription("Цвет embed в HEX формате (по умолчанию: #b209d4)")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("image")
      .setDescription("URL изображения для embed")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("thumbnail")
      .setDescription("URL миниатюры для embed")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("footer")
      .setDescription("Текст в footer (по умолчанию: название сервера)")
      .setRequired(false)
  );

export async function execute(interaction) {
  // Проверка прав администратора
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ У вас нет прав для использования этой команды!",
      flags: 64,
    });
  }

  // Получение параметров
  const message = interaction.options.getString("message");
  const target = interaction.options.getString("target");
  const singleUser = interaction.options.getUser("user");
  const multipleUsers = interaction.options.getString("users");
  const title = interaction.options.getString("title") || "📢 Объявление";
  const color = interaction.options.getString("color") || "#b209d4";
  const image = interaction.options.getString("image");
  const thumbnail = interaction.options.getString("thumbnail");
  const footer = interaction.options.getString("footer") || interaction.guild.name;

  // Валидация цвета
  const hexRegex = /^#([0-9A-F]{3}){1,2}$/i;
  if (!hexRegex.test(color)) {
    return interaction.reply({
      content: "❌ Неверный формат цвета! Используйте HEX формат (например: #b209d4)",
      flags: 64,
    });
  }

  // Определение списка получателей
  let recipients = [];

  if (target === "all") {
    // Отправка всем участникам сервера
    try {
      const members = await interaction.guild.members.fetch();
      recipients = members.filter(member => !member.user.bot).map(member => member.user);
    } catch (error) {
      console.error("Ошибка при получении списка участников:", error);
      return interaction.reply({
        content: "❌ Не удалось получить список участников сервера!",
        flags: 64,
      });
    }
  } else if (target === "single") {
    // Отправка одному пользователю
    if (!singleUser) {
      return interaction.reply({
        content: "❌ Вы должны указать пользователя для отправки!",
        flags: 64,
      });
    }
    recipients = [singleUser];
  } else if (target === "multiple") {
    // Отправка нескольким пользователям
    if (!multipleUsers) {
      return interaction.reply({
        content: "❌ Вы должны указать ID пользователей через запятую!",
        flags: 64,
      });
    }

    const userIds = multipleUsers.split(",").map(id => id.trim());
    for (const userId of userIds) {
      try {
        const user = await interaction.client.users.fetch(userId);
        if (user && !user.bot) {
          recipients.push(user);
        }
      } catch (error) {
        console.error(`Не удалось найти пользователя с ID: ${userId}`);
      }
    }

    if (recipients.length === 0) {
      return interaction.reply({
        content: "❌ Не удалось найти ни одного пользователя по указанным ID!",
        flags: 64,
      });
    }
  }

  // Создание превью embed
  const previewEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(message)
    .setFooter({ text: footer })
    .setTimestamp();

  if (image) previewEmbed.setImage(image);
  if (thumbnail) previewEmbed.setThumbnail(thumbnail);

  // Создание кнопок подтверждения
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("announce_confirm")
      .setLabel("✅ Отправить")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("announce_cancel")
      .setLabel("❌ Отмена")
      .setStyle(ButtonStyle.Danger)
  );

  // Отправка превью
  const targetText =
    target === "all"
      ? `всем участникам сервера (${recipients.length} чел.)`
      : target === "single"
      ? `участнику ${singleUser.tag}`
      : `выбранным участникам (${recipients.length} чел.)`;

  const confirmMessage = await interaction.reply({
    content: `**Превью объявления**\nБудет отправлено: **${targetText}**\n\nПодтвердите отправку:`,
    embeds: [previewEmbed],
    components: [confirmRow],
    fetchReply: true,
  });

  // Ожидание подтверждения
  const collector = confirmMessage.createMessageComponentCollector({
    time: 60000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({
        content: "❌ Только автор команды может подтвердить отправку!",
        flags: 64,
      });
    }

    if (i.customId === "announce_cancel") {
      collector.stop("cancelled");
      return i.update({
        content: "❌ Отправка объявления отменена.",
        embeds: [],
        components: [],
      });
    }

    if (i.customId === "announce_confirm") {
      collector.stop("confirmed");

      // Обновление сообщения на "Отправка..."
      await i.update({
        content: `⏳ Отправка объявления ${recipients.length} получателям...`,
        components: [],
      });

      // Отправка сообщений
      let successCount = 0;
      let failCount = 0;
      const failedUsers = [];

      for (const user of recipients) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(message)
            .setFooter({ text: footer })
            .setTimestamp();

          if (image) dmEmbed.setImage(image);
          if (thumbnail) dmEmbed.setThumbnail(thumbnail);

          await user.send({ embeds: [dmEmbed] });
          successCount++;

          // Небольшая задержка между отправками для избежания rate limit
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Не удалось отправить сообщение пользователю ${user.tag}:`, error);
          failCount++;
          failedUsers.push(user.tag);
        }
      }

      // Результаты рассылки
      const resultEmbed = new EmbedBuilder()
        .setColor(failCount === 0 ? "#00ff00" : "#ffaa00")
        .setTitle("📊 Результаты рассылки")
        .addFields(
          { name: "✅ Отправлено успешно", value: `${successCount}`, inline: true },
          { name: "❌ Не удалось отправить", value: `${failCount}`, inline: true },
          { name: "📝 Всего получателей", value: `${recipients.length}`, inline: true }
        )
        .setTimestamp();

      if (failedUsers.length > 0 && failedUsers.length <= 10) {
        resultEmbed.addFields({
          name: "⚠️ Не удалось отправить:",
          value: failedUsers.join(", "),
        });
      } else if (failedUsers.length > 10) {
        resultEmbed.addFields({
          name: "⚠️ Не удалось отправить:",
          value: `${failedUsers.length} пользователей (возможно, закрыты ЛС)`,
        });
      }

      await interaction.editReply({
        content: null,
        embeds: [resultEmbed],
      });
    }
  });

  collector.on("end", async (collected, reason) => {
    if (reason === "time") {
      await interaction.editReply({
        content: "⏱️ Время ожидания истекло. Отправка отменена.",
        embeds: [],
        components: [],
      });
    }
  });
}
