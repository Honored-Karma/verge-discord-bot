import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Полный гайд по всем командам бота')
    .addStringOption(option =>
        option.setName('category')
            .setDescription('Выбрать категорию команд')
            .setRequired(false)
            .addChoices(
                { name: '📋 Основное', value: 'main' },
                { name: '👤 Профиль', value: 'profile' },
                { name: '🥋 Тренировка', value: 'training' },
                { name: '💰 Экономика', value: 'economy' },
                { name: '🛡️ Админ', value: 'admin' },
                { name: '📚 Полный список', value: 'all' }
            ));

export async function execute(interaction) {
    const category = interaction.options.getString('category') || 'main';

    const helpEmbeds = {
        main: createMainHelp(),
        profile: createProfileHelp(),
        training: createTrainingHelp(),
        economy: createEconomyHelp(),
        admin: createAdminHelp(),
        all: createAllCommandsHelp()
    };

    const embed = helpEmbeds[category] || helpEmbeds.main;

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

function createMainHelp() {
    return new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📖 Гайд по Verge RPG Bot')
        .setDescription('**Быстрая справка по основным командам**')
        .addFields(
            {
                name: '👤 Профиль и персонаж',
                value: '`/register` - Создать нового персонажа\n`/profile` - Просмотреть профиль\n`/set-avatar <url>` - Установить аватар',
                inline: false
            },
            {
                name: '🥋 Тренировка',
                value: '`/train <style>` - Тренироваться в стиле\n`/social-rp <action>` - Социальный RP\n`/styles-list` - Список стилей',
                inline: false
            },
            {
                name: '💰 Экономика',
                value: '`/pay <user> <currency> <amount>` - Платёж\n`/exchange <from> <to> <amount>` - Обменять валюту\n`/inventory` - Инвентарь',
                inline: false
            },
            {
                name: '⏱️ Полезно',
                value: '`/leaderboard [type]` - Рейтинги\n`/help [category]` - Эта справка',
                inline: false
            },
            {
                name: '💡 Совет',
                value: 'Используйте `/help [категория]` для подробной информации!\nНапример: `/help admin` для админских команд',
                inline: false
            }
        )
        .setFooter({ text: 'Используйте стрелки для выбора категории' });
}

function createProfileHelp() {
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('👤 Команды профиля и персонажа')
        .addFields(
            {
                name: '/register',
                value: '✅ **Создать нового персонажа**\nУсловия: Нужно быть зарегистрированным один раз\nПараметры:\n• `character_name` - Имя вашего персонажа\n• `avatar_url` (опционально) - URL аватара\n\n💡 Совет: Придумайте интересное имя!',
                inline: false
            },
            {
                name: '/profile [user]',
                value: '✅ **Просмотреть профиль игрока**\nПараметры:\n• `user` (опционально) - Другой пользователь\n\n📊 Показывает:\n• AP и SP по стилям\n• Баланс валюты\n• Рейтинг в мастерстве\n• Статистику тренировок',
                inline: false
            },
            {
                name: '/set-avatar <url>',
                value: '✅ **НОВОЕ! Установить аватар персонажа**\nПараметры:\n• `url` - Прямая ссылка на изображение\n\n🖼️ Поддерживаемые форматы:\n• JPG, PNG, GIF, WebP\n• Discord CDN ссылки\n\n💡 Пример: https://example.com/avatar.jpg',
                inline: false
            },
            {
                name: '/inventory [user]',
                value: '✅ **Просмотреть инвентарь**\nПараметры:\n• `user` (опционально) - Инвентарь другого игрока\n\n🎁 Показывает:\n• Все предметы\n• Количество\n• Использование',
                inline: false
            }
        )
        .setFooter({ text: '👤 Категория: Профиль и персонаж' });
}

function createTrainingHelp() {
    return new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🥋 Команды тренировки и боевых стилей')
        .addFields(
            {
                name: '/train <style>',
                value: '✅ **Тренироваться в боевом стиле**\nПараметры:\n• `style` - Название стиля\n\n⚡ Награды:\n• +10 AP за тренировку\n• +30 SP в выбранный стиль\n• Кулдаун: 5 часов\n\n💡 Совет: Тренируйтесь в разных стилях для лучшего прогресса!',
                inline: false
            },
            {
                name: '/social-rp <action>',
                value: '✅ **Социальное ролевое действие**\nПараметры:\n• `action` - Описание действия\n\n⚡ Награды:\n• +20 AP за RP\n• +15 SP в случайный стиль\n• Кулдаун: 12 часов\n\n🎭 Примеры:\n• "медитирую в святилище"\n• "практикую с партнёром"',
                inline: false
            },
            {
                name: '/styles-list',
                value: '✅ **Просмотреть все боевые стили**\n\n🥋 В боте доступны 8+ стилей:\n• Aikido: reverse\n• Blood Taekwondo\n• Muay Thai\n• Dark Jiu-Jitsu\n• Sun Kendo\n• Qi boxing\n• Wolgwang Sword Style\n• Kyokushin Karate\n\n💡 Совет: Каждый стиль имеет уникальные свойства!',
                inline: false
            }
        )
        .setFooter({ text: '🥋 Категория: Тренировка' });
}

function createEconomyHelp() {
    return new EmbedBuilder()
        .setColor('#ffcc00')
        .setTitle('💰 Команды экономики и валюты')
        .addFields(
            {
                name: '/pay <user> <krw/yen> <amount>',
                value: '✅ **Отправить деньги другому игроку**\nПараметры:\n• `user` - Получатель\n• `krw/yen` - Тип валюты\n• `amount` - Сумма\n\n💸 Условия:\n• Нужна валюта на счёте\n• Без комиссии\n\n💡 Пример: /pay @John yen 100',
                inline: false
            },
            {
                name: '/exchange <from> <to> <amount>',
                value: '✅ **Обменять одну валюту на другую**\nПараметры:\n• `from` - Из какой валюты (krw/yen)\n• `to` - В какую валюту\n• `amount` - Сумма\n\n📊 Курсы меняются динамически!\n\n💡 Пример: /exchange krw yen 100',
                inline: false
            },
            {
                name: '/leaderboard [type]',
                value: '✅ **Просмотреть рейтинги**\nПараметры:\n• `type` (опционально) - Тип рейтинга\n\n🏆 Доступные рейтинги:\n• `ap` - По AP (Атаке)\n• `sp` - По SP (Мастерству)\n• `krw` - По корейской воне\n• `yen` - По японской иене\n\n💡 Поднимайтесь на вершину рейтингов!',
                inline: false
            },
            {
                name: '/use <item>',
                value: '✅ **Использовать предмет из инвентаря**\nПараметры:\n• `item` - Название предмета\n\n🎁 Примеры предметов:\n• AP Tome (50) - +50 AP\n• SP Scroll: Muay Thai - +30 SP',
                inline: false
            }
        )
        .setFooter({ text: '💰 Категория: Экономика' });
}

function createAdminHelp() {
    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🛡️ Админские команды')
        .setDescription('⚠️ Эти команды доступны только администраторам!')
        .addFields(
            {
                name: '/add-ap <user> <amount>',
                value: '✅ Добавить AP игроку\nПример: `/add-ap @John 100`',
                inline: true
            },
            {
                name: '/set-ap <user> <amount>',
                value: '✅ Установить AP игроку\nПример: `/set-ap @John 500`',
                inline: true
            },
            {
                name: '/add-sp <user> <amount>',
                value: '✅ Добавить SP игроку\nПример: `/add-sp @John 50`',
                inline: true
            },
            {
                name: '/set-sp <user> <amount>',
                value: '✅ Установить SP игроку\nПример: `/set-sp @John 200`',
                inline: true
            },
            {
                name: '/add-currency <user> <krw> <yen>',
                value: '✅ Добавить валюту\nПример: `/add-currency @John 1000 500`',
                inline: true
            },
            {
                name: '/set-currency <user> <krw> <yen>',
                value: '✅ Установить валюту\nПример: `/set-currency @John 5000 2000`',
                inline: true
            },
            {
                name: '/add-style <name>',
                value: '✅ Создать новый боевой стиль\nПример: `/add-style "Lightning Fist"`',
                inline: true
            },
            {
                name: '/delete-style <name>',
                value: '✅ Удалить боевой стиль\nПример: `/delete-style "Old Style"`',
                inline: true
            },
            {
                name: '/give-item <user> <item>',
                value: '✅ Выдать предмет игроку\nПример: `/give-item @John "AP Tome (50)"`',
                inline: true
            },
            {
                name: '/give-style <user> <style>',
                value: '✅ Выдать боевой стиль\nПример: `/give-style @John "Muay Thai"`',
                inline: true
            },
            {
                name: '/set-ap-multiplier <multiplier>',
                value: '✅ Множитель AP для всех\nПример: `/set-ap-multiplier 150`',
                inline: true
            },
            {
                name: '/set-sp-multiplier <multiplier>',
                value: '✅ Множитель SP для всех\nПример: `/set-sp-multiplier 150`',
                inline: true
            },
            {
                name: '/delete-user <user>',
                value: '✅ Удалить игрока и все его данные\nОсторожно! Это необратимо!',
                inline: true
            }
        )
        .setFooter({ text: '🛡️ Категория: Администрирование' });
}

function createAllCommandsHelp() {
    return new EmbedBuilder()
        .setColor('#00ffff')
        .setTitle('📚 Полный список всех команд (24+)')
        .addFields(
            {
                name: '👤 Профиль (4)',
                value: '/register\n/profile\n/set-avatar\n/inventory',
                inline: true
            },
            {
                name: '🥋 Тренировка (3)',
                value: '/train\n/social-rp\n/styles-list',
                inline: true
            },
            {
                name: '💰 Экономика (4)',
                value: '/pay\n/exchange\n/leaderboard\n/use',
                inline: true
            },
            {
                name: '🛡️ Админ (13)',
                value: '/add-ap\n/set-ap\n/add-sp\n/set-sp\n/add-currency\n/set-currency\n/add-style\n/delete-style\n/give-item\n/give-style\n/set-ap-multiplier\n/set-sp-multiplier\n/delete-user',
                inline: true
            },
            {
                name: '📖 Справка (1)',
                value: '/help (эта команда)',
                inline: true
            },
            {
                name: '🔍 Всего команд',
                value: '**25 команд** - полный функционал RPG бота!',
                inline: true
            }
        )
        .setFooter({ text: '📚 Полный список всех команд' });
}
