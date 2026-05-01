
import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer, getActiveSlot, setActiveSlot } from '../utils/dataManager.js';
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
                .setRequired(false))
            .addStringOption(option =>
            option.setName('attribute_name')
                .setDescription('Название атрибута персонажа (например: Пепел, Гром, Лёд)')
                .setRequired(false))
            .addIntegerOption(option =>
            option.setName('slot')
                .setDescription('Номер слота (необязательно). Если не указан — используется активный слот.')
                .setRequired(false)
            );

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
    const attributeName = interaction.options.getString('attribute_name') || null;
    const avatarAttachment = interaction.options.getAttachment('avatar');

    const requestedSlot = interaction.options.getInteger('slot');
    let slot = requestedSlot && requestedSlot >= 1 ? requestedSlot : await getActiveSlot(playerId);
    if (slot > 2) slot = 2;

    // Slot policy: slot 1 must exist before slot 2 can be created.
    if (slot !== 1) {
        const slot1Player = await getPlayer(playerId);
        if (!slot1Player) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Сначала создайте слот 1', 'Нельзя создать персонажа в слоте 2, пока не создан персонаж в слоте 1.\n\nИспользуйте: `/register slot:1`')],
                flags: 64,
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }
    }

    // Check if this slot already has a character (slot 1 uses plain playerId)
    const checkId = (slot && slot !== 1) ? `${playerId}_${slot}` : playerId;
    const existingPlayer = await getPlayer(checkId);

    if (existingPlayer) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Уже зарегистрирован', `В слоте ${slot} уже есть персонаж (${existingPlayer.character_name || existingPlayer.username}). Переключитесь на другой слот или удалите персонажа.`)],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (characterName.length < 2 || characterName.length > 32) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Некорректное имя', 'Имя персонажа должно быть от 2 до 32 символов.')],
            flags: 64,
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

    const success = await createPlayer(playerId, username, characterName, avatarUrl, slot, attributeName);

    if (success) {
        await setActiveSlot(playerId, slot);

        const msg = await interaction.reply({
            embeds: [createRegisterEmbed('Регистрация завершена', 
                `Добро пожаловать, **${characterName}**! Создан персонаж в слоте **${slot}**.\n\nУдачи в приключениях! 🚀`)],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка регистрации', 'Произошла ошибка при регистрации. Попробуйте снова.')],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}
