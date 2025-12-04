# 🚀 MongoDB Setup Checklist

## ✨ Что было сделано за тебя:

- ✅ `package.json` обновлен - `mongodb` вместо `pg` и `better-sqlite3`
- ✅ `utils/db.js` полностью переписан для MongoDB с автоинициализацией
- ✅ `utils/dataManager.js` все функции переписаны для MongoDB
- ✅ `.env.example` обновлен правильно для MongoDB
- ✅ Все команды в `/commands` не требуют изменений (используют dataManager)

## 📋 Что нужно сделать ТОП (важно!):

### 1️⃣ Проверь твой MongoDB URI в secrets

Он должен выглядеть вот так:
```
mongodb+srv://zerokarma08_db_user:ПАРОЛЬ@verge.kh04id7.mongodb.net/?appName=Verge
```

Замени `ПАРОЛЬ` на реальный пароль.

### 2️⃣ Добавь MONGODB_URI в .env

Открой `.env` файл и убедись что есть:
```env
DISCORD_TOKEN=твой_токен
CLIENT_ID=твой_id
MONGODB_URI=mongodb+srv://zerokarma08_db_user:пароль@verge.kh04id7.mongodb.net/?appName=Verge
```

### 3️⃣ Убедись что MongoDB Atlas доступна

Зайди в MongoDB Atlas:
1. Перейди в "Network Access"
2. Убедись что твой IP добавлен (или 0.0.0.0/0 для разработки)
3. Проверь что ты в правильном проекте

### 4️⃣ Установи зависимости

```bash
npm install
```

Это установит `mongodb@6.5.0` вместо PostgreSQL драйверов.

### 5️⃣ Готово!

При первом запуске бот автоматически:
- ✅ Подключится к MongoDB
- ✅ Создаст БД `discord_bot`
- ✅ Создаст все нужные коллекции
- ✅ Создаст индексы для оптимизации

## 🗂️ Коллекции которые создадутся автоматически:

| Коллекция | Назначение | Индексы |
|-----------|-----------|---------|
| `players` | Профили игроков | `id` (unique) |
| `styles` | Стили/скиллы | `name` (unique) |
| `player_sp` | SP каждого игрока по стилю | `player_id`, `style_id` (composite unique) |
| `inventory` | Инвентарь игроков | `player_id` |
| `admin_actions` | Логи админ действий | `admin_id`, `timestamp` |

## 🔍 Проверка что всё работает

После запуска бота ты должен увидеть:
```
✅ Connected to MongoDB
✅ Database initialized successfully
🤖 Bot is ready!
```

## 💡 Если есть данные в старой PostgreSQL

Используй миграционный скрипт:
```bash
node migrate-to-mongodb.js
```

Перенесет все данные из PostgreSQL в MongoDB.

## ❓ Частые проблемы:

### "MONGODB_URI not found in environment variables!"
→ Добавь `MONGODB_URI` в `.env`

### "connect ECONNREFUSED"
→ Проверь интернет, URL правильный, IP добавлен в Atlas

### "MongoError: not authorized"
→ Пароль в URI неверный или пользователь не имеет доступа

### "Error: timeout waiting for replication"
→ Скорее всего медленный интернет, попробуй позже

## 📞 Нужна помощь?

Если что-то не работает:
1. Проверь консоль ошибок
2. Убедись что MONGODB_URI в `.env`
3. Проверь MongoDB Atlas доступна
4. Перепроверь пароль в URI

**Все готово к запуску! 🎉**
