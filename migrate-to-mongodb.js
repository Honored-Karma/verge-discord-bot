/**
 * Migration script from PostgreSQL to MongoDB
 * Use this if you have existing data in PostgreSQL and want to migrate to MongoDB
 * 
 * Usage: node migrate-to-mongodb.js
 */

import pkg from 'pg';
import { MongoClient } from 'mongodb';

const { Pool } = pkg;

const PG_CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://...';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set!');
    process.exit(1);
}

async function migrate() {
    let pgPool, mongoClient;
    
    try {
        // Connect to PostgreSQL
        pgPool = new Pool({
            connectionString: PG_CONNECTION_STRING
        });
        
        // Connect to MongoDB
        mongoClient = new MongoClient(MONGODB_URI);
        await mongoClient.connect();
        const db = mongoClient.db('discord_bot');
        
        console.log('📚 Starting migration...');
        
        // Migrate players
        console.log('🔄 Migrating players...');
        const playersResult = await pgPool.query('SELECT * FROM players');
        if (playersResult.rows.length > 0) {
            await db.collection('players').insertMany(playersResult.rows);
            console.log(`✅ Migrated ${playersResult.rows.length} players`);
        }
        
        // Migrate styles
        console.log('🔄 Migrating styles...');
        const stylesResult = await pgPool.query('SELECT * FROM styles');
        if (stylesResult.rows.length > 0) {
            await db.collection('styles').insertMany(stylesResult.rows);
            console.log(`✅ Migrated ${stylesResult.rows.length} styles`);
        }
        
        // Migrate player_sp
        console.log('🔄 Migrating player_sp...');
        const playerSpResult = await pgPool.query('SELECT * FROM player_sp');
        if (playerSpResult.rows.length > 0) {
            const playerSpData = playerSpResult.rows.map(row => ({
                player_id: row.player_id,
                style_id: row.style_id,
                sp: row.sp
            }));
            await db.collection('player_sp').insertMany(playerSpData);
            console.log(`✅ Migrated ${playerSpResult.rows.length} player_sp records`);
        }
        
        // Migrate inventory
        console.log('🔄 Migrating inventory...');
        const inventoryResult = await pgPool.query('SELECT * FROM inventory');
        if (inventoryResult.rows.length > 0) {
            const inventoryData = inventoryResult.rows.map(row => ({
                player_id: row.player_id,
                item_name: row.item_name,
                qty: row.qty
            }));
            await db.collection('inventory').insertMany(inventoryData);
            console.log(`✅ Migrated ${inventoryResult.rows.length} inventory items`);
        }
        
        // Migrate admin_actions
        console.log('🔄 Migrating admin_actions...');
        const adminActionsResult = await pgPool.query('SELECT * FROM admin_actions');
        if (adminActionsResult.rows.length > 0) {
            const adminActionsData = adminActionsResult.rows.map(row => ({
                admin_id: row.admin_id,
                action: row.action,
                details: row.details,
                timestamp: row.timestamp
            }));
            await db.collection('admin_actions').insertMany(adminActionsData);
            console.log(`✅ Migrated ${adminActionsResult.rows.length} admin actions`);
        }
        
        // Create indexes
        console.log('🔧 Creating indexes...');
        await db.collection('players').createIndex({ id: 1 }, { unique: true });
        await db.collection('styles').createIndex({ name: 1 }, { unique: true });
        await db.collection('player_sp').createIndex({ player_id: 1, style_id: 1 }, { unique: true });
        await db.collection('inventory').createIndex({ player_id: 1 });
        await db.collection('admin_actions').createIndex({ admin_id: 1 });
        await db.collection('admin_actions').createIndex({ timestamp: 1 });
        
        console.log('✅ Migration completed successfully!');
        console.log('🎉 Your data has been migrated to MongoDB!');
        
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    } finally {
        if (pgPool) await pgPool.end();
        if (mongoClient) await mongoClient.close();
    }
}

migrate();
