import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';

const BUTTON_STYLE_MAP = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
    link: ButtonStyle.Link
};

function applyEmoji(text = '', emojiPrefix = '') {
    if (!text) return text;
    return emojiPrefix ? `${emojiPrefix} ${text}` : text;
}

function parseEmbed(rawEmbed, options) {
    const emoji = options?.emoji || {};
    const embed = new EmbedBuilder();

    if (rawEmbed.color) embed.setColor(rawEmbed.color);
    if (rawEmbed.title) embed.setTitle(applyEmoji(rawEmbed.title, emoji.title));
    if (rawEmbed.description) embed.setDescription(rawEmbed.description);
    if (rawEmbed.url) embed.setURL(rawEmbed.url);
    if (rawEmbed.timestamp) embed.setTimestamp(new Date(rawEmbed.timestamp));
    if (rawEmbed.footer) {
        embed.setFooter({
            text: applyEmoji(rawEmbed.footer.text, emoji.footer),
            iconURL: rawEmbed.footer.icon_url
        });
    }
    if (rawEmbed.thumbnail?.url) embed.setThumbnail(rawEmbed.thumbnail.url);
    if (rawEmbed.image?.url) embed.setImage(rawEmbed.image.url);
    if (rawEmbed.author) {
        embed.setAuthor({
            name: applyEmoji(rawEmbed.author.name, emoji.author),
            iconURL: rawEmbed.author.icon_url,
            url: rawEmbed.author.url
        });
    }

    if (Array.isArray(rawEmbed.fields) && rawEmbed.fields.length > 0) {
        embed.addFields(
            rawEmbed.fields.map((field) => ({
                name: applyEmoji(field.name, emoji.fieldTitle),
                value: applyEmoji(field.value, emoji.fieldValue),
                inline: Boolean(field.inline)
            }))
        );
    }

    return embed;
}

function parseButton(component) {
    const styleName = String(component.style || 'secondary').toLowerCase();
    const style = BUTTON_STYLE_MAP[styleName] || ButtonStyle.Secondary;

    const button = new ButtonBuilder()
        .setLabel(component.label || 'Button')
        .setStyle(style)
        .setDisabled(Boolean(component.disabled));

    if (component.emoji) button.setEmoji(component.emoji);

    if (style === ButtonStyle.Link) {
        button.setURL(component.url || 'https://discord.com');
    } else {
        button.setCustomId(component.custom_id || component.customId || `btn_${Date.now()}`);
    }

    return button;
}

function parseSelectMenu(component) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(component.custom_id || component.customId || `select_${Date.now()}`)
        .setPlaceholder(component.placeholder || 'Выберите опцию')
        .setMinValues(component.min_values ?? 1)
        .setMaxValues(component.max_values ?? 1)
        .setDisabled(Boolean(component.disabled));

    const options = Array.isArray(component.options) ? component.options : [];
    menu.addOptions(options.map((opt, idx) => ({
        label: opt.label || `Опция ${idx + 1}`,
        value: opt.value || `value_${idx + 1}`,
        description: opt.description,
        emoji: opt.emoji,
        default: Boolean(opt.default)
    })));

    return menu;
}

function parseRows(rawRows = []) {
    const rows = [];

    for (const row of rawRows) {
        const actionRow = new ActionRowBuilder();
        const components = Array.isArray(row.components) ? row.components : [];

        for (const component of components) {
            const type = String(component.type || '').toLowerCase();

            if (type === 'button') {
                actionRow.addComponents(parseButton(component));
                continue;
            }

            if (type === 'select' || type === 'string_select' || type === 'stringselect') {
                actionRow.addComponents(parseSelectMenu(component));
            }
        }

        if (actionRow.components.length > 0) {
            rows.push(actionRow);
        }
    }

    return rows;
}

export function parseDiscohookPayload(input, options = {}) {
    try {
        const payload = typeof input === 'string' ? JSON.parse(input) : input;
        const embeds = Array.isArray(payload.embeds) ? payload.embeds.map((embed) => parseEmbed(embed, options)) : [];
        const components = parseRows(payload.components || payload.actionRows || []);

        return {
            content: payload.content || null,
            embeds,
            components
        };
    } catch (error) {
        throw new Error(`Discohook JSON parse error: ${error.message}`);
    }
}
