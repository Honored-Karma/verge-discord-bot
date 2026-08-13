import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Полный гайд по всем командам бота")
  .addStringOption((option) =>
    option
      .setName("category")
      .setDescription("Выбрать категорию команд")
      .setRequired(false)
      .addChoices(
        { name: "📋 Основное", value: "main" },
        { name: "👤 Профиль", value: "profile" },
        { name: "🥋 Тренировка", value: "training" },
        { name: "💰 Экономика", value: "economy" },
        { name: "🛡️ Админ", value: "admin" },
        { name: "📚 Основные команды", value: "all" },
      ),
  );

export async function execute(interaction) {
  const category = interaction.options.getString("category") || "main";

  const helpEmbeds = {
    main: createMainHelp(),
    profile: createProfileHelp(),
    training: createTrainingHelp(),
    economy: createEconomyHelp(),
    admin: createAdminHelp(),
    all: createAllCommandsHelp(),
  };

  const selected = helpEmbeds[category] || helpEmbeds.main;
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help_category_select")
      .setPlaceholder("Выберите раздел справки")
      .addOptions(
        { label: "Основное", value: "main", emoji: "📋" },
        { label: "Профиль", value: "profile", emoji: "👤" },
        { label: "Тренировка", value: "training", emoji: "🥋" },
        { label: "Экономика", value: "economy", emoji: "💰" },
        { label: "Админ", value: "admin", emoji: "🛡️" },
        { label: "Основные команды", value: "all", emoji: "📚" },
      ),
  );

  const message = await interaction.reply({
    embeds: [selected],
    components: [menu],
    flags: 64,
    fetchReply: true,
  });

  const collector = message.createMessageComponentCollector({ time: 180000 });
  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: "Это меню не для вас.", flags: 64 });
    }
    if (!i.isStringSelectMenu() || i.customId !== "help_category_select")
      return;
    const next = i.values[0];
    const embed = helpEmbeds[next] || helpEmbeds.main;
    await i.update({ embeds: [embed], components: [menu] });
  });

  collector.on("end", async () => {
    await interaction.editReply({ components: [] }).catch(() => {});
  });
}

function createMainHelp() {
  return new EmbedBuilder()
    .setColor("#b209d4")
    .setTitle("📖 Гайд по Verge RPG Bot")
    .setDescription("**Быстрая справка по основным командам**")
    .setImage("https://iili.io/BP3OOut.png")
    .addFields(
      {
        name: "👤 Профиль и персонаж",
        value:
          "`/register` - Создать нового персонажа\n`/profile` - Просмотреть профиль\n`/set-avatar <url>` - Установить аватар",
        inline: false,
      },
      {
        name: "🥋 Тренировка",
        value:
          "`/train-ap` — Физическая тренировка (+AP)\n`/train-sp` — Тренировка боевого стиля (+SP)\n`/social-rp` — Социальная сцена (+AP)\n`/styles-list` — Список боевых стилей",
        inline: false,
      },
      {
        name: "💰 Экономика",
        value:
          "`/shop` — Магазин свитков, эликсиров и редких заявок\n`/pay <user> <currency> <amount>` - Перевод валюты\n`/transfer-item <user> [quantity] [slot]` - Передача предмета\n`/exchange <currency> <amount>` - Обмен валюты\n`/inventory` - Инвентарь",
        inline: false,
      },
      {
        name: "⏱️ Полезно",
        value:
          "`/leaderboard [sort_by] [limit]` - Интерактивный рейтинг\n`/help [category]` - Эта справка",
        inline: false,
      },
      {
        name: "💡 Совет",
        value:
          "Используйте `/help [категория]` для подробной информации!\nНапример: `/help admin` для админских команд",
        inline: false,
      },
    )
    .setFooter({ text: "Выберите нужный раздел в меню ниже" });
}

