import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('components-demo')
    .setDescription('Демо компонентных сообщений: Button, Select, Modal');

function baseEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🧩 Компонентное сообщение')
        .setDescription('Используйте кнопки и меню ниже.\n`Открыть модалку` -> откроет форму ввода.')
        .setImage('https://s.iimg.su/s/22/uPwMsKAxzFj3zv2fzk1VVgPLssmMEosDzMeKuRk4.jpg')
        .setTimestamp();
}

export async function execute(interaction) {
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('demo_ping')
            .setLabel('Ping')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('demo_modal')
            .setLabel('Открыть модалку')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('demo_close')
            .setLabel('Закрыть')
            .setStyle(ButtonStyle.Danger)
    );

    const select = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('demo_select')
            .setPlaceholder('Выберите действие')
            .addOptions(
                { label: 'Показать AP/SP инфо', value: 'apsp', emoji: '📊' },
                { label: 'Показать rank инфо', value: 'rank', emoji: '👑' },
                { label: 'Показать salary инфо', value: 'salary', emoji: '💸' }
            )
    );

    const message = await interaction.reply({
        embeds: [baseEmbed()],
        components: [buttons, select],
        fetchReply: true
    });

    const collector = message.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Это демо-сообщение не для вас.', flags: 64 });
        }

        if (i.isButton()) {
            if (i.customId === 'demo_ping') {
                return i.reply({ content: `🏓 Pong! Latency: ${Date.now() - i.createdTimestamp}ms`, flags: 64 });
            }

            if (i.customId === 'demo_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('demo_feedback_modal')
                    .setTitle('Отправка формы');

                const input = new TextInputBuilder()
                    .setCustomId('feedback_text')
                    .setLabel('Введите текст')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Например: очень красиво!')
                    .setRequired(true)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({
                        time: 120000,
                        filter: (submitInteraction) =>
                            submitInteraction.customId === 'demo_feedback_modal' &&
                            submitInteraction.user.id === interaction.user.id
                    });

                    const submittedText = modalSubmit.fields.getTextInputValue('feedback_text');
                    await modalSubmit.reply({ content: `✅ Получено из модалки: ${submittedText}`, flags: 64 });
                } catch {
                    // no-op: modal timeout
                }
                return;
            }

            if (i.customId === 'demo_close') {
                collector.stop('closed');
                return i.update({ content: '🛑 Компонентная сессия закрыта.', embeds: [], components: [] });
            }
        }

        if (i.isStringSelectMenu() && i.customId === 'demo_select') {
            const choice = i.values[0];
            const details = {
                apsp: 'AP/SP отслеживаются в профиле, включая множители и историю изменений.',
                rank: 'Ранг игрока задается через /set-rank с учетом выбранной организации.',
                salary: 'Зарплата начисляется кроном раз в неделю на основе rank + organization.'
            };

            return i.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('ℹ️ Результат выбора')
                        .setDescription(details[choice] || 'Нет данных')
                        .setImage('https://s.iimg.su/s/22/uClf58LxwwC7ZyuLlAWkzTJ3TD4tsoH4fjoKN653.jpg')
                        .setTimestamp()
                ],
                flags: 64
            });
        }
    });

    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });
}
