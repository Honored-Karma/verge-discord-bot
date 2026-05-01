# 🔐 ГАЙД ПО БЕЗОПАСНОМУ КОММИТУ В GITHUB

**Цель:** Убедиться, что все критичные файлы сохранены перед `git push`  
**Статус:** Локальная версия готова ✅  
**Риск потери кода:** Минимальный 🟢

---

## 📋 ПРЕДВАРИТЕЛЬНАЯ ПРОВЕРКА (5 минут)

### Шаг 1️⃣: Проверить критичные файлы

```bash
# Перейди в папку проекта
cd "C:\Users\solok\OneDrive\Документы\verge-discord-bot"

# Проверь основные файлы
ls -la index.js package.json package-lock.json deploy-commands.js .env.example .gitignore
```

**Ожидаемый результат:**
```
✅ index.js                  [существует]
✅ package.json              [существует]
✅ package-lock.json         [существует]
✅ deploy-commands.js        [существует]
✅ .env.example              [существует]
✅ .gitignore                [существует]
```

### Шаг 2️⃣: Проверить критичные папки

```bash
# Проверь наличие главных папок
ls -la | grep "^d"

# или более подробно
ls -la commands/ | head -10      # Должны быть 37 команд
ls -la services/
ls -la utils/
ls -la data/
ls -la assets/
```

**Ожидаемый результат:**
```
✅ commands/        [37 файлов]
✅ services/        [файлы сервисов]
✅ utils/           [утилиты]
✅ data/            [конфигурация]
✅ assets/          [ресурсы]
✅ node_modules/    [зависимости - исключена из git]
```

### Шаг 3️⃣: Проверить .gitignore

```bash
# Посмотри содержимое .gitignore
cat .gitignore

# Должно содержать:
# node_modules/
# .env
# *.log
# .DS_Store
# .vscode/
```

**Проверка:**
```
✅ node_modules/ исключена (не будет закоммлена)
✅ .env исключена (не будет закоммлена)
✅ *.log исключены (логи не будут закоммлены)
```

### Шаг 4️⃣: Проверить статус git

```bash
# Посмотри текущий статус
git status

# Должно вывести примерно такое:
# On branch main
# nothing to commit, working tree clean
# или
# Changes not staged for commit:
#   modified: README.md
#   ...
```

**ВАЖНО:** Если есть файлы, которые ты не хочешь коммитить:
```bash
# Посмотри какие файлы будут добавлены
git diff --name-only

# Если видишь ненужные файлы (например, *.log):
git clean -fd *.log  # Удалить логи
```

### Шаг 5️⃣: Проверить на случайные ненужные файлы

```bash
# Ищи все .log файлы
find . -name "*.log" -type f

# Ищи все временные файлы
find . -name "~*" -o -name "*.tmp" -o -name "*.bak"

# Ищи .env (не должно быть - только .env.example)
ls -la | grep "^-.*\.env$"
```

**Результат:**
```
✅ Нет *.log файлов (или они исключены в .gitignore)
✅ Нет временных файлов
✅ Есть только .env.example (сам .env исключен)
```

---

## 🚨 КРИТИЧНАЯ ПРОВЕРКА: ЧТО НЕ ПОТЕРЯЕТСЯ?

Используй эту таблицу для проверки:

```
╔══════════════════════════════════════════════════════════════╗
║  ФАЙЛ/ПАПКА             │  СТАТУС  │  КОД  │  ДЕЙСТВИЕ       ║
╠══════════════════════════════════════════════════════════════╣
║  index.js               │  ✅ ОК   │   🔴  │  Не удалять     ║
║  package.json           │  ✅ ОК   │  🔴  │  Не удалять     ║
║  package-lock.json      │  ✅ ОК   │  🔴  │  Не удалять     ║
║  deploy-commands.js     │  ✅ ОК   │  🔴  │  Не удалять     ║
║  commands/              │  ✅ ОК   │  🔴  │  Не удалять     ║
║  services/              │  ✅ ОК   │  🔴  │  Не удалять     ║
║  utils/                 │  ✅ ОК   │  🔴  │  Не удалять     ║
║  data/                  │  ✅ ОК   │  🔴  │  Не удалять     ║
║  assets/                │  ✅ ОК   │  🔴  │  Не удалять     ║
║─────────────────────────────────────────────────────────────║
║  README.md              │  ✅ ОК   │  🟠  │  Не удалять     ║
║  QUICKSTART.md          │  ✅ ОК   │  🟠  │  Не удалять     ║
║  ENVIRONMENT_VARIABLES  │  ✅ ОК   │  🟠  │  Не удалять     ║
║  .env.example           │  ✅ ОК   │  🟠  │  Не удалять     ║
║  .gitignore             │  ✅ ОК   │  🟠  │  Не удалять     ║
║  setup.ps1              │  ✅ ОК   │  🟠  │  Не удалять     ║
║  run.bat                │  ✅ ОК   │  🟠  │  Не удалять     ║
║  deploy.bat             │  ✅ ОК   │  🟠  │  Не удалять     ║
║─────────────────────────────────────────────────────────────║
║  node_modules/          │  ❌ X    │      │  (в .gitignore) ║
║  .env                   │  ❌ X    │      │  (в .gitignore) ║
║  *.log                  │  ❌ X    │      │  (в .gitignore) ║
║─────────────────────────────────────────────────────────────║
║  00_НАЧНИ_ОТСЮДА.txt    │  ❌ НЕТ  │      │  (опционально)  ║
║  CHANGELOG.md           │  ❌ НЕТ  │      │  (опционально)  ║
║  TUTORIAL.md            │  ❌ НЕТ  │      │  (опционально)  ║
║  и другие гайды...      │  ❌ НЕТ  │      │  (опционально)  ║
╚══════════════════════════════════════════════════════════════╝
```

