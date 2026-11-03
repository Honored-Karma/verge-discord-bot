import {
  AttachmentBuilder,
  ComponentType,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  MessageFlagsBitField,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { isLegacyBannerUrl } from "./embeds.js";
import { RESPONSE_COLORS as COLORS, getResponseState, statusHeading, truncateText, splitResponseText } from "./responseStyle.js";

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
  return flags === undefined ? 0 : Number(new MessageFlagsBitField(flags).bitfield);
}

function embedData(embed) {
  // We are converting to V2: legacy embed length limits do not apply here.
  return embed?.data || (typeof embed?.toJSON === "function" ? embed.toJSON() : (embed || {}));
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

function createContainer({ text, embed, state, rows = [] }) {
  const data = embedData(embed);
  const combinedText = [text, embedText(data)].filter(Boolean).join("\n\n");
  const container = new ContainerBuilder().setAccentColor(
    COLORS[state || getResponseState(embed)]
      ?? ([COLORS.success, COLORS.error, COLORS.warning, COLORS.neutral].includes(data.color)
        ? data.color : inferColor(combinedText, data.color)),
  );
  const chunks = splitResponseText(combinedText || "Готово.");

  addText(container, chunks, data.thumbnail);
  addImage(container, data.image);
  addRows(container, rows);
  return container;
}

/** 4,000 characters are shared by all Text Displays, not per component. */
function fitTextBudget(options) {
  const components = options.components.map((component) => component.toJSON?.() || structuredClone(component));
  const texts = [];
  const visit = (component) => {
    if (component.type === ComponentType.TextDisplay) texts.push(component);
    (component.components || []).forEach(visit);
  };
  components.forEach(visit);
  const total = texts.reduce((sum, component) => sum + component.content.length, 0);
  if (total <= 4000) return options;
  if ((options.files?.length || 0) + (options.attachments?.length || 0) >= 10) {
    throw new RangeError("Long response requires one free attachment slot");
  }
  const fullText = texts.map((component) => component.content).join("\n\n");
  const filename = `verge-details-${randomUUID()}.txt`;
  const note = "\n\n-# Текст сокращён. Полный ответ — во вложении ниже.";
  const budget = 4000 - note.length - texts.length * 4;
  for (const component of texts) {
    component.content = truncateText(component.content, Math.max(1, Math.floor(budget * component.content.length / total)));
  }
  texts[0].content += note;
  components.push(new FileBuilder().setURL(`attachment://${filename}`).toJSON());
  const count = (items) => items.reduce((sum, item) => sum + 1 + count(item.components || []) + (item.accessory ? 1 : 0), 0);
  // Free one layout slot without removing controls or text.
  if (count(components) > 40) {
    const index = components.findIndex((component) => component.type === ComponentType.Container);
    if (index >= 0) components.splice(index, 1, ...components[index].components);
    else {
      const indices = components.flatMap((component, i) => component.type === ComponentType.TextDisplay ? [i] : []);
      if (indices.length >= 2) {
        components[indices[0]].content += `\n${components[indices[1]].content}`;
        components.splice(indices[1], 1);
      }
    }
  }
  return { ...options, components,
    files: [...(options.files || []), new AttachmentBuilder(Buffer.from(fullText, "utf8"), { name: filename })] };
}

export function modernizeResponsePayload(payload, { resetLegacyFields = false } = {}) {
  if (payload === undefined || payload === null) return payload;
  const options = typeof payload === "string" ? { content: payload } : { ...payload };
  const state = options.responseState;
  delete options.responseState;

  if (options.ephemeral) {
    options.flags = resolveFlags(options.flags) | MessageFlags.Ephemeral;
    delete options.ephemeral;
  }

  const components = Array.isArray(options.components) ? options.components : [];
  const embeds = Array.isArray(options.embeds) ? options.embeds.filter(Boolean) : [];
  const content = typeof options.content === "string" ? options.content.trim() : "";
  // Mentions inside legacy embeds did not notify users. Keep that behavior.
  if (!content && embeds.length && options.allowedMentions === undefined) options.allowedMentions = { parse: [] };

  if (hasV2Components(components)) {
    options.flags = resolveFlags(options.flags) | MessageFlags.IsComponentsV2;
    if (resetLegacyFields) {
      options.content = null;
      options.embeds = [];
    }
    return fitTextBudget(options);
  }
  if (!content && embeds.length === 0) return options;

  const rows = components.filter((component) => componentType(component) === ComponentType.ActionRow);
  let containers = [];

  if (embeds.length > 0) {
    embeds.forEach((embed, index) => {
      containers.push(createContainer({
        text: index === 0 ? content : "",
        embed,
        state,
        rows: index === embeds.length - 1 ? rows : [],
      }));
    });
  } else {
    containers.push(createContainer({ text: content, state, rows }));
  }

  // Ten embeds with thumbnails, images and five button rows can exceed V2's
  // 40-component budget. Flatten decorative nesting, retaining all text/media/actions.
  const count = (component) => {
    const data = component.toJSON?.() || component;
    return 1 + (data.components || []).reduce((n, child) => n + count(child), 0)
      + (data.accessory ? count(data.accessory) : 0);
  };
  if (containers.reduce((n, component) => n + count(component), 0) > 40) {
    const combined = [content, ...embeds.map((embed) => embedText(embedData(embed)))].filter(Boolean).join("\n\n");
    const compact = createContainer({ text: combined, state: state || getResponseState(embeds[0]) });
    const media = embeds.flatMap((embed) => {
      const data = embedData(embed);
      return [data.thumbnail, data.image].filter((item) => item?.url && !isLegacyBannerUrl(item.url));
    });
    for (let i = 0; i < media.length; i += 10) {
      compact.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        media.slice(i, i + 10).map((item) => new MediaGalleryItemBuilder().setURL(item.url)),
      ));
    }
    addRows(compact, rows);
    containers = [compact];
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
  return fitTextBudget(options);
}

