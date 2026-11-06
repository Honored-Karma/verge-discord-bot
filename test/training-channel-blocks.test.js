import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";
import {
  extractChannelIds,
  blockTrainingChannels,
  unblockTrainingChannels,
  getBlockedTrainingChannels,
  getTrainingChannelBlock,
  checkTrainingChannelBlocked,
  _clearMemoryChannelBlocks,
} from "../utils/trainingChannelBlocks.js";
import { data, execute } from "../commands/train-channel-block.js";
import { isAdmin, hasCommandPermission } from "../utils/adminCheck.js";

test("extractChannelIds correctly parses mentions, raw IDs, URLs and channelOption", () => {
  // 1. Channel option only
  assert.deepEqual(extractChannelIds({ id: "111222333444555666" }, null), ["111222333444555666"]);

  // 2. Mentions in string
  const mentions = "<#111222333444555666> <#222333444555666777>";
  assert.deepEqual(extractChannelIds(null, mentions), ["111222333444555666", "222333444555666777"]);

  // 3. Raw IDs with commas and spaces
  const rawIds = "111222333444555666, 222333444555666777 333444555666777888";
  assert.deepEqual(extractChannelIds(null, rawIds), [
    "111222333444555666",
    "222333444555666777",
    "333444555666777888",
  ]);

  // 4. Discord channel URLs (extracts channel ID and ignores guild ID in URL)
  const urls = "https://discord.com/channels/999888777666555444/111222333444555666 <#222333444555666777>";
  assert.deepEqual(extractChannelIds(null, urls), [
    "111222333444555666",
    "222333444555666777",
  ]);

  // 5. Combined and deduplicated
  const mixed = "<#111222333444555666> 222333444555666777 <#111222333444555666>";
  const combined = extractChannelIds({ id: "111222333444555666" }, mixed);
  assert.deepEqual(combined, ["111222333444555666", "222333444555666777"]);

  // 6. Empty inputs
  assert.deepEqual(extractChannelIds(null, ""), []);
  assert.deepEqual(extractChannelIds(null, "invalid text"), []);
});

test("trainingChannelBlocks CRUD operations work in memory store", async () => {
  _clearMemoryChannelBlocks();
  const guildId = "guild-1";

  // Block multiple channels
  const blockResult = await blockTrainingChannels({
    guildId,
    channels: [
      { id: "1001", name: "chat-1" },
      { id: "1002", name: "chat-2" },
      { id: "1003", name: "chat-3" },
      { id: "category-cat", name: "category-1" },
    ],
    adminId: "admin-1",
    reason: "Не для тренировок",
  });

  assert.equal(blockResult.success, true);
  assert.equal(blockResult.blocked.length, 4);

  // List blocked channels
  const list = await getBlockedTrainingChannels(guildId);
  assert.equal(list.length, 4);
  assert.equal(list.some((c) => c.channel_id === "1001"), true);
  assert.equal(list.some((c) => c.channel_id === "1002"), true);
  assert.equal(list.some((c) => c.channel_id === "1003"), true);

  // Check channel blocked directly
  const direct = await getTrainingChannelBlock(guildId, "1001");
  assert.ok(direct);
  assert.equal(direct.reason, "Не для тренировок");

  // Check thread under blocked channel
  const threadInteraction = {
    guildId,
    channelId: "thread-555",
    channel: {
      id: "thread-555",
      parentId: "1002", // parent is blocked
    },
  };
  const threadBlock = await getTrainingChannelBlock(guildId, threadInteraction);
  assert.ok(threadBlock);
  assert.equal(threadBlock.channel_id, "1002");

  // Check category hierarchy resolution (thread -> parent text channel -> category)
  const categoryInteraction = {
    guildId,
    channelId: "thread-deep",
    channel: {
      id: "thread-deep",
      parentId: "text-chan",
      parent: {
        id: "text-chan",
        parentId: "category-cat", // category is blocked
      },
    },
  };
  const categoryBlock = await getTrainingChannelBlock(guildId, categoryInteraction);
  assert.ok(categoryBlock);
  assert.equal(categoryBlock.channel_id, "category-cat");

  // Check unblocked channel returns null
  const unblocked = await getTrainingChannelBlock(guildId, "9999");
  assert.equal(unblocked, null);

  // Unblock one channel
  const unblockRes = await unblockTrainingChannels({
    guildId,
    channelIds: ["1001"],
  });
  assert.equal(unblockRes.success, true);
  assert.equal(unblockRes.deletedCount, 1);

  assert.equal(await getTrainingChannelBlock(guildId, "1001"), null);
  assert.ok(await getTrainingChannelBlock(guildId, "1002"));

  // Unblock all channels
  const unblockAllRes = await unblockTrainingChannels({
    guildId,
    all: true,
  });
  assert.equal(unblockAllRes.success, true);
  assert.equal(unblockAllRes.deletedCount, 3);

  const emptyList = await getBlockedTrainingChannels(guildId);
  assert.equal(emptyList.length, 0);
});

