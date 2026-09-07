import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setCharacterAvatar, getActiveSlot } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('set-avatar')
    .setDescription('Установить аватар для своего персонажа')
    .addAttachmentOption(option =>
        option.setName('file')
            .setDescription('Файл изображения аватара (png, jpg, webp, gif)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('url')
            .setDescription('URL аватара (прямая ссылка на изображение)')
            .setRequired(false))
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
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;

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

    const fileAttachment = interaction.options.getAttachment('file');
    const avatarUrl = interaction.options.getString('url');

    if (!fileAttachment && !avatarUrl) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Не указан аватар', 'Пожалуйста, прикрепите файл изображения (`file`) или укажите ссылку (`url`).')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const source = fileAttachment || avatarUrl;

    if (avatarUrl && !fileAttachment) {
        if (!isValidUrl(avatarUrl)) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Неверный URL', 'Пожалуйста, предоставьте валидный URL изображения (например: https://example.com/image.jpg)')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }

        if (!isImageUrl(avatarUrl)) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Неверный формат', 'URL должен вести на изображение (jpg, png, gif, webp)')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }
    }

    if (fileAttachment) {
        if (fileAttachment.contentType && !fileAttachment.contentType.startsWith('image/')) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Неверный формат', 'Прикреплённый файл должен быть изображением (jpg, png, gif, webp).')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }
    }

    // Откладываем ответ, так как скачивание и сохранение файла может занять несколько секунд
    await interaction.deferReply({ flags: 64 });

    // Сохраняем аватар в постоянное хранилище
    const success = await setCharacterAvatar(playerId, source);

    if (success) {
        const updatedPlayer = await getPlayer(playerId);
        const embed = createSuccessEmbed(
            'Успешно! ✅',
            `Аватар персонажа **${player.character_name || player.username}** успешно сохранён и зафиксирован!\nТеперь он не слетит со временем.`,
            'setAvatar'
        );
        if (updatedPlayer?.character_avatar && /^https?:\/\//i.test(updatedPlayer.character_avatar)) {
            embed.setThumbnail(updatedPlayer.character_avatar);
        } else if (fileAttachment?.url) {
            embed.setThumbnail(fileAttachment.url);
        } else if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }

        await interaction.editReply({
            embeds: [embed]
        });
    } else {
        await interaction.editReply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось загрузить или сохранить изображение. Проверьте формат и размер файла (до 8 МБ).')]
        });
    }
}

// Помощник для проверки URL (только http/https)
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
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
