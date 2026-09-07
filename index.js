import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { createServer } from 'http';
import { connectDatabase, closeDatabase, getDB } from './utils/db.js';
import { startWeeklySalaryScheduler } from './services/salaryService.js';
import { expireMultipliers } from './utils/dataManager.js';
import { installModernResponseAdapter } from './utils/modernResponses.js';
import {
    routeComponentInteraction,
    routeModalInteraction
} from './utils/interactionRouter.js';
import { registerInteractionHandlers } from './interactions/index.js';
import { ensureCardFont } from './utils/cardFont.js';
import { initializeOrgRoles } from './utils/orgRoles.js';
import { createExpressApp } from './server/app.js';
import { validateEnv } from './config/env.js';
import { logger } from './utils/logger.js';

config();

const persistentNamespaces = registerInteractionHandlers();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Validate Environment Variables
let envConfig;
try {
    envConfig = validateEnv(process.env);
    if (envConfig.warnings && envConfig.warnings.length > 0) {
        envConfig.warnings.forEach(w => logger.warn(w));
    }
} catch (envError) {
    logger.error('Fatal startup error during environment validation:', envError);
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

const token = envConfig.DISCORD_TOKEN;

// 2. Load Discord Commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
        const command = await import(pathToFileURL(filePath).href);
        if ('data' in command && 'execute' in command) {
            if (client.commands.has(command.data.name)) {
                logger.warn(`Duplicate command detected: ${command.data.name}. Skipping.`);
                continue;
            }
            client.commands.set(command.data.name, command);
            logger.debug(`Loaded command: ${command.data.name}`);
        } else {
            logger.warn(`Command ${file} is missing required "data" or "execute" property.`);
        }
    } catch (err) {
        logger.error(`Failed to load command ${file}:`, err);
    }
}

let salarySchedulerInterval = null;
let multiplierExpiryInterval = null;

client.once(Events.ClientReady, async readyClient => {
    logger.info(`Discord Bot ready as ${readyClient.user.tag} (Guilds: ${client.guilds.cache.size})`);
    logger.info(`Persistent interaction handlers: ${persistentNamespaces.join(', ')}`);

    // Auto-deploy slash commands on startup if configured
    try {
        const commandsJSON = [];
        for (const [, cmd] of client.commands) {
            commandsJSON.push(cmd.data.toJSON());
        }

        if (token) {
            const rest = new REST().setToken(token);
            const clientId = envConfig.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
            const guildId = envConfig.GUILD_ID;

            if (clientId) {
                if (guildId) {
                    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsJSON });
                    logger.info(`Deployed ${commandsJSON.length} commands to guild ${guildId}`);
                } else {
                    await rest.put(Routes.applicationCommands(clientId), { body: commandsJSON });
                    logger.info(`Deployed ${commandsJSON.length} commands globally`);
                }
            }
        }
    } catch (deployError) {
        logger.error('Failed to deploy slash commands:', deployError);
    }

    // Шрифт карточек готовим на старте, а не при первом /profile: раньше первый
    // игрок после каждого рестарта ждал загрузку 617 КБ внутри трёхсекундного
    // окна ответа Discord.
    try {
        const font = await ensureCardFont();
        logger.info(font.ok
            ? `🔤 Шрифт карточек готов (источник: ${font.source})`
            : '⚠️  Шрифт карточек не найден — кириллица на карточках может не отрисоваться');
    } catch (fontError) {
        logger.error('❌ Не удалось подготовить шрифт карточек:', fontError);
    }

    // Реестр «организация — роль» держим в базе, поэтому индекс и начальные
    // значения проливаем на старте. Инициализация идёт здесь, а не в db.js:
    // модуль ролей тянет dataManager, и импорт из db.js замкнул бы цикл.
    try {
        await initializeOrgRoles(getDB());
    } catch (orgRoleError) {
        logger.error('❌ Не удалось подготовить реестр ролей организаций:', orgRoleError);
    }

    salarySchedulerInterval = startWeeklySalaryScheduler(client);
    multiplierExpiryInterval = setInterval(() => { expireMultipliers(); }, 60_000);
});

