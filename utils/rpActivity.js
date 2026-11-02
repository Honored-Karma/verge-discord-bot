import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { getDB } from "./db.js";
import { applyRPActivityPenalty, getActiveSlot } from "./dataManager.js";
import { createErrorEmbed } from "./embeds.js";
import { makePlayerKey } from "./playerKey.js";
import { logCommand } from "./logs.js";

const DEFAULT_RP_ROLE_ID = "1431761095319879892";

export async function isRPActivityChannel(interaction) {
  if (!interaction.guildId || !interaction.guild) return false;
  const guild = interaction.guild;
  const roleId = process.env.RP_ROLE_ID || process.env.PLAYER_ROLE_ID || DEFAULT_RP_ROLE_ID;
  const [everyone, role] = await Promise.all([
    guild.roles.fetch(guild.id, { force: true }),
    guild.roles.fetch(roleId, { force: true }),
  ]);
  if (!everyone) throw new Error("Роль @everyone не найдена на сервере");
  if (!role) throw new Error("РП-роль не найдена на сервере");

  // Force a REST read: cached overwrites can outlive an open training form.
  let channel = await guild.channels.fetch(interaction.channelId, { force: true });
  if (!channel) throw new Error("Канал не найден");
  if (channel?.isThread()) {
    channel = await guild.channels.fetch(channel.parentId, { force: true });
    if (!channel) throw new Error("Родительский канал ветки не найден");
  }
  // Discord copies category overwrites into synced channels. Unsynced channels
  // have their own overwrites, so their actual permissions are authoritative.
  const everyonePermissions = channel.permissionsFor(everyone, false);
  const rpPermissions = channel.permissionsFor(role, false);
  if (!everyonePermissions || !rpPermissions) throw new Error("Права канала недоступны");
  return !everyonePermissions.has(PermissionFlagsBits.ViewChannel, false)
    && rpPermissions.has(PermissionFlagsBits.ViewChannel, false);
}

// Returns true once the interaction has been rejected and answered.
export async function enforceRPActivityChannel(interaction, playerId, currency, styleId = null) {
  let allowed;
  try {
    allowed = await isRPActivityChannel(interaction);
  } catch (error) {
    console.error("[rp-activity] Cannot check channel permissions:", error);
    await replyError(interaction, "Не удалось проверить права РП-канала",
      "Попробуйте ещё раз или обратитесь к администрации. Штраф не списан.");
    return true;
  }
  if (allowed) return false;
  if (!interaction.guildId) {
    await replyError(interaction, "Команда доступна только на сервере",
      "Используйте её в РП-канале. Штраф не списан.");
    return true;
  }

  const penalty = await applyRPActivityPenalty(playerId, currency, styleId);
  if (!penalty.success) {
    await replyError(interaction, "Команда доступна только в РП-каналах",
      "Не удалось списать штраф. Обратитесь к администрации.");
    return true;
  }
  const styleText = penalty.styleName ? ` в стиле «${penalty.styleName}»` : "";
  await replyError(interaction, "Команда доступна только в РП-каналах",
    `За использование вне РП-канала списано **${penalty.deducted} ${currency.toUpperCase()}**${styleText}.\n`
    + `Осталось: **${penalty.balance} ${currency.toUpperCase()}**. Награда не начислена.`);
  await logCommand({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    userTag: interaction.user.tag || interaction.user.username,
    command: interaction.commandName || (currency === "sp" ? "train-sp"
      : interaction.customId?.startsWith("social_rp_modal:") ? "social-rp" : "train-ap"),
    extra: { reason: "outside_rp_category", penalty: penalty.deducted, currency, style: penalty.styleName },
  }).catch(error => console.error("[rp-activity] Penalty log error:", error));
  return true;
}

async function replyError(interaction, title, description) {
  const payload = { embeds: [createErrorEmbed(title, description)], allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ ...payload, content: null, components: [] });
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

export async function resetTrainingLocationOnMessage(message) {
  if (!message.guildId || message.author?.bot || !message.content?.trim()) return;
  const slot = await getActiveSlot(message.author.id);
  await getDB().collection("players").updateOne({
    id: makePlayerKey(message.author.id, slot),
    "training_location.guild_id": message.guildId,
    "training_location.channel_id": { $ne: message.channelId },
  }, { $unset: { training_location: "" } });
}
