import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown, validateTrainingText, checkGlobalCooldown, autoDeleteMessageShort, autoDeleteMessage } from '../utils/cooldowns.js';
import { createTrainEmbed, createErrorEmbed } from '../utils/embeds.js';
import { progressBar, getAPProgress } from '../utils/progressBar.js';

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

    const playerId = interaction.user.id;
    const username = interaction.user.username;
    const trainingText = interaction.options.getString('text');
    
    let player = getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
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
    
    const newAP = addAP(playerId, TRAIN_AP_REWARD, 'train');
    
    if (newAP === false) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить AP. Попробуйте снова.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const embed = createTrainEmbed('Тренировка завершена!', 
        `Вы получили **${TRAIN_AP_REWARD} AP**!\n\n` +
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
