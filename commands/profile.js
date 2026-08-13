import {
    AttachmentBuilder,
    MessageFlags,
    SlashCommandBuilder,
} from 'discord.js';
import {
    getAllPlayerSP,
    getPlayer,
    getRecentProgressionHistory,
    getReputationTier,
    getTotalSP,
} from '../utils/dataManager.js';
import {
    createCooldownEmbed,
    createErrorEmbed,
    getProfileMultipliers,
} from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import {
    generatePhysicalStatsCard,
    generateUnifiedProfileCard,
} from '../utils/profileHtml.js';
import { createProfileV2Components } from '../utils/profileComponents.js';

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Просмотр профиля игрока')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Пользователь для просмотра (оставьте пустым для себя)')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('slot')
            .setDescription('Слот: 1 или 2 (по умолчанию активный)')
            .setRequired(false)
            .addChoices(
                { name: 'Слот 1', value: 1 },
                { name: 'Слот 2', value: 2 },
            ));

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Профиль', retryAt)],
            fetchReply: true,
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    let slot = interaction.options.getInteger('slot');
    if (!slot) {
        const { getActiveSlot } = await import('../utils/dataManager.js');
        slot = await getActiveSlot(userId);
    }
    if (slot !== 1 && slot !== 2) slot = 1;

    const slotPlayerId = slot === 1 ? userId : `${userId}_${slot}`;
    const player = await getPlayer(slotPlayerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed(
                'Пустой слот',
                'В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа.',
            )],
            fetchReply: true,
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const [history, styles, totalSP] = await Promise.all([
        getRecentProgressionHistory(slotPlayerId, 8),
        getAllPlayerSP(slotPlayerId),
        getTotalSP(slotPlayerId),
    ]);

    const characterName = player.character_name || player.username;
    const avatarUrl = player.character_avatar
        || targetUser.displayAvatarURL({ extension: 'png', size: 512 });
    const fallbackAvatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 512 });
    const multipliers = getProfileMultipliers(player);
    const reputationTier = getReputationTier(player.reputation);

    const mainCardPromise = generateUnifiedProfileCard({
        characterName,
        avatarUrl,
        fallbackAvatarUrl,
        styles,
        attributeName: player.attribute_name || null,
        ap: player.ap,
        totalSP,
        apMultiplier: multipliers.ap,
        spMultiplier: multipliers.sp,
        salaryMultiplier: Number(player.salary_multiplier ?? 100),
        krw: player.krw,
        yen: player.yen,
        reputation: player.reputation,
        reputationTier: reputationTier.name,
        orgName: player.organization || player.custom_org || null,
        orgRank: player.rank || null,
        playerId: player.id,
        slot,
    }).catch((error) => {
        console.error('Unified profile card render error:', error);
        return null;
    });

    const physicalCardPromise = player.physical_stats
        ? generatePhysicalStatsCard({
            characterName,
            avatarUrl,
            fallbackAvatarUrl,
            stats: player.physical_stats,
            playerId: player.id,
            slot,
        }).catch((error) => {
            console.error('Physical stats card render error:', error);
            return null;
        })
        : Promise.resolve(null);

    const [mainCardBuffer, physicalCardBuffer] = await Promise.all([
        mainCardPromise,
        physicalCardPromise,
    ]);

    const buildView = (page, disabled = false) => {
        const isMain = page === 'main';
        const isPhysical = page === 'physical';
        const buffer = isMain ? mainCardBuffer : isPhysical ? physicalCardBuffer : null;
        const imageName = buffer
            ? (isMain ? 'profile-main.png' : 'physical-stats.png')
            : null;

        return {
            components: createProfileV2Components({
                page,
                player,
                user: targetUser,
                slot,
                totalSP,
                history,
                imageName,
                disabled,
            }),
            files: buffer ? [new AttachmentBuilder(buffer, { name: imageName })] : [],
            imageName,
        };
    };

    let currentPage = 'main';
    const initialView = buildView(currentPage);
    const response = await interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: initialView.components,
        files: initialView.files,
        fetchReply: true,
    });

    const collector = response.createMessageComponentCollector({ time: 3 * 60 * 1000 });
    const pageByButton = {
        profile_main: 'main',
        profile_physical: 'physical',
        profile_history: 'history',
    };

    collector.on('collect', async (componentInteraction) => {
        if (componentInteraction.user.id !== interaction.user.id) {
            await componentInteraction.reply({
                content: 'Это не ваш интерфейс профиля.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const nextPage = pageByButton[componentInteraction.customId];
        if (!nextPage) return;

        currentPage = nextPage;
        const nextView = buildView(currentPage);
        await componentInteraction.update({
            components: nextView.components,
            files: nextView.files,
            attachments: [],
        });
    });

    collector.on('end', async () => {
        try {
            const expiredView = buildView(currentPage, true);
            await interaction.editReply({ components: expiredView.components });
        } catch {}
    });
}
