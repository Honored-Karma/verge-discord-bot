import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setCharacterAvatar } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-avatar')
    .setDescription('Установить аватар для своего персонажа')
    .addStringOption(option =>
        option.setName('url')
            .setDescription('URL аватара (изображение)')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1 или 2 (по умолчанию активный)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 }
            )
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

    const userId = interaction.user.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;
    const avatarUrl = interaction.options.getString('url');
    // Проверяем, что пользователь зарегистрирован
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', 'В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Проверяем формат URL
    if (!isValidUrl(avatarUrl)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Неверный URL', 'Пожалуйста, предоставьте валидный URL изображения (например: https://example.com/image.jpg)')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Проверяем, что URL указывает на изображение
    if (!isImageUrl(avatarUrl)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Неверный формат', 'URL должен вести на изображение (jpg, png, gif, webp)')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Обновляем аватар
    const success = await setCharacterAvatar(userId, avatarUrl);

    if (success) {
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Успешно! ✅', `Ваш аватар персонажа обновлён!\n\n📸 **URL:** ${avatarUrl}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось обновить аватар. Попробуйте позже.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
    }
}

// Помощник для проверки URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Помощник для проверки, что это изображение
function isImageUrl(url) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const lowercaseUrl = url.toLowerCase();
    
    return imageExtensions.some(ext => lowercaseUrl.includes(ext)) ||
           url.includes('cdn.discordapp.com') ||
           url.includes('media.discordapp.net');
}
