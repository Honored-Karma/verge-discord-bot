import assert from "node:assert/strict";
import test from "node:test";
import { ChannelType, Client, Guild, PermissionFlagsBits } from "discord.js";
import { isRPActivityChannel, enforceRPActivityChannel } from "../utils/rpActivity.js";

const ROLE = "1431761095319879892";
process.env.RP_ROLE_ID = ROLE;

function channelInteraction({
  allowed = true, thread = false, everyoneDenied = true,
  categoryAllowed = allowed, categoryEveryoneDenied = everyoneDenied,
  parentId = "category", everyonePermissions = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads,
  rpPermissions = 0n, channelOverwrites = null,
  gatePermission = PermissionFlagsBits.ViewChannel,
} = {}) {
  const overwrites = (denyEveryone, allowRP) => [
    { id: "guild", type: 0, deny: denyEveryone ? String(gatePermission) : "0", allow: "0" },
    { id: ROLE, type: 0, allow: allowRP ? String(gatePermission) : "0", deny: "0" },
  ];
  // Use discord.js permission resolution to exercise guild defaults and channel
  // overwrites, rather than reproducing that resolution in a test mock.
  const guild = new Guild(new Client({ intents: [] }), {
    id: "guild",
    name: "Тестовый сервер",
    roles: [
      { id: "guild", name: "@everyone", permissions: String(everyonePermissions) },
      { id: ROLE, name: "РП", permissions: String(rpPermissions) },
    ],
    channels: [
      { id: "category", type: ChannelType.GuildCategory, permission_overwrites: overwrites(categoryEveryoneDenied, categoryAllowed) },
      { id: "channel", type: ChannelType.GuildText, parent_id: parentId, permission_overwrites: channelOverwrites ?? overwrites(everyoneDenied, allowed) },
      { id: "thread", type: ChannelType.PublicThread, parent_id: "channel" },
    ],
  });
  guild.roles.fetch = async (id, options) => {
    assert.equal(options?.force, true, "роли должны обновляться перед проверкой");
    return guild.roles.cache.get(id) ?? null;
  };
  guild.channels.fetch = async (id, options) => {
    assert.equal(options?.force, true, "права канала должны обновляться перед проверкой");
    return guild.channels.cache.get(id) ?? null;
  };
  return {
    guildId: "guild",
    channelId: thread ? "thread" : "channel",
    user: { id: "user", username: "Игрок" },
    guild,
    async reply(payload) { this.response = payload; return { id: `${this.user.id}:response` }; },
    async editReply(payload) { this.response = payload; },
    async deferReply() { this.deferred = true; },
    async showModal() { this.modalShown = true; },
  };
}

test("РП-канал определяется по доступу everyone и РП-роли, включая ветки и каналы без категории", async () => {
  assert.equal(await isRPActivityChannel(channelInteraction()), true);
  assert.equal(await isRPActivityChannel(channelInteraction({ thread: true })), true);
  assert.equal(await isRPActivityChannel(channelInteraction({ allowed: false })), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ everyoneDenied: false })), false);
  assert.equal(await isRPActivityChannel({ guildId: null }), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ parentId: null })), true);
});

test("права самого канала имеют приоритет над отличающимися правами категории", async () => {
  const privateChannel = { categoryAllowed: false, categoryEveryoneDenied: false };
  assert.equal(await isRPActivityChannel(channelInteraction(privateChannel)), true);
  assert.equal(await isRPActivityChannel(channelInteraction({ ...privateChannel, thread: true })), true);
  assert.equal(await isRPActivityChannel(channelInteraction({ everyoneDenied: false, categoryEveryoneDenied: true })), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ allowed: false, categoryAllowed: true })), false);
});

test("видимый всем канал отклоняется, даже если писать может только РП-роль", async () => {
  const options = { gatePermission: PermissionFlagsBits.SendMessages };
  assert.equal(await isRPActivityChannel(channelInteraction(options)), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ ...options, thread: true })), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ ...options, parentId: null })), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ ...options, allowed: false })), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ ...options, everyoneDenied: false })), false);
});

