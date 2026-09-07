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
import {
    describeOrgSync,
    listOrgRoles,
    setOrgRole,
    syncAllOrgRoles,
    syncOrgRoles,
    unsetOrgRole,
} from '../utils/orgRoles.js';

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
                    .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 })))
    .addSubcommandGroup(group =>
        group.setName('role')
            .setDescription('[АДМИН] Роли Discord для организаций')
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('[АДМИН] Показать, какая роль привязана к какой организации'))
            .addSubcommand(sub =>
                sub.setName('set')
                    .setDescription('[АДМИН] Привязать роль Discord к организации')
                    .addStringOption(opt =>
                        opt.setName('name')
                            .setDescription('Название организации (TENRYU, GUARDIANS или кастомная)')
                            .setRequired(true))
                    .addRoleOption(opt =>
                        opt.setName('role')
                            .setDescription('Роль, которую выдавать участникам организации')
                            .setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('unset')
                    .setDescription('[АДМИН] Убрать привязку роли к организации')
                    .addStringOption(opt =>
                        opt.setName('name')
                            .setDescription('Название организации')
                            .setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('sync')
                    .setDescription('[АДМИН] Пересобрать роли организации у одного игрока')
                    .addUserOption(opt =>
                        opt.setName('user')
                            .setDescription('Игрок')
                            .setRequired(true)))
            .addSubcommand(sub =>
                sub.setName('sync-all')
                    .setDescription('[АДМИН] Пересобрать роли организаций у всех игроков')));

export async function execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    // list — доступно всем. Проверка на группу обязательна: без неё
    // `/org role list` провалился бы в публичный список организаций.
    if (!group && sub === 'list') {
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

    if (group === 'role') {
        await handleRoleGroup(interaction, sub);
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
        const sync = await syncOrgRoles({
            guild: interaction.guild,
            userId: targetUser.id,
            actorId: interaction.user.id,
        });
        const note = describeOrgSync(sync);
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Организация назначена',
                `Игроку **${player.character_name || player.username}** (слот **${slot}**) назначена организация **${found.name}**.${note ? `\n\n${note}` : ''}`,
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
        const sync = await syncOrgRoles({
            guild: interaction.guild,
            userId: targetUser.id,
            actorId: interaction.user.id,
        });
        const note = describeOrgSync(sync);
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Организация убрана',
                `Кастомная организация убрана у игрока **${player.character_name || player.username}** (слот **${slot}**).${note ? `\n\n${note}` : ''}`,
                'deleteStyle')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
}

/**
 * Группа `/org role`. Реестр правится отдельно от самих организаций: у роли
 * своя жизнь, её могут пересоздать в Discord, не трогая игровые данные.
 */
async function handleRoleGroup(interaction, sub) {
    if (sub === 'list') {
        const rows = await listOrgRoles();
        const body = rows.length === 0
            ? 'Ни одной привязки нет. Добавьте через `/org role set`.'
            // Роль показываем id, а не упоминанием: в Components V2 `<@&id>`
            // пингует всех её носителей.
            : rows.map(row => `• **${row.label}** → роль \`${row.role_id}\``).join('\n');
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('🏷️ Роли организаций', body)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (sub === 'set') {
        const name = interaction.options.getString('name').trim();
        const role = interaction.options.getRole('role');
        const result = await setOrgRole(name, role.id, interaction.user.id);
        if (!result.success) {
            const msg = await interaction.reply({
                embeds: [createErrorEmbed('Ошибка', 'Не удалось сохранить привязку роли.')],
                fetchReply: true
            });
            autoDeleteMessageShort(msg);
            return;
        }
        const msg = await interaction.reply({
            embeds: [createSuccessEmbed('Роль привязана',
                `Организации **${result.label}** соответствует роль **${role.name}**.\n\n-# Уже выданные организации это не пересобирает — для этого есть \`/org role sync-all\`.`,
                'setRank')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (sub === 'unset') {
        const name = interaction.options.getString('name').trim();
        const result = await unsetOrgRole(name, interaction.user.id);
        const msg = await interaction.reply({
            embeds: result.success
                ? [createSuccessEmbed('Привязка убрана',
                    `Для организации **${name}** роль больше не выдаётся.\n\n-# Уже выданные роли остаются на участниках.`,
                    'deleteStyle')]
                : [createErrorEmbed('Не найдено', `Для организации **${name}** привязки нет.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (sub === 'sync') {
        const targetUser = interaction.options.getUser('user');
        const sync = await syncOrgRoles({
            guild: interaction.guild,
            userId: targetUser.id,
            actorId: interaction.user.id,
        });
        const note = describeOrgSync(sync) || 'Ничего менять не потребовалось.';
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('Синхронизация роли',
                `${targetUser.username}: ${sync.orgName ? `организация **${sync.orgName}**` : 'организации нет'}.\n\n${note}`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    if (sub === 'sync-all') {
        // Проход по всему серверу заведомо дольше трёх секунд.
        await interaction.deferReply();
        const result = await syncAllOrgRoles({
            guild: interaction.guild,
            actorId: interaction.user.id,
        });

        const labels = {
            applied: 'обновлено',
            unchanged: 'уже верно',
            unmapped: 'организация без роли',
            member_not_found: 'нет на сервере',
            missing_permission: 'нет права у бота',
            role_too_high: 'роль выше бота',
            role_not_found: 'роль не найдена',
            failed: 'отказ Discord',
        };
        const lines = Object.entries(result.counts || {})
            .map(([status, count]) => `• ${labels[status] || status}: **${count}**`);

        await interaction.editReply({
            embeds: [createInfoEmbed('Синхронизация ролей организаций',
                [
                    `Обработано игроков: **${result.processed}**`,
                    result.truncated ? `-# Список обрезан до ${result.processed} — запустите ещё раз.` : '',
                    '',
                    lines.length ? lines.join('\n') : 'Кандидатов не нашлось.',
                ].filter(Boolean).join('\n'))]
        });
        return;
    }
}
