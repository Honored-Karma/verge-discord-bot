
import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, createPlayer, getActiveSlot, setActiveSlot, isSlot3Unlocked } from '../utils/dataManager.js';
import { makePlayerKey } from '../utils/playerKey.js';
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
            .setDescription('Номер слота (необязательно). Если не указан — используется следующий свободный слот.')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 },
                { name: 'Слот 3', value: 3 }
            )
    );

export function resolveRegistrationSlot({ requestedSlot, slot1Player, slot2Player, slot3Player, isSlot3Unlocked = false }) {
    if (requestedSlot !== null && requestedSlot !== undefined) {
        const slotNum = Number(requestedSlot);
        if (![1, 2, 3].includes(slotNum)) {
            return {
                ok: false,
                title: 'Неверный слот',
                message: 'Доступны слоты: 1, 2 или 3.'
            };
        }

        // Slot 3 restriction: requires administrator grant
        if (slotNum === 3 && !isSlot3Unlocked) {
            return {
                ok: false,
                title: 'Слот 3 заблокирован',
                message: 'Доступ к 3-му слоту персонажа заблокирован.\n\nВыдача 3-го слота осуществляется администрацией сервера через команду `/grant-slot`.'
            };
        }

        // Sequential registration policy:
        // Slot 2 requires Slot 1 to exist.
        if (slotNum === 2 && !slot1Player) {
            return {
                ok: false,
                title: 'Сначала создайте слот 1',
                message: 'Нельзя создать персонажа в слоте 2, пока не создан персонаж в слоте 1.\n\nИспользуйте: `/register slot:1`'
            };
        }

        // Slot 3 requires Slot 1 and Slot 2 to exist.
        if (slotNum === 3) {
            if (!slot1Player) {
                return {
                    ok: false,
                    title: 'Сначала создайте слот 1',
                    message: 'Нельзя создать персонажа в слоте 3, пока не создан персонаж в слоте 1.\n\nИспользуйте: `/register slot:1`'
                };
            }
            if (!slot2Player) {
                return {
                    ok: false,
                    title: 'Сначала создайте слот 2',
                    message: 'Нельзя создать персонажа в слоте 3, пока не создан персонаж в слоте 2.\n\nИспользуйте: `/register slot:2`'
                };
            }
        }

        return { ok: true, slot: slotNum };
    }

    // Automatically determine next free slot in sequence (1 -> 2 -> 3)
    if (!slot1Player) {
        return { ok: true, slot: 1 };
    } else if (!slot2Player) {
        return { ok: true, slot: 2 };
    } else if (!isSlot3Unlocked) {
        return {
            ok: false,
            title: 'Лимит слотов достигнут',
            message: 'У вас уже созданы персонажи во всех стандартных слотах (1 и 2).\n\nДоступ к 3-му слоту персонажа выдаётся администрацией сервера через команду `/grant-slot`.'
        };
    } else if (!slot3Player) {
        return { ok: true, slot: 3 };
    } else {
        return {
            ok: false,
            title: 'Все слоты заняты',
            message: 'У вас уже созданы персонажи во всех трёх слотах (1, 2 и 3).\n\nПереключитесь на нужный слот через `/slot` или удалите персонажа.'
        };
    }
}

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

    await interaction.deferReply({ flags: 64 });

    const playerId = interaction.user.id;
    const username = interaction.user.username;

    const characterName = interaction.options.getString('character_name');
    const attributeName = interaction.options.getString('attribute_name') || null;
    const avatarAttachment = interaction.options.getAttachment('avatar');

    const requestedSlot = interaction.options.getInteger('slot');

    // Fetch existing characters in all slots and check slot 3 unlock status
    const [slot1Player, slot2Player, slot3Player, slot3Unlocked] = await Promise.all([
        getPlayer(playerId),
        getPlayer(makePlayerKey(playerId, 2)),
        getPlayer(makePlayerKey(playerId, 3)),
        isSlot3Unlocked(playerId)
    ]);

    const slotResolution = resolveRegistrationSlot({
        requestedSlot,
        slot1Player,
        slot2Player,
        slot3Player,
        isSlot3Unlocked: slot3Unlocked
    });

    if (!slotResolution.ok) {
        const msg = await interaction.editReply({
            embeds: [createErrorEmbed(slotResolution.title, slotResolution.message)],
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const slot = slotResolution.slot;

    // Check if chosen slot already has a character
    const checkId = makePlayerKey(playerId, slot);
    const existingPlayer = await getPlayer(checkId);

    if (existingPlayer) {
        const msg = await interaction.editReply({
            embeds: [createErrorEmbed('Уже зарегистрирован', `В слоте ${slot} уже есть персонаж (${existingPlayer.character_name || existingPlayer.username}). Переключитесь на другой слот или удалите персонажа.`)],
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (characterName.length < 2 || characterName.length > 32) {
        const msg = await interaction.editReply({
            embeds: [createErrorEmbed('Некорректное имя', 'Имя персонажа должно быть от 2 до 32 символов.')],
        });
        autoDeleteMessageShort(msg);
        return;
    }

    let avatarSource = null;
    if (avatarAttachment) {
        if (avatarAttachment.contentType && avatarAttachment.contentType.startsWith('image/')) {
            avatarSource = avatarAttachment;
        }
    }

    const success = await createPlayer(playerId, username, characterName, avatarSource, slot, attributeName);

    if (success) {
        // Active slot is always set to 1 upon registration
        await setActiveSlot(playerId, 1);

        const msg = await interaction.editReply({
            embeds: [createRegisterEmbed('Регистрация завершена', 
                `Добро пожаловать, **${characterName}**! Создан персонаж в слоте **${slot}**.\nАктивным слотом установлен **Слот 1**.\n\nУдачи в приключениях! 🚀`)],
        });
        autoDeleteMessageShort(msg);
    } else {
        const msg = await interaction.editReply({
            embeds: [createErrorEmbed('Ошибка регистрации', 'Произошла ошибка при регистрации. Попробуйте снова.')],
        });
        autoDeleteMessageShort(msg);
    }
}
