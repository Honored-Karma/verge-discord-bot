import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import {
    deployApplicationCommands,
    getDeployConfig,
    formatDeployError,
} from './utils/deployCommands.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];

const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
        const command = await import(pathToFileURL(filePath).href);
        if ('data' in command && 'execute' in command) {
            if (commands.some(cmd => cmd.name === command.data.name)) {
                console.warn(`⚠️  Duplicate command detected: ${command.data.name}. Skipping.`);
                continue;
            }
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded command for deployment: ${command.data.name}`);
        } else {
            console.log(`⚠️  Warning: ${file} is missing required "data" or "execute" property.`);
        }
    } catch (err) {
        console.error(`❌ Failed to load command ${file}:`, err);
    }
}

const { token, clientId, guildId } = getDeployConfig();

if (!token) {
    console.error('❌ No Discord token found! Please set DISCORD_TOKEN or TOKEN in your secrets.');
    process.exit(1);
}

if (!clientId) {
    console.error('❌ No CLIENT_ID found! Please set CLIENT_ID in your environment.');
    process.exit(1);
}

(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);
        if (guildId) {
            console.log(`📍 Target guild: ${guildId}`);
        } else {
            console.log('🌍 Target: global commands (propagation up to ~1 hour)');
        }

        const data = await deployApplicationCommands(commands, {
            token,
            clientId,
            guildId,
            cleanup: Boolean(guildId),
        });

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:');
        console.error(error.formatted || formatDeployError(error, { clientId, guildId }));
        process.exit(1);
    }
})();