**Легенда:**
- 🔴 КРИТИЧНО = БОТ НЕ РАБОТАЕТ БЕЗ ЭТОГО
- 🟠 ВАЖНО = ДОЛЖНО ОСТАТЬСЯ ДЛЯ ПОЛНОТЫ
- ❌ НЕТ = ОТСУТСТВУЕТ В ЛОКАЛЬНОЙ ВЕРСИИ (можно добавить позже)
- ❌ X = В .gitignore (специально исключено)

---

## ✅ БЕЗОПАСНЫЙ КОММИТ: ШАГ ЗА ШАГОМ

### ВАРИАНТ 1: МИНИМАЛЬНЫЙ КОММИТ (только обновления)

Используй этот вариант, если ты только редактировал существующие файлы:

```bash
# 1. Посмотри что изменилось
git status

# 2. Добавь только изменённые файлы
git add -A

# 3. Проверь что добавилось (перед коммитом!)
git diff --cached --name-only

# 4. Сделай коммит
git commit -m "Update: [Описание изменений]"

# 5. Загрузи на GitHub
git push origin main
```

### ВАРИАНТ 2: ПОЛНЫЙ КОММИТ (с новыми файлами)

Если ты добавил новые файлы, используй:

```bash
# 1. Проверь статус
git status

# 2. Посмотри ВСЕ файлы которые будут добавлены
git add --dry-run -A

# 3. Если всё правильно, добавь файлы
git add -A

# 4. Ещё раз проверь перед коммитом
git diff --cached

# 5. Сделай коммит с описанием
git commit -m "Feature: [Описание новых файлов]"

# 6. Загрузи на GitHub
git push origin main
```

### ВАРИАНТ 3: ИЗБИРАТЕЛЬНЫЙ КОММИТ (выбранные файлы)

Если ты хочешь закоммитить только определённые файлы:

```bash
# 1. Добавь конкретные файлы
git add index.js commands/ services/

# 2. Проверь что добавилось
git status

# 3. Сделай коммит
git commit -m "Feat: Update commands and services"

# 4. Загрузи на GitHub
git push origin main
```

---

## 🛡️ ПРЕДОТВРАЩЕНИЕ ОШИБОК

### ⚠️ ОПАСНОСТЬ 1: Коммит node_modules

```bash
# ПЛОХО ❌ - Это добавит 1000+ файлов!
git add -A
git commit -m "Add node_modules"

# ХОРОШО ✅ - Проверь .gitignore
cat .gitignore | grep node_modules
# Должно быть: node_modules/
```

**Решение:**
```bash
# Если случайно добавил node_modules, удали его:
git rm -r --cached node_modules/
git commit --amend -m "Remove node_modules from staging"
```

### ⚠️ ОПАСНОСТЬ 2: Коммит .env

```bash
# ПЛОХО ❌ - Это утечка данных!
git add .env
git commit -m "Add environment variables"

# ХОРОШО ✅ - Используй .env.example
cat .gitignore | grep "^\.env$"
# Должно быть: .env
```

**Решение:**
```bash
# Если случайно добавил .env, удали его:
git rm --cached .env
git commit --amend -m "Remove .env from staging"
```

### ⚠️ ОПАСНОСТЬ 3: Коммит логов

```bash
# ПЛОХО ❌ - Логи занимают место и не нужны в git
git add deploy.log

# ХОРОШО ✅ - Они исключены в .gitignore
cat .gitignore | grep "\.log"
# Должно быть: *.log
```

