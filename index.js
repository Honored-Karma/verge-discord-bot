import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { createServer } from 'http';
import { connectDatabase, closeDatabase } from './utils/db.js';
import { startWeeklySalaryScheduler } from './services/salaryService.js';
import { expireMultipliers } from './utils/dataManager.js';
import { installModernResponseAdapter } from './utils/modernResponses.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!token) {
    console.error('❌ No Discord token found! Please set DISCORD_TOKEN or TOKEN in your secrets.');
    process.exit(1);
}

const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
        const command = await import(pathToFileURL(filePath).href);
        if ('data' in command && 'execute' in command) {
            if (client.commands.has(command.data.name)) {
                console.warn(`⚠️  Duplicate command detected: ${command.data.name}. Skipping.`);
                continue;
            }
            client.commands.set(command.data.name, command);
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️  Warning: ${file} is missing required "data" or "execute" property.`);
        }
    } catch (err) {
        console.error(`❌ Failed to load command ${file}:`, err);
    }
}

client.once(Events.ClientReady, async readyClient => {
    console.log(`🤖 Bot is ready! Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);

    // Auto-deploy slash commands on startup
    try {
        const commandsJSON = [];
        for (const [, cmd] of client.commands) {
            commandsJSON.push(cmd.data.toJSON());
        }

        const rest = new REST().setToken(token);
        const clientId = process.env.CLIENT_ID;
        const guildId = process.env.GUILD_ID;

        if (clientId) {
            if (guildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsJSON });
                console.log(`✅ Deployed ${commandsJSON.length} commands to guild ${guildId}`);
            } else {
                await rest.put(Routes.applicationCommands(clientId), { body: commandsJSON });
                console.log(`✅ Deployed ${commandsJSON.length} commands globally`);
            }
        } else {
            console.warn('⚠️  CLIENT_ID not set — skipping command deployment');
        }
    } catch (deployError) {
        console.error('❌ Failed to deploy commands:', deployError);
    }

    startWeeklySalaryScheduler(client);

    // Periodic multiplier expiry check (every 60 seconds)
    setInterval(() => { expireMultipliers(); }, 60_000);
});

client.on(Events.InteractionCreate, async interaction => {
    // Give every command and component interaction the same Components V2 visual language.
    installModernResponseAdapter(interaction);

    if (interaction.isModalSubmit()) {
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
            console.error(`❌ Error handling modal ${interaction.customId}:`, error);
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

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
        console.error(`❌ No command matching ${interaction.commandName} was found.`);
        return;
    }
    
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = {
            content: 'Произошла ошибка при выполнении команды!',
            flags: 64
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

client.on(Events.Error, error => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Health check HTTP server for Railway / hosting platforms
// Must start BEFORE heavy init so the platform sees an open port immediately
const PORT = process.env.PORT || 3000;
createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(PORT, () => {
    console.log(`✅ Health check server listening on port ${PORT}`);
});

// Connect to MongoDB
console.log('🔌 Connecting to MongoDB...');
await connectDatabase();
console.log('✅ MongoDB connected successfully!');

client.login(token).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down gracefully...');
    await client.destroy();
    await closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⏹️  Shutting down gracefully...');
    await client.destroy();
    await closeDatabase();
    process.exit(0);
});
