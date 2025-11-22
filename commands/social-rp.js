import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown } from '../utils/cooldowns.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { progressBar, getAPProgress } from '../utils/progressBar.js';

const SOCIALRP_COOLDOWN = 12 * 60 * 60 * 1000;
const SOCIALRP_AP_REWARD = 20;

export const data = new SlashCommandBuilder()
    .setName('social-rp')
    .setDescription('Submit social RP to earn AP (20 AP, 12 hour cooldown)')
    .addStringOption(option =>
        option.setName('text')
            .setDescription('Your social roleplay text')
            .setRequired(true));

export async function execute(interaction) {
    const playerId = interaction.user.id;
    const username = interaction.user.username;
    const rpText = interaction.options.getString('text');
    
    let player = getPlayer(playerId);
    
    if (!player) {
        createPlayer(playerId, username);
        player = getPlayer(playerId);
    }
    
    if (rpText.length < 50) {
        return interaction.reply({
            embeds: [createErrorEmbed('Text Too Short', 'Social RP text must be at least 50 characters.')],
            ephemeral: true
        });
    }
    
    const cooldownCheck = checkCooldown(player.last_socialrp_timestamp, SOCIALRP_COOLDOWN);
    if (cooldownCheck.onCooldown) {
        return interaction.reply({
            embeds: [createErrorEmbed('Social RP Cooldown', `You must wait **${cooldownCheck.remainingFormatted}** before submitting social RP again.`)],
            ephemeral: true
        });
    }
    
    const newAP = addAP(playerId, SOCIALRP_AP_REWARD, 'socialrp');
    
    if (newAP === false) {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to add AP. Please try again.')],
            ephemeral: true
        });
    }
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const embed = createSuccessEmbed('Social RP Complete!', 
        `You have earned **${SOCIALRP_AP_REWARD} AP**!\n\n` +
        `**Total AP:** ${newAP}\n` +
        `**Techniques Unlocked:** ${apProgress.techniques}\n\n` +
        `**Progress to Next Technique:**\n${progressText}`
    );
    
    if (newAP >= 1000) {
        embed.setDescription(embed.data.description + '\n\n🌟 **You have reached 1000 AP! Avatar/Embodiment is now available!**');
    }
    
    return interaction.reply({ embeds: [embed] });
}
