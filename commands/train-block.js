import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  blockTraining,
  checkTrainingBlock,
  formatTrainingName,
  getTrainingBlocksList,
  TRAINING_NAMES,
  TRAINING_TYPES,
  unblockTraining,
} from "../utils/trainingBlocks.js";
import {
  createErrorEmbed,
  createSuccessEmbed,
  createTrainingBlockedEmbed,
} from "../utils/embeds.js";
import { hasCommandPermission } from "../utils/adminCheck.js";
import { resolveMember } from "../utils/memberHelper.js";
import { logCommand } from "../utils/logs.js";
import { autoDeleteMessageShort } from "../utils/cooldowns.js";

const TRAINING_CHOICES = [
  { name: "Все тренировки (AP, SP, Social RP)", value: TRAINING_TYPES.ALL },
  { name: "Тренировка AP (/train-ap)", value: TRAINING_TYPES.TRAIN_AP },
  { name: "Тренировка стилей SP (/train-sp)", value: TRAINING_TYPES.TRAIN_SP },
  { name: "Социальный RP (/social-rp)", value: TRAINING_TYPES.SOCIAL_RP },
];

const SLOT_CHOICES = [
  { name: "Все слоты (аккаунт)", value: 0 },
  { name: "Слот 1", value: 1 },
  { name: "Слот 2", value: 2 },
  { name: "Слот 3", value: 3 },
];

export const data = new SlashCommandBuilder()
  .setName("train-block")
  .setDescription("[АДМИН] Управление блокировками тренировок игроков")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("block")
      .setDescription("Заблокировать проведение тренировки игроку")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Игрок для блокировки")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("training")
          .setDescription("Какую тренировку заблокировать")
          .setRequired(true)
          .addChoices(...TRAINING_CHOICES),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Причина блокировки")
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("hours")
          .setDescription(
            "Длительность в часах (0 или не указано = бессрочно)",
          )
          .setMinValue(1)
          .setMaxValue(87600)
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("slot")
          .setDescription("Слот персонажа (по умолчанию: все слоты)")
          .setRequired(false)
          .addChoices(...SLOT_CHOICES),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unblock")
      .setDescription("Снять блокировку тренировки с игрока")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Игрок для разблокировки")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("training")
          .setDescription("Какую тренировку разблокировать")
          .setRequired(true)
          .addChoices(...TRAINING_CHOICES),
      )
      .addIntegerOption((option) =>
        option
          .setName("slot")
          .setDescription("Слот (по умолчанию: все слоты)")
          .setRequired(false)
          .addChoices(...SLOT_CHOICES),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("Посмотреть активные блокировки тренировок игрока")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Игрок для проверки")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("slot")
          .setDescription("Фильтр по слоту")
          .setRequired(false)
          .addChoices(...SLOT_CHOICES),
      ),
  );

