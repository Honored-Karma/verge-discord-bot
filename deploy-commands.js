import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

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

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
    console.error('❌ No Discord token found! Please set DISCORD_TOKEN or TOKEN in your secrets.');
    process.exit(1);
}

if (!clientId) {
    console.error('❌ No CLIENT_ID found! Please set CLIENT_ID in your environment.');
    process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);
        let data;
        if (guildId) {
            // Удаляем все старые гильдейские команды
            console.log(`📍 Removing old guild commands from: ${guildId}`);
            const oldGuildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
            for (const cmd of oldGuildCommands) {
                await rest.delete(Routes.applicationGuildCommand(clientId, guildId, cmd.id));
                console.log(`🗑️ Deleted old guild command: ${cmd.name}`);
            }
            // Удаляем все старые глобальные команды
            console.log('🌍 Removing old global commands');
            const oldGlobalCommands = await rest.get(Routes.applicationCommands(clientId));
            for (const cmd of oldGlobalCommands) {
                await rest.delete(Routes.applicationCommand(clientId, cmd.id));
                console.log(`🗑️ Deleted old global command: ${cmd.name}`);
            }
            // Деплоим новые
            console.log(`📍 Deploying to guild: ${guildId}`);
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`✅ Successfully deployed to guild!`);
        } else {
            // Удаляем все старые глобальные команды
            console.log('🌍 Removing old global commands');
            const oldGlobalCommands = await rest.get(Routes.applicationCommands(clientId));
            for (const cmd of oldGlobalCommands) {
                await rest.delete(Routes.applicationCommand(clientId, cmd.id));
                console.log(`🗑️ Deleted old global command: ${cmd.name}`);
            }
            // Деплоим новые
            console.log('🌍 Deploying globally (this may take up to 1 hour to propagate)');
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
        }
        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
