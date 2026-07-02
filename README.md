# 🤖 Verge — Discord RPG Bot

**Discord RPG бот с тренировками, боевыми стилями, двойной экономикой, слот-системой персонажей, зарплатами и логированием.**

![Discord.js](https://img.shields.io/badge/discord.js-v14-blue?style=for-the-badge&logo=discord)
![MongoDB](https://img.shields.io/badge/MongoDB-6-green?style=for-the-badge&logo=mongodb)
![Node.js](https://img.shields.io/badge/Node.js-18+-darkgreen?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

---

## ✨ Возможности

- **36 слэш-команд** — регистрация, тренировки, экономика, администрирование
- **Система слотов** — до 2 персонажей на одного пользователя (`/slot`, `/register slot:2`)
- **AP / SP прогрессия** — очки способностей и очки стилей с множителями и бонусами за ранг/активность
- **Двойная валюта** — KRW и YEN, обмен по курсу 1 ¥ = 9.4 ₩
- **Еженедельные зарплаты** — автоматические выплаты по организации и рангу (cron)
- **Ролевая система прав** — ADMIN_IDS, LIMITED_ADMIN_ROLE_IDS, GIVE_STYLE_ROLE_IDS
- **Логирование команд** — запись в БД + пересылка в лог-канал (`/log-enable`, `/log-disable`)
- **Профиль с пагинацией** — 4 страницы: основная, AP/SP, стили, баланс + история
- **Красивые embed-ы** — баннеры, прогресс-бары, кнопки навигации
- **MongoDB Atlas** — автоматическая инициализация 10 коллекций с индексами

---

## 🚀 Быстрый старт

### Требования
- **Node.js** 18+
- **MongoDB Atlas** (бесплатный кластер)
- **Discord Bot Token**

### Установка

```bash
git clone https://github.com/your-username/verge-discord-bot.git
cd verge-discord-bot
npm install
cp .env.example .env   # заполните своими значениями
npm run deploy          # зарегистрировать команды в Discord
npm start               # запустить бота
```

Подробнее: [QUICKSTART.md](QUICKSTART.md)

---

## 📋 Команды (36)

### 👤 Персонаж
| Команда | Описание |
|---------|----------|
| `/register` | Создать персонажа (опц. `slot:2`) |
| `/profile` | Профиль с пагинацией (4 страницы) |
| `/set-avatar` | Установить аватар персонажа |
| `/set-rank` | Установить ранг (админ) |
| `/slot` | Переключить активный слот |
| `/slots` | Просмотреть все слоты |
| `/inventory` | Инвентарь персонажа |
| `/ranks-info` | Таблица рангов и организаций |

### 🥋 Тренировка и стили
| Команда | Описание |
|---------|----------|
| `/train` | Тренировка (AP, кулдаун 2ч) |
| `/social-rp` | Социальный RP (AP/SP, кулдаун 2ч) |
| `/styles-list` | Список стилей с пагинацией |
| `/add-style` | Создать стиль (админ) |
| `/delete-style` | Удалить стиль (админ) |
| `/give-style` | Выдать стиль игроку |
| `/remove-player-style` | Убрать стиль у игрока |

### 💰 Экономика
| Команда | Описание |
|---------|----------|
| `/pay` | Перевод валюты (2% налог) |
| `/exchange` | Обмен KRW ↔ YEN |
| `/leaderboard` | Рейтинг (ap / sp / krw / yen) |
| `/use` | Использовать предмет |

### ⚙️ Администрирование
| Команда | Описание |
|---------|----------|
| `/add-ap` | Добавить AP |
| `/set-ap` | Установить AP |
| `/add-sp` | Добавить SP |
| `/set-sp` | Установить SP |
| `/add-currency` | Добавить валюту |
| `/deduct-currency` | Списать валюту |
| `/set-currency` | Установить баланс |
| `/set-ap-multiplier` | Множитель AP (50–500%) |
| `/set-sp-multiplier` | Множитель SP (50–500%) |
| `/give-item` | Выдать предмет |
| `/delete-user` | Удалить персонажа |

### � Логи и утилиты
| Команда | Описание |
|---------|----------|
| `/log-enable` | Включить лог-канал |
| `/log-disable` | Отключить лог-канал |
| `/logs` | Просмотреть последние логи |
| `/help` | Справка по командам |
| `/render-ui` | Рендер Discohook JSON |
| `/components-demo` | Демо компонентов |

---

## 📁 Структура проекта

```
verge-discord-bot/
├── commands/            # 36 слэш-команд
├── utils/
│   ├── db.js            # Подключение MongoDB, инициализация коллекций
│   ├── dataManager.js   # ~40 функций работы с БД
│   ├── embeds.js        # Embed-билдеры, баннеры, кнопки
│   ├── cooldowns.js     # Кулдауны и валидация текста
│   ├── adminCheck.js    # Проверка прав (admin / limited / style-giver)
│   ├── rankSystem.js    # Организации, ранги, зарплаты
│   ├── logs.js          # Логирование команд в БД и канал
│   ├── playerKey.js     # Генерация ключа слота
│   ├── memberHelper.js  # Resolve member с fetch
│   ├── progressBar.js   # Прогресс-бары
│   └── discohookParser.js # Парсер Discohook JSON
├── services/
│   └── salaryService.js # Еженедельные зарплаты (cron)
├── data/
│   └── default_items.json
├── index.js             # Точка входа
├── deploy-commands.js   # Деплой команд в Discord API
├── .env.example         # Шаблон переменных окружения
└── package.json
```

---

## 🗄️ База данных

MongoDB, 10 коллекций (создаются автоматически):

| Коллекция | Назначение |
|-----------|-----------|
| `players` | Персонажи (AP, валюта, ранг, множители, аватар) |
| `user_settings` | Активный слот пользователя |
| `styles` | Боевые стили |
| `player_sp` | SP игрока по каждому стилю |
| `inventory` | Предметы |
| `admin_actions` | Лог админских действий |
| `command_logs` | Лог всех команд |
| `log_channels` | Каналы для пересылки логов |
| `progression_history` | История изменений AP/SP |
| `salary_logs` | Лог выплат зарплат |

---

## 🔧 Конфигурация (.env)

```env
DISCORD_TOKEN=...          # Токен бота (обязательно)
CLIENT_ID=...              # ID приложения (обязательно)
MONGODB_URI=...            # MongoDB URI (обязательно)
GUILD_ID=...               # ID сервера (для guild deploy)
ADMIN_IDS=id1,id2          # ID полных админов
LIMITED_ADMIN_ROLE_IDS=... # Роли для add-ap, add-sp и т.п.
GIVE_STYLE_ROLE_IDS=...    # Роли для give-style
SALARY_CRON=0 12 * * 1    # Расписание зарплат (по умолчанию: пн 12:00 UTC)
SALARY_LOG_CHANNEL_ID=...  # Канал для отчёта о зарплатах
```

Полный список — см. [.env.example](.env.example)

---

## 🐛 FAQ

**"Unknown interaction"** — бот не успевает ответить за 3 сек. Используйте `deferReply()`.

**MongoDB connection error** — проверьте IP в Atlas Network Access и корректность URI.

**Команды не видны** — выполните `npm run deploy` и подождите до 15 минут.

---

## 📚 Документация

- [TUTORIAL.md](TUTORIAL.md) — полный туториал по игре
- [QUICKSTART.md](QUICKSTART.md) — быстрый старт
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — структура проекта
- [CONTRIBUTING.md](CONTRIBUTING.md) — как участвовать в разработке
- [CHANGELOG.md](CHANGELOG.md) — история изменений

---

## � Лицензия

MIT — см. [LICENSE](LICENSE)
