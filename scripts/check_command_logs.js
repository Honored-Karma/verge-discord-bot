import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

config();

console.log('Running check_command_logs.js');

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error('MONGODB_URI not set in env');
    process.exit(1);
}

async function main() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('discord_bot');
        const col = db.collection('command_logs');
        const count = await col.countDocuments();
        console.log('command_logs count:', count);
        const docs = await col.find({}).sort({ timestamp: -1 }).limit(5).toArray();
        console.log('latest entries:');
        console.log(docs);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
    }
}

main();
