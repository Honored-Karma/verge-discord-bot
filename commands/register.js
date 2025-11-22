import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register yourself in the RPG system');

export async function execute(interaction) {
    const playerId = interaction.user.id;
    const username = interaction.user.username;
    
    const existingPlayer = getPlayer(playerId);
    
    if (existingPlayer) {
        return interaction.reply({
            embeds: [createErrorEmbed('Already Registered', 'You are already registered in the system!')],
            ephemeral: true
        });
    }
    
    const success = createPlayer(playerId, username);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('Registration Complete', `Welcome, **${username}**! You have been registered in the RPG system.\n\nUse \`/train\` to earn AP and \`/profile\` to view your progress!`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Registration Failed', 'An error occurred during registration. Please try again.')],
            ephemeral: true
        });
    }
}
