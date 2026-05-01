import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

config();

let client;
let db;

async function backfillPlayerDefaults() {
    const defaults = {
        krw: 0,
        yen: 0,
        ap: 0,
        rank: null,
        organization: null,
        last_train_timestamp: 0,
        last_socialrp_timestamp: 0,
        unlocked_avatar: 0,
        ap_multiplier: 100,
        sp_multiplier: 100,
        ap_multiplier_expires_at: 0,
        sp_multiplier_expires_at: 0,
        last_ap_change_at: 0,
        last_sp_change_at: 0,
        last_salary_paid_at: 0
    };

    for (const [field, value] of Object.entries(defaults)) {
        await db.collection('players').updateMany(
            { [field]: { $exists: false } },
            { $set: { [field]: value } }
        );
    }
}

async function connectDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('❌ MONGODB_URI not found in environment variables!');
            process.exit(1);
        }

        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db('discord_bot');
        
        console.log('✅ Connected to MongoDB');
        await initializeDatabase();
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error);
        process.exit(1);
    }
}

async function initializeDatabase() {
    try {
        // Get all collection names
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        // Create collections if they don't exist
        if (!collectionNames.includes('players')) {
            await db.createCollection('players');
            await db.collection('players').createIndex({ id: 1 }, { unique: true });
        }

        if (!collectionNames.includes('user_settings')) {
            await db.createCollection('user_settings');
            await db.collection('user_settings').createIndex({ id: 1 }, { unique: true });
        }

        if (!collectionNames.includes('styles')) {
            await db.createCollection('styles');
            await db.collection('styles').createIndex({ name: 1 }, { unique: true });
        }

        if (!collectionNames.includes('player_sp')) {
            await db.createCollection('player_sp');
            await db.collection('player_sp').createIndex({ player_id: 1, style_id: 1 }, { unique: true });
        }

        if (!collectionNames.includes('inventory')) {
            await db.createCollection('inventory');
            await db.collection('inventory').createIndex({ player_id: 1 });
        }

        if (!collectionNames.includes('admin_actions')) {
            await db.createCollection('admin_actions');
            await db.collection('admin_actions').createIndex({ admin_id: 1 });
            await db.collection('admin_actions').createIndex({ timestamp: 1 });
        }

        if (!collectionNames.includes('command_logs')) {
            await db.createCollection('command_logs');
            await db.collection('command_logs').createIndex({ timestamp: 1 });
            await db.collection('command_logs').createIndex({ command: 1 });
            await db.collection('command_logs').createIndex({ user_id: 1 });
        }

        if (!collectionNames.includes('log_channels')) {
            await db.createCollection('log_channels');
            await db.collection('log_channels').createIndex({ channel_id: 1 }, { unique: true });
        }

        if (!collectionNames.includes('progression_history')) {
            await db.createCollection('progression_history');
            await db.collection('progression_history').createIndex({ player_id: 1 });
            await db.collection('progression_history').createIndex({ changed_at: -1 });
        }

        if (!collectionNames.includes('salary_logs')) {
            await db.createCollection('salary_logs');
            await db.collection('salary_logs').createIndex({ player_id: 1 });
            await db.collection('salary_logs').createIndex({ paid_at: -1 });
        }

        console.log('✅ Database initialized successfully');
        await backfillPlayerDefaults();
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    }
}

// Helper function to get database
export function getDB() {
    return db;
}

export async function closeDatabase() {
    if (client) {
        await client.close();
        console.log('Database connection closed');
    }
}

export { connectDatabase };
