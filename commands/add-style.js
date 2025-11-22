import { SlashCommandBuilder } from 'discord.js';
import { addStyle } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';

function isAdmin(member) {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.includes(member.id)) return true;
    if (member.roles.cache.some(role => role.name === 'Game Master')) return true;
    if (member.guild.ownerId === member.id) return true;
    return false;
}

export const data = new SlashCommandBuilder()
    .setName('add-style')
    .setDescription('[ADMIN] Create a new martial arts style')
    .addStringOption(option =>
        option.setName('name')
            .setDescription('The name of the style')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('description')
            .setDescription('Description of the style')
            .setRequired(true));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Permission Denied', 'You must be a Game Master or admin to use this command.')],
            ephemeral: true
        });
    }
    
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    
    const success = addStyle(name, description, interaction.user.id);
    
    if (success) {
        return interaction.reply({
            embeds: [createSuccessEmbed('Style Created', `**${name}** has been added to the available martial arts styles!\n\n*${description}*`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to create style. It may already exist.')],
            ephemeral: true
        });
    }
}
