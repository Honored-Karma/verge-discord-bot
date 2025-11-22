import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer } from '../utils/dataManager.js';
import { createRegisterEmbed, createErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
    .setName('register')
    .setDescription('Зарегистрироваться в системе')
    .addStringOption(option =>
        option.setName('character_name')
            .setDescription('Имя вашего персонажа')
            .setRequired(true))
    .addAttachmentOption(option =>
        option.setName('avatar')
            .setDescription('Аватар персонажа (необязательно)')
            .setRequired(false));

export async function execute(interaction) {
    const playerId = interaction.user.id;
    const username = interaction.user.username;
    const characterName = interaction.options.getString('character_name');
    const avatarAttachment = interaction.options.getAttachment('avatar');
    
    const existingPlayer = getPlayer(playerId);
    
    if (existingPlayer) {
        return interaction.reply({
            embeds: [createErrorEmbed('Уже зарегистрирован', 'Вы уже зарегистрированы в системе!')],
            ephemeral: true
        });
    }
    
    if (characterName.length < 2 || characterName.length > 32) {
        return interaction.reply({
            embeds: [createErrorEmbed('Некорректное имя', 'Имя персонажа должно быть от 2 до 32 символов.')],
            ephemeral: true
        });
    }
    
    let avatarUrl = null;
    if (avatarAttachment) {
        if (avatarAttachment.contentType && avatarAttachment.contentType.startsWith('image/')) {
            avatarUrl = avatarAttachment.url;
        }
    }
    
    const success = createPlayer(playerId, username, characterName, avatarUrl);
    
    if (success) {
        return interaction.reply({
            embeds: [createRegisterEmbed('Регистрация завершена', 
                `Добро пожаловать, **${characterName}**!\n\nУдачи в приключениях! 🚀`)]
        });
    } else {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка регистрации', 'Произошла ошибка при регистрации. Попробуйте снова.')],
            ephemeral: true
        });
    }
}
