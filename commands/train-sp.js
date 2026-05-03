import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addSP, getSP, listStyles, updatePlayer } from '../utils/dataManager.js';
import {
    checkCooldown,
    validateTrainingText,
    checkGlobalCooldown,
    autoDeleteMessageShort,
    autoDeleteMessageLong
} from '../utils/cooldowns.js';
import { createTrainEmbed, createErrorEmbed, createCooldownEmbed } from '../utils/embeds.js';
import { progressBar } from '../utils/progressBar.js';
import { logCommand } from '../utils/logs.js';
import { makePlayerKey } from '../utils/playerKey.js';

const TRAIN_SP_COOLDOWN = 5 * 60 * 60 * 1000; // 5 часов (отдельно от /train-ap)
const TRAIN_SP_REWARD = 30; // базовый SP за тренировку

/** Возвращает информацию о текущем ранге стиля */
function getSPRankInfo(sp) {
    if (sp >= 2500) return { name: 'Мастер',   emoji: '🔴', min: 2500, next: null  };
    if (sp >= 1000) return { name: 'Эксперт',  emoji: '🟠', min: 1000, next: 2500  };
    if (sp >= 350)  return { name: 'Владелец', emoji: '🟡', min: 350,  next: 1000  };
    return             { name: 'Новичок',  emoji: '⚪', min: 0,    next: 350   };
}

/** Строит строку с прогресс-баром и рангом для embed */
function buildSPProgressText(sp) {
    const { name, emoji, min, next } = getSPRankInfo(sp);
    if (!next) {
        return `${emoji} **${name}** — ${sp} SP *(максимальный ранг!)*`;
    }
    const bar = progressBar(sp - min, next - min, 20);
    return `${emoji} **${name}** → **${next} SP**\n${bar}`;
}

export const data = new SlashCommandBuilder()
    .setName('train-sp')
    .setDescription('Тренировка боевого стиля — получить SP (мин. 800 символов, кулдаун 5 часов)')
    .addStringOption(option =>
        option.setName('style')
            .setDescription('Название боевого стиля (используйте /styles-list для просмотра)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('text')
            .setDescription('Текст тренировки (минимум 800 символов)')
            .setRequired(true)
            .setMaxLength(4000));

export async function execute(interaction) {
    // Глобальный кулдаун (анти-спам 3с)
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Тренировка SP', retryAt)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const userId = interaction.user.id;
    const { getActiveSlot } = await import('../utils/dataManager.js');
    const activeSlot = await getActiveSlot(userId);
    const playerId = makePlayerKey(userId, activeSlot);
    const username = interaction.user.username;
    const styleName = interaction.options.getString('style');
    const trainingText = interaction.options.getString('text');

    // Логируем команду
    await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: playerId,
        userTag: username,
        command: 'train-sp',
        extra: { style: styleName, text: trainingText }
    });

    // Проверяем наличие персонажа
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed(
                'Пустой слот',
                'В этом слоте нет персонажа. Используйте `/register`, чтобы создать нового персонажа.'
            )],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Ищем стиль по названию (без учёта регистра)
    const allStyles = await listStyles();
    const style = allStyles.find(s => s.name.toLowerCase() === styleName.trim().toLowerCase());

    if (!style) {
        const styleList = allStyles.length > 0
            ? allStyles.map(s => `• **${s.name}**`).join('\n')
            : '_Стилей в базе пока нет. Обратитесь к администратору._';
        const msg = await interaction.reply({
            embeds: [createErrorEmbed(
                'Стиль не найден',
                `Стиль **"${styleName}"** не найден в базе.\n\nВведите название точно, как в списке.\n\n**Доступные стили:**\n${styleList}`
            )],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Валидация текста тренировки (мин. 800 символов, не спам)
    const validation = validateTrainingText(trainingText);
    if (!validation.valid) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Текст не прошёл проверку', validation.reason)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Проверяем кулдаун тренировки SP (отдельный от /train-ap)
    const cooldownCheck = checkCooldown(player.last_sp_train_timestamp, TRAIN_SP_COOLDOWN);
    if (cooldownCheck.onCooldown) {
        const retryAt = Math.floor(Date.now() / 1000) + Math.ceil(cooldownCheck.remaining / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Тренировка SP', retryAt)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Фиксируем текущий SP до начисления (для расчёта дельты)
    const currentSP = await getSP(playerId, style.id);

    // Начисляем SP (source='train-sp', adminId=null — не пишем в лог админ-действий)
    const newSP = await addSP(playerId, style.id, TRAIN_SP_REWARD, null, 'train-sp');
    if (newSP === false) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить SP. Попробуйте снова.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Сохраняем метку времени последней SP-тренировки
    await updatePlayer(playerId, {
        last_sp_train_timestamp: Math.floor(Date.now() / 1000)
    });

    // Считаем фактически полученный SP (с учётом всех множителей)
    const actualSPGained = Math.max(0, newSP - currentSP);
    const multiplier = Math.round((actualSPGained / TRAIN_SP_REWARD) * 100);

    const spProgressText = buildSPProgressText(newSP);

    // Обрезаем текст тренировки для embed (макс. 1000 символов)
    const truncatedText = trainingText.length > 1000
        ? trainingText.slice(0, 1000) + '...'
        : trainingText;

    const embed = createTrainEmbed(
        'Тренировка стиля завершена!',
        `**<:SP28112025:1443994403604533268> Стиль: ${style.name}**\n\n` +
        `**Получено SP:**\n` +
        `Базовое значение: **${TRAIN_SP_REWARD} SP**\n` +
        `Множитель: **${multiplier}%**\n` +
        `Итого получено: **+${actualSPGained} SP**\n\n` +
        `**Всего SP в стиле:** ${newSP} SP\n` +
        `**Следующая тренировка SP:** <t:${Math.floor((Date.now() + TRAIN_SP_COOLDOWN) / 1000)}:R>\n\n` +
        `**Прогресс стиля:**\n${spProgressText}`
    );

    embed.addFields({ name: '📝 Текст тренировки', value: truncatedText });

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageLong(msg);
}
