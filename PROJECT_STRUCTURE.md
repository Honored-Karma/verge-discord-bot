# 📁 Структура проекта Verge

```
verge-discord-bot/
│
├── 📂 .github/                          # GitHub конфигурация
│   ├── workflows/
│   │   └── nodejs.yml                  # CI/CD pipeline (автоматическая проверка)
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md               # Шаблон для bug reports
│       └── feature_request.md          # Шаблон для feature requests
│
├── 📂 commands/                        # Все 24+ slash-команд
│   ├── add-ap.js                       # Добавить AP (админ)
│   ├── add-currency.js                 # Добавить валюту (админ)
│   ├── add-sp.js                       # Добавить SP (админ)
│   ├── add-style.js                    # Создать стиль боя (админ)
│   ├── delete-style.js                 # Удалить стиль (админ)
│   ├── delete-user.js                  # Удалить игрока (админ)
│   ├── exchange.js                     # Обменять валюту
│   ├── give-item.js                    # Выдать предмет (админ)
│   ├── give-style.js                   # Выдать стиль (админ)
│   ├── inventory.js                    # Просмотреть инвентарь
│   ├── leaderboard.js                  # Лидерборд
│   ├── pay.js                          # Платёж игроку
│   ├── profile.js                      # Просмотр профиля
│   ├── register.js                     # Регистрация персонажа
│   ├── set-ap.js                       # Установить AP (админ)
│   ├── set-ap-multiplier.js            # Множитель AP (админ)
│   ├── set-avatar.js                   # Установить аватар ✨ NEW
│   ├── set-currency.js                 # Установить валюту (админ)
│   ├── set-sp.js                       # Установить SP (админ)
│   ├── set-sp-multiplier.js            # Множитель SP (админ)
│   ├── social-rp.js                    # Социальный RP
│   ├── styles-list.js                  # Список стилей
│   ├── train.js                        # Тренировка в стиле
│   └── use.js                          # Использовать предмет
│
├── 📂 utils/                           # Утилиты и вспомогательные функции
│   ├── db.js                           # ⚡ MongoDB подключение и инициализация
│   ├── dataManager.js                  # 📊 30+ функций для работы с БД
│   ├── embeds.js                       # 🎨 Красивые Discord embeds
│   ├── cooldowns.js                    # ⏱️  Система кулдаунов
│   ├── adminCheck.js                   # 🛡️  Проверка прав админа
│   └── progressBar.js                  # 📈 Визуализация прогресса
│
├── 📂 data/                            # Данные по умолчанию
│   └── default_items.json              # Дефолтные предметы и их свойства
│
├── 📂 sql/                             # Справочная информация БД
│   └── init.sql                        # Схема БД (справка для PostgreSQL)
│
├── 📂 logs/                            # Логи приложения
│   └── (создаются автоматически)
│
├── 📜 index.js                         # 🤖 ГЛАВНЫЙ файл бота
├── 📜 deploy-commands.js               # 📝 Регистрация команд в Discord
├── 📜 test-mongodb.js                  # 🧪 Тест подключения к MongoDB
├── 📜 migrate-to-mongodb.js            # 🔄 Скрипт миграции (справка)
│
├── 📋 .env                             # ⚙️  Переменные окружения (НЕ в git!)
├── 📋 .env.example                     # 📋 Пример переменных окружения
├── 📋 .gitignore                       # 🚫 Какие файлы игнорировать
│
├── 🎀 README.md                        # ⭐ Главная документация
├── 🎀 QUICKSTART.md                    # 🚀 Быстрый старт за 5 минут
├── 🎀 CONTRIBUTING.md                  # 🤝 Гайд для контрибьютеров
├── 🎀 CHANGELOG.md                     # 📜 История изменений
├── 🎀 GITHUB_SETUP.md                  # 📤 Как загрузить на GitHub
├── 🎀 LICENSE                          # ⚖️  MIT License
│
├── 📦 package.json                     # 📦 Зависимости и скрипты
├── 📦 package-lock.json                # 🔒 Точные версии зависимостей
│
├── 🟠 run.bat                          # ▶️  Быстрый запуск (Windows)
├── 🟠 deploy.bat                       # 📝 Deploy команд (Windows)
└── 🟡 setup.ps1                        # ⚙️  Скрипт установки (PowerShell)
```

