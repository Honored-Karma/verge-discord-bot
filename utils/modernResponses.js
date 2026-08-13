import {
  ComponentType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { isLegacyBannerUrl } from "./embeds.js";

const COLORS = {
  brand: 0xb209d4,
  success: 0x22c55e,
  error: 0xef4444,
  warning: 0xf59e0b,
  info: 0x38bdf8,
};

const V2_COMPONENT_TYPES = new Set([
  ComponentType.TextDisplay,
  ComponentType.Section,
  ComponentType.MediaGallery,
  ComponentType.Separator,
  ComponentType.Container,
]);

const ADAPTER_INSTALLED = Symbol("modernResponseAdapterInstalled");
const MESSAGE_COMPONENT_STATE = new Map();
const MAX_REMEMBERED_MESSAGES = 1_000;

function rememberComponents(messageId, components) {
  if (!messageId || !components) return;
  MESSAGE_COMPONENT_STATE.delete(messageId);
  MESSAGE_COMPONENT_STATE.set(messageId, components);

  while (MESSAGE_COMPONENT_STATE.size > MAX_REMEMBERED_MESSAGES) {
    const oldestMessageId = MESSAGE_COMPONENT_STATE.keys().next().value;
    MESSAGE_COMPONENT_STATE.delete(oldestMessageId);
  }
}

function componentType(component) {
  try {
    return component?.data?.type ?? component?.toJSON?.().type ?? component?.type;
  } catch {
    return component?.data?.type ?? component?.type;
  }
}

function hasV2Components(components = []) {
  return components.some((component) => V2_COMPONENT_TYPES.has(componentType(component)));
}

function resolveFlags(flags) {
  if (typeof flags === "number") return flags;
  if (typeof flags === "bigint") return Number(flags);
  if (flags?.bitfield !== undefined) return Number(flags.bitfield);
  return 0;
}

function embedData(embed) {
  return typeof embed?.toJSON === "function" ? embed.toJSON() : (embed || {});
}

function inferColor(text, fallback = COLORS.brand) {
  const value = String(text || "").toLocaleLowerCase("ru-RU");
  if (/ошиб|запрещ|не удалось|нельзя|не найден|невер|некоррект|недоступ|истек/.test(value)) {
    return COLORS.error;
  }
  if (/кулдаун|подожд|время вышло|осторож|подтвержд/.test(value)) {
    return COLORS.warning;
  }
  if (/успеш|заверш|обновлен|обновлён|добавлен|создан|выдан|установлен|списан|удалён|удален|использован|изменён|выбран/.test(value)) {
    return COLORS.success;
  }
  if (/инфо|справк|список|таблиц|рейтинг|слот|инвентар/.test(value)) {
    return COLORS.info;
  }
  return Number.isInteger(fallback) ? fallback : COLORS.brand;
}

function splitText(value, limit = 3900) {
  const source = String(value || "").trim();
  if (!source) return [];

  const chunks = [];
  let remaining = source;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.55)) cut = remaining.lastIndexOf(" ", limit);
    if (cut < Math.floor(limit * 0.55)) cut = limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return null;
  const milliseconds = new Date(timestamp).getTime();
  if (!Number.isFinite(milliseconds)) return null;
  return `<t:${Math.floor(milliseconds / 1000)}:R>`;
}

function embedText(data) {
  const blocks = [];
  if (data.author?.name) blocks.push(`-# ${data.author.name}`);
  if (data.title) blocks.push(`## ${data.title}`);
  if (data.description) blocks.push(data.description);

  for (const field of data.fields || []) {
    blocks.push(`### ${field.name}\n${field.value}`);
  }

  const footer = [data.footer?.text, formatTimestamp(data.timestamp)].filter(Boolean).join(" • ");
  if (footer) blocks.push(`-# ${footer}`);
  return blocks.join("\n\n");
}

function addText(container, chunks, thumbnail) {
  chunks.forEach((chunk, index) => {
    if (index === 0 && thumbnail?.url) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk))
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(thumbnail.url)
              .setDescription(thumbnail.description || "Изображение профиля"),
          ),
      );
      return;
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
  });
}

function addImage(container, image) {
  if (!image?.url || isLegacyBannerUrl(image.url)) return;
  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(image.url)
          .setDescription(image.description || "Изображение"),
      ),
    );
}

