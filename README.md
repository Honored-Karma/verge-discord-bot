# 🤖 Verge - Discord RPG Bot

**Полнофункциональный Discord RPG бот с системой тренировок, боевых стилей, экономики и профилей!**

![Discord.js](https://img.shields.io/badge/discord.js-v14-blue?style=for-the-badge&logo=discord)
![MongoDB](https://img.shields.io/badge/MongoDB-6.5.0-green?style=for-the-badge&logo=mongodb)
![Node.js](https://img.shields.io/badge/Node.js-18+-darkgreen?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

---

## ✨ Особенности

### 🎮 Игровая механика
- **Регистрация персонажа** с уникальным именем и аватаром
- **Система тренировок** для повышения AP (Attack Power)
- **24 боевых стиля** с разными характеристиками
- **Социальные ролевые сценарии** для заработка SP (Style Points)
- **Система инвентаря** для хранения предметов

### 💰 Экономика
- **Двойная валюта**: KRW (корейская вона) и YEN (японская иена)
- **Обмен валют** с динамическим курсом
- **Платежи между игроками** `/pay`
- **Лидерборд** по AP, SP и богатству

### 👤 Профиль персонажа
- **Подробный профиль** с всей статистикой
- **Смена аватара** командой `/set-avatar`
- **Отслеживание прогресса** в каждом стиле боя
- **Просмотр инвентаря** и истории

### ⚙️ Администрирование
- **Команды для админов** для управления экономикой
- **Выдача стилей** и предметов
- **Управление множителями** AP и SP
- **Логирование действий**

---

## 🚀 Быстрый старт

### Требования
- **Node.js** 18 или выше
- **MongoDB Atlas** аккаунт (бесплатно)
- **Discord Bot Token** с необходимыми permissions

### Установка

1. **Клонируйте репозиторий**
```bash
git clone https://github.com/yourusername/verge-discord-bot.git
cd verge-discord-bot
```

2. **Установите зависимости**
```bash
npm install
```

3. **Настройте переменные окружения**
```bash
cp .env.example .env
```

Отредактируйте `.env`:
```env
DISCORD_TOKEN=ваш_токен_бота
CLIENT_ID=ID_вашего_бота
MONGODB_URI=mongodb+srv://пользователь:пароль@кластер.mongodb.net/?appName=Verge
```

4. **Запустите бота**
```bash
npm start
```

5. **Задеплойте команды в Discord** (один раз)
```bash
npm run deploy
```

---

## 📋 Доступные команды

### 👤 Профиль и персонаж
| Команда | Описание |
|---------|----------|
| `/register` | Создать нового персонажа |
| `/profile` | Просмотреть свой профиль (с пагинацией) |
| `/set-avatar <url>` | Установить аватар персонажа |
| `/inventory` | Просмотреть инвентарь |

### 🥋 Боевые стили
| Команда | Описание |
|---------|----------|
| `/train <style>` | Тренироваться в стиле боя |
| `/styles-list` | Список всех доступных стилей |
| `/social-rp <action>` | Социальное ролевое действие |

### 💪 Характеристики
| Команда | Описание |
|---------|----------|
| `/add-ap <user> <amount>` | Добавить AP |
| `/set-ap <user> <amount>` | Установить AP |
| `/add-sp <user> <amount>` | Добавить SP |
| `/set-sp <user> <amount>` | Установить SP |
| `/add-currency <user> <krw> <yen>` | Добавить деньги |

### 💰 Экономика
| Команда | Описание |
|---------|----------|
| `/pay <user> <krw/yen> <amount>` | Отправить деньги игроку |
| `/exchange <from> <to> <amount>` | Обменять валюту |
| `/leaderboard <type>` | Лидерборд (ap/sp/krw/yen) |
| `/use <item>` | Использовать предмет из инвентаря |

### 🛡️ Администрирование
| Команда | Описание |
|---------|----------|
| `/delete-user <user>` | Удалить игрока (админ) |
| `/set-ap-multiplier <multiplier>` | Установить множитель AP |
| `/set-sp-multiplier <multiplier>` | Установить множитель SP |
| `/set-currency <user> <krw> <yen>` | Установить денежный баланс |
| `/give-style <user> <style>` | Выдать стиль боя (админ) |
| `/give-item <user> <item>` | Выдать предмет (админ) |
| `/add-style <name>` | Создать новый стиль (админ) |
| `/delete-style <name>` | Удалить стиль (админ) |

### 📖 Справка
| Команда | Описание |
|---------|----------|
| `/help [category]` | **НОВОЕ!** Полный гайд по командам |

---

## 📚 Документация

- **[TUTORIAL.md](TUTORIAL.md)** - Подробный туториал по игре (700+ строк)
- **[START_HERE.md](START_HERE.md)** - Начните отсюда
- **[QUICKSTART.md](QUICKSTART.md)** - Быстрый старт за 5 минут
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Структура проекта

---

## 📁 Структура проекта

```
verge-discord-bot/
├── commands/                 # Все 24+ слэш-команды
│   ├── register.js
│   ├── profile.js
│   ├── train.js
│   ├── set-avatar.js
│   └── ... (и другие)
├── utils/
│   ├── db.js               # Подключение MongoDB
│   ├── dataManager.js      # 30+ функций работы с БД
│   ├── embeds.js           # Красивые embed-ы
│   ├── cooldowns.js        # Система кулдаунов
│   ├── adminCheck.js       # Проверка админских прав
│   └── progressBar.js      # Визуализация прогресса
├── data/
│   └── default_items.json  # Дефолтные предметы
├── sql/
│   └── init.sql            # Инициализация БД (справка)
├── .env.example            # Шаблон переменных окружения
├── .gitignore              # Git ignore файл
├── package.json            # Зависимости
├── deploy-commands.js      # Регистрация команд в Discord
└── index.js                # Главный файл бота
```

---

## 🗄️ База данных

Бот использует **MongoDB** с 5 основными коллекциями:

1. **players** - Данные игроков (имя, AP, SP, валюта, аватар и т.д.)
2. **styles** - Боевые стили (название, описание, требования)
3. **player_sp** - SP в каждом стиле для каждого игрока
4. **inventory** - Предметы в инвентаре
5. **admin_actions** - Логирование действий администраторов

База данных **автоматически инициализируется** при первом запуске!

---

## 🔧 Конфигурация

### Требуемые permissions для бота в Discord
- Read Messages/View Channels
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands

### Переменные окружения (.env)
```env
# Discord
DISCORD_TOKEN=токен_вашего_бота
CLIENT_ID=ID_приложения_бота

# MongoDB Atlas
MONGODB_URI=mongodb+srv://пользователь:пароль@кластер.mongodb.net/?appName=Verge
```

---

## 📊 Статистика

- **25+ Команд** готовых к использованию
- **30+ Функций** работы с БД
- **8 Боевых стилей** по умолчанию (легко добавлять новые)
- **MongoDB** для надёжного хранения данных
- **100% на русском языке** 🇷🇺
- **Подробный туториал** (TUTORIAL.md - 700+ строк)

---

## 🎨 Особенности интерфейса

- ✅ Красивые **embed-ы** с цветными полями
- ✅ **Пагинация** в профиле (навигационные кнопки)
- ✅ **Визуальные прогресс-бары** для показа уровня
- ✅ **Автоматические сообщения** удаляются через 30 сек
- ✅ **Система кулдаунов** для баланса
- ✅ **Эмодзи** на русском и английском

---

## 🐛 Известные проблемы и решения

### "Unknown interaction" ошибка
- Убедитесь, что бот отвечает в течение 3 секунд
- Используйте `await interaction.deferReply()` для долгих операций

### MongoDB connection error
- Проверьте IP в MongoDB Atlas Network Access
- Убедитесь, что пароль не содержит спецсимволы (или экранируйте их)

### Команды не видны в Discord
- Запустите `npm run deploy`
- Дождитесь 5-15 минут для синхронизации

---

## 📚 Документация

- [Discord.js Documentation](https://discord.js.org/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Discord Developer Portal](https://discord.com/developers)

---

## 🤝 Примеры использования

### Создание нового стиля
```javascript
await addStyle('Новый стиль', 'Описание стиля', 100, 50);
```

### Добавление предмета в инвентарь
```javascript
await addItemToInventory(playerId, 'Зелье здоровья', 5);
```

### Обновление профиля
```javascript
await setCharacterAvatar(playerId, 'https://example.com/avatar.jpg');
```

---

## 📝 Лицензия

MIT License - смотрите [LICENSE](LICENSE) файл для подробностей

---

## 👥 Автор

Создано с ❤️ для Discord сообщества

---

## 🎯 Планы развития

- [ ] Веб-панель администратора
- [ ] Система достижений
- [ ] PvP боевая система
- [ ] Клан система
- [ ] Магазин предметов
- [ ] Эвенты и квесты

---

## 💬 Вопросы и поддержка

Если у вас есть вопросы или проблемы:
1. Проверьте раздел **Известные проблемы**
2. Откройте **Issue** на GitHub
3. Напишите в Discord сообщество

---

**Спасибо за использование Verge! Приятной игры! 🎮**