---

## 🔑 Ключевые файлы

### 🤖 index.js - Главный файл
- Инициализирует Discord.js клиент
- Загружает все команды из папки `commands/`
- Подключается к MongoDB
- Обрабатывает события взаимодействия (commands)
- Управляет graceful shutdown

### 📊 utils/dataManager.js - Сердце приложения
Содержит 30+ функций для работы с БД:
- `getPlayer()`, `createPlayer()` - работа с игроками
- `addAP()`, `setAP()` - управление AP
- `addSP()`, `setSP()` - управление SP
- `addItemToInventory()` - работа с предметами
- `getLeaderboard()` - рейтинги
- И много других...

### ⚡ utils/db.js - MongoDB управление
- `connectDatabase()` - подключение к MongoDB Atlas
- `initializeDatabase()` - автоматическое создание коллекций и индексов
- `getDB()` - получить экземпляр БД
- `closeDatabase()` - graceful shutdown

### 🎨 utils/embeds.js - UI компоненты
Создает красивые embed-ы для:
- Профилей игроков
- Ошибок и успеха
- Информационных сообщений
- Лидербордов

### ⏱️  utils/cooldowns.js - Балансировка
- Управляет кулдаунами команд
- Предотвращает спам
- Отслеживает последние использования

---

## 🗄️ MongoDB Коллекции

### players
```javascript
{
  id: "userId",
  username: "userName",
  character_name: "персонаж",
  character_avatar: "url",
  ap: 100,
  krw: 0,
  yen: 0,
  ap_multiplier: 100.0,
  sp_multiplier: 100.0,
  unlocked_avatar: 0,
  created_at: Date
}
```

### styles
```javascript
{
  name: "Название стиля",
  description: "Описание",
  requirements: { ap: 100 },
  created_by: "userId"
}
```

### player_sp
```javascript
{
  player_id: "userId",
  style_id: "styleId",
  sp: 50,
  rank: "Novice"
}
```

### inventory
```javascript
{
  player_id: "userId",
  item_id: "itemId",
  quantity: 5,
  acquired_at: Date
}
```

### admin_actions
```javascript
{
  admin_id: "userId",
  action: "add-ap",
  target_user: "userId",
  details: { amount: 100 },
  timestamp: Date
}
```

---

## 🔄 Как работает бот

1. **Запуск** (`npm start`)
   - index.js загружает все команды
   - Подключается к MongoDB
   - Авторизуется в Discord

2. **Пользователь пишет команду** (`/register`)
   - Discord отправляет interaction
   - index.js маршрутизирует в команду (commands/register.js)
   - Команда вызывает функции из dataManager.js
   - dataManager.js работает с MongoDB через db.js
   - Команда отправляет красивый embed через embeds.js

3. **Фоновые процессы**
   - Система кулдаунов отслеживает время
   - Валидация входных данных
   - Проверка прав администратора
   - Логирование действий

---

## 🎯 Важные константы

**Роли для админа:** Проверяется через `adminCheck.js`

**Система рангов:**
- Novice: 0-349 SP
- Owner: 350-999 SP
- Expert: 1000-2499 SP
- Master: 2500+ SP

**Кулдауны:**
- Глобальный: 1 сек между командами
- Тренировка: 5 часов
- Social RP: 12 часов

---

## 📈 Как добавить новую команду

1. Создайте файл `commands/my-command.js`
2. Экспортируйте `data` (SlashCommandBuilder) и `execute` (функция)
3. Используйте функции из `dataManager.js` для БД
4. Используйте `embeds.js` для красивого UI
5. Проверьте администраторское право через `adminCheck.js` если нужно
6. Запустите `npm run deploy` чтобы зарегистрировать команду

---

**Структура создана для масштабирования и удобства! 🚀**
