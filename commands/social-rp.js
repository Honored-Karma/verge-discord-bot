import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown, checkGlobalCooldown, autoDeleteMessageShort, autoDeleteMessage } from '../utils/cooldowns.js';
import { createSocialRPEmbed, createErrorEmbed } from '../utils/embeds.js';
import { progressBar, getAPProgress } from '../utils/progressBar.js';

const SOCIALRP_COOLDOWN = 12 * 60 * 60 * 1000;
const SOCIALRP_AP_REWARD = 10;

export const data = new SlashCommandBuilder()
    .setName('social-rp')
    .setDescription('Социальное взаимодействие для получения AP (10 AP, кулдаун 12 часов)')
    .addStringOption(option =>
        option.setName('text')
            .setDescription('Текст взаимодействия')
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
    const rpText = interaction.options.getString('text');
    
    let player = getPlayer(playerId);
    
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (rpText.length < 50) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Текст слишком короткий', 'Текст должен содержать минимум 50 символов.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const cooldownCheck = checkCooldown(player.last_socialrp_timestamp, SOCIALRP_COOLDOWN);
    if (cooldownCheck.onCooldown) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Кулдаун', `Следующее взаимодействие доступно через **${cooldownCheck.remainingFormatted}**`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const newAP = addAP(playerId, SOCIALRP_AP_REWARD, 'socialrp');
    
    if (newAP === false) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить AP. Попробуйте снова.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    // Get updated player data to show multiplier
    const updatedPlayer = getPlayer(playerId);
    const multiplier = updatedPlayer.ap_multiplier || 100;
    const actualAPGained = Math.round(SOCIALRP_AP_REWARD * multiplier / 100);
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const embed = createSocialRPEmbed('Взаимодействие завершено!', 
        `**📊 Получено AP:**\n` +
        `Базовое значение: **${SOCIALRP_AP_REWARD} AP**\n` +
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
