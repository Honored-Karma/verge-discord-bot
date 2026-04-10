import { SlashCommandBuilder } from 'discord.js';
import { parseDiscohookPayload } from '../utils/discohookParser.js';
import { createErrorEmbed } from '../utils/embeds.js';
import { hasCommandPermission } from '../utils/adminCheck.js';
import { resolveMember } from '../utils/memberHelper.js';

export const data = new SlashCommandBuilder()
    .setName('render-ui')
    .setDescription('[АДМИН] Рендер UI из Discohook JSON')
    .addStringOption((option) =>
        option
            .setName('json')
            .setDescription('JSON payload из Discohook')
            .setRequired(true))
    .addBooleanOption((option) =>
        option
            .setName('ephemeral')
            .setDescription('Отправить только вам?')
            .setRequired(false));

export async function execute(interaction) {
    const member = await resolveMember(interaction);
    if (!hasCommandPermission(member, 'render-ui')) {
        return interaction.reply({
            embeds: [createErrorEmbed('Доступ запрещен', 'Команда доступна только администраторам.')],
            flags: 64
        });
    }

    const jsonInput = interaction.options.getString('json', true);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

    try {
        const ui = parseDiscohookPayload(jsonInput, {
            emoji: {
                title: process.env.UI_TITLE_EMOJI || '✨',
                fieldTitle: process.env.UI_FIELD_EMOJI || '🔹'
            }
        });

        await interaction.reply({
            content: ui.content ?? undefined,
            embeds: ui.embeds,
            components: ui.components,
            flags: ephemeral ? 64 : undefined
        });
    } catch (error) {
        await interaction.reply({
            embeds: [createErrorEmbed('Ошибка JSON', error.message)],
            flags: 64
        });
    }
}
