import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { isSlot3Unlocked, setSlot3Unlocked, getPlayer, logAdminAction } from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/adminCheck.js';
import { logCommand } from '../utils/logs.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('grant-slot')
    .setDescription('[АДМИН] Управление доступом к 3-му слоту персонажа')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sub =>
        sub.setName('give')
            .setDescription('Выдать игроку доступ к 3-му слоту персонажа')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Игрок, которому выдается слот')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Отозвать у игрока доступ к 3-му слоту персонажа')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Игрок, у которого отзывается слот')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('check')
            .setDescription('Проверить статус доступа к 3-му слоту у игрока')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Игрок для проверки')
                    .setRequired(true)
            )
    );

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Эта команда доступна только администраторам сервера.')],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');

    if (subcommand === 'give') {
        const success = await setSlot3Unlocked(targetUser.id, true);
        if (!success) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Ошибка', 'Не удалось сохранить настройки слота в базе данных.')],
                flags: 64,
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }

        logAdminAction(interaction.user.id, 'grant_slot_3', {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username
        });

        try {
            await logCommand(interaction, {
                targetUser,
                slot: 3,
                action: 'grant_slot_3'
            });
        } catch (e) {
            console.error('Error logging grant-slot command:', e);
        }

        const msg = await interaction.reply({
            embeds: [createSuccessEmbed(
                '3-й слот разблокирован',
                `Игроку <@${targetUser.id}> (**${targetUser.username}**) выдан доступ к **3-му слоту** персонажа!\n\nТеперь игрок может последовательно зарегистрировать персонажа через \`/register\`.`,
                'grant-slot'
            )],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (subcommand === 'remove') {
        const success = await setSlot3Unlocked(targetUser.id, false);
        if (!success) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Ошибка', 'Не удалось сохранить настройки слота в базе данных.')],
                flags: 64,
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }

        logAdminAction(interaction.user.id, 'revoke_slot_3', {
            targetUserId: targetUser.id,
            targetUsername: targetUser.username
        });

        const existingSlot3Player = await getPlayer(makePlayerKey(targetUser.id, 3));
        const notice = existingSlot3Player
            ? `\n\n⚠️ *У игрока уже создан персонаж в 3-м слоте («${existingSlot3Player.character_name || existingSlot3Player.username}»). Персонаж не удален, но в случае удаления создать нового без повторной выдачи будет нельзя.*`
            : '';

        const msg = await interaction.reply({
            embeds: [createSuccessEmbed(
                'Доступ к 3-му слоту отозван',
                `У игрока <@${targetUser.id}> (**${targetUser.username}**) успешно отозван доступ к **3-му слоту** персонажа.${notice}`,
                'grant-slot'
            )],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (subcommand === 'check') {
        const unlocked = await isSlot3Unlocked(targetUser.id);
        const existingSlot3Player = await getPlayer(makePlayerKey(targetUser.id, 3));

        const charInfo = existingSlot3Player
            ? `**${existingSlot3Player.character_name || existingSlot3Player.username}** (AP: ${existingSlot3Player.ap || 0})`
            : '_персонаж не создан_';

        const embed = createInfoEmbed(
            'Статус 3-го слота',
            `**Игрок:** <@${targetUser.id}> (${targetUser.username})\n` +
            `**Доступ к слоту 3:** ${unlocked ? '🟢 **Разблокирован**' : '🔒 **Заблокирован**'}\n` +
            `**Персонаж в слоте 3:** ${charInfo}`,
            'grant-slot'
        );

        const msg = await interaction.reply({
            embeds: [embed],
            flags: 64,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
}
