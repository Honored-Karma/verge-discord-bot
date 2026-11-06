import { EmbedBuilder, MessageFlags } from "discord.js";
import { getDB } from "./db.js";
import { createErrorEmbed } from "./embeds.js";

// In-memory fallback for test environments or simulations when MongoDB is not connected
const memoryChannelBlocks = new Map();

/**
 * Extracts channel IDs from a Discord ChannelOption, StringOption, or Discord URLs.
 * Correctly parses mentions (<#123...>), Discord URLs (https://discord.com/channels/guild/channel),
 * and plain numeric IDs (123456...).
 */
export function extractChannelIds(channelOption, channelsString) {
  const ids = new Set();
  if (channelOption?.id) {
    ids.add(String(channelOption.id));
  }
  if (typeof channelsString === "string" && channelsString.trim()) {
    // 1. Extract from Discord channel URLs first, so guild IDs in the URL aren't picked up as channels
    const urlRegex = /https?:\/\/(?:[a-z0-9-]+\.)?discord(?:app)?\.com\/channels\/\d+\/(\d+)/gi;
    const withoutUrls = channelsString.replace(urlRegex, (_, channelId) => {
      ids.add(channelId);
      return " ";
    });

    // 2. Mentions: <#123456789012345678>
    const mentionRegex = /<#(\d+)>/g;
    let match;
    while ((match = mentionRegex.exec(withoutUrls)) !== null) {
      ids.add(match[1]);
    }

    // 3. Bare numeric IDs (Discord snowflakes or test IDs)
    const idRegex = /\b(\d{3,20})\b/g;
    while ((match = idRegex.exec(withoutUrls)) !== null) {
      ids.add(match[1]);
    }
  }
  return Array.from(ids);
}

/**
 * Blocks one or more channels for training in a guild
 */
export async function blockTrainingChannels({
  guildId,
  channels, // array of { id, name }
  adminId,
  reason = null,
}) {
  try {
    const db = getDB();
    const now = new Date();
    const blocked = [];
    const updated = [];

    if (!db) {
      for (const ch of channels) {
        const channelId = String(ch.id);
        const key = `${guildId}:${channelId}`;
        const existing = memoryChannelBlocks.get(key);
        if (existing) {
          existing.reason = reason || existing.reason;
          existing.channel_name = ch.name || existing.channel_name;
          existing.blocked_by = String(adminId);
          existing.updated_at = now;
          updated.push({ id: channelId, name: ch.name || existing.channel_name, reason: existing.reason });
        } else {
          const item = {
            guild_id: String(guildId),
            channel_id: channelId,
            channel_name: ch.name || null,
            reason: reason || null,
            blocked_by: String(adminId),
            blocked_at: now,
            is_active: true,
          };
          memoryChannelBlocks.set(key, item);
          blocked.push({ id: channelId, name: ch.name, reason });
        }
      }
      return { success: true, blocked, updated };
    }

    for (const ch of channels) {
      const channelId = String(ch.id);
      const existing = await db.collection("training_channel_blocks").findOne({
        guild_id: String(guildId),
        channel_id: channelId,
        is_active: { $ne: false },
      });

      if (existing) {
        await db.collection("training_channel_blocks").updateOne(
          { _id: existing._id },
          {
            $set: {
              channel_name: ch.name || existing.channel_name,
              reason: reason || existing.reason,
              blocked_by: String(adminId),
              updated_at: now,
            },
          },
        );
        updated.push({ id: channelId, name: ch.name || existing.channel_name, reason: reason || existing.reason });
      } else {
        await db.collection("training_channel_blocks").updateOne(
          { guild_id: String(guildId), channel_id: channelId },
          {
            $set: {
              guild_id: String(guildId),
              channel_id: channelId,
              channel_name: ch.name || null,
              reason: reason || null,
              blocked_by: String(adminId),
              blocked_at: now,
              is_active: true,
            },
          },
          { upsert: true },
        );
        blocked.push({ id: channelId, name: ch.name, reason });
      }
    }

    return { success: true, blocked, updated };
  } catch (error) {
    console.error("[trainingChannelBlocks] Error blocking channels:", error);
    return { success: false, error: "Ошибка сохранения в базе данных" };
  }
}

/**
 * Unblocks one or more channels (or all) for training in a guild
 */