test("видимый всем канал только для чтения не считается РП-каналом", async () => {
  const interaction = channelInteraction({ gatePermission: PermissionFlagsBits.SendMessages });
  interaction.guild.channels.cache.get("channel").permissionOverwrites._add({
    id: ROLE, type: 0,
    allow: String(PermissionFlagsBits.ViewChannel),
    deny: String(PermissionFlagsBits.SendMessages),
  });
  assert.equal(await isRPActivityChannel(interaction), false);
});

test("учитываются базовые права ролей, а Administrator не заменяет РП-доступ", async () => {
  assert.equal(await isRPActivityChannel(channelInteraction({
    everyonePermissions: 0n,
    rpPermissions: PermissionFlagsBits.ViewChannel,
    channelOverwrites: [],
  })), true);
  assert.equal(await isRPActivityChannel(channelInteraction({
    allowed: false,
    rpPermissions: PermissionFlagsBits.Administrator,
  })), false);
});

test("отсутствующие роли, канал или родитель ветки вызывают ошибку проверки", async () => {
  for (const missing of ["guild", ROLE]) {
    const interaction = channelInteraction();
    interaction.guild.roles.cache.delete(missing);
    await assert.rejects(isRPActivityChannel(interaction), /не найдена/);
  }
  const missingChannel = channelInteraction();
  missingChannel.guild.channels.cache.delete("channel");
  await assert.rejects(isRPActivityChannel(missingChannel), /Канал не найден/);
  const missingParent = channelInteraction({ thread: true });
  missingParent.guild.channels.cache.delete("channel");
  await assert.rejects(isRPActivityChannel(missingParent), /Родительский канал ветки не найден/);
});

