import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown, validateTrainingText, checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { createTrainEmbed, createErrorEmbed } from '../utils/embeds.js';
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
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
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
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Кулдаун', `Следующая тренировка доступна через **${cooldownCheck.remainingFormatted}**`)],
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
    
    // Get updated player data to show multiplier
    const updatedPlayer = await getPlayer(playerId);
    const multiplier = updatedPlayer.ap_multiplier || 100;
    const actualAPGained = Math.round(TRAIN_AP_REWARD * multiplier / 100);
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const embed = createTrainEmbed('Тренировка завершена!', 
        `**📊 Получено AP:**\n` +
        `Базовое значение: **${TRAIN_AP_REWARD} AP**\n` +
        `Множитель: **${multiplier}%**\n` +
        `Итого получено: **+${actualAPGained} AP**\n\n` +
        `**Всего AP:** ${newAP}\n` +
        `**Техник разблокировано:** ${apProgress.techniques}\n\n` +
        `**Прогресс к следующей технике:**\n${progressText}`
    );
    
    if (newAP >= 1000) {
        embed.setDescription(embed.data.description + '\n\n🌟 **Вы достигли 1000 AP! Avatar/Embodiment доступен!**');
    }
    
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    autoDeleteMessageShort(msg);
}
