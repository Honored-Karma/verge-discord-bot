import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { connectDatabase, closeDatabase } from './utils/db.js';
import { startWeeklySalaryScheduler } from './services/salaryService.js';

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
    const command = await import(`file://${filePath}`);
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
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    // Wrap reply/followUp to convert deprecated `ephemeral: true` into flags: 64
    try {
        const origReply = interaction.reply.bind(interaction);
        interaction.reply = (options) => {
            if (options && options.ephemeral) {
                options.flags = (options.flags || 0) | 64;
                delete options.ephemeral;
            }
            return origReply(options);
        };
        if (interaction.followUp) {
            const origFollow = interaction.followUp.bind(interaction);
            interaction.followUp = (options) => {
                if (options && options.ephemeral) {
                    options.flags = (options.flags || 0) | 64;
                    delete options.ephemeral;
                }
                return origFollow(options);
            };
        }
    } catch (e) {
        // noop
    }
    
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
            content: 'There was an error while executing this command!',
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
