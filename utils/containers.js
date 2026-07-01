import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from "discord.js";
import { COLORS } from "./theme.js";

export const V2_FLAG = MessageFlags.IsComponentsV2;

/**
 * Собирает Container (Components V2) с акцентной полосой, секциями и опциональной галереей.
 */
export function buildContainer({
  accentColor,
  title,
  description,
  thumbnail,
  fields = [],
  mediaGallery = [],
  separators = true,
  actionRows = [],
}) {
  const container = new ContainerBuilder();
  if (accentColor != null) container.setAccentColor(accentColor);

  const header = [title, description].filter(Boolean).join("\n\n");
  if (header) {
    if (thumbnail) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(header),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(thumbnail),
          ),
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(header),
      );
    }
  }

  const visibleFields = fields.filter((f) => f.value);
  if (separators && visibleFields.length && header) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    );
  }

  for (const field of visibleFields) {
    const content = field.name
      ? `**${field.name}**\n${field.value}`
      : field.value;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    );
  }

  if (mediaGallery.length) {
    const gallery = new MediaGalleryBuilder();
    for (const url of mediaGallery) {
      gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
    }
    container.addMediaGalleryComponents(gallery);
  }

  for (const row of actionRows) {
    container.addActionRowComponents(row);
  }

  return container;
}

/** Конвертирует EmbedBuilder в Container, опционально заменяя баннер на MediaGallery. */
export function containerFromEmbed(
  embed,
  { omitImage = false, mediaGallery = [] } = {},
) {
  const data =
    typeof embed.toJSON === "function" ? embed.toJSON() : embed.data ?? embed;

  const images = [...mediaGallery];
  if (!omitImage && data.image?.url) images.push(data.image.url);

  const fields = [...(data.fields || [])];
  if (data.footer?.text) {
    fields.push({ name: "", value: `*${data.footer.text}*` });
  }
  if (data.timestamp) {
    const ts = Math.floor(new Date(data.timestamp).getTime() / 1000);
    fields.push({ name: "", value: `<t:${ts}:f>` });
  }

  return buildContainer({
    accentColor: data.color,
    title: data.title ?? undefined,
    description: data.description ?? undefined,
    thumbnail: data.thumbnail?.url,
    fields,
    mediaGallery: images,
  });
}

/** Payload для interaction.reply / editReply / update с флагом Components V2. */
export function v2Payload(container, { extraComponents = [], files = [], ephemeral = false } = {}) {
  let flags = V2_FLAG;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  return {
    components: [container, ...extraComponents],
    files,
    flags,
  };
}

export function createErrorContainer(title, description) {
  return buildContainer({
    accentColor: COLORS.error,
    title: `<:38minus:1497656812772655154>  ${title}`,
    description,
  });
}

export function createCooldownContainer(actionName, unixTimestamp) {
  return buildContainer({
    accentColor: COLORS.warning,
    title: `⏳ ${actionName}: кулдаун`,
    description:
      `Следующее действие будет доступно <t:${unixTimestamp}:R>.\n` +
      `Точное время: <t:${unixTimestamp}:F>`,
  });
}

export function createSuccessContainer(title, description) {
  return buildContainer({
    accentColor: COLORS.success,
    title: `<:37plus:1497656766459281428>  ${title}`,
    description,
  });
}

export function createInfoContainer(title, description) {
  return buildContainer({
    accentColor: COLORS.info,
    title,
    description,
  });
}

export function errorV2(title, description) {
  return v2Payload(createErrorContainer(title, description));
}

export function cooldownV2(actionName, unixTimestamp) {
  return v2Payload(createCooldownContainer(actionName, unixTimestamp));
}

export function embedV2(embed, { omitImage = false, mediaGallery = [], extraComponents = [] } = {}) {
  return v2Payload(containerFromEmbed(embed, { omitImage, mediaGallery }), { extraComponents });
}
