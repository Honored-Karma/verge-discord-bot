import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'rpg_bot.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function initializeDatabase() {
    try {
        const initSQL = readFileSync(join(__dirname, '..', 'sql', 'init.sql'), 'utf-8');
        db.exec(initSQL);
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    }
}

initializeDatabase();

export default db;
