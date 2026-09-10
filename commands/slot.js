import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, setActiveSlot, isSlot3Unlocked } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';
import { describeOrgSync, syncOrgRoles } from '../utils/orgRoles.js';

export const data = new SlashCommandBuilder()
    .setName('slot')
    .setDescription('Переключить активный слот персонажа')
    .addIntegerOption(option =>
        option.setName('number')
            .setDescription('Номер слота (1, 2 или 3)')
            .setRequired(true)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 },
                { name: 'Слот 3', value: 3 }
            )
    );

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        return interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            flags: 64
        });
    }

    const slot = interaction.options.getInteger('number');
    if (slot !== 1 && slot !== 2 && slot !== 3) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Неверный номер слота. Доступно: 1, 2 или 3.')],
            flags: 64
        });
    }

    const userId = interaction.user.id;
    // Try to get target character (if exists)
    const target = await getPlayer(makePlayerKey(userId, slot));

    if (!target) {
        if (slot === 3) {
            const slot3Unlocked = await isSlot3Unlocked(userId);
            if (!slot3Unlocked) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Слот заблокирован', 'Доступ к 3-му слоту персонажа заблокирован.\n\nВыдача 3-го слота осуществляется администрацией сервера через команду `/grant-slot`.')],
                    flags: 64
                });
            }
        }
        const slot1Player = await getPlayer(userId);
        if (slot === 2 && !slot1Player) {
            return interaction.reply({
                embeds: [createErrorEmbed('Слот недоступен', 'Нельзя переключиться на слот 2, пока не создан персонаж в слоте 1.\n\nИспользуйте `/register slot:1`')],
                flags: 64
            });
        }
        if (slot === 3) {
            const slot2Player = await getPlayer(makePlayerKey(userId, 2));
            if (!slot1Player || !slot2Player) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Слот недоступен', 'Нельзя переключиться на слот 3, пока не созданы персонажи в слотах 1 и 2.\n\nИспользуйте `/register` для последовательного создания.')],
                    flags: 64
                });
            }
        }
    }

    const ok = await setActiveSlot(userId, slot);
    if (!ok) {
        return interaction.reply({
            embeds: [createErrorEmbed('Ошибка', 'Не удалось переключить слот, попробуйте позже.')],
            flags: 64
        });
    }

    // Роль организации отражает активного персонажа, поэтому переключение слота
    // её пересобирает: иначе игрок в Стражах ходил бы с ролью Тенрю.
    const sync = await syncOrgRoles({ guild: interaction.guild, userId });
    const note = describeOrgSync(sync);

    if (target) {
        await interaction.reply({
            embeds: [createSuccessEmbed('Слот изменён', `Теперь активен слот **${slot}** — **${target.character_name || target.username}**${note ? `\n\n${note}` : ''}`, 'slot')],
            flags: 64
        });
    } else {
        await interaction.reply({
            embeds: [createSuccessEmbed('Слот выбран', `Теперь активен пустой слот **${slot}**. Используйте /register чтобы создать персонажа в этом слоте.`, 'slot')],
            flags: 64
        });
    }
}
