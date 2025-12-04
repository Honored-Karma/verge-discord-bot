# Discord RPG Bot - MongoDB Setup

## ✅ Что было сделано

Твой бот полностью мигрирован с PostgreSQL на MongoDB. Вот что изменилось:

### 📝 Измененные файлы:

1. **`package.json`**
   - Удалены: `pg`, `better-sqlite3`
   - Добавлен: `mongodb` ^6.5.0

2. **`utils/db.js`** - полностью переписан
   - Теперь использует MongoClient из MongoDB
   - Автоматически создает все коллекции при старте
   - Создает нужные индексы для оптимизации

3. **`utils/dataManager.js`** - все функции переписаны для MongoDB
   - `getPlayer()`, `createPlayer()` - работают с collections
   - `addAP()`, `setSP()`, `addCurrency()` - используют MongoDB операторы
   - `getAllPlayerSP()` - использует aggregation pipeline
   - И все остальные функции готовы к MongoDB

### 🗄️ Структура базы данных (MongoDB)

Твоя MongoDB будет иметь эти коллекции (создаются автоматически):

```
discord_bot (database)
├── players
│   ├── id (unique index)
│   ├── username
│   ├── character_name
│   ├── character_avatar
│   ├── krw (корейские воны)
│   ├── yen (йены)
│   ├── ap (очки способности)
│   ├── sp_multiplier
│   ├── ap_multiplier
│   ├── last_train_timestamp
│   ├── last_socialrp_timestamp
│   └── unlocked_avatar
│
├── styles
│   ├── id (unique)
│   ├── name (unique index)
│   ├── created_by
│   └── created_at
│
├── player_sp
│   ├── player_id + style_id (composite unique index)
│   └── sp
│
├── inventory
│   ├── player_id (indexed)
│   ├── item_name
│   └── qty
│
└── admin_actions
    ├── admin_id (indexed)
    ├── action
    ├── details
    └── timestamp (indexed)
```

## 🚀 Как запустить

### 1. Установи зависимости
```bash
npm install
```

### 2. Настрой переменные окружения

Создай файл `.env` в корне проекта (или используй существующий):

```env
DISCORD_TOKEN=твой_дискорд_токен
CLIENT_ID=твой_client_id

# Твой MongoDB URI (у тебя уже есть в secrets)
MONGODB_URI=mongodb+srv://zerokarma08_db_user:пароль@verge.kh04id7.mongodb.net/?appName=Verge
```

### 3. Развей команды на сервер
```bash
npm run deploy
```

### 4. Запусти бота
```bash
npm start
```

## 📚 Функции которые теперь работают с MongoDB:

Все функции в `utils/dataManager.js` готовы:
- ✅ `getPlayer()` - получить игрока
- ✅ `createPlayer()` - создать нового игрока
- ✅ `addAP()`, `setAP()` - управление AP
- ✅ `addSP()`, `setSP()` - управление SP по стилям
- ✅ `getLeaderboard()` - топ игроков
- ✅ `giveItem()`, `useItem()` - система инвентаря
- ✅ `addCurrency()`, `setCurrency()`, `exchangeCurrency()` - валюты
- ✅ `addStyle()`, `deleteStyle()`, `giveStyle()` - управление стилями
- ✅ `deletePlayer()` - удаление игрока (каскадно удалит всё)
- ✅ И все остальные...

## 🔄 Все команды работают так же!

Все команды в папке `commands/` работают **без изменений**, потому что они используют функции из `dataManager.js`, которые теперь работают с MongoDB.

## 💡 Преимущества MongoDB для твоего бота:

1. **Простота** - JSON-подобная структура (JavaScript native)
2. **Масштабируемость** - легко расширять структуру
3. **Гибкость** - не нужны миграции как в SQL
4. **Atlas бесплатный уровень** - 512 MB storage (достаточно для RPG)
5. **Быстро** - индексы уже настроены

## ❓ Если что-то не работает

Проверь:
1. MONGODB_URI верный в `.env`
2. Интернет подключение есть
3. IP адрес компьютера добавлен в MongoDB Atlas (или 0.0.0.0)
4. Node.js v16+ установлен

Все! Бот готов к запуску! 🚀
