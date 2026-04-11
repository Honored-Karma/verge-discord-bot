# Структура проекта Verge

```
verge-discord-bot/
├── commands/                # 36 слэш-команд
├── utils/
│   ├── db.js                # MongoDB: подключение, инициализация 10 коллекций
│   ├── dataManager.js       # ~40 функций работы с БД
│   ├── embeds.js            # Embed-билдеры, баннеры, кнопки профиля
│   ├── cooldowns.js         # Кулдауны, валидация текста тренировок
│   ├── adminCheck.js        # isAdmin / hasCommandPermission (роли)
│   ├── rankSystem.js        # Организации, ранги, зарплаты
│   ├── logs.js              # Логирование команд в БД и Discord-канал
│   ├── playerKey.js         # makePlayerKey(userId, slot)
│   ├── memberHelper.js      # resolveMember с guild fetch
│   ├── progressBar.js       # Прогресс-бары AP/SP
│   └── discohookParser.js   # Парсер Discohook JSON
├── services/
│   └── salaryService.js     # Еженедельные зарплаты (node-cron)
├── data/
│   └── default_items.json
├── .github/
│   ├── workflows/nodejs.yml
│   └── ISSUE_TEMPLATE/
├── index.js                 # Точка входа, загрузка команд, ephemeral-обёртка
├── deploy-commands.js       # Деплой команд в Discord API
├── .env.example
├── package.json
├── deploy.bat / run.bat     # Быстрый запуск (Windows)
└── setup.ps1                # Установка (PowerShell)
```

---

## Ключевые файлы

### index.js
Загружает все `commands/*.js`, подключается к MongoDB, запускает cron-зарплаты, обрабатывает slash-команды с автоматической конвертацией `ephemeral → flags: 64`.

### utils/dataManager.js
~40 экспортируемых функций: `getPlayer`, `createPlayer`, `addAP`, `setSP`, `transferCurrency`, `giveItem`, `getLeaderboard`, `exchangeCurrency`, `giveStyle`, `deletePlayer`, `setCharacterAvatar` и др.

### utils/db.js
`connectDatabase()` → создаёт 10 коллекций (`players`, `user_settings`, `styles`, `player_sp`, `inventory`, `admin_actions`, `command_logs`, `log_channels`, `progression_history`, `salary_logs`) с индексами. `getDB()` для доступа.

### utils/adminCheck.js
Три уровня доступа:
- **Full admin** — `ADMIN_IDS`, роль "Game Master", владелец сервера, Discord Administrator
- **Limited admin** — `LIMITED_ADMIN_ROLE_IDS` (add-ap, add-sp, add-currency, etc.)
- **Style giver** — `GIVE_STYLE_ROLE_IDS` (give-style, remove-player-style)

### services/salaryService.js
Cron-задача (`SALARY_CRON`). Каждую неделю начисляет валюту по организации/рангу из `rankSystem.js`.

---

## Как добавить команду

1. Создать `commands/my-command.js`
2. Экспортировать `data` (SlashCommandBuilder) и `execute(interaction)`
3. Запустить `npm run deploy`
