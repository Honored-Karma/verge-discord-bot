# Руководство по развертыванию Verge TRP Portal (Production Deployment Guide)

Настоящий документ содержит пошаговую инструкцию по безопасному развертыванию и сопровождению экосистемы **Verge TRP** (Discord Bot + Web Portal + REST API + Knowledge Base).

Требуются **Node.js 22.12+** и MongoDB **replica set** либо sharded cluster (MongoDB Atlas подходит). Переводы, покупки, расход предметов, SP-тренировки и выдача наград используют транзакции. На standalone MongoDB эти операции отклоняются до списания, без перехода к небезопасным компенсирующим записям.

Зависимости устанавливаются через `npm ci` и `npm --prefix web ci` по двум включённым в Git lock-файлам. Для проверки: `npm test`, `npm run web:build`, `npm audit`, `npm --prefix web audit`.

Для веб-авторизации задайте `GUILD_ID` и токен бота с доступом к серверу: роли повторно проверяются перед каждым изменяющим API-запросом, чтения используют кеш на 60 секунд. Недоступность проверки возвращает 503 и не сохраняет административные права из старой сессии.

При обновлении сохраните резервную копию и выполните `npm run migrate:public-ids`, чтобы исправить ссылки персонажей, созданных старой версией без `slug`/`public_id`. Новые персонажи получают их при создании. Начатые старой версией незавершённые операции без квитанций требуют сверки по балансу/инвентарю и логам; автоматически повторять их нельзя.

---

## 1. Архитектура приложения

Приложение функционирует как единый долгоживущий Node.js процесс:
- **Discord Gateway Client**: постоянное WebSocket-соединение с Discord API для обработки слэш-команд, боевой системы и модальных окон.
- **Express API & Web Server**: обслуживание HTTP/HTTPS запросов, Discord OAuth2 авторизации, публичного API, панели администратора и отдачи бандла веб-портала.
- **MongoDB Database**: хранение данных игроков, инвентарей, квенты/анкет, энциклопедии (Wiki), сессий и журнала аудита.
- **In-Process Schedulers**: еженедельная выплата зарплат (CRON), проверка истечения временных множителей AP/SP.

> [!IMPORTANT]
> Приложение **нельзя** развертывать в serverless-средах (например, Vercel Serverless / AWS Lambda), так как для работы Discord-бота и планировщика требуется постоянный процесс с активным WebSocket. Рекомендуются платформы постоянных контейнеров/процессов: **Railway, Fly.io, Render, DigitalOcean App Platform, Hetzner VPS / Ubuntu Server (Docker / PM2)**.

---

## 2. Необходимые переменные окружения (.env)

Перед запуском убедитесь, что в рабочей среде заданы следующие переменные:

| Переменная | Описание | Пример значения |
| :--- | :--- | :--- |
| `NODE_ENV` | Режим работы | `production` |
| `PORT` | Порт веб-сервера | `3000` |
| `WEB_BASE_URL` | Публичный HTTPS URL проекта | `https://vergetrp.ru` |
| `MONGODB_URI` | Строка подключения к MongoDB Atlas | `mongodb+srv://verge_app:PASSWORD@cluster.mongodb.net/discord_bot` |
| `SESSION_SECRET` | 64-символьный ключ шифрования сессий | *Сгенерируйте через crypto.randomBytes(32)* |
| `TRUST_PROXY` | Количество прокси (1 для Cloudflare/Railway/Nginx) | `1` |
| `DISCORD_TOKEN` | Токен Discord-бота | *Токен из Developer Portal* |
| `DISCORD_CLIENT_ID` | Client ID Discord приложения | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | Client Secret для OAuth2 | *Секрет из Developer Portal* |
| `DISCORD_REDIRECT_URI` | Callback URL OAuth2 | `https://vergetrp.ru/api/auth/discord/callback` |
| `GUILD_ID` | ID официального Discord-сервера | `987654321098765432` |
| `ADMIN_IDS` | Discord ID главных администраторов (через запятую) | `111222333444555666` |
| `ADMIN_ROLE_IDS` | ID роли Администратора | `888777666555444333` |
| `ANKETOLOG_ROLE_IDS`| ID роли Анкетолога | `777666555444333222` |
| `MODERATOR_ROLE_IDS`| ID роли Модератора | `666555444333222111` |

---

## 3. Настройка Discord Developer Portal

1. Перейдите в [Discord Developer Portal](https://discord.com/developers/applications).
2. В разделе **Bot**:
   - Включите **Server Members Intent** и **Message Content Intent**.
   - Скопируйте токен в `DISCORD_TOKEN`.
3. В разделе **OAuth2 -> General**:
   - В поле **Redirects** добавьте точный URL: `https://<ВАШ_ДОМЕН>/api/auth/discord/callback`.
   - Скопируйте **Client ID** и **Client Secret**.

---

## 4. Подготовка базы данных MongoDB Atlas

1. Создайте отдельного пользователя базы данных (например, `verge_app_user`) с ограниченными правами **readWrite** только для базы `discord_bot`. **Не используйте суперпользователя `admin` / `atlasAdmin`**.
2. В **Network Access** разрешите IP-адрес вашего production сервера (или `0.0.0.0/0`, если платформа использует плавающие IP).
3. Индексы коллекций создаются автоматически при первом старте сервера через `utils/db.js`.

---

## 5. Первоначальный запуск и импорт данных (Runbook)

Последовательность команд при первом развертывании:

```bash
# 1. Установка зависимостей и сборка веб-приложения
npm run build

# 2. Выполнение безопасной миграции стабильных публичных слагов
npm run migrate:public-ids

# 3. Импорт принятых анкет персонажей из базы/Discord
npm run applications:import

# 4. Импорт канонического лора в базу знаний Wiki (24 статьи)
npm run wiki:import

# 5. Запуск основного сервера
npm start
```

---

## 6. Проверка работоспособности (Health & Readiness)

- **Liveness Probe**: `GET https://<ДОМЕН>/api/health` $\rightarrow$ возвращает HTTP 200 `{ status: 'ok', uptime: ... }`.
- **Readiness Probe**: `GET https://<ДОМЕН>/api/health/ready` $\rightarrow$ возвращает HTTP 200 `{ status: 'ready', database: 'ready', discord: 'ready' }`.
- **Robots**: `GET https://<ДОМЕН>/robots.txt` $\rightarrow$ проверяет запрет индексации `/admin` и `/api`.
- **Sitemap**: `GET https://<ДОМЕН>/sitemap.xml` $\rightarrow$ содержит ссылки на опубликованные статьи Wiki, принятые анкеты и персонажей.

---

## 7. Стратегия резервного копирования (Backup & Disaster Recovery)

### Что подлежит обязательному бэкапу:
1. `players` (персонажи, статы, балансы KRW/JPY, ранги, организации).
2. `user_settings` (настройки слотов игроков).
3. `inventory` (предметы игроков).
4. `player_sp` (изученные стили и боевой опыт).
5. `applications` (принятые анкеты).
6. `wiki_articles` (особенно статьи с флагом `is_manually_overridden: true`).
7. `admin_actions` (журнал аудита действий).

### Создание резервной копии:
```bash
mongodump --uri="mongodb+srv://user:password@cluster.mongodb.net/discord_bot" --out=./backups/backup_$(date +%Y%m%d_%H%M%S)
```

### Восстановление:
```bash
mongorestore --uri="mongodb+srv://user:password@cluster.mongodb.net/discord_bot" --nsInclude="discord_bot.*" ./backups/backup_FOLDER/discord_bot
```
