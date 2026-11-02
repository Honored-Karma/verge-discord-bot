import assert from "node:assert/strict";
import test from "node:test";
import { ChannelType, PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { isRPActivityChannel, enforceRPActivityChannel, resetTrainingLocationOnMessage } from "../utils/rpActivity.js";

const ROLE = "1431761095319879892";
process.env.RP_ROLE_ID = ROLE;

function channelInteraction({ allowed = true, thread = false, everyoneDenied = true } = {}) {
  const overwrites = new Map([
    ["guild", { deny: new PermissionsBitField(everyoneDenied ? [PermissionFlagsBits.ViewChannel] : []) }],
    [ROLE, { allow: new PermissionsBitField(allowed ? [PermissionFlagsBits.ViewChannel] : []) }],
  ]);
  const category = { type: ChannelType.GuildCategory, permissionOverwrites: { cache: overwrites } };
  const channels = new Map([
    ["channel", { parentId: "category", isThread: () => false }],
    ["thread", { parentId: "channel", isThread: () => true }],
    ["category", category],
  ]);
  return {
    guildId: "guild",
    channelId: thread ? "thread" : "channel",
    user: { id: "user", username: "Игрок" },
    guild: {
      id: "guild",
      roles: { fetch: async id => id === ROLE ? { id } : null },
      channels: { fetch: async id => channels.get(id) },
    },
    async reply(payload) { this.response = payload; },
    async editReply(payload) { this.response = payload; },
    async deferReply() { this.deferred = true; },
    async showModal() { this.modalShown = true; },
  };
}

test("РП-категория определяется по запрету everyone и разрешению РП-роли, в том числе в ветке", async () => {
  assert.equal(await isRPActivityChannel(channelInteraction()), true);
  assert.equal(await isRPActivityChannel(channelInteraction({ thread: true })), true);
  assert.equal(await isRPActivityChannel(channelInteraction({ allowed: false })), false);
  assert.equal(await isRPActivityChannel(channelInteraction({ everyoneDenied: false })), false);
  assert.equal(await isRPActivityChannel({ guildId: null }), false);
  const noCategory = channelInteraction();
  noCategory.guild.channels.fetch = async () => ({ isThread: () => false, parentId: null });
  assert.equal(await isRPActivityChannel(noCategory), false);
});

test("награды, штрафы и смена канала работают на настоящей MongoDB", async t => {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const server = await MongoMemoryServer.create();
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

    await t.test("повтор снижает множитель AP и SP, социальное RP не затронуто", async () => {
      const first = await dm.completeAPTraining("user", 10, cooldown, context);
      assert.equal(first.success, true);
      assert.equal(first.locationFactor, 1);
      assert.equal(first.gained, 10);
      assert.equal((await dm.completeAPTraining("user", 10, cooldown, context)).reason, "cooldown");
      assert.equal((await dm.getPlayer("user")).training_location.repeats, 0);
      await expireCooldowns();
      const second = await dm.completeAPTraining("user", 10, cooldown, context);
      assert.equal(second.locationFactor, 0.8);
      assert.equal(second.gained, Math.round(10 * second.multiplier / 100));
      const sp = await dm.completeSPTraining("user", style.id, 10, cooldown, context);
      assert.equal(sp.success, true);
      assert.ok(Math.abs(sp.locationFactor - 0.64) < 1e-10);
      const social = await dm.completeSocialRP("user", 10, cooldown);
      assert.equal(social.success, true);
      assert.equal(social.locationFactor, 1);
      assert.equal((await dm.getPlayer("user")).training_location.repeats, 2);
    });

    await t.test("обычное сообщение в другом канале сбрасывает дебафф только на этом сервере", async () => {
      const message = { author: { id: "user", bot: false }, guildId: "guild", channelId: "channel", content: "Привет" };
      await resetTrainingLocationOnMessage(message);
      assert.equal((await dm.getPlayer("user")).training_location.repeats, 2);
      await resetTrainingLocationOnMessage({ ...message, guildId: "other", channelId: "other" });
      await resetTrainingLocationOnMessage({ ...message, channelId: "other", author: { id: "user", bot: true } });
      await resetTrainingLocationOnMessage({ ...message, channelId: "other", content: "  " });
      assert.equal((await dm.getPlayer("user")).training_location.repeats, 2);
      await resetTrainingLocationOnMessage({ ...message, channelId: "other" });
      assert.equal((await dm.getPlayer("user")).training_location, undefined);
      await expireCooldowns();
      assert.equal((await dm.completeAPTraining("user", 10, cooldown, context)).locationFactor, 1);
      await expireCooldowns();
      assert.equal((await dm.completeAPTraining("user", 10, cooldown, { ...context, channelId: "new" })).locationFactor, 1);
    });

    await t.test("два одновременных отправления формы дают одну награду и один шаг дебаффа", async () => {
      await expireCooldowns();
      const before = await dm.getPlayer("user");
      const results = await Promise.all([
        dm.completeAPTraining("user", 10, cooldown, { ...context, channelId: "new" }),
        dm.completeAPTraining("user", 10, cooldown, { ...context, channelId: "new" }),
      ]);
      assert.equal(results.filter(result => result.success).length, 1);
      const after = await dm.getPlayer("user");
      assert.equal(after.training_location.repeats, before.training_location.repeats + 1);
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

    await t.test("все три команды отклоняются вне РП до открытия формы", async () => {
      for (const commandName of ["train-ap", "train-sp", "social-rp"]) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction({ allowed: false });
        interaction.commandName = commandName;
        // Separate users avoid the shared three-second command cooldown.
        interaction.user.id = commandName;
        await dm.createPlayer(commandName, commandName, "Персонаж", null, 1, null);
        await dm.updatePlayer(commandName, { ap: 20 });
        await dm.giveStyle(commandName, style.name, 20, "admin");
        await command.execute(interaction);
        assert.equal(interaction.modalShown, undefined);
        assert.match(JSON.stringify(interaction.response), /РП-категориях/);
        if (commandName === "train-sp") assert.equal(await dm.getSP(commandName, style.id), 10);
        else assert.equal((await dm.getPlayer(commandName)).ap, 10);
      }
    });

    await t.test("открытая форма перепроверяет категорию и не начисляет награду после изменения прав", async () => {
      const specs = [
        ["train-ap", "train_ap_modal:1"],
        ["train-sp", `train_sp_modal:1:${style.id}`],
        ["social-rp", "social_rp_modal:1"],
      ];
      for (const [commandName, customId] of specs) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction({ allowed: false });
        interaction.customId = customId;
        interaction.user.id = commandName;
        await command.handleModalSubmit(interaction);
        assert.match(JSON.stringify(interaction.response), /РП-категориях/);
        if (commandName === "train-sp") assert.equal(await dm.getSP(commandName, style.id), 0);
        else assert.equal((await dm.getPlayer(commandName)).ap, 0);
      }
    });

    await t.test("разрешённые формы начисляют награды и показывают снижение множителя", async () => {
      const specs = [
        ["train-ap", "train_ap_modal:1"],
        ["train-sp", `train_sp_modal:1:${style.id}`],
        ["social-rp", "social_rp_modal:1"],
      ];
      await dm.updatePlayer("user", { last_socialrp_timestamp: 0 });
      await expireCooldowns();
      await db.collection("players").updateOne({ id: "user" }, { $unset: { training_location: "" } });
      for (const [commandName, customId] of specs) {
        const command = await import(`../commands/${commandName}.js`);
        const interaction = channelInteraction();
        interaction.customId = customId;
        interaction.user.displayAvatarURL = () => "https://cdn.discordapp.com/embed/avatars/0.png";
        interaction.fields = { getTextInputValue: () => "Персонаж выполняет упражнения и отрабатывает движения. ".repeat(20) };
        await command.handleModalSubmit(interaction);
        assert.match(JSON.stringify(interaction.response), /завершена/);
        if (commandName === "train-sp") {
          assert.match(JSON.stringify(interaction.response), /Повтор в том же канале/);
        }
      }
      assert.equal((await dm.getPlayer("user")).training_location.repeats, 1);
    });

    await t.test("сброс относится только к активному слоту персонажа", async () => {
      await dm.createPlayer("user", "Игрок", "Второй персонаж", null, 2, null);
      await dm.setActiveSlot("user", 1);
      const secondPlayerId = "user_2";
      await dm.updatePlayer(secondPlayerId, { training_location: { guild_id: "guild", channel_id: "channel", repeats: 3 } });
      await resetTrainingLocationOnMessage({ author: { id: "user" }, guildId: "guild", channelId: "other", content: "Привет" });
      assert.equal((await dm.getPlayer(secondPlayerId)).training_location.repeats, 3);
      await dm.setActiveSlot("user", 2);
      await resetTrainingLocationOnMessage({ author: { id: "user" }, guildId: "guild", channelId: "other", content: "Привет" });
      assert.equal((await dm.getPlayer(secondPlayerId)).training_location, undefined);
      await dm.setActiveSlot("user", 1);
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