client.on(Events.InteractionCreate, async interaction => {
    installModernResponseAdapter(interaction);

    // Persistent panels first: buttons and menus backed by a stored session keep
    // working after a restart, unlike the per-message collectors below.
    if (interaction.isButton() || interaction.isAnySelectMenu()) {
        try {
            await routeComponentInteraction(interaction);
        } catch (error) {
            console.error(`❌ Error routing component ${interaction.customId}:`, error);
            const errorMessage = {
                content: 'Не удалось обработать нажатие. Запустите команду ещё раз.',
                flags: 64
            };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage).catch(() => {});
            } else {
                await interaction.reply(errorMessage).catch(() => {});
            }
        }
        // Interactions without a session are left untouched on purpose so the
        // collectors still driving other commands can pick them up.
        return;
    }

    if (interaction.isModalSubmit()) {
        try {
            if (await routeModalInteraction(interaction)) return;
        } catch (error) {
            console.error(`❌ Error routing modal ${interaction.customId}:`, error);
        }

        const command = [...client.commands.values()].find(candidate =>
            typeof candidate.handlesModal === 'function' && candidate.handlesModal(interaction)
        );

        if (!command || typeof command.handleModalSubmit !== 'function') {
            await interaction.reply({
                content: 'Эта форма больше не поддерживается. Запустите команду ещё раз.',
                flags: 64
            }).catch(() => {});
            return;
        }

        try {
            await command.handleModalSubmit(interaction);
        } catch (error) {
            logger.error(`Error handling modal ${interaction.customId}:`, error);
            const errorMessage = {
                content: 'Не удалось обработать форму. Попробуйте снова.',
                flags: 64
            };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage).catch(() => {});
            } else {
                await interaction.reply(errorMessage).catch(() => {});
            }
        }
        return;
    }

    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || typeof command.autocomplete !== 'function') return;
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            logger.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
        logger.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }
    
    try {
        await command.execute(interaction);
    } catch (error) {
        logger.error(`Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = {
            content: 'Произошла ошибка при выполнении команды!',
            flags: 64
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(() => {});
        } else {
            await interaction.reply(errorMessage).catch(() => {});
        }
    }
});

client.on(Events.Error, error => {
    logger.error('Discord client error event:', error);
});

process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', error);
});

// 3. Connect to Database
if (envConfig.MONGODB_URI) {
    logger.info('Connecting to MongoDB...');
    await connectDatabase();
    logger.info('MongoDB connected successfully');
} else {
    logger.warn('MONGODB_URI not found; running in development simulation mode');
}

// 4. Express Web Application (API + Web Portal + Health Check)
const PORT = envConfig.PORT;
const app = createExpressApp(client);
const server = app.listen(PORT, () => {
    logger.info(`Verge Web Portal & API listening on port ${PORT} (${envConfig.WEB_BASE_URL})`);
});

// 5. Connect to Discord if token available
if (token) {
    client.login(token).catch(error => {
        logger.error('Failed to login to Discord:', error);
    });
}

// 6. Graceful Shutdown Handler
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Shutting down gracefully...`);

    // Safety timeout: force exit if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
        logger.warn('Shutdown timed out after 10s. Forcefully terminating process.');
        process.exit(1);
    }, 10_000);
    forceExitTimeout.unref();

    try {
        if (multiplierExpiryInterval) clearInterval(multiplierExpiryInterval);
        if (salarySchedulerInterval && typeof salarySchedulerInterval.stop === 'function') {
            salarySchedulerInterval.stop();
        }

        // Close HTTP server
        await new Promise((resolve) => {
            server.close((err) => {
                if (err) logger.error('Error closing HTTP server:', err);
                else logger.info('HTTP server closed');
                resolve();
            });
        });

        // Destroy Discord client
        if (client.isReady?.()) {
            await client.destroy();
            logger.info('Discord client destroyed');
        }

        // Close Database
        await closeDatabase();
        logger.info('Database connection closed');

        clearTimeout(forceExitTimeout);
        logger.info('Graceful shutdown complete');
        process.exit(0);
    } catch (shutdownErr) {
        logger.error('Error during graceful shutdown:', shutdownErr);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