test("награды, штрафы и смена канала работают на настоящей MongoDB", async t => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = server.getUri();
  const { connectDatabase, closeDatabase, getDB } = await import("../utils/db.js");
  const dm = await import("../utils/dataManager.js");
  const context = { guildId: "guild", channelId: "channel" };
  const cooldown = 5 * 60 * 60 * 1000;
  try {
    await connectDatabase();
    const db = getDB();
    await dm.createPlayer("user", "Игрок", "Персонаж", null, 1, null);
    await dm.addStyle("Стиль", "admin");
    const style = await dm.getStyleByName("Стиль");
    await dm.giveStyle("user", style.name, 30, "admin");
    const expireCooldowns = () => db.collection("players").updateOne({ id: "user" }, {
      $set: { last_train_timestamp: 1, last_sp_train_timestamp: 1 },
    });

    await t.test("повтор в том же канале не снижает множитель AP и SP", async () => {
      const first = await dm.completeAPTraining("user", 10, cooldown, context);
      assert.equal(first.success, true);
      assert.equal(first.locationFactor, 1);
      assert.equal(first.locationRepeats, 0);
      assert.equal(first.gained, 10);
      assert.equal((await dm.completeAPTraining("user", 10, cooldown, context)).reason, "cooldown");
      assert.equal((await dm.getPlayer("user")).training_location, undefined);
      await expireCooldowns();
      const second = await dm.completeAPTraining("user", 10, cooldown, context);
      assert.equal(second.success, true);
      assert.equal(second.locationFactor, 1);
      assert.equal(second.locationRepeats, 0);
      assert.equal(second.multiplier, second.baseMultiplier + second.dynamicBonus + second.shopBonus);
      assert.equal(second.gained, Math.round(10 * second.multiplier / 100));
      const sp = await dm.completeSPTraining("user", style.id, 10, cooldown, context);
      assert.equal(sp.success, true);
      assert.equal(sp.locationFactor, 1);
      assert.equal(sp.locationRepeats, 0);
      assert.equal(sp.multiplier, sp.baseMultiplier + sp.dynamicBonus + sp.shopBonus);
      assert.equal(sp.gained, Math.round(10 * sp.multiplier / 100));
      const social = await dm.completeSocialRP("user", 10, cooldown);
      assert.equal(social.success, true);
      assert.equal(social.locationFactor, 1);
      assert.equal((await dm.getPlayer("user")).training_location, undefined);
    });

    await t.test("два одновременных отправления формы дают ровно одну награду", async () => {
      await expireCooldowns();
      const before = await dm.getPlayer("user");
      const results = await Promise.all([
        dm.completeAPTraining("user", 10, cooldown, { ...context, channelId: "new" }),
        dm.completeAPTraining("user", 10, cooldown, { ...context, channelId: "new" }),
      ]);
      assert.equal(results.filter(result => result.success).length, 1);
      const after = await dm.getPlayer("user");
      assert.equal(after.ap - before.ap, results.find(result => result.success).gained);
    });

    await t.test("штрафы ограничены нулём, не умножаются и записываются в историю", async () => {
      await dm.updatePlayer("user", { ap: 7, ap_multiplier: 500 });
      const ap = await dm.applyRPActivityPenalty("user", "ap");
      assert.equal(ap.deducted, 7);
      assert.equal(ap.balance, 0);
      assert.equal((await dm.applyRPActivityPenalty("user", "ap")).deducted, 0);
      await db.collection("player_sp").updateOne({ player_id: "user", style_id: style.id }, { $set: { sp: 4 } });
      const sp = await dm.applyRPActivityPenalty("user", "sp");
      assert.equal(sp.deducted, 4);
      assert.equal(sp.balance, 0);
      assert.equal(await dm.getSP("user", style.id), 0);
      const history = await db.collection("progression_history").findOne({ player_id: "user", source: "rp-channel-penalty", type: "sp" });
      assert.equal(history.delta, -4);
      assert.equal(history.style_id, style.id);
    });

    await t.test("одновременные штрафы не теряют списания", async () => {
      await dm.updatePlayer("user", { ap: 15 });
      const penalties = await Promise.all([dm.applyRPActivityPenalty("user", "ap"), dm.applyRPActivityPenalty("user", "ap")]);
      assert.equal(penalties.reduce((sum, item) => sum + item.deducted, 0), 15);
      assert.equal((await dm.getPlayer("user")).ap, 0);
    });

    await t.test("все три команды отклоняются в заблокированном канале до открытия формы без штрафа", async () => {
      const { blockTrainingChannels } = await import("../utils/trainingChannelBlocks.js");
      await blockTrainingChannels({
        guildId: "guild",
        channels: [{ id: "blocked-chan" }],
        adminId: "admin",
        reason: "Тестовая блокировка",
      });

      for (const commandName of ["train-ap", "train-sp", "social-rp"]) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction();
        interaction.channelId = "blocked-chan";
        interaction.commandName = commandName;
        // Separate users avoid the shared three-second command cooldown.
        interaction.user.id = `blocked-${commandName}`;
        await dm.createPlayer(interaction.user.id, commandName, "Персонаж", null, 1, null);
        await dm.updatePlayer(interaction.user.id, { ap: 20 });
        await dm.giveStyle(interaction.user.id, style.name, 20, "admin");
        await command.execute(interaction);
        assert.equal(interaction.modalShown, undefined);
        assert.match(JSON.stringify(interaction.response), /Тренировки запрещены/);
        // Никакого штрафа не списано
        if (commandName === "train-sp") assert.equal(await dm.getSP(interaction.user.id, style.id), 20);
        else assert.equal((await dm.getPlayer(interaction.user.id)).ap, 20);
      }
    });

    await t.test("все три команды открываются и начисляют награды в незаблокированном канале без штрафа", async () => {
      const specs = [
        ["train-ap", "train_ap_modal:1"],
        ["train-sp", `train_sp_modal:1:${style.id}`],
        ["social-rp", "social_rp_modal:1"],
      ];
      for (const [commandName, customId] of specs) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction();
        interaction.commandName = commandName;
        interaction.user.id = `hidden-rp:${commandName}`;
        await dm.createPlayer(interaction.user.id, commandName, "Персонаж", null, 1, null);
        await dm.updatePlayer(interaction.user.id, { ap: 20 });
        await dm.giveStyle(interaction.user.id, style.name, 20, "admin");

        await command.execute(interaction);
        if (commandName === "train-sp") {
          assert.match(JSON.stringify(interaction.response), /Выберите стиль/);
        } else {
          assert.equal(interaction.modalShown, true);
        }
        assert.equal((await dm.getPlayer(interaction.user.id)).ap, 20);
        assert.equal(await dm.getSP(interaction.user.id, style.id), 20);

        interaction.customId = customId;
        interaction.user.displayAvatarURL = () => "https://cdn.discordapp.com/embed/avatars/0.png";
        interaction.fields = { getTextInputValue: () => "Персонаж выполняет упражнения и отрабатывает движения. ".repeat(20) };
        await command.handleModalSubmit(interaction);
        assert.match(JSON.stringify(interaction.response), /завершена|учтена/);
        if (commandName === "train-sp") {
          assert.ok(await dm.getSP(interaction.user.id, style.id) > 20);
        } else {
          assert.ok((await dm.getPlayer(interaction.user.id)).ap > 20);
        }
        assert.equal(await db.collection("progression_history").countDocuments({
          player_id: interaction.user.id, source: "rp-channel-penalty",
        }), 0);
      }
    });

    await t.test("открытая форма блокируется, если канал был заблокирован перед отправкой", async () => {
      const specs = [
        ["train-ap", "train_ap_modal:1"],
        ["train-sp", `train_sp_modal:1:${style.id}`],
        ["social-rp", "social_rp_modal:1"],
      ];
      for (const [commandName, customId] of specs) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction();
        interaction.channelId = "blocked-chan";
        interaction.customId = customId;
        interaction.user.id = `modal-block:${commandName}`;
        await dm.createPlayer(interaction.user.id, commandName, "Персонаж", null, 1, null);
        await dm.updatePlayer(interaction.user.id, { ap: 20 });
        await dm.giveStyle(interaction.user.id, style.name, 20, "admin");

        await command.handleModalSubmit(interaction);
        assert.match(JSON.stringify(interaction.response), /Тренировки запрещены/);
        if (commandName === "train-sp") assert.equal(await dm.getSP(interaction.user.id, style.id), 20);
        else assert.equal((await dm.getPlayer(interaction.user.id)).ap, 20);
      }
    });

    await t.test("формы в РП-канале с отдельными правами начисляют награды без штрафа", async () => {
      const specs = [
        ["train-ap", "train_ap_modal:1"],
        ["train-sp", `train_sp_modal:1:${style.id}`],
        ["social-rp", "social_rp_modal:1"],
      ];
      await dm.updatePlayer("user", { last_socialrp_timestamp: 0 });
      await expireCooldowns();
      for (const [commandName, customId] of specs) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction({ categoryAllowed: false, categoryEveryoneDenied: false });
        interaction.customId = customId;
        interaction.user.displayAvatarURL = () => "https://cdn.discordapp.com/embed/avatars/0.png";
        interaction.fields = { getTextInputValue: () => "Персонаж выполняет упражнения и отрабатывает движения. ".repeat(20) };
        await command.handleModalSubmit(interaction);
        assert.match(JSON.stringify(interaction.response), /завершена|учтена/);
        assert.doesNotMatch(JSON.stringify(interaction.response), /Повтор в том же канале/);
      }
      assert.equal((await dm.getPlayer("user")).training_location, undefined);
    });

    await t.test("ошибка Discord при чтении прав отклоняет активность без штрафа", async () => {
      await dm.updatePlayer("user", { ap: 20 });
      const interaction = channelInteraction();
      interaction.guild.roles.fetch = async () => null;
      assert.equal(await enforceRPActivityChannel(interaction, "user", "ap"), true);
      assert.equal((await dm.getPlayer("user")).ap, 20);
      assert.match(JSON.stringify(interaction.response), /Штраф не списан/);
    });
  } finally {
    await closeDatabase();
    await server.stop();
  }
});
