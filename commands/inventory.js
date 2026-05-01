import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { getPlayer, getPlayerInventory } from '../utils/dataManager.js';
import { createCooldownEmbed, createInventoryEmbed, createInfoEmbed, createErrorEmbed } from '../utils/embeds.js';
import { checkGlobalCooldown, autoDeleteMessageShort } from '../utils/cooldowns.js';

export const data = new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Просмотр инвентаря')
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
            embeds: [createCooldownEmbed('Инвентарь', retryAt)],
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
    const playerId = slot === 1 ? userId : `${userId}_${slot}`;
    const player = await getPlayer(playerId);
    if (!player) {
        const msg = await interaction.reply({
            embeds: [createErrorEmbed('Пустой слот', `В этом слоте нет персонажа. Используйте /register, чтобы создать нового персонажа в этом слоте.`)],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const inventory = await getPlayerInventory(playerId);
    
    if (inventory.length === 0) {
        const name = player.character_name || player.username;
        const msg = await interaction.reply({
            embeds: [createInfoEmbed('🎒 Инвентарь', `Инвентарь игрока **${name}** пуст.`, 'inventory')],
            fetchReply: true
        });
        autoDeleteMessageShort(msg);
        return;
    }
    
    const name = player.character_name || player.username;
    const itemsPerPage = 8;
    const totalPages = Math.ceil(inventory.length / itemsPerPage);
    let page = 0;

    function buildPageText(currentPage) {
        const start = currentPage * itemsPerPage;
        const end = start + itemsPerPage;
        return inventory.slice(start, end).map((item, idx) => {
            const number = start + idx + 1;
            return `\`${number}.\` **${item.item_name}** x${item.qty}`;
        }).join('\n');
    }

    function buildButtons(currentPage) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('inv_prev')
                .setLabel('◀ Назад')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('inv_next')
                .setLabel('Вперёд ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1)
        );
    }

    const embed = createInventoryEmbed(`🎒 Инвентарь — ${name}`, buildPageText(page))
        .setFooter({ text: `Страница ${page + 1}/${totalPages}` });

    const components = totalPages > 1 ? [buildButtons(page)] : [];
    const msg = await interaction.reply({ embeds: [embed], components, fetchReply: true });

    if (totalPages <= 1) {
        autoDeleteMessageShort(msg);
        return;
    }

    const collector = msg.createMessageComponentCollector({ time: 180000 });
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Это не ваш инвентарь.', flags: 64 });
        }

        if (i.customId === 'inv_prev') page = Math.max(0, page - 1);
        if (i.customId === 'inv_next') page = Math.min(totalPages - 1, page + 1);

        const nextEmbed = createInventoryEmbed(`🎒 Инвентарь — ${name}`, buildPageText(page))
            .setFooter({ text: `Страница ${page + 1}/${totalPages}` });
        await i.update({ embeds: [nextEmbed], components: [buildButtons(page)] });
    });

    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });
}
