import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, getAllPlayerSP, getTotalSP } from '../utils/dataManager.js';
import { createProfileMainPage, createProfileAPSPPage, createProfileStylesPage, createProfileBalancePage, createProfileButtons, createStyleNavigationButtons, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

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
        const msg = await interaction.reply({
            content: `⏱️ Подождите **${globalCooldown.remainingFormatted}** перед следующей командой!`,
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

    const embed = createProfileMainPage(player, targetUser);
    const buttons = createProfileButtons(0);

    const response = await interaction.reply({
        embeds: [embed],
        components: [buttons],
        fetchReply: true
    });

    const collector = response.createMessageComponentCollector({ time: 300000 });

    let currentPage = 0;
    let stylesPage = 0;

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Это не ваш профиль!', flags: 64 });
        }

        const styles = await getAllPlayerSP(slotPlayerId);
        let newEmbed, newButtons;

        if (i.customId === 'profile_main') {
            currentPage = 0;
            newEmbed = createProfileMainPage(player, targetUser);
            newButtons = [createProfileButtons(0)];
        } else if (i.customId === 'profile_apsp') {
            currentPage = 1;
            const totalSP = await getTotalSP(slotPlayerId);
            newEmbed = createProfileAPSPPage(player, targetUser, totalSP);
            newButtons = [createProfileButtons(1)];
        } else if (i.customId === 'profile_styles') {
            currentPage = 2;
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
            const result = createProfileStylesPage(player, styles, targetUser, stylesPage + 1);
            stylesPage++;
            newEmbed = result.embed;
            newButtons = [createProfileButtons(2), createStyleNavigationButtons(stylesPage, result.totalPages)];
        } else if (i.customId === 'profile_balance') {
            currentPage = 3;
            newEmbed = createProfileBalancePage(player, targetUser);
            newButtons = [createProfileButtons(3)];
        }

        await i.update({ embeds: [newEmbed], components: newButtons });
    });
    
    collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });
    
    // Auto-delete profile message after 20 seconds
    setTimeout(() => {
        response.delete().catch(() => {});
    }, 20000);
}
