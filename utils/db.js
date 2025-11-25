import { MongoClient, ObjectId } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
    console.error('❌ MONGODB_URI not set in environment variables');
    process.exit(1);
}

let client = null;
let db = null;

async function connectDatabase() {
    try {
        client = new MongoClient(mongoUri, {
            maxPoolSize: 10,
        });
        
        await client.connect();
        db = client.db('discord_rpg_bot');
        
        await initializeDatabase();
        console.log('✅ Database initialized successfully');
        return db;
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error);
        throw error;
    }
}

async function initializeDatabase() {
    try {
        // Create collections if they don't exist
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        if (!collectionNames.includes('players')) {
            await db.createCollection('players');
            await db.collection('players').createIndex({ id: 1 }, { unique: true });
        }
        
        if (!collectionNames.includes('player_sp')) {
            await db.createCollection('player_sp');
            await db.collection('player_sp').createIndex({ player_id: 1, style_id: 1 }, { unique: true });
        }
        
        if (!collectionNames.includes('styles')) {
            await db.createCollection('styles');
            await db.collection('styles').createIndex({ name: 1 }, { unique: true });
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
    } catch (error) {
        console.error('❌ Error initializing database collections:', error);
        throw error;
    }
}

// Connect to database on module load
await connectDatabase();

export default db;
export { client, connectDatabase };
