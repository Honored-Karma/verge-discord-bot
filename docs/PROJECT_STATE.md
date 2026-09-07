# Состояние проекта Verge TRP (Project State)

Документ фиксирует актуальный статус кодовой базы, архитектурные решения и техническое состояние экосистемы **Verge TRP** по итогам выполнения этапов 1–8.

---

## 1. Что реализовано на Этапах 1–8

| Этап | Название | Ключевые результаты |
| :--- | :--- | :--- |
| **Этап 1** | **Аудит & Архитектурный план** | Аудит существующего Discord-бота, инвентаря, боевых стилей и экономики; план разделения на сервисы без нарушения обратной совместимости. |
| **Этап 2** | **Backend Foundation** | Создание сервисного слоя (`playerService`, `inventoryService`, `authService`), Express 5 API, Discord OAuth2 авторизация, сессии MongoStore, CSRF & CORS защита. |
| **Этап 3** | **Character & Inventory** | Публичные и приватные профили персонажей, переключение слотов (1 и 2), отображение боевых стилей и физических статов, фильтрация и инспекция инвентаря, адаптивный UI (Desktop + Mobile). |
| **Этап 4 / 4.1** | **Applications & Public Identity** | Внедрение стабильных публичных слагов (`slug`, `public_id`), скрытие внутренних Discord ID из URL, каталог и детальные карточки принятых анкет (`/applications`), парсер анкет. |
| **Этап 5 / 5.1** | **Каноническая Wiki** | Импортер 24 канонических статей лора по 8 категориям, хэширование происхождения (`provenance`), связи статей с персонажами, OpenGraph/SEO метатеги (`metaInjector`), санитизация HTML. |
| **Этап 6** | **Панель администратора (Admin Panel)** | Гранулярная модель прав (`permissionService`), каталог контента, Markdown-редактор с live preview, оптимистичная блокировка (`409 Conflict`), сохранение ручных правок (`is_manually_overridden`), журнал аудита (`admin_actions`). |
| **Этап 7** | **Глобальный поиск (Global Search)** | Единый сервис поиска по персонажам, анкетам и Wiki, ранжирование релевантности (100–15 баллов), оверлей поиска (`Ctrl+K`), специализированная страница `/search?q=...`. |
| **Этап 8** | **Production Hardening & Deployment Prep** | Валидатор `config/env.js`, изоляция demo-данных от production, Graceful Shutdown (`SIGINT`/`SIGTERM`), CSP/HSTS заголовки, `robots.txt`, `sitemap.xml`, Code Splitting фронтенда (уменьшение бандла на 40%), `0 vulnerabilities`, `DEPLOYMENT.md`, `RELEASE_CHECKLIST.md`. |

---

## 2. Текущий стек технологий

- **Backend Runtime**: Node.js (LTS v20+), ES Modules (`import`/`export`).
- **Discord Bot**: `discord.js` (v14.25.1), Slash Commands, Modals, REST API, Gateway WebSocket.
- **Web Server & API**: Express (v5.2.1), `express-session`, `connect-mongo`, `helmet`, `cors`, `compression`, `express-rate-limit`.
- **Database**: MongoDB (v6.21.0 Native Driver), MongoDB Atlas.
- **Frontend SPA**: React 18, Vite 5, React Router 6 (с `React.lazy` и `Suspense`), Lucide React, Vanilla CSS Design System.
- **Тестирование**: Встроенный Node.js Test Runner (`node --test`), 106 модульных и интеграционных тестов.

---

## 3. Структура проекта

```
verge-discord-bot/
├── assets/                  # Иконки, шрифты (InterCyr.ttf) и статические ассеты
├── commands/                # 51 слэш-команда Discord-бота
├── config/                  # Централизованная конфигурация и валидатор ENV (env.js)
├── data/                    # Канонический лор (lore-extracted.txt, normalized-lore.json)
├── docs/                    # Документация (ARCHITECTURE.md, SECURITY.md, PROJECT_STATE.md, RELEASE_CHECKLIST.md)
├── scripts/                 # CLI-скрипты миграций и импорта (migrate-public-ids, import-wiki, import-applications)
├── server/                  # Express веб-сервер и маршруты API
│   ├── middlewares/         # auth.js, csrf.js, metaInjector.js, errorHandler.js
│   └── routes/              # health.js, auth.js, characters.js, applications.js, wiki.js, admin.js, search.js, seo.js
├── services/                # Бизнес-логика (playerService, inventoryService, wikiService, globalSearchService, etc.)
├── test/                    # Тестовые наборы (106 тестов)
├── utils/                   # Утилиты работы с БД (db.js), рангами, логгером (logger.js), каталогом магазина
├── web/                     # React + Vite Frontend
│   ├── src/                 # Компоненты, страницы, стили (main.css, theme.css), контекст авторизации
│   └── dist/                # Скомпилированный production-бандл
├── DEPLOYMENT.md            # Руководство по развертыванию
├── index.js                 # Точка входа единого процесса (Bot + Web + DB)
└── package.json             # Зависимости и скрипты запуска
```

