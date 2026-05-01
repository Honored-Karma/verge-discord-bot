import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown, validateTrainingText, checkGlobalCooldown, autoDeleteMessageShort, autoDeleteMessageLong } from '../utils/cooldowns.js';
import { createTrainEmbed, createErrorEmbed, createCooldownEmbed } from '../utils/embeds.js';
import { progressBar, getAPProgress } from '../utils/progressBar.js';
import { logCommand } from '../utils/logs.js';
import { makePlayerKey } from '../utils/playerKey.js';

const TRAIN_COOLDOWN = 5 * 60 * 60 * 1000;
const TRAIN_AP_REWARD = 10;

export const data = new SlashCommandBuilder()
    .setName('train')
    .setDescription('Тренировка для получения AP (10 AP, 800+ символов, кулдаун 5 часов)')
    .addStringOption(option =>
        option.setName('text')
            .setDescription('Текст тренировки (минимум 800 символов)')
            .setRequired(true));

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Тренировка', retryAt)],
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
    const trainingText = interaction.options.getString('text');
    // Логирование текста тренировки
    await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: playerId,
        userTag: username,
        command: 'train',
        extra: { text: trainingText }
    });
    let player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', 'В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const validation = validateTrainingText(trainingText);
    if (!validation.valid) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректный текст', validation.reason)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const cooldownCheck = checkCooldown(player.last_train_timestamp, TRAIN_COOLDOWN);
    if (cooldownCheck.onCooldown) {
        const retryAt = Math.floor(Date.now() / 1000) + Math.ceil(cooldownCheck.remaining / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Тренировка', retryAt)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const newAP = await addAP(playerId, TRAIN_AP_REWARD, 'train');
    
    if (newAP === false) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить AP. Попробуйте снова.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const actualAPGained = Math.max(0, newAP - (player.ap || 0));
    const multiplier = Math.round((actualAPGained / TRAIN_AP_REWARD) * 100);
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const truncatedText = trainingText.length > 900 ? trainingText.slice(0, 900) + '...' : trainingText;

    const embed = createTrainEmbed('Тренировка завершена!', 
        `**📊 Получено AP:**\n` +
        `Базовое значение: **${TRAIN_AP_REWARD} AP**\n` +
        `Множитель: **${multiplier}%**\n` +
        `Итого получено: **+${actualAPGained} AP**\n\n` +
        `**Всего AP:** ${newAP}\n` +
        `**Следующая тренировка:** <t:${Math.floor((Date.now() + TRAIN_COOLDOWN) / 1000)}:R>\n\n` +
        `**Прогресс AP:**\n${progressText}`
    );
    embed.addFields({ name: '📝 Текст тренировки', value: truncatedText });
    
    if (newAP >= 1000) {
        embed.setDescription(embed.data.description + '\n\n🌟 **Олицетворение достигнуто!**');
    }
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageLong(msg);
}