export async function unblockTrainingChannels({
  guildId,
  channelIds = [],
  all = false,
}) {
  try {
    const db = getDB();

    if (!db) {
      if (all) {
        let count = 0;
        for (const [key, item] of memoryChannelBlocks.entries()) {
          if (item.guild_id === String(guildId)) {
            memoryChannelBlocks.delete(key);
            count++;
          }
        }
        return { success: true, deletedCount: count, all: true };
      }
      let count = 0;
      const ids = channelIds.map(String);
      for (const id of ids) {
        const key = `${guildId}:${id}`;
        if (memoryChannelBlocks.delete(key)) count++;
      }
      return { success: true, deletedCount: count, unblockedIds: ids };
    }

    if (all) {
      const res = await db.collection("training_channel_blocks").deleteMany({
        guild_id: String(guildId),
      });
      return { success: true, deletedCount: res.deletedCount, all: true };
    }

    const ids = channelIds.map(String);
    const res = await db.collection("training_channel_blocks").deleteMany({
      guild_id: String(guildId),
      channel_id: { $in: ids },
    });
    return { success: true, deletedCount: res.deletedCount, unblockedIds: ids };
  } catch (error) {
    console.error("[trainingChannelBlocks] Error unblocking channels:", error);
    return { success: false, error: "Ошибка удаления из базы данных" };
  }
}

/**
 * Gets all blocked channels for a guild
 */
export async function getBlockedTrainingChannels(guildId) {
  try {
    const db = getDB();
    if (!db) {
      const result = [];
      for (const item of memoryChannelBlocks.values()) {
        if (item.guild_id === String(guildId) && item.is_active !== false) {
          result.push(item);
        }
      }
      return result.sort((a, b) => (b.blocked_at?.getTime?.() || 0) - (a.blocked_at?.getTime?.() || 0));
    }
    return await db
      .collection("training_channel_blocks")
      .find({ guild_id: String(guildId), is_active: { $ne: false } })
      .sort({ blocked_at: -1 })
      .toArray();
  } catch (error) {
    console.error("[trainingChannelBlocks] Error fetching blocked channels:", error);
    return [];
  }
}

/**
 * Checks if a channel (or thread parent, or category) is blocked
 */
export async function getTrainingChannelBlock(guildId, channelOrInteraction) {
  if (!guildId || !channelOrInteraction) return null;

  try {
    const idsToCheck = new Set();
    if (typeof channelOrInteraction === "string") {
      idsToCheck.add(channelOrInteraction);
    } else {
      const cId = channelOrInteraction.channelId || channelOrInteraction.id;
      if (cId) idsToCheck.add(String(cId));

      const guild = channelOrInteraction.guild;
      const channel =
        channelOrInteraction.channel ||
        (guild?.channels?.cache?.get ? guild.channels.cache.get(cId) : null);

      if (channel?.id) idsToCheck.add(String(channel.id));
      if (channel?.parentId) {
        idsToCheck.add(String(channel.parentId));
        const parentChannel =
          channel.parent ||
          (guild?.channels?.cache?.get ? guild.channels.cache.get(channel.parentId) : null);
        if (parentChannel?.parentId) {
          idsToCheck.add(String(parentChannel.parentId));
        }
      }
    }

    const cleanIds = Array.from(idsToCheck).filter(Boolean);
    if (cleanIds.length === 0) return null;

    const db = getDB();
    if (!db) {
      for (const id of cleanIds) {
        const key = `${guildId}:${id}`;
        const item = memoryChannelBlocks.get(key);
        if (item && item.is_active !== false) {
          return item;
        }
      }
      return null;
    }

    return await db.collection("training_channel_blocks").findOne({
      guild_id: String(guildId),
      channel_id: { $in: cleanIds },
      is_active: { $ne: false },
    });
  } catch (error) {
    console.error("[trainingChannelBlocks] Error checking channel block:", error);
    return null;
  }
}

/**
 * Middleware-like check for commands (/train-ap, /train-sp, /social-rp)
 * Returns true if training was blocked and an error message was sent.
 */
export async function checkTrainingChannelBlocked(interaction) {
  if (!interaction?.guildId) return false;

  const block = await getTrainingChannelBlock(interaction.guildId, interaction);
  if (!block) return false;

  const reasonText = block.reason ? `\n\n**Причина:** ${block.reason}` : "";
  const embed = createErrorEmbed(
    "Тренировки запрещены",
    `В этом канале запрещено проводить тренировки.${reasonText}`,
  );

  const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ ...payload, content: null, components: [] });
  } else {
    await interaction.reply(payload);
  }
  return true;
}

/**
 * Helper to clear in-memory store (for testing)
 */
export function _clearMemoryChannelBlocks() {
  memoryChannelBlocks.clear();
}
