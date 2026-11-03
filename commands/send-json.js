import { SlashCommandBuilder, PermissionFlagsBits, Routes } from 'discord.js';
import { isAdmin } from '../utils/adminCheck.js';

export const data = new SlashCommandBuilder()
    .setName('send-json')
    .setDescription('Отправить сообщение от имени бота из JSON')
    .addStringOption(opt =>
        opt.setName('json')
            .setDescription('JSON тело сообщения')
            .setRequired(false))
    .addAttachmentOption(opt =>
        opt.setName('file')
            .setDescription('JSON файл (.json) с телом сообщения')
            .setRequired(false))
    .addChannelOption(opt =>
        opt.setName('channel')
            .setDescription('Канал для отправки (по умолчанию — текущий)')
            .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);

export async function execute(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ Доступ запрещён. Команда только для администраторов.', flags: 64 });
    }

    const jsonString = interaction.options.getString('json');
    const file = interaction.options.getAttachment('file');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!jsonString && !file) {
        return interaction.reply({ content: '❌ Укажите параметр `json` или прикрепите `file`.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let payload;
    try {
        if (file) {
            if (file.size && file.size > 500 * 1024) {
                return interaction.editReply({ content: '❌ Размер JSON файла превышает лимит (максимум 500 КБ).' });
            }
            if (!file.url || (!file.url.includes('cdn.discordapp.com') && !file.url.includes('media.discordapp.net'))) {
                return interaction.editReply({ content: '❌ Файл должен быть загружен через Discord.' });
            }
            const response = await fetch(file.url, { signal: AbortSignal.timeout(8000) });
            if (!response.ok) {
                return interaction.editReply({ content: `❌ Не удалось скачать файл (HTTP ${response.status})` });
            }
            const text = await response.text();
            payload = JSON.parse(text);
        } else {
            payload = JSON.parse(jsonString);
        }
    } catch (e) {
        return interaction.editReply({ content: `❌ Невалидный JSON: ${e.message}` });
    }

    try {
        await interaction.client.rest.post(Routes.channelMessages(channel.id), { body: payload });
        await interaction.editReply({ content: `✅ Сообщение отправлено в <#${channel.id}>` });
    } catch (e) {
        const errMsg = e?.rawError?.message || e.message;
        await interaction.editReply({ content: `❌ Ошибка отправки: ${errMsg}` });
    }
}