test("checkTrainingChannelBlocked middleware replies with error and stops execution", async () => {
  _clearMemoryChannelBlocks();
  const guildId = "guild-middleware";
  await blockTrainingChannels({
    guildId,
    channels: [{ id: "chan-blocked" }],
    adminId: "admin-1",
    reason: "Спам-канал",
  });

  let replied = null;
  const interaction = {
    guildId,
    channelId: "chan-blocked",
    channel: { id: "chan-blocked" },
    reply: async (payload) => {
      replied = payload;
    },
  };

  const isBlocked = await checkTrainingChannelBlocked(interaction);
  assert.equal(isBlocked, true);
  assert.ok(replied);
  assert.equal(replied.flags, MessageFlags.Ephemeral);
  const embed = replied.embeds[0].toJSON();
  assert.match(embed.title, /Тренировки запрещены/);
  assert.match(embed.description, /Спам-канал/);

  // Test unblocked channel
  const allowedInteraction = {
    guildId,
    channelId: "chan-allowed",
    channel: { id: "chan-allowed" },
    reply: async () => assert.fail("Should not reply for allowed channel"),
  };
  assert.equal(await checkTrainingChannelBlocked(allowedInteraction), false);
});

test("train-channel-block slash command permits ONLY admins and rejects non-admins and GMs", async () => {
  _clearMemoryChannelBlocks();
  assert.equal(data.name, "train-channel-block");
  assert.equal(data.default_member_permissions, null);
  assert.equal(data.dm_permission, false);

  const regularMember = {
    id: "regular-user",
    guild: { ownerId: "admin-owner" },
    permissions: { has: () => false },
    roles: [],
  };
  assert.equal(isAdmin(regularMember), false);
  assert.equal(hasCommandPermission(regularMember, "train-channel-block"), false);

  const gmMember = {
    id: "gm-user",
    guild: { ownerId: "admin-owner" },
    permissions: { has: () => false },
    roles: [{ id: "1431759694179074162", name: "GM" }],
  };
  assert.equal(isAdmin(gmMember), false);
  assert.equal(hasCommandPermission(gmMember, "train-channel-block"), false);

  // Test execution rejection for regular member
  let rejectedReply = null;
  await execute({
    guildId: "guild-cmd-test",
    user: { id: regularMember.id },
    member: regularMember,
    guild: { members: { fetch: async () => regularMember } },
    reply: async (payload) => {
      rejectedReply = payload;
      return {};
    },
  });
  assert.ok(rejectedReply);
  assert.match(rejectedReply.embeds[0].toJSON().description, /только администраторам/);

  // Test execution rejection for GM member
  let gmRejectedReply = null;
  await execute({
    guildId: "guild-cmd-test",
    user: { id: gmMember.id },
    member: gmMember,
    guild: { members: { fetch: async () => gmMember } },
    reply: async (payload) => {
      gmRejectedReply = payload;
      return {};
    },
  });
  assert.ok(gmRejectedReply);
  assert.match(gmRejectedReply.embeds[0].toJSON().description, /только администраторам/);

  const adminMember = {
    id: "admin-user",
    guild: { ownerId: "admin-user" },
    permissions: { has: () => true },
    roles: [],
  };
  assert.equal(isAdmin(adminMember), true);
  assert.equal(hasCommandPermission(adminMember, "train-channel-block"), true);

  // Test execute subcommand block with multiple channels
  let executedReply = null;
  const commandInteraction = {
    guildId: "guild-cmd-test",
    channelId: "cmd-channel",
    user: { id: "admin-user", tag: "Admin#0001", username: "Admin" },
    member: adminMember,
    client: {},
    options: {
      getSubcommand: () => "block",
      getChannel: () => null,
      getString: (opt) => (opt === "channels" ? "<#5001> <#5002>" : "Только сюжетные тренировки"),
    },
    guild: {
      members: { fetch: async () => adminMember },
      channels: {
        cache: new Map([
          ["5001", { id: "5001", name: "flood-1" }],
          ["5002", { id: "5002", name: "flood-2" }],
        ]),
      },
    },
    reply: async (payload) => {
      executedReply = payload;
    },
  };

  await execute(commandInteraction);
  assert.ok(executedReply);
  const embed = executedReply.embeds[0].toJSON();
  assert.match(embed.title, /Запрет тренировок установлен/);
  assert.match(embed.fields[0].value, /<#5001>/);
  assert.match(embed.fields[0].value, /<#5002>/);

  // Test execute subcommand list
  let listReply = null;
  const listInteraction = {
    guildId: "guild-cmd-test",
    channelId: "cmd-channel",
    user: { id: "admin-user", username: "Admin" },
    member: adminMember,
    options: {
      getSubcommand: () => "list",
    },
    reply: async (payload) => {
      listReply = payload;
    },
  };

  await execute(listInteraction);
  assert.ok(listReply);
  const listEmbed = listReply.embeds[0].toJSON();
  assert.match(listEmbed.title, /Каналы с запретом тренировок/);
  assert.match(listEmbed.description, /<#5001>/);
  assert.match(listEmbed.description, /<#5002>/);

  // Test execute subcommand unblock all
  let unblockReply = null;
  const unblockInteraction = {
    guildId: "guild-cmd-test",
    channelId: "cmd-channel",
    user: { id: "admin-user", username: "Admin" },
    member: adminMember,
    client: {},
    options: {
      getSubcommand: () => "unblock",
      getChannel: () => null,
      getString: () => null,
      getBoolean: (opt) => (opt === "all" ? true : false),
    },
    reply: async (payload) => {
      unblockReply = payload;
    },
  };

  await execute(unblockInteraction);
  assert.ok(unblockReply);
  const unblockEmbed = unblockReply.embeds[0].toJSON();
  assert.match(unblockEmbed.title, /Запрет тренировок снят со ВСЕХ каналов/);
});
