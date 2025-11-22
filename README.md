# Discord RPG Bot

A comprehensive Discord bot featuring training mechanics, AP/SP progression system, martial arts styles, inventory management, and admin tools.

## Features

### Player Features
- **Registration System**: Register with `/register` to start your journey
- **Training System**: Submit training text (800+ characters) to earn 10 AP with 5-hour cooldown
- **Social RP**: Earn 20 AP for social roleplay with 12-hour cooldown
- **Profile System**: View detailed player profiles with AP/SP progress
- **Martial Arts Styles**: Train in 8 default styles with mastery ranks (Novice → Owner → Expert → Master)
- **Inventory**: Collect and view items
- **Leaderboards**: Compete for top rankings in AP, SP, or balance

### Admin Features
- **AP Management**: Set or add AP to players (`/set-ap`, `/add-ap`)
- **SP Management**: Set or add SP for specific styles (`/set-sp`, `/add-sp`)
- **Style Creation**: Add new martial arts styles (`/add-style`)
- **Item Distribution**: Give items to players (`/give-item`)
- **Action Logging**: All admin actions are logged to database and file

## Setup Instructions

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token
5. Go to "OAuth2" → "URL Generator"
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Send Messages`, `Embed Links`, `Read Message History`
6. Use the generated URL to invite the bot to your server

### 2. Configure Environment Variables

The bot uses Replit's integration system for Discord credentials. Make sure you have:

- `DISCORD_TOKEN` or `TOKEN`: Your bot token (automatically set by Discord integration)
- `CLIENT_ID`: Your application/client ID
- `GUILD_ID` (optional): Your server ID for faster command deployment during testing
- `ADMIN_IDS` (optional): Comma-separated list of admin user IDs

You can set these in Replit's Secrets tab.

### 3. Deploy Commands

Before running the bot, you need to register the slash commands:

```bash
npm run deploy
```

This will register all commands to your Discord server. If you didn't set `GUILD_ID`, commands will be deployed globally (takes up to 1 hour).

### 4. Run the Bot

```bash
npm start
```

The bot will connect to Discord and be ready to use!

## Available Commands

### User Commands
- `/register` - Register yourself in the RPG system
- `/train <text>` - Submit training text (800+ characters, 5h cooldown)
- `/social-rp <text>` - Submit social RP (20 AP, 12h cooldown)
- `/profile [user]` - View a player's profile
- `/inventory [user]` - View inventory
- `/styles-list` - View all available martial arts styles
- `/leaderboard [sort_by] [limit]` - View top players

### Admin Commands (Game Master role or ADMIN_IDS)
- `/set-ap <user> <amount>` - Set player's AP to a specific value
- `/add-ap <user> <amount>` - Add AP to a player
- `/set-sp <user> <style> <amount>` - Set player's SP for a style
- `/add-sp <user> <style> <amount>` - Add SP to a player for a style
- `/add-style <name> <description>` - Create a new martial arts style
- `/give-item <user> <item_id> [qty]` - Give an item to a player

## Default Martial Arts Styles

1. **Aikido: reverse** - The art of redirecting force and energy
2. **Blood Taekwondo** - Aggressive striking style focused on devastating kicks
3. **Muay Thai** - The art of eight limbs
4. **Dark Jiu-Jitsu** - Grappling and submission techniques
5. **Sun Kendo** - Sword mastery infused with radiant energy
6. **Qi boxing** - Internal energy channeled through punches
7. **Wolgwang Sword Style** - Moonlight blade techniques
8. **Kyokushin Karate** - Full-contact striking and conditioning

## Progression System

### AP (Ability Points)
- Earn AP through training and social RP
- Every 100 AP unlocks a new technique
- Reaching 1000 AP unlocks Avatar/Embodiment status

### SP (Style Points)
- Style-specific progression (managed by admins)
- **Novice**: 0-349 SP
- **Owner**: 350-999 SP
- **Expert**: 1000-2499 SP
- **Master**: 2500+ SP

## Database

The bot uses SQLite (better-sqlite3) for data storage. The database includes:
- Player profiles and progression
- Martial arts styles
- Items and inventory
- Admin action logs

## Admin Actions Log

All admin actions are logged to:
- Database: `admin_actions` table
- File: `logs/actions.log`

## Default Items

- **AP Tome (50)**: Grants 50 AP
- **AP Tome (100)**: Grants 100 AP
- **SP Scroll: Muay Thai**: Grants 30 SP in Muay Thai
- **SP Scroll: Aikido**: Grants 30 SP in Aikido

## Project Structure

```
discord-rpg-bot/
├── commands/           # All slash commands
├── utils/              # Utility functions
│   ├── db.js          # Database connection
│   ├── dataManager.js # CRUD operations
│   ├── progressBar.js # Progress visualization
│   ├── cooldowns.js   # Cooldown management
│   └── embeds.js      # Discord embed helpers
├── sql/               # Database schema
├── data/              # Default items and data
├── logs/              # Admin action logs
├── index.js           # Main bot file
└── deploy-commands.js # Command deployment script
```

## Technologies

- **Node.js 18+** with ES modules
- **discord.js v14+** for Discord API
- **better-sqlite3** for database
- **dotenv** for environment configuration
- **ms** for time parsing

## Support

For issues or questions, please check:
1. Bot token is correct in Secrets
2. Bot has proper permissions in your server
3. Commands are deployed (`npm run deploy`)
4. Console logs for error messages

## License

MIT
