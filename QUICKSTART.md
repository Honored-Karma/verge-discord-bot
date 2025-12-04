# ⚡ Быстрый старт (5 минут)

## Шаг 1: Проверь `.env` файл

Открой `.env` в корне проекта и убедись что там есть:

```env
DISCORD_TOKEN=MTQ0MTg2NDcyMjQzMjY1OTcwOA.G7tIOJ.DTZ9_FNzxvmBadGXSdLBkUouhvBgmvAOMNDHOU
CLIENT_ID=1441864722432659708
MONGODB_URI=mongodb+srv://zerokarma08_db_user:ПАРОЛЬ@verge.kh04id7.mongodb.net/?appName=Verge
```

⚠️ **Важно:** Замени `ПАРОЛЬ` на реальный пароль от MongoDB.

## Шаг 2: Установи зависимости

```bash
npm install
```

Это установит `mongodb` и все остальные пакеты.

## Шаг 3: Развей команды на сервер

```bash
npm run deploy
```

Это добавит все слэш-команды на твой Discord сервер.

## Шаг 4: Запусти бота

```bash
npm start
```

Ты должен увидеть:
```
✅ Connected to MongoDB
✅ Database initialized successfully
🤖 Bot is ready! Logged in as YourBotName#0000
📊 Serving X server(s)
```

## ✅ Готово!

Твой бот теперь использует MongoDB и готов к работе!

---

## 🆘 Если что-то не работает

### "MONGODB_URI not found"
→ Добавь `MONGODB_URI=...` в `.env`

### "connect ECONNREFUSED" 
→ Проверь интернет и URL в `.env`

### "Authentication failed"
→ Неверный пароль в `MONGODB_URI`

### Ещё вопросы?
Читай `MONGODB_SETUP.md` и `MIGRATION_GUIDE.md`

---

**Дальше просто используй бота как обычно!** 🎉
