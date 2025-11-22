import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer, addAP } from '../utils/dataManager.js';
import { checkCooldown, validateTrainingText } from '../utils/cooldowns.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { progressBar, getAPProgress } from '../utils/progressBar.js';

const TRAIN_COOLDOWN = 5 * 60 * 60 * 1000;
const TRAIN_AP_REWARD = 10;

export const data = new SlashCommandBuilder()
    .setName('train')
    .setDescription('Submit training text to earn AP (800+ characters, 5 hour cooldown)')
    .addStringOption(option =>
        option.setName('text')
            .setDescription('Your training roleplay text (minimum 800 characters)')
            .setRequired(true));

export async function execute(interaction) {
    const playerId = interaction.user.id;
    const username = interaction.user.username;
    const trainingText = interaction.options.getString('text');
    
    let player = getPlayer(playerId);
    
    if (!player) {
        createPlayer(playerId, username);
        player = getPlayer(playerId);
    }
    
    const validation = validateTrainingText(trainingText);
    if (!validation.valid) {
        return interaction.reply({
            embeds: [createErrorEmbed('Invalid Training Text', validation.reason)],
            ephemeral: true
        });
    }
    
    const cooldownCheck = checkCooldown(player.last_train_timestamp, TRAIN_COOLDOWN);
    if (cooldownCheck.onCooldown) {
        return interaction.reply({
            embeds: [createErrorEmbed('Training Cooldown', `You must wait **${cooldownCheck.remainingFormatted}** before training again.`)],
            ephemeral: true
        });
    }
    
    const newAP = addAP(playerId, TRAIN_AP_REWARD, 'train');
    
    if (newAP === false) {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to add AP. Please try again.')],
            ephemeral: true
        });
    }
    
    const apProgress = getAPProgress(newAP);
    const progressText = progressBar(apProgress.current, apProgress.max, 20);
    
    const embed = createSuccessEmbed('Training Complete!', 
        `You have earned **${TRAIN_AP_REWARD} AP**!\n\n` +
        `**Total AP:** ${newAP}\n` +
        `**Techniques Unlocked:** ${apProgress.techniques}\n\n` +
        `**Progress to Next Technique:**\n${progressText}`
    );
    
    if (newAP >= 1000) {
        embed.setDescription(embed.data.description + '\n\n🌟 **You have reached 1000 AP! Avatar/Embodiment is now available!**');
    }
    
    return interaction.reply({ embeds: [embed] });
}
