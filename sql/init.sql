-- Players table: stores user profiles and AP
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    ap INTEGER DEFAULT 0,
    last_train_timestamp INTEGER DEFAULT 0,
    last_socialrp_timestamp INTEGER DEFAULT 0,
    unlocked_avatar INTEGER DEFAULT 0
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL
);

-- Items that can be given to players
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    effect TEXT,
    created_at INTEGER NOT NULL
);

-- Player inventory
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- Admin action log
CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp INTEGER NOT NULL
);

-- Insert default styles
INSERT OR IGNORE INTO styles (name, description, created_by, created_at) VALUES
    ('Aikido: reverse', 'The art of redirecting force and energy', 'system', strftime('%s', 'now')),
    ('Blood Taekwondo', 'Aggressive striking style focused on devastating kicks', 'system', strftime('%s', 'now')),
    ('Muay Thai', 'The art of eight limbs combining punches, kicks, elbows, and knees', 'system', strftime('%s', 'now')),
    ('Dark Jiu-Jitsu', 'Grappling and submission techniques shrouded in shadow', 'system', strftime('%s', 'now')),
    ('Sun Kendo', 'Sword mastery infused with radiant energy', 'system', strftime('%s', 'now')),
    ('Qi boxing', 'Internal energy channeled through devastating punches', 'system', strftime('%s', 'now')),
    ('Wolgwang Sword Style', 'Moonlight blade techniques of precision and grace', 'system', strftime('%s', 'now')),
    ('Kyokushin Karate', 'Full-contact striking and iron body conditioning', 'system', strftime('%s', 'now'));

-- Insert default items
INSERT OR IGNORE INTO items (id, name, type, effect, created_at) VALUES
    ('ap_tome_50', 'AP Tome (50)', 'consumable', '{"ap":50}', strftime('%s', 'now')),
    ('ap_tome_100', 'AP Tome (100)', 'consumable', '{"ap":100}', strftime('%s', 'now')),
    ('sp_scroll_muay_thai', 'SP Scroll: Muay Thai', 'consumable', '{"sp":{"style":"Muay Thai","value":30}}', strftime('%s', 'now'));
