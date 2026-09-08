import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { checkGlobalCooldown } from '../utils/cooldowns.js';
import { logCommand } from '../utils/logs.js';
import { createLootboxPayload } from '../utils/lootbox.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('lootbox')
    .setDescription('[АДМИН] Открыть Lucky Lootbox и испытать удачу')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
        option.setName('hidden')
            .setDescription('Показать результат только вам')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('test_roll')
            .setDescription('Фиксированное число (1..100 для проверки)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100));

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: '❌ Эта команда доступна только администраторам и владельцу сервера.',
            flags: 64
        });
    }

    const cooldown = checkGlobalCooldown(interaction.user.id);
    if (cooldown.onCooldown) {
        return interaction.reply({
            content: `⏱️ Подождите **${cooldown.remainingFormatted}** перед следующей командой!`,
            flags: 64
        });
    }

    const hidden = interaction.options.getBoolean('hidden') === true;
    const customRoll = interaction.options.getInteger('test_roll');

    const { roll, outcome, embed, components } = createLootboxPayload(customRoll);

    await interaction.reply({
        embeds: [embed],
        components,
        flags: hidden ? 64 : 0
    });

    await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        command: 'lootbox',
        extra: {
            roll,
            reward: outcome.name,
            hidden
        }
    }).catch(error => console.error('Error logging lootbox command:', error));
}