export async function execute(interaction) {
  const member = await resolveMember(interaction);
  if (!hasCommandPermission(member, "train-block")) {
    const msg = await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещен",
          "Эта команда доступна только администраторам и гейм-мастерам.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    autoDeleteMessageShort(msg);
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser("user");
  const slotOption = interaction.options.getInteger("slot");
  const slot = [1, 2, 3].includes(slotOption) ? slotOption : null;

  if (subcommand === "block") {
    const training = interaction.options.getString("training");
    const reason = interaction.options.getString("reason") || "Не указана";
    const hours = interaction.options.getInteger("hours") || 0;

    const result = await blockTraining({
      userId: targetUser.id,
      slot,
      trainingType: training,
      reason,
      durationHours: hours,
      adminId: interaction.user.id,
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Ошибка",
            `Не удалось заблокировать тренировку: ${result.error}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const trainingName = formatTrainingName(training);
    const slotText = slot ? `Слот ${slot}` : "Все слоты (аккаунт)";
    const durationText = hours > 0 ? `${hours} ч.` : "Бессрочно";

    const blockEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔒 Блокировка тренировки установлена")
      .addFields(
        {
          name: "👤 Игрок",
          value: `<@${targetUser.id}> (${targetUser.tag})`,
          inline: true,
        },
        { name: "🎯 Тренировка", value: trainingName, inline: true },
        { name: "📁 Слот", value: slotText, inline: true },
        { name: "⏳ Срок", value: durationText, inline: true },
        { name: "📝 Причина", value: reason, inline: false },
        {
          name: "👮 Администратор",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [blockEmbed] });

    // Попытка отправить игроку уведомление в ЛС
    try {
      const dmEmbed = createTrainingBlockedEmbed({
        trainingName,
        slot,
        reason,
        blockedBy: interaction.user.id,
        blockedAt: Math.floor(Date.now() / 1000),
        expiresAt:
          hours > 0 ? Math.floor(Date.now() / 1000) + hours * 3600 : null,
      });
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // Игнорируем ошибку, если у игрока закрыты ЛС
    }

    try {
      await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        command: "train-block block",
        targetId: targetUser.id,
        targetTag: targetUser.tag,
        extra: {
          training: trainingName,
          slot: slotText,
          hours: durationText,
          reason,
        },
      });
    } catch (e) {
      console.error("logCommand error in train-block:", e);
    }
    return;
  }

  if (subcommand === "unblock") {
    const training = interaction.options.getString("training");

    const result = await unblockTraining({
      userId: targetUser.id,
      slot,
      trainingType: training,
      adminId: interaction.user.id,
    });

    if (!result.success) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Ошибка",
            `Не удалось снять блокировку: ${result.error}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (result.unblockedCount === 0) {
      return interaction.reply({
        embeds: [
          createErrorEmbed(
            "Блокировка не найдена",
            `У игрока <@${targetUser.id}> не найдено активных блокировок для выбранной тренировки и слота.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const trainingName = formatTrainingName(training);
    const slotText = slot ? `Слот ${slot}` : "Все слоты (аккаунт)";

    const unblockEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🔓 Блокировка тренировки снята")
      .addFields(
        {
          name: "👤 Игрок",
          value: `<@${targetUser.id}> (${targetUser.tag})`,
          inline: true,
        },
        { name: "🎯 Тренировка", value: trainingName, inline: true },
        { name: "📁 Слот", value: slotText, inline: true },
        {
          name: "📊 Снято записей",
          value: `${result.unblockedCount}`,
          inline: true,
        },
        {
          name: "👮 Администратор",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [unblockEmbed] });

    // Попытка уведомить игрока в ЛС
    try {
      const dmEmbed = createSuccessEmbed(
        "Блокировка тренировки снята",
        `Администрация сервера сняла блокировку с тренировки **${trainingName}** (${slotText}). Вы снова можете выполнять данную тренировку.`,
      );
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // Игнорируем ошибку ЛС
    }

    try {
      await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        command: "train-block unblock",
        targetId: targetUser.id,
        targetTag: targetUser.tag,
        extra: {
          training: trainingName,
          slot: slotText,
          unblockedCount: result.unblockedCount,
        },
      });
    } catch (e) {
      console.error("logCommand error in train-block:", e);
    }
    return;
  }

  if (subcommand === "list") {
    const blocks = await getTrainingBlocksList(targetUser.id, slot);

    if (!blocks || blocks.length === 0) {
      const slotFilterText = slot ? ` для слота ${slot}` : "";
      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            "Нет активных блокировок",
            `У игрока <@${targetUser.id}> нет активных блокировок тренировок${slotFilterText}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 Блокировки тренировок: ${targetUser.tag}`)
      .setDescription(
        `Список действующих ограничений для пользователя <@${targetUser.id}>:`,
      )
      .setTimestamp();

    for (const b of blocks) {
      const slotLabel = b.slot ? `Слот ${b.slot}` : "Все слоты (аккаунт)";
      const expiresLabel = b.expiresAt
        ? `<t:${b.expiresAt}:f> (<t:${b.expiresAt}:R>)`
        : "Бессрочно";

      embed.addFields({
        name: `🚫 ${b.trainingName} [${slotLabel}]`,
        value: `**Причина:** ${b.reason}\n**Заблокировал:** <@${b.blockedBy}>\n**Дата:** <t:${b.blockedAt}:d>\n**Срок:** ${expiresLabel}`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
