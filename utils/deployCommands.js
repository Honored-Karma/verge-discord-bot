import { REST, Routes } from "discord.js";

export function getDeployConfig() {
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  const clientId = process.env.CLIENT_ID?.trim() || null;
  const guildId = process.env.GUILD_ID?.trim() || null;
  return { token, clientId, guildId };
}

export function buildBotInviteUrl(clientId) {
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=268435456`;
}

function formatDeployError(error, { clientId, guildId }) {
  if (error?.code === 50001 || error?.rawError?.code === 50001) {
    return [
      `Бот не имеет доступа к серверу GUILD_ID=${guildId}.`,
      "Скорее всего бота кикнули с этого сервера, или GUILD_ID указывает не на тот сервер.",
      "",
      "Что сделать:",
      "1. Пригласите бота на тестовый сервер (нужен scope applications.commands):",
      `   ${buildBotInviteUrl(clientId)}`,
      "2. Скопируйте ID тестового сервера (ПКМ по иконке сервера → Копировать ID)",
      "3. Обновите GUILD_ID в .env / переменных хостинга на новый ID",
      "4. Перезапустите бота или выполните npm run deploy",
    ].join("\n");
  }
  return error?.message || String(error);
}

async function assertBotInGuild(rest, guildId, { clientId, knownGuildIds } = {}) {
  if (knownGuildIds && !knownGuildIds.has(guildId)) {
    throw Object.assign(new Error("Missing guild in cache"), {
      code: 50001,
      formatted: formatDeployError({ code: 50001 }, { clientId, guildId }),
    });
  }

  try {
    await rest.get(Routes.guild(guildId));
  } catch (error) {
    if (error?.code === 50001 || error?.status === 403 || error?.status === 404) {
      const msg = formatDeployError({ code: 50001 }, { clientId, guildId });
      throw Object.assign(new Error(msg), { code: 50001, formatted: msg });
    }
    throw error;
  }
}

/**
 * @param {object[]} commands - slash command JSON payloads
 * @param {object} options
 * @param {string} options.token
 * @param {string} options.clientId
 * @param {string|null} options.guildId
 * @param {boolean} options.cleanup - удалять старые команды перед деплоем
 * @param {Set<string>|null} options.knownGuildIds - guild IDs из client.guilds.cache
 */
export async function deployApplicationCommands(commands, options) {
  const { token, clientId, guildId, cleanup = false, knownGuildIds = null } = options;

  if (!token) throw new Error("DISCORD_TOKEN не задан");
  if (!clientId) throw new Error("CLIENT_ID не задан");

  const rest = new REST().setToken(token);

  if (guildId) {
    await assertBotInGuild(rest, guildId, { clientId, knownGuildIds });

    if (cleanup) {
      const oldGuildCommands = await rest.get(
        Routes.applicationGuildCommands(clientId, guildId),
      );
      for (const cmd of oldGuildCommands) {
        await rest.delete(
          Routes.applicationGuildCommand(clientId, guildId, cmd.id),
        );
      }

      const oldGlobalCommands = await rest.get(Routes.applicationCommands(clientId));
      for (const cmd of oldGlobalCommands) {
        await rest.delete(Routes.applicationCommand(clientId, cmd.id));
      }
    }

    return rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
  }

  if (cleanup) {
    const oldGlobalCommands = await rest.get(Routes.applicationCommands(clientId));
    for (const cmd of oldGlobalCommands) {
      await rest.delete(Routes.applicationCommand(clientId, cmd.id));
    }
  }

  return rest.put(Routes.applicationCommands(clientId), { body: commands });
}

export { formatDeployError };