---

## 4. Основные Public Routes и API Endpoints

### Frontend Маршруты (SPA):
- `/` — Главная страница (Hero, обзор мира, навигация).
- `/login` — Вход через Discord OAuth2.
- `/dashboard` — Личный кабинет игрока (выбор слота, валюты, обзор).
- `/profile` / `/characters/:slug` — Публичное досье персонажа.
- `/inventory` / `/characters/:slug/inventory` — Инвентарь персонажа (при наличии прав).
- `/applications` — Каталог принятых анкет с фильтрацией по фракциям.
- `/applications/:slug` — Полный просмотр принятой анкеты.
- `/wiki` — Главная страница энциклопедии мира Verge TRP.
- `/wiki/:category` — Список статей выбранной категории.
- `/wiki/:category/:slug` — Статья энциклопедии с оглавлением (TOC).
- `/search?q=...` — Страница глобального поиска по всей базе.
- `/admin/*` — Административная панель (Overview, Wiki, Applications, Characters, Audit).

### Backend REST API:
- `GET /api/health`, `GET /api/health/ready` — Liveness и Readiness проверки.
- `GET /robots.txt`, `GET /sitemap.xml` — SEO-метаданные.
- `GET /api/auth/me`, `POST /api/auth/slot`, `POST /api/auth/logout` — Управление сессией.
- `GET /api/characters/:id`, `GET /api/characters/:id/inventory` — Данные персонажей.
- `GET /api/applications`, `GET /api/applications/:slug` — Данные анкет.
- `GET /api/wiki`, `GET /api/wiki/categories`, `GET /api/wiki/articles/:slug` — Статьи базы знаний.
- `GET /api/search?q=...` — Единый публичный поиск.
- `/api/admin/*` — Административные мутации и журнал аудита (защищены правами).

---

## 5. Модель идентификации и безопасность данных

- **Public Slugs**: Персонажи и анкеты доступны по понятным человекочитаемым слагам (например, `/characters/hana-kami`, `/applications/sawako-naito`), сгенерированным из кириллических имен с сохранением уникальности.
- **Защита от IDOR**: Внутренние Discord User ID и `_id` MongoDB никогда не передаются в публичных API и не используются в URL.
- **Приватность**: Балансы игроков (KRW, JPY), подробный инвентарь и черновики скрыты от неавторизованных пользователей и отдаются только владельцу или администраторам.

---

## 6. Ролевая модель и права доступа (Permission Model)

Внедрена система гранулярных возможностей (Capabilities), рассчитываемых в [`services/permissionService.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/services/permissionService.js):
- `canAccessAdmin`: Доступ к панели управления.
- `canManageWiki`: Создание, редактирование, публикация и архивация статей Wiki.
- `canManageApplications`: Просмотр анкет и вызов синхронизации из Discord.
- `canViewPrivateCharacters`: Просмотр скрытых статов игроков.
- `canViewInventories`: Просмотр инвентарей других игроков.
- `canManageCharacters`: Модерация публичных полей персонажей (имя, аватар, ранг, организация).
- `canManageEconomy`: Управление экономикой и множителями (строго администраторы).
- `canViewAuditLog`: Просмотр журнала аудита (строго администраторы).

---

## 7. Состояние тестов и сборки

- **Тестовый набор**: **106 из 106 тестов** успешно проходят (`npm test`, 0 failures).
- **Сборка**: `npm run build` компилирует оптимизированный бандл с разделением кода за ~4.5s (`index.js` весит 207 kB / 65 kB gzipped).
- **Аудит безопасности**: `npm audit --omit=dev` сообщает о **0 уязвимостях** в production-зависимостях.

---

## 8. Известные архитектурные ограничения

1. **Единый процесс**: Бот и веб-сервер работают в одном процессе Node.js (необходимо для постоянного WebSocket-соединения бота и встроенного планировщика зарплат).
2. **Экономика через веб**: Прямое изменение балансов KRW/JPY и очков AP/SP намеренно не выведено в веб-интерфейс, чтобы избежать конфликтов с игровыми слэш-командами Discord-бота.
3. **Удаление статей**: Вместо физического удаления статей Wiki используется безопасная архивация (`status: 'archived'`).

---

## 9. Что требуется выполнить вручную для Production Deployment

1. Подготовить хостинг постоянных процессов (Railway, Fly.io, Hetzner VPS / Docker).
2. Заполнить переменные окружения на сервере согласно [`.env.example`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/.env.example) (включая стойкий `SESSION_SECRET` и `WEB_BASE_URL=https://...`).
3. Добавить Redirect URI `https://<ДОМЕН>/api/auth/discord/callback` в Discord Developer Portal.
4. Выполнить начальный импорт лора, анкет и миграцию слагов:
   ```bash
   npm run build
   npm run migrate:public-ids
   npm run applications:import
   npm run wiki:import
   npm start
   ```
5. Пройти проверку по [docs/RELEASE_CHECKLIST.md](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/docs/RELEASE_CHECKLIST.md).
