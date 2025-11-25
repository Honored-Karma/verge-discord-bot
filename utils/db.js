import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        try {
            // Create tables one by one with IF NOT EXISTS
            await client.query(`
                CREATE TABLE IF NOT EXISTS players (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    character_name TEXT,
                    character_avatar TEXT,
                    krw INTEGER DEFAULT 0,
                    yen INTEGER DEFAULT 0,
                    ap INTEGER DEFAULT 0,
                    last_train_timestamp INTEGER DEFAULT 0,
                    last_socialrp_timestamp INTEGER DEFAULT 0,
                    unlocked_avatar INTEGER DEFAULT 0,
                    ap_multiplier REAL DEFAULT 100.0
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS styles (
                    id SERIAL PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    created_by TEXT,
                    created_at INTEGER NOT NULL
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS player_sp (
                    player_id TEXT NOT NULL,
                    style_id INTEGER NOT NULL,
                    sp INTEGER DEFAULT 0,
                    PRIMARY KEY (player_id, style_id),
                    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
                    FOREIGN KEY (style_id) REFERENCES styles(id) ON DELETE CASCADE
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS inventory (
                    id SERIAL PRIMARY KEY,
                    player_id TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    qty INTEGER DEFAULT 1,
                    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS admin_actions (
                    id SERIAL PRIMARY KEY,
                    admin_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT,
                    timestamp INTEGER NOT NULL
                )
            `);

            // Create indexes
            await client.query('CREATE INDEX IF NOT EXISTS idx_player_sp_player_id ON player_sp(player_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp)');
            await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_player_id ON inventory(player_id)');

            console.log('✅ Database initialized successfully');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    }
}

// Initialize database on module load
await initializeDatabase();

export default pool;
