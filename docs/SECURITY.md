# Политика безопасности и защитные механизмы (Security Architecture)

В документе зафиксированы меры защиты информации, модель прав, механизмы изоляции приватных данных и защитные барьеры экосистемы **Verge TRP**.

---

## 1. Аутентификация (Authentication)

### 1.1. Discord OAuth2 Flow
- Авторизация пользователей происходит через стандартный протокол Discord OAuth2 (Authorization Code Flow) со scope `identify` и `guilds.members.read`.
- При инициации входа генерируется криптографически стойкий одноразовый параметр `state` (`crypto.randomBytes(16)`), сохраняемый в сессии.
- В callback-эндпоинте `state` сверяется и **немедленно удаляется**, что предотвращает атаки перехвата авторизации (CSRF Login).
- При успешном получении профиля вызывается **`req.session.regenerate()`** для предотвращения Session Fixation атак.

### 1.2. Безопасность сессий (Session Security)
- Сессии хранятся в защищенной коллекции `sessions` MongoDB через `connect-mongo`.
- Параметры Cookie:
  - `httpOnly: true` — cookie недоступна для JavaScript в браузере (защита от XSS-кражи токена).
  - `secure: true` (в production) — передача только по шифрованному каналу HTTPS.
  - `sameSite: 'lax'` — защита от межсайтовой передачи сессионных cookie.
  - `maxAge: 14 дней` — автоматическая очистка истекших сессий через TTL-индекс MongoDB.

---

## 2. Авторизация и гранулярные права (Authorization & Capabilities)

Вместо монолитного булевого флага `isStaff` внедрен сервисный слой **[`services/permissionService.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/services/permissionService.js)**. Права вычисляются по принципу наименьших привилегий (Principle of Least Privilege):

| Возможность (Capability) | Описание | Доступ |
| :--- | :--- | :--- |
| `canAccessAdmin` | Доступ к административной панели и обзору | Staff, Moderator, Anketolog, Lore Master, Admin |
| `canManageWiki` | Создание, редактирование, публикация и архивация статей Wiki | Lore Master, Admin |
| `canManageApplications` | Просмотр анкет и запуск синхронизации | Anketolog, Admin |
| `canViewPrivateCharacters` | Просмотр приватных статов и скрытых слотов | Staff, Moderator, Admin |
| `canViewInventories` | Просмотр чужих инвентарей | Staff, Admin |
| `canManageCharacters` | Модерация публичных полей (имя, аватар, ранг, организация) | High Staff, Admin |
| `canManageEconomy` | Прямое изменение балансов KRW/JPY и очков AP/SP | **Только Admin** |
| `canViewAuditLog` | Просмотр журнала аудита действий | **Только Admin** |

Проверка прав на бэкенде осуществляется middleware `requireCapability(capabilityName)`.

---

## 3. Защита от перебора идентификаторов (IDOR & Privacy Hardening)

1. **Запрет использования Discord ID в URL**:
   - Внутренние Discord User ID (например, `123456789012345678`) и системные суффиксы слотов (`_2`) **никогда не используются в публичных ссылках**.
   - Вместо них используются публичные слоги (`/characters/hana-kami`, `/applications/hana-kami`) или непрозрачные идентификаторы (`public_id`).
2. **Публичные DTO (Data Transfer Objects)**:
   - Функции `sanitizeCharacter()`, `sanitizeApplicationForPublic()` и `sanitizeWikiArticleForPublic()` строго фильтруют поля перед отправкой клиенту.
   - Из публичных ответов вырезаются: балансы KRW/JPY, подробный инвентарь, служебные таймстампы, ID каналов Discord, внутренние заметки кураторов, черновики статей.

---

## 4. Защита от межсайтовых атак (CSRF & CORS)

### 4.1. CSRF Protection
- Middleware [`server/middlewares/csrf.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/server/middlewares/csrf.js) защищает все изменяющие состояние HTTP-запросы (`POST`, `PATCH`, `DELETE`, `PUT`).
- В production проверяются заголовки `Origin` и `Referer` — запросы с недоверенных или `null` origin немедленно отклоняются со статусом `403 Forbidden`.

