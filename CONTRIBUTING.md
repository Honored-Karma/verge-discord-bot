# 🤝 Contribution Guidelines

Спасибо за интерес к развитию Verge! 

## Как внести вклад

### 1. **Создание команды**
```javascript
// commands/my-command.js
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('command-name')
    .setDescription('Описание команды');

export async function execute(interaction) {
    // Ваш код здесь
}
```

### 2. **Добавление функции в dataManager**
```javascript
export async function myNewFunction(params) {
    try {
        const db = getDB();
        // Ваша логика MongoDB
        return result;
    } catch (error) {
        console.error('Error:', error);
        return false;
    }
}
```

### 3. **Стиль кода**
- Используйте стрелочные функции где возможно
- Добавляйте обработку ошибок с try/catch
- Используйте логирование для дебага
- Комментируйте сложный код

### 4. **Тестирование**
- Протестируйте команду в Discord перед PR
- Проверьте работу с MongoDB
- Убедитесь, что нет логов ошибок

## Pull Request Process

1. Fork репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Коммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Pushьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## Требования к PR

- Понятное описание изменений
- Работающий код без ошибок
- Обновленный README если нужно
- Тестирование на работоспособность

## Структура коммитов

```
feat: Добавлена команда set-avatar
fix: Исправлена ошибка в экономике
docs: Обновлена документация
style: Форматирование кода
refactor: Переписана функция getPlayer
```

---

**Спасибо за ваш вклад! ❤️**
