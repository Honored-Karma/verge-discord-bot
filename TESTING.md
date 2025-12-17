Тестирование изменений слотов и быстрая проверка

1) Синтаксическая проверка изменённых файлов (локально, без запуска бота и без токена):

# Проверяет синтаксис JS модулей
node --check utils/dataManager.js
node --check commands/slot.js
node --check commands/register.js

2) Запуск бота (требуются переменные окружения и MongoDB):

# Установите в среде: DISCORD_TOKEN, MONGODB_URI (и другие, если есть в проекте)
# Затем запустите:
npm run start

3) Команды для коммита и пуша на GitHub (если у вас есть доступ и удалённый `origin` настроен):

git add .
git commit -m "Add multi-slot character support: dataManager, slot/register commands, docs"
git push origin main

Примечания
- Синтаксическая проверка `node --check` лишь обнаруживает синтаксические ошибки; она не выполняет код и не тестирует подключение к БД/Discord.
- Для интеграционных тестов запуск бота и использование тестовой MongoDB рекомендуется.
