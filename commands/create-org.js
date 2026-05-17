import { SlashCommandBuilder } from 'discord.js';
import {
    createCustomOrg,
    deleteCustomOrg,
    listCustomOrgs,
    setCustomOrg,
    removeCustomOrg,
    getPlayer,
    getActiveSlot,
} from '../utils/dataManager.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../utils/embeds.js';
import { hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { makePlayerKey } from '../utils/playerKey.js';

export const data = new SlashCommandBuilder()
    .setName('org')
    .setDescription('Управление кастомными организациями')
    .addSubcommand(sub =>
        sub.setName('create')
            .setDescription('[АДМИН] Создать новую кастомную организацию')
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('Название организации')
                    .setRequired(true)
                    .setMaxLength(50)))
    .addSubcommand(sub =>
        sub.setName('delete')
            .setDescription('[АДМИН] Удалить кастомную организацию')
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('Название организации')
                    .setRequired(true)))
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('Список всех кастомных организаций'))
    .addSubcommand(sub =>
        sub.setName('assign')
            .setDescription('[АДМИН] Назначить игроку кастомную организацию')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Игрок')
                    .setRequired(true))
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('Название организации')
                    .setRequired(true))
            .addIntegerOption(opt =>
                opt.setName('slot')
                    .setDescription('Слот (1 или 2, по умолчанию активный)')
                    .setRequired(false)
                    .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 })))
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('[АДМИН] Убрать кастомную организацию у игрока')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('Игрок')
                    .setRequired(true))
            .addIntegerOption(opt =>
                opt.setName('slot')
                    .setDescription('Слот (1 или 2, по умолчанию активный)')
                    .setRequired(false)
                    .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 })));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // list — доступно всем
    if (sub === 'list') {
        const orgs = await listCustomOrgs();
        if (orgs.length === 0) {
            const msg = await interaction.reply({
                embeds: [createInfoEmbed('Кастомные организации', 'Кастомных организаций пока нет.')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }
        const lines = orgs.map((o, i) => `**${i + 1}.** ${o.name}`).join('\n');
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('🏢 Кастомные организации', lines)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    // Остальные подкоманды — только для админов
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'set-ap')) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещён', 'Эта команда доступна только администраторам.')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (sub === 'create') {
        const name = interaction.options.getString('name').trim();
        const result = await createCustomOrg(name, interaction.user.id);
        if (result.success) {
            const msg = await interaction.reply({
                embeds: [createSuccessEmbed('Организация создана', `Кастомная организация **${name}** успешно создана.`, 'addStyle')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
        } else {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Ошибка', result.reason)],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
        }
        return;
    }

    if (sub === 'delete') {
        const name = interaction.options.getString('name').trim();
        const ok = await deleteCustomOrg(name);
        if (ok) {
            const msg = await interaction.reply({
                embeds: [createSuccessEmbed('Организация удалена', `Кастомная организация **${name}** удалена.`, 'deleteStyle')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
        } else {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Не найдено', `Организация с названием **${name}** не найдена.`)],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
        }
        return;
    }

    if (sub === 'assign') {
        const targetUser = interaction.options.getUser('user');
        const name = interaction.options.getString('name').trim();
        const requestedSlot = interaction.options.getInteger('slot');
        let slot = requestedSlot ?? await getActiveSlot(targetUser.id);
        if (slot < 1 || slot > 2) slot = 1;
        const playerId = makePlayerKey(targetUser.id, slot);

        const player = await getPlayer(playerId);
        if (!player) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Не зарегистрирован', `В слоте ${slot} у игрока нет персонажа.`)],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }

        // Проверяем что такая кастомная организация существует
        const orgs = await listCustomOrgs();
        const found = orgs.find(o => o.name.toLowerCase() === name.toLowerCase());
        if (!found) {
            const orgList = orgs.length > 0
                ? orgs.map(o => `• ${o.name}`).join('\n')
                : 'Нет кастомных организаций. Создайте через `/org create`.';
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Организация не найдена',
                    `Кастомная организация **${name}** не существует.\n\nДоступные:\n${orgList}`)],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }

        await setCustomOrg(playerId, found.name, interaction.user.id);
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Организация назначена',
                `Игроку **${player.character_name || player.username}** (слот **${slot}**) назначена организация **${found.name}**.`,
                'setRank')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (sub === 'remove') {
        const targetUser = interaction.options.getUser('user');
        const requestedSlot = interaction.options.getInteger('slot');
        let slot = requestedSlot ?? await getActiveSlot(targetUser.id);
        if (slot < 1 || slot > 2) slot = 1;
        const playerId = makePlayerKey(targetUser.id, slot);

        const player = await getPlayer(playerId);
        if (!player) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Не зарегистрирован', `В слоте ${slot} у игрока нет персонажа.`)],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }

        await removeCustomOrg(playerId, interaction.user.id);
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Организация убрана',
                `Кастомная организация убрана у игрока **${player.character_name || player.username}** (слот **${slot}**).`,
                'deleteStyle')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
}
