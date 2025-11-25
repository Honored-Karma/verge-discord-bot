import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer } from '../utils/dataManager.js';
import { createRegisterEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

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
    const characterName = interaction.options.getString('character_name');
    const avatarAttachment = interaction.options.getAttachment('avatar');
    
    const existingPlayer = await getPlayer(playerId);
    
    if (existingPlayer) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Уже зарегистрирован', 'Вы уже зарегистрированы в системе!')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    if (characterName.length < 2 || characterName.length > 32) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное имя', 'Имя персонажа должно быть от 2 до 32 символов.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    let avatarUrl = null;
    if (avatarAttachment) {
        if (avatarAttachment.contentType && avatarAttachment.contentType.startsWith('image/')) {
            avatarUrl = avatarAttachment.url;
        }
    }
    
    const success = await createPlayer(playerId, username, characterName, avatarUrl);
    
    if (success) {
        const msg = await interaction.reply({
            embeds: [createRegisterEmbed('Регистрация завершена', 
                `Добро пожаловать, **${characterName}**!\n\nУдачи в приключениях! 🚀`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка регистрации', 'Произошла ошибка при регистрации. Попробуйте снова.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
