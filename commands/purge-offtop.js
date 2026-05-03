import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { createSuccessEmbed, createErrorEmbed } from "../utils/embeds.js";
import { isAdmin } from "../utils/adminCheck.js";
import { logCommand } from "../utils/logs.js";

// Discord API ограничение: до 100 сообщений за один fetch
// bulkDelete работает только для сообщений моложе 14 дней
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("purge-offtop")
  .setDescription("[АДМИН] Удалить оффтоп-сообщения по префиксу (( // и т.д.)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((option) =>
    option
      .setName("prefix")
      .setDescription('Префикс оффтопа: например "((" или "//"')
      .setRequired(true)
      .setMaxLength(10),
  )
  .addIntegerOption((option) =>
    option
      .setName("count")
      .setDescription("Сколько последних сообщений просматривать (1–100)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100),
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Только сообщения этого пользователя (необязательно)")
      .setRequired(false),
  );

export async function execute(interaction) {
  // Проверка прав: либо полный админ, либо есть право "Управление сообщениями"
  const hasPerms =
    isAdmin(interaction.member) ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);

  if (!hasPerms) {
    return interaction.reply({
      embeds: [
        createErrorEmbed(
          "Доступ запрещён",
          "Эта команда доступна администраторам и модераторам с правом **Управление сообщениями**.",
        ),
      ],
      flags: 64,
    });
  }

  const prefix = interaction.options.getString("prefix");
  const count = interaction.options.getInteger("count");
  const targetUser = interaction.options.getUser("user") || null;

  // Defer (ephemeral) — только admin видит прогресс и результат
  await interaction.deferReply({ ephemeral: true });

  try {
    // Проверяем права бота на удаление сообщений в канале
    const botMember = interaction.guild.members.me;
    const hasPerms = botMember
      .permissionsIn(interaction.channel)
      .has(PermissionFlagsBits.ManageMessages);

    if (!hasPerms) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Недостаточно прав у бота",
            "Боту нужно право **Управление сообщениями** в этом канале.",
          ),
        ],
      });
    }

    // Получаем последние N сообщений
    const fetched = await interaction.channel.messages.fetch({ limit: count });

    // Фильтруем: по префиксу + опционально по пользователю
    // trimStart() — на случай если перед (( есть пробел
    const toDelete = fetched.filter((msg) => {
      if (!msg.content.trimStart().startsWith(prefix)) return false;
      if (targetUser && msg.author.id !== targetUser.id) return false;
      return true;
    });

    if (toDelete.size === 0) {
      const userPart = targetUser ? ` от **${targetUser.username}**` : "";
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Ничего не найдено",
            `Среди последних **${count}** сообщений нет оффтопа с префиксом \`${prefix}\`${userPart}.\n\n` +
              `_Убедись, что сообщения начинаются ровно с этого префикса._`,
          ),
        ],
      });
    }

    // Разделяем на свежие (<14 дней, можно bulkDelete) и старые (удаляем вручную)
    const now = Date.now();
    const recent = toDelete.filter(
      (msg) => now - msg.createdTimestamp < TWO_WEEKS_MS,
    );
    const old = toDelete.filter(
      (msg) => now - msg.createdTimestamp >= TWO_WEEKS_MS,
    );

    let deleted = 0;
    let failed = 0;

    // Быстрое удаление свежих сообщений (один запрос к API)
    if (recent.size > 0) {
      try {
        const result = await interaction.channel.bulkDelete(recent, true);
        deleted += result.size;
      } catch (err) {
        console.error("[purge-offtop] bulkDelete error:", err);
        // Fallback: пробуем удалять поштучно
        for (const [, msg] of recent) {
          try {
            await msg.delete();
            deleted++;
          } catch {
            failed++;
          }
          await sleep(300);
        }
      }
    }

    // Поштучное удаление старых сообщений (bulkDelete их не берёт)
    if (old.size > 0) {
      for (const [, msg] of old) {
        try {
          await msg.delete();
          deleted++;
        } catch {
          failed++;
        }
        await sleep(300); // Небольшая пауза против rate-limit
      }
    }

    // Логируем действие
    try {
      await logCommand({
        client: interaction.client,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.username,
        command: "purge-offtop",
        extra: {
          prefix,
          scanned: count,
          deleted,
          failed,
          targetUserId: targetUser?.id ?? null,
        },
      });
    } catch (e) {
      console.error("[purge-offtop] logCommand error:", e);
    }

    // Формируем итоговый embed
    const lines = [
      `**Префикс:** \`${prefix}\``,
      `**Просмотрено:** ${count} сообщений`,
      `**Найдено оффтопа:** ${toDelete.size}`,
      `**Удалено:** ${deleted} сообщений`,
    ];
    if (targetUser) lines.splice(1, 0, `**Фильтр по:** ${targetUser}`);
    if (old.size > 0)
      lines.push(
        `📅 Из них старых (>14 дней): **${old.size}** — удалено поштучно`,
      );
    if (failed > 0)
      lines.push(
        `⚠️ Не удалось удалить: **${failed}** (нет доступа или уже удалены)`,
      );

    return interaction.editReply({
      embeds: [createSuccessEmbed("Оффтоп удалён", lines.join("\n"))],
    });
  } catch (error) {
    console.error("[purge-offtop] Unexpected error:", error);
    return interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Ошибка",
          `Не удалось выполнить очистку: \`${error.message}\``,
        ),
      ],
    });
  }
}

/** Утилита: пауза между запросами к Discord API */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