### ⚠️ ОПАСНОСТЬ 4: Забыл добавить критичные файлы

```bash
# ПЛОХО ❌ - Недостаточно файлов в коммите
git status
# nothing to commit

# ХОРОШО ✅ - Проверь новые файлы
git add commands/*.js
git commit -m "Add new commands"
```

---

## 🔄 СИНХРОНИЗАЦИЯ ПОСЛЕ КОММИТА

### После успешного push:

```bash
# 1. Проверь что всё загрузилось
git log --oneline -5
# Должен показать твой коммит в начале

# 2. Проверь статус
git status
# Должно быть: working tree clean

# 3. Убедись что на GitHub (опционально)
# Зайди на https://github.com/Honored-Karma/verge-discord-bot/
# Проверь что видишь свои изменения
```

### Если нужно откатить последний коммит:

```bash
# Если ещё не push'ил:
git reset --soft HEAD~1

# Если уже push'ил (опасно!):
git revert HEAD
git push origin main
```

---

## 📊 ФИНАЛЬНЫЙ ЧЕКЛИСТ ПЕРЕД PUSH

```
ПЕРЕД ТЕМ КАК ПИСАТЬ git push:

□ Проверил что все файлы на месте:
  □ index.js                    ✅
  □ package.json                ✅
  □ package-lock.json           ✅
  □ deploy-commands.js          ✅
  □ commands/ (37 файлов)       ✅
  □ services/                   ✅
  □ utils/                       ✅
  □ data/                        ✅
  □ assets/                      ✅

□ Проверил что исключено:
  □ node_modules/ (в .gitignore) ✅
  □ .env (в .gitignore)          ✅
  □ *.log (в .gitignore)         ✅

□ Проверил git status:
  □ git status чист или готов к коммиту ✅

□ Проверил что не добавляю лишнее:
  □ Нет node_modules/ в staging  ✅
  □ Нет .env в staging           ✅
  □ Нет *.log в staging          ✅

□ Создал правильный коммит:
  □ git commit с понятным сообщением ✅

□ Готов к push:
  □ git push origin main ✅
```

---

## 🚀 КОМАНДА ДЛЯ БЫСТРОГО КОММИТА

```bash
# Всё в одной строке (сейф вариант):
git status && git add -A && git status && git commit -m "Update: Bot updates" && git push origin main

# Или по частям для контроля:
git add -A
git status  # <-- ПОСМОТРИ ЧТО ДОБАВИЛОСЬ!
git commit -m "Update: Bot updates"
git push origin main
```

**⚠️ ВАЖНО:** Перед третьей строкой (push) всегда смотри `git status`!

---

## 🆘 ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК

### Ошибка: "fatal: not a git repository"

```bash
# Убедись что в правильной папке:
pwd
# Должна быть: C:\Users\solok\OneDrive\Документы\verge-discord-bot

# Если не git репозиторий:
git init
git remote add origin https://github.com/Honored-Karma/verge-discord-bot.git
```

### Ошибка: "Please tell me who you are"

```bash
git config user.email "твой@email.com"
git config user.name "Твое имя"
```

### Ошибка: "rejected... (fetch first)"

```bash
# Сначала загрузи обновления
git pull origin main

# Потом загружай свои
git push origin main
```

### Ошибка: "Everything up-to-date"

```bash
# Всё уже загружено, коммитить нечего
# Это хорошо! Ничего не потеряется ✅
```

---

## ✅ УСПЕХ!

Если ты увидел:
```
...
33 files changed, 150 insertions(+), 30 deletions(-)
...
To github.com:Honored-Karma/verge-discord-bot.git
   abc1234..def5678  main -> main
```

**ПОЗДРАВЛЯЮ!** ✅ Коммит прошёл успешно!

---

## 📞 ПОЛЕЗНЫЕ КОМАНДЫ GIT

```bash
# Посмотреть историю
git log --oneline -10

# Посмотреть что изменилось в последнем коммите
git show --name-status HEAD

# Посмотреть diff последних изменений
git diff HEAD~1

# Посмотреть список файлов в staging
git diff --cached --name-only

# Отменить добавление файла в staging
git reset HEAD файл.js

# Удалить все локальные изменения (опасно!)
git reset --hard HEAD
```

---

## 📚 ИСТОЧНИКИ

- [Git docs](https://git-scm.com/docs)
- [GitHub guides](https://guides.github.com)
- [Pro Git book](https://git-scm.com/book)

---

**Статус:** ✅ ГОТОВО К КОММИТУ  
**Опасность потери кода:** 🟢 МИНИМАЛЬНАЯ  
**Рекомендация:** Следуй чеклисту и push будет безопасным! 🚀
