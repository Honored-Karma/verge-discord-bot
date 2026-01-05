import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables!');
    process.exit(1);
}

let client;
let db;

async function connectDatabase() {
    try {
        client = new MongoClient(MONGODB_URI);
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

        console.log('✅ Database initialized successfully');
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
export default db;