### 4.2. CORS Configuration
- В production-режиме SPA отдается с того же домена (`same-origin`), поэтому открытый CORS (`*`) **полностью отключен**.
- В режиме разработки разрешены только локальные порты Vite (`localhost:5173`, `localhost:3000`).

---

## 5. Заголовки безопасности и Content Security Policy (CSP)

Через библиотеку `helmet` в [`server/app.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/server/app.js) настроены следующие политики:

```javascript
contentSecurityPolicy: {
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://cdn.discordapp.com", "https://media.discordapp.net", "https://images.unsplash.com"],
        connectSrc: ["'self'", "https://discord.com"],
        frameAncestors: ["'none'"]
    }
}
```

- **HSTS**: `max-age=31536000; includeSubDomains; preload` (принудительный HTTPS).
- **Clickjacking Protection**: `frame-ancestors: 'none'`, `X-Frame-Options: DENY`.
- **MIME Sniffing**: `X-Content-Type-Options: nosniff`.
- **Referrer Policy**: `strict-origin-when-cross-origin`.

---

## 6. Защита от инъекций (NoSQL, XSS, ReDoS)

1. **NoSQL / Mongo Injection**:
   - Пользовательский ввод никогда не подставляется в качестве ключей объектов запросов MongoDB.
   - Запрещено использование операторов `$where` и динамических `$set` из тела запроса.
2. **Safe Regex / ReDoS Mitigation**:
   - Функция `escapeRegex()` экранирует спецсимволы `.*+?^${}()|[]\` перед созданием регулярных выражений поиска.
   - Поисковые строки ограничены длиной от 2 до 100 символов.
3. **XSS Prevention**:
   - В интерфейсе исключено использование `dangerouslySetInnerHTML`.
   - Markdown рендерится через компонент `MarkdownReader` с валидацией ссылок (только относительные и HTTPS URL).
   - Подсветка поисковых совпадений выполняется через безопасные React-ноды в `SearchHighlight.jsx`.
   - Метатеги страниц экранируются функцией `escapeHtml()`.

---

## 7. Журналирование аудита (Admin Audit Logging)

- Все административные действия (создание, редактирование, публикация, архивация статей Wiki, модерация персонажей, синхронизация анкет) логируются в коллекцию `admin_actions` через [`services/auditService.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/services/auditService.js).
- В лог записываются: ID и username инициатора, тип сущности, ID сущности, дельта изменений (`changes: { before, after }`), IP-адрес и таймстамп.
- **Маскирование секретов**: токены авторизации, cookie, пароли и строки подключения к базе данных автоматически вырезаются логгером [`utils/logger.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/utils/logger.js) и никогда не попадают в логи.

---

## 8. Валидация переменных окружения (Fail-Fast Configuration)

Модуль [`config/env.js`](file:///c:/Users/solok/OneDrive/Документы/verge-discord-bot/config/env.js) при старте приложения проверяет корректность всех критических переменных. Если `NODE_ENV=production`:
- Сервер не запустится при отсутствии или невалидном формате `MONGODB_URI`.
- Сервер отклонит `SESSION_SECRET` короче 32 символов или совпадающий со стандартными плейсхолдерами.
- Сервер потребует использования протокола `HTTPS` для `WEB_BASE_URL` и `DISCORD_REDIRECT_URI`.

---

## 9. Допущения и эксплуатационные ограничения (Security Assumptions)

1. **Reverse Proxy & SSL Termination**: Предполагается, что production-трафик проходит через надежный reverse proxy с SSL-сертификатом (Cloudflare / Nginx / Railway / Fly.io) с установленным `TRUST_PROXY=1`.
2. **MongoDB Atlas Access**: Пользователь базы данных должен иметь права `readWrite` строго на базу `discord_bot` и не обладать глобальными правами кластера.
3. **Хранение секретов**: Файлы `.env` не должны попадать в систему контроля версий (контролируется `.gitignore`).
