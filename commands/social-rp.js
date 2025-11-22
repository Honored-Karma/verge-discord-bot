import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown } from '../utils/cooldowns.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { progressBar, getAPProgress } from '../utils/progressBar.js';

const SOCIALRP_COOLDOWN = 12 * 60 * 60 * 1000;
const SOCIALRP_AP_REWARD = 20;

export const data = new SlashCommandBuilder()
    .setName('social-rp')
    .setDescription('Социальное взаимодействие для получения AP (20 AP, кулдаун 12 часов)')
    .addStringOption(option =>
        option.setName('text')
            .setDescription('Текст взаимодействия')
            .setRequired(true));

export async function execute(interaction) {
    const playerId = interaction.user.id;
    const rpText = interaction.options.getString('text');
    
    let player = getPlayer(playerId);
    
    if (!player) {
        return interaction.reply({
            embeds: [createErrorEmbed('Не зарегистрирован', 'Сначала зарегистрируйтесь командой `/register`!')],
            ephemeral: true
        });
    }
    
    if (rpText.length < 50) {
        return interaction.reply({
            embeds: [createErrorEmbed('Текст слишком короткий', 'Текст должен содержать минимум 50 символов.')],
            ephemeral: true
        });
    }
    
    const cooldownCheck = checkCooldown(player.last_socialrp_timestamp, SOCIALRP_COOLDOWN);
    if (cooldownCheck.onCooldown) {
        return interaction.reply({
            embeds: [createErrorEmbed('Кулдаун', `Следующее взаимодействие доступно через **${cooldownCheck.remainingFormatted}**`)],
            ephemeral: true
        });
    }
    
    const newAP = addAP(playerId, SOCIALRP_AP_REWARD, 'socialrp');
    
    if (newAP === false) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось добавить AP. Попробуйте снова.')],
            ephemeral: true
        });
    }
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const embed = createSuccessEmbed('Взаимодействие завершено!', 
        `Вы получили **${SOCIALRP_AP_REWARD} AP**!\n\n` +
        `**Всего AP:** ${newAP}\n` +
        `**Техник разблокировано:** ${apProgress.techniques}\n\n` +
        `**Прогресс к следующей технике:**\n${progressText}`
    );
    
    if (newAP >= 1000) {
        embed.setDescription(embed.data.description + '\n\n🌟 **Вы достигли 1000 AP! Avatar/Embodiment доступен!**');
    }
    
    return interaction.reply({ embeds: [embed] });
}