function createProfileHelp() {
  return new EmbedBuilder()
    .setColor("#b209d4")
    .setTitle("👤 Команды профиля и персонажа")
    .setImage("https://iili.io/BP3OOut.png")
    .addFields(
      {
        name: "/register",
        value:
          "✅ **Создать нового персонажа**\nУсловия: Нужно быть зарегистрированным один раз\nПараметры:\n• `character_name` - Имя вашего персонажа\n• `avatar_url` (опционально) - URL аватара\n\n💡 Совет: Придумайте интересное имя!",
        inline: false,
      },
      {
        name: "/profile [user]",
        value:
          "✅ **Просмотреть профиль игрока**\nПараметры:\n• `user` (опционально) - Другой пользователь\n\n📊 Показывает:\n• AP и SP по стилям\n• Баланс валюты\n• Рейтинг в мастерстве\n• Статистику тренировок",
        inline: false,
      },
      {
        name: "/set-avatar <url>",
        value:
          "✅ **НОВОЕ! Установить аватар персонажа**\nПараметры:\n• `url` - Прямая ссылка на изображение\n\n🖼️ Поддерживаемые форматы:\n• JPG, PNG, GIF, WebP\n• Discord CDN ссылки\n\n💡 Пример: https://example.com/avatar.jpg",
        inline: false,
      },
      {
        name: "/inventory [user] [slot]",
        value:
          "✅ **Открыть интерактивный инвентарь**\nПараметры:\n• `user` — инвентарь другого игрока\n• `slot` — слот персонажа\n\n🎁 Можно выбрать предмет, прочитать его описание и увидеть точный эффект. Владелец также может использовать один предмет или всю стопку.",
        inline: false,
      },
    )
    .setFooter({ text: "👤 Категория: Профиль и персонаж" });
}

function createTrainingHelp() {
  return new EmbedBuilder()
    .setColor("#b209d4")
    .setTitle("🥋 Тренировка и боевые стили")
    .setImage("https://iili.io/BP3OOut.png")
    .addFields(
      {
        name: "/train-ap",
        value:
          "✅ **Физическая тренировка — получить AP**\n" +
          "Команда открывает форму для текста тренировки.\n" +
          "• Объём: **800–4 000 символов**\n" +
          "• Требуется связный текст без спама символами\n\n" +
          "⚡ Награды:\n" +
          "• +10 AP (базовое значение × множитель)\n" +
          "• Множитель: базовый% + бонус ранга + бонус активности\n" +
          "• Кулдаун: **5 часов**\n\n" +
          "📝 После отправки появится результат и фрагмент тренировки",
        inline: false,
      },
      {
        name: "/train-sp",
        value:
          "✅ **Развить изученный боевой стиль — получить SP**\n" +
          "Сначала выберите стиль из списка, затем заполните форму тренировки.\n" +
          "• Объём: **500–4 000 символов**\n" +
          "• Доступны только стили вашего активного персонажа\n\n" +
          "🥋 Награды:\n" +
          "• +10 SP (базовое значение × множитель)\n" +
          "• Уровни: Новичок → Владелец → Эксперт → Мастер\n" +
          "• Кулдаун: **5 часов**",
        inline: false,
      },
      {
        name: "/social-rp",
        value:
          "✅ **Социальное RP — получить AP**\n" +
          "Команда открывает форму для социальной сцены.\n" +
          "• Объём: **50–4 000 символов**\n" +
          "• Опишите действие и реакцию персонажа\n\n" +
          "⚡ Награды:\n" +
          "• +10 AP (с учётом множителя)\n" +
          "• Кулдаун: **12 часов**\n\n" +
          "🎭 После отправки появится результат и фрагмент сцены",
        inline: false,
      },
      {
        name: "/styles-list",
        value:
          "✅ **Просмотреть все боевые стили**\n\n" +
          "🥋 Показывает все стили из базы данных\n" +
          "💡 Для тренировки используйте `/train-sp` — доступный стиль выбирается из списка",
        inline: false,
      },
    )
    .setFooter({ text: "🥋 Категория: Тренировка" });
}

