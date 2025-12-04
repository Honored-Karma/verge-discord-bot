import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('Trying to connect to MongoDB...');
console.log('URI (without password):', MONGODB_URI ? MONGODB_URI.replace(/:[^@]*@/, ':****@') : 'NOT SET');

if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not set in .env');
    process.exit(1);
}

async function test() {
    const client = new MongoClient(MONGODB_URI);
    try {
        console.log('Connecting...');
        await client.connect();
        console.log('SUCCESS! Connected to MongoDB');
        
        const admin = client.db('admin');
        const result = await admin.command({ ping: 1 });
        console.log('Ping result:', result);
        
        process.exit(0);
    } catch (error) {
        console.error('ERROR:', error.message);
        console.error('Error code:', error.code);
        console.error('Error details:', error.errorResponse);
        process.exit(1);
    } finally {
        await client.close();
    }
}

test();
