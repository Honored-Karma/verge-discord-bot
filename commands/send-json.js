import { SlashCommandBuilder, PermissionFlagsBits, REST, Routes } from 'discord.js';

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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
    const jsonString = interaction.options.getString('json');
    const file = interaction.options.getAttachment('file');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!jsonString && !file) {
        return interaction.reply({ content: '❌ Укажите параметр `json` или прикрепите `file`.', flags: 64 });
    }

    let payload;
    try {
        if (file) {
            const response = await fetch(file.url);
            const text = await response.text();
            payload = JSON.parse(text);
        } else {
            payload = JSON.parse(jsonString);
        }
    } catch (e) {
        return interaction.reply({ content: `❌ Невалидный JSON: ${e.message}`, flags: 64 });
    }

    try {
        const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
        const rest = new REST().setToken(token);
        await rest.post(Routes.channelMessages(channel.id), { body: payload });
        await interaction.reply({ content: `✅ Сообщение отправлено в <#${channel.id}>`, flags: 64 });
    } catch (e) {
        const errMsg = e?.rawError?.message || e.message;
        await interaction.reply({ content: `❌ Ошибка отправки: ${errMsg}`, flags: 64 });
    }
}