function createEconomyHelp() {
  return new EmbedBuilder()
    .setColor("#b209d4")
    .setTitle("💰 Команды экономики и валюты")
    .setImage("https://iili.io/BP3OOut.png")
    .addFields(
      {
        name: "/shop",
        value:
          "🛍️ **Открыть интерактивный магазин**\nСвитки AP/SP выдаются в инвентарь, временные эликсиры сразу усиливают тренировки, а артефакты, киберпротезы и мутации создают оплаченную заявку.\n\nРедкие заявки рассматривает Глава анкетологов или администратор. При отклонении оплата возвращается автоматически. Цены доступны в YEN и KRW по курсу магазина.",
        inline: false,
      },
      {
        name: "/pay <user> <krw/yen> <amount>",
        value:
          "✅ **Перевести валюту другому персонажу**\n• `user` — получатель\n• `currency` — KRW или YEN\n• `amount` — сумма до вычета налога\n• `slot` — слот получателя\n\n💸 Перед списанием появится точный расчёт. Налог составляет **2%** и вычитается из отправленной суммы.",
        inline: false,
      },
      {
        name: "/transfer-item <user> [quantity] [slot]",
        value:
          "📦 **Передать предмет персонажу**\nВыберите предмет из активного инвентаря, проверьте количество и подтвердите передачу. Можно передавать расходники, коллекционные предметы и вещи между своими слотами.",
        inline: false,
      },
      {
        name: "/exchange <currency> <amount>",
        value:
          "✅ **Обменять KRW и YEN**\n• `currency` — какую валюту отдать\n• `amount` — сумма обмена\n\n💱 Фиксированный курс: **1 ¥ = 9,4 ₩**. Перед обменом бот покажет точный результат и новые балансы; дробная часть округляется вниз.",
        inline: false,
      },
      {
        name: "/leaderboard [sort_by] [limit]",
        value:
          "✅ **Открыть интерактивный рейтинг**\n• `sort_by` — стартовая вкладка AP, SP, KRW или YEN\n• `limit` — от 5 до 15 персонажей на странице\n\n🏆 На каждой вкладке видны пьедестал топ-3, полный рейтинг и позиция вашего активного персонажа. Данные можно обновить отдельной кнопкой.",
        inline: false,
      },
      {
        name: "/use",
        value:
          "✅ **Открыть интерактивный инвентарь**\nВыберите предмет из списка и нажмите «Использовать 1» или «Использовать все».\n\n🎁 Расходники:\n• AP Tome (50) — +50 AP\n• SP Scroll: Muay Thai — +30 SP\n• SP Scroll: Muay Thai (50) — +50 SP\n\nКоллекционные предметы бот не расходует.",
        inline: false,
      },
    )
    .setFooter({ text: "💰 Категория: Экономика" });
}