/** Compact shared template; complex panels reuse the same tokens and adapter. */
export function createStatusComponents(title, message, state = "info", { subject, next, rows = [] } = {}) {
  return [createContainer({
    state,
    text: [`## ${statusHeading(title, state)}`, subject, message, next && `-# ${next}`].filter(Boolean).join("\n\n"),
    rows,
  })];
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

  const source = { id: interaction.message?.id || null,
    components: hasV2Components(interaction.message?.components || []) ? interaction.message.components : null };
  const ownReply = { id: null, components: null };
  let editTarget = source.id ? source : ownReply;
  if (source.id && source.components) rememberComponents(source.id, source.components);

  // editReply targets the deferred response. A private reply from a component
  // interaction is a different message from the public panel it came from.
  for (const [method, target] of [["deferReply", ownReply], ["deferUpdate", source]]) {
    if (typeof interaction[method] !== "function") continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = async (...args) => {
      const result = await original(...args);
      editTarget = target;
      return result;
    };
  }

  for (const method of ["reply", "followUp", "editReply", "update"]) {
    if (typeof interaction[method] !== "function") continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = async (payload) => {
      const target = method === "update" ? source : method === "reply" ? ownReply
        : method === "editReply" ? editTarget : { id: null, components: null };
      const previous = (target.id && MESSAGE_COMPONENT_STATE.get(target.id)) || target.components;
      const editsMessage = method === "editReply" || method === "update";
      const nextPayload = editsMessage && isClearControlsPayload(payload) && previous
        ? { ...payload, content: null, embeds: [], components: stripActionRows(previous),
          flags: resolveFlags(payload.flags) | MessageFlags.IsComponentsV2 }
        : modernizeResponsePayload(payload, { resetLegacyFields: editsMessage });
      const result = await original(nextPayload);
      target.id = result?.id || result?.resource?.message?.id || target.id;
      if (hasV2Components(nextPayload?.components || [])) target.components = nextPayload.components;
      if (target.id && target.components) rememberComponents(target.id, target.components);
      if (editsMessage && isClearControlsPayload(payload) && target.id) MESSAGE_COMPONENT_STATE.delete(target.id);
      if (method === "reply") editTarget = ownReply;
      return result;
    };
  }
}
