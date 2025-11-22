# Discord RPG Bot Project

## Overview
Discord RPG bot with comprehensive player progression system, martial arts training mechanics, and admin management tools. Built with Node.js, discord.js v14, and SQLite.

## Recent Changes
- **2025-11-22**: Initial project setup
  - Created complete Discord bot infrastructure with 13 slash commands
  - Implemented database schema with SQLite (players, styles, inventory, SP tracking)
  - Set up AP/SP progression system with cooldowns and validation
  - Added admin tools for player management
  - Configured 8 default martial arts styles
  - Created comprehensive documentation

## Architecture

### Database Schema
- **players**: User profiles with AP progression and timestamps
- **player_sp**: Style-specific SP tracking (many-to-many relationship)
- **styles**: Martial arts styles with descriptions
- **items**: Item definitions with JSON effects
- **inventory**: Player item storage
- **admin_actions**: Audit log for all admin changes

### Command Structure
**User Commands:**
- `/register` - Player registration
- `/train` - AP earning through training (800+ chars, 5h cooldown)
- `/social-rp` - AP earning through RP (20 AP, 12h cooldown)
- `/profile` - Display player stats and progression
- `/inventory` - View items
- `/styles-list` - Show available martial arts
- `/leaderboard` - Rankings by AP/SP/balance

**Admin Commands:**
- `/set-ap`, `/add-ap` - Modify player AP
- `/set-sp`, `/add-sp` - Modify style-specific SP
- `/add-style` - Create new martial arts styles
- `/give-item` - Distribute items to players

### Progression Systems

**AP (Ability Points):**
- Training: 10 AP per submission (800+ characters, 5h cooldown)
- Social RP: 20 AP per submission (12h cooldown)
- Milestone: Every 100 AP unlocks a technique
- Avatar unlock at 1000 AP

**SP (Style Points):**
- Style-specific progression
- Ranks: Novice (0), Owner (350), Expert (1000), Master (2500)
- Admin-managed progression

### Technology Stack
- **Runtime**: Node.js 20+ with ES modules
- **Discord API**: discord.js v14
- **Database**: better-sqlite3 (SQLite)
- **Environment**: dotenv for configuration
- **Utilities**: ms for time parsing

## Required Configuration

### Discord Setup
1. Create bot at [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable necessary intents (Guilds, GuildMessages, MessageContent)
3. Generate bot token
4. Get application Client ID
5. Invite bot with proper permissions

### Environment Variables (Secrets)
- `DISCORD_TOKEN` or `TOKEN` - Bot token (REQUIRED)
- `CLIENT_ID` - Application ID (REQUIRED for command deployment)
- `GUILD_ID` - Server ID for dev testing (OPTIONAL)
- `ADMIN_IDS` - Comma-separated admin user IDs (OPTIONAL)

### Admin Permissions
Admins are determined by:
1. Users in ADMIN_IDS environment variable
2. Users with "Game Master" role
3. Server owner (fallback)

## File Structure
```
├── commands/           # Slash command handlers (13 files)
├── utils/             # Utility modules
│   ├── db.js         # Database connection & initialization
│   ├── dataManager.js # CRUD operations
│   ├── progressBar.js # Progress visualization
│   ├── cooldowns.js  # Cooldown validation
│   └── embeds.js     # Discord embed builders
├── sql/              # Database schema
│   └── init.sql      # Table definitions & default data
├── data/             # Configuration
│   └── default_items.json # Item definitions
├── logs/             # Action logging
│   └── actions.log   # Admin action audit trail
├── index.js          # Main bot entry point
├── deploy-commands.js # Slash command registration
└── package.json      # Dependencies and scripts
```

## Deployment Workflow
1. Set Discord credentials in Secrets
2. Run `npm run deploy` to register commands
3. Run `npm start` to launch bot
4. Verify bot connection in console

## Database Features
- Automatic initialization from init.sql
- WAL mode for better concurrency
- Foreign key constraints for data integrity
- Default martial arts styles pre-populated
- Sample items included

## Security Features
- Prepared statements for SQL injection prevention
- Input validation (text length, character composition)
- Admin action logging (database + file)
- Cooldown enforcement with timestamp tracking
- Role-based access control

## Default Martial Arts Styles
1. Aikido: reverse
2. Blood Taekwondo
3. Muay Thai
4. Dark Jiu-Jitsu
5. Sun Kendo
6. Qi boxing
7. Wolgwang Sword Style
8. Kyokushin Karate

## User Preferences
- Language: Russian (user speaks Russian)
- Code style: ES modules, modern JavaScript
- Comments: Simple English in code
- Error handling: Comprehensive with user-friendly messages

## Notes
- Bot uses slash commands only (no prefix commands)
- All interactions use Discord embeds for better UX
- Progress bars use Unicode block characters
- Database file: `rpg_bot.db` (auto-created)
- Commands deploy instantly to guild, globally within 1 hour
