import { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getPlayer, getAllPlayerSP, getTotalSP, getRecentProgressionHistory } from '../utils/dataManager.js';
import {
    createProfileMainPage,
    createProfileAPSPPage,
    createProfileStylesPage,
    createProfileBalancePage,
    createProfileHistoryPage,
    createProfileButtons,
    createStyleNavigationButtons,
    createErrorEmbed,
    createCooldownEmbed
} from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';
import { generateProfileCard } from '../utils/profileHtml.js';

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
                { name: 'Слот 2', value: 2 }
            )
    );

export async function execute(interaction) {
    const globalCooldown = checkGlobalCooldown(interaction.user.id);
    if (globalCooldown.onCooldown) {
        const retryAt = Math.floor((Date.now() + globalCooldown.remaining) / 1000);
        const msg = await interaction.reply({
            embeds: [createCooldownEmbed('Profile', retryAt)],
            fetchReply: true
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
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }

    const history = await getRecentProgressionHistory(slotPlayerId, 8);
    const styles = await getAllPlayerSP(slotPlayerId);
    const totalSP = await getTotalSP(slotPlayerId);

    // ── Build HTML profile card ──────────────────────────────────
    const topStyles = styles.slice(0, 3);
    const level = Math.floor(player.ap / 100);
    const xp = player.ap % 100;
    const xpToNextLevel = 100;

    let hudBuffer;
    try {
        hudBuffer = await generateProfileCard({
            characterName: player.character_name || player.username,
            avatarUrl: player.character_avatar || targetUser.displayAvatarURL({ extension: 'png', size: 512 }),
            level,
            xp,
            xpToNextLevel,
            styles: topStyles,
            attributeName: player.attribute_name || null,
            attributeValue: player.ap,
            totalSP,
            orgName: player.organization || null,
            orgRank: player.rank || null,
            playerId: player.id,
            slot,
        });
    } catch (err) {
        console.error('Profile card render error:', err);
        hudBuffer = null;
    }

    let mainEmbed;
    const files = [];
    if (hudBuffer) {
        const attachment = new AttachmentBuilder(hudBuffer, { name: 'profile-hud.png' });
        files.push(attachment);
        mainEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🧬 Профиль — ${player.character_name || player.username}`)
            .setImage('attachment://profile-hud.png')
            .setFooter({ text: `ID: ${player.id} • Слот №${slot}` })
            .setTimestamp();
    } else {
        mainEmbed = createProfileMainPage(player, targetUser, slot);
    }
    const buttons = createProfileButtons(0);

    const response = await interaction.reply({
        embeds: [mainEmbed],
        files,
        components: [buttons],
        fetchReply: true
    });

    const collector = response.createMessageComponentCollector({ time: 300000 });
    let stylesPage = 0;

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Это не ваш профиль!', flags: 64 });
        }

        const styles = await getAllPlayerSP(slotPlayerId);
        let newEmbed;
        let newButtons;
        let newFiles = [];

        if (i.customId === 'profile_main') {
            if (hudBuffer) {
                const att = new AttachmentBuilder(hudBuffer, { name: 'profile-hud.png' });
                newFiles = [att];
                newEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`🧬 Профиль — ${player.character_name || player.username}`)
                    .setImage('attachment://profile-hud.png')
                    .setFooter({ text: `ID: ${player.id} • Слот №${slot}` })
                    .setTimestamp();
            } else {
                newEmbed = createProfileMainPage(player, targetUser, slot);
            }
            newButtons = [createProfileButtons(0)];
        } else if (i.customId === 'profile_apsp') {
            const totalSP = await getTotalSP(slotPlayerId);
            newEmbed = createProfileAPSPPage(player, targetUser, totalSP);
            newButtons = [createProfileButtons(1)];
        } else if (i.customId === 'profile_styles') {
            stylesPage = 0;
            const result = createProfileStylesPage(player, styles, targetUser, stylesPage);
            newEmbed = result.embed;
            newButtons = [createProfileButtons(2)];
            if (result.totalPages > 1) {
                newButtons.push(createStyleNavigationButtons(stylesPage, result.totalPages));
            }
        } else if (i.customId === 'styles_prev') {
            stylesPage = Math.max(0, stylesPage - 1);
            const result = createProfileStylesPage(player, styles, targetUser, stylesPage);
            newEmbed = result.embed;
            newButtons = [createProfileButtons(2), createStyleNavigationButtons(stylesPage, result.totalPages)];
        } else if (i.customId === 'styles_next') {
            const nextAttempt = stylesPage + 1;
            const result = createProfileStylesPage(player, styles, targetUser, nextAttempt);
            if (nextAttempt < result.totalPages) stylesPage = nextAttempt;
            const refreshed = createProfileStylesPage(player, styles, targetUser, stylesPage);
            newEmbed = refreshed.embed;
            newButtons = [createProfileButtons(2), createStyleNavigationButtons(stylesPage, refreshed.totalPages)];
        } else if (i.customId === 'profile_balance') {
            newEmbed = createProfileBalancePage(player, targetUser);
            newButtons = [createProfileButtons(3)];
        } else if (i.customId === 'profile_history') {
            newEmbed = createProfileHistoryPage(player, targetUser, history);
            newButtons = [createProfileButtons(4)];
        }

        await i.update({ embeds: [newEmbed], files: newFiles, components: newButtons });
    });

    collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });

    setTimeout(() => {
        response.delete().catch(() => {});
    }, 20000);
}