function createAdminHelp() {
  return new EmbedBuilder()
    .setColor("#b209d4")
    .setTitle("🛡️ Админские команды")
    .setDescription("⚠️ Эти команды доступны только администраторам!")
    .setImage("https://iili.io/BP3OOut.png")
    .addFields(
      {
        name: "/announce <message> <target>",
        value:
          "✅ **Массовая рассылка в ЛС**\nОтправить объявление в embed формате участникам сервера\n📝 Параметры: message, target, user, title, color, image",
        inline: false,
      },
      {
        name: "/purge-offtop <prefix> <count> [user]",
        value:
          "✅ **Удалить оффтоп-сообщения по префиксу**\n" +
          "Параметры:\n" +
          "• `prefix` — префикс оффтопа: `((` или `//` и т.д.\n" +
          "• `count` — сколько сообщений просматривать (1–100)\n" +
          "• `user` *(необязательно)* — только сообщения этого участника\n\n" +
          "🗑️ Бот удаляет все совпавшие сообщения, результат виден только администратору",
        inline: false,
      },
      {
        name: "/add-ap <user> <amount>",
        value: "✅ Добавить AP игроку\nПример: `/add-ap @John 100`",
        inline: true,
      },
      {
        name: "/set-ap <user> <amount>",
        value: "✅ Установить AP игроку\nПример: `/set-ap @John 500`",
        inline: true,
      },
      {
        name: "/add-sp <user> <amount>",
        value: "✅ Добавить SP игроку\nПример: `/add-sp @John 50`",
        inline: true,
      },
      {
        name: "/set-sp <user> <amount>",
        value: "✅ Установить SP игроку\nПример: `/set-sp @John 200`",
        inline: true,
      },
      {
        name: "/add-currency <user> <krw> <yen>",
        value: "✅ Добавить валюту\nПример: `/add-currency @John 1000 500`",
        inline: true,
      },
      {
        name: "/set-currency <user> <krw> <yen>",
        value: "✅ Установить валюту\nПример: `/set-currency @John 5000 2000`",
        inline: true,
      },
      {
        name: "/add-style <name>",
        value:
          '✅ Создать новый боевой стиль\nПример: `/add-style "Lightning Fist"`',
        inline: true,
      },
      {
        name: "/delete-style <name>",
        value: '✅ Удалить боевой стиль\nПример: `/delete-style "Old Style"`',
        inline: true,
      },
      {
        name: "/give-item <user> [item] [quantity] [slot]",
        value:
          "✅ **Открыть центр выдачи предметов**\nВыберите готовый расходник из каталога или создайте новый AP-том, SP-свиток либо коллекционный предмет. Перед выдачей бот покажет редкость и эффект всей стопки.",
        inline: true,
      },
      {
        name: "/shop-order <order> <action> [reason]",
        value:
          "✅ **Обработать оплаченную заявку магазина**\nПосле фактической выдачи отмечает заказ выполненным. При отклонении безопасно возвращает игроку полную стоимость.",
        inline: true,
      },
      {
        name: "/shop-admin <действие>",
        value:
          "🛠️ **Управлять каталогом магазина**\nДобавление и редактирование карточек, цены, способа выдачи, недельного лимита, остатка и состояния товара. Доступно только администраторам сервера.",
        inline: true,
      },
      {
        name: "/give-style <user> <style>",
        value:
          '✅ Выдать боевой стиль\nПример: `/give-style @John "Muay Thai"`',
        inline: true,
      },
      {
        name: "/set-ap-multiplier <multiplier>",
        value: "✅ Множитель AP для всех\nПример: `/set-ap-multiplier 150`",
        inline: true,
      },
      {
        name: "/set-sp-multiplier <multiplier>",
        value: "✅ Множитель SP для всех\nПример: `/set-sp-multiplier 150`",
        inline: true,
      },
      {
        name: "/delete-user <user>",
        value: "✅ Удалить игрока и все его данные\nОсторожно! Это необратимо!",
        inline: true,
      },
    )
    .setFooter({ text: "🛡️ Категория: Администрирование" });
}

function createAllCommandsHelp() {
  return new EmbedBuilder()
    .setColor("#b209d4")
    .setTitle("📚 Основные команды Verge RPG")
    .setImage("https://iili.io/BP3OOut.png")
    .addFields(
      {
        name: "👤 Профиль (4)",
        value: "/register\n/profile\n/set-avatar\n/inventory",
        inline: true,
      },
      {
        name: "🥋 Тренировка (4)",
        value: "/train-ap\n/train-sp\n/social-rp\n/styles-list",
        inline: true,
      },
      {
        name: "💰 Экономика (6)",
        value: "/shop\n/pay\n/transfer-item\n/exchange\n/leaderboard\n/use",
        inline: true,
      },
      {
        name: "🛡️ Админ (17)",
        value:
          "/announce\n/purge-offtop\n/add-ap\n/set-ap\n/add-sp\n/set-sp\n/add-currency\n/set-currency\n/add-style\n/delete-style\n/give-item\n/shop-order\n/shop-admin\n/give-style\n/set-ap-multiplier\n/set-sp-multiplier\n/delete-user",
        inline: true,
      },
      {
        name: "📖 Справка (1)",
        value: "/help (эта команда)",
        inline: true,
      },
      {
        name: "🔍 Доступно в боте",
        value: "**51 slash-команда** — игровые, персональные и административные инструменты.",
        inline: true,
      },
    )
    .setFooter({ text: "📚 Основные команды для игроков" });
}