function addRows(container, rows) {
  for (const row of rows) {
    if (componentType(row) !== ComponentType.ActionRow) continue;
    container.addActionRowComponents(row);
  }
}

function createContainer({ text, embed, rows = [] }) {
  const data = embedData(embed);
  const combinedText = [text, embedText(data)].filter(Boolean).join("\n\n");
  const container = new ContainerBuilder().setAccentColor(
    inferColor(combinedText, data.color),
  );
  const chunks = splitText(combinedText || "Готово.");

  addText(container, chunks.slice(0, 7), data.thumbnail);
  addImage(container, data.image);
  addRows(container, rows);
  return container;
}

export function modernizeResponsePayload(payload, { resetLegacyFields = false } = {}) {
  if (payload === undefined || payload === null) return payload;
  const options = typeof payload === "string" ? { content: payload } : { ...payload };

  if (options.ephemeral) {
    options.flags = resolveFlags(options.flags) | MessageFlags.Ephemeral;
    delete options.ephemeral;
  }

  const components = Array.isArray(options.components) ? options.components : [];
  const embeds = Array.isArray(options.embeds) ? options.embeds.filter(Boolean) : [];
  const content = typeof options.content === "string" ? options.content.trim() : "";

  if (hasV2Components(components)) return options;
  if (!content && embeds.length === 0) return options;

  const rows = components.filter((component) => componentType(component) === ComponentType.ActionRow);
  const containers = [];

  if (embeds.length > 0) {
    embeds.forEach((embed, index) => {
      containers.push(createContainer({
        text: index === 0 ? content : "",
        embed,
        rows: index === embeds.length - 1 ? rows : [],
      }));
    });
  } else {
    containers.push(createContainer({ text: content, rows }));
  }

  if (resetLegacyFields) {
    options.content = null;
    options.embeds = [];
  } else {
    delete options.content;
    delete options.embeds;
  }
  options.components = containers;
  options.flags = resolveFlags(options.flags) | MessageFlags.IsComponentsV2;
  return options;
}

function isClearControlsPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.components) &&
    payload.components.length === 0 &&
    payload.content === undefined &&
    payload.embeds === undefined,
  );
}

function stripActionRows(components = []) {
  return components
    .map((component) => {
      const data = typeof component?.toJSON === "function" ? component.toJSON() : structuredClone(component);
      if (data?.type === ComponentType.ActionRow) return null;
      if (Array.isArray(data?.components)) {
        data.components = data.components.filter(
          (child) => child?.type !== ComponentType.ActionRow,
        );
      }
      return data;
    })
    .filter(Boolean);
}

export function installModernResponseAdapter(interaction) {
  if (!interaction || interaction[ADAPTER_INSTALLED]) return;
  interaction[ADAPTER_INSTALLED] = true;

  let messageId = interaction.message?.id || null;
  let lastV2Components = hasV2Components(interaction.message?.components || [])
    ? interaction.message.components
    : null;
  if (messageId && lastV2Components) {
    rememberComponents(messageId, lastV2Components);
  }

  const methods = ["reply", "followUp", "editReply", "update"];
  for (const method of methods) {
    if (typeof interaction?.[method] !== "function") continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = async (payload) => {
      const sharedComponents = messageId ? MESSAGE_COMPONENT_STATE.get(messageId) : null;
      if (sharedComponents) lastV2Components = sharedComponents;

      let nextPayload;
      if (isClearControlsPayload(payload) && lastV2Components) {
        nextPayload = {
          ...payload,
          content: null,
          embeds: [],
          components: stripActionRows(lastV2Components),
          flags: resolveFlags(payload.flags) | MessageFlags.IsComponentsV2,
        };
      } else {
        nextPayload = modernizeResponsePayload(payload, {
          resetLegacyFields: method === "editReply" || method === "update",
        });
      }

      if (hasV2Components(nextPayload?.components || [])) {
        lastV2Components = nextPayload.components;
      }
      const result = await original(nextPayload);
      messageId = result?.id || messageId;
      if (messageId && lastV2Components) {
        rememberComponents(messageId, lastV2Components);
      }
      if (isClearControlsPayload(payload) && messageId) {
        MESSAGE_COMPONENT_STATE.delete(messageId);
      }
      return result;
    };
  }
}
