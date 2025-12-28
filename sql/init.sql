-- Players table: stores user profiles and AP
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
    ap_multiplier REAL DEFAULT 100.0,
    rank TEXT
);

-- Player SP per style
CREATE TABLE IF NOT EXISTS player_sp (
    player_id TEXT NOT NULL,
    style_id INTEGER NOT NULL,
    sp INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, style_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (style_id) REFERENCES styles(id) ON DELETE CASCADE
);

-- Martial arts styles
CREATE TABLE IF NOT EXISTS styles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL
);

-- Player inventory (stores item names directly, no reference to items table)
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    player_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Admin action log
CREATE TABLE IF NOT EXISTS admin_actions (
    id SERIAL PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp INTEGER NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_sp_player_id ON player_sp(player_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_player_id ON inventory(player_id);
