import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { initializeShopCatalog } from './shopCatalog.js';

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
        last_sp_train_timestamp: 0,
        last_salary_paid_at: 0,
        last_salary_period_key: null,
        reputation: 20
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

        // 1. Players collection and indexes
        if (!collectionNames.includes('players')) {
            await db.createCollection('players');
        }
        await db.collection('players').createIndex({ id: 1 }, { unique: true });
        await db.collection('players').createIndex(
            { slug: 1 },
            { unique: true, sparse: true, name: 'player_slug_unique' }
        );
        await db.collection('players').createIndex(
            { public_id: 1 },
            { unique: true, sparse: true, name: 'player_public_id_unique' }
        );

        // 2. Applications collection and indexes
        if (!collectionNames.includes('applications')) {
            await db.createCollection('applications');
        }
        await db.collection('applications').createIndex(
            { slug: 1 },
            { unique: true, name: 'application_slug_unique' }
        );
        await db.collection('applications').createIndex(
            { public_id: 1 },
            { unique: true, sparse: true, name: 'application_public_id_unique' }
        );

        // 3. Wiki articles collection and indexes
        if (!collectionNames.includes('wiki_articles')) {
            await db.createCollection('wiki_articles');
        }
        await db.collection('wiki_articles').createIndex(
            { slug: 1 },
            { unique: true, name: 'wiki_article_slug_unique' }
        );
        await db.collection('wiki_articles').createIndex(
            { public_id: 1 },
            { unique: true, name: 'wiki_article_public_id_unique' }
        );
        await db.collection('wiki_articles').createIndex(
            { category: 1, status: 1, sort_order: 1 },
            { name: 'wiki_articles_category_status' }
        );

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
        await normalizeInventory();

        if (!collectionNames.includes('admin_actions')) {
            await db.createCollection('admin_actions');
        }
        await db.collection('admin_actions').createIndex({ admin_id: 1 });
        await db.collection('admin_actions').createIndex({ timestamp: 1 });
        await db.collection('admin_actions').createIndex({ created_at: -1 }, { name: 'admin_actions_created_at' });
        await db.collection('admin_actions').createIndex({ entity_type: 1 }, { name: 'admin_actions_entity_type' });

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
        await db.collection('salary_logs').createIndex(
            { player_id: 1, period_key: 1 },
            {
                unique: true,
                partialFilterExpression: { period_key: { $type: 'string' } },
                name: 'salary_player_period_unique'
            }
        );

        if (!collectionNames.includes('reputation_history')) {
            await db.createCollection('reputation_history');
            await db.collection('reputation_history').createIndex({ player_id: 1 });
            await db.collection('reputation_history').createIndex({ changed_at: -1 });
        }

        if (!collectionNames.includes('shop_purchases')) {
            await db.createCollection('shop_purchases');
        }

        if (!collectionNames.includes('shop_catalog_items')) {
            await db.createCollection('shop_catalog_items');
        }
        await db.collection('shop_catalog_items').createIndex(
            { id: 1 },
            { unique: true, name: 'shop_catalog_item_id_unique' }
        );
        await db.collection('shop_catalog_items').createIndex(
            { category: 1, enabled: 1, archived: 1, sort_order: 1 },
            { name: 'shop_catalog_visible_items' }
        );
        if (!collectionNames.includes('shop_catalog_audit')) {
            await db.createCollection('shop_catalog_audit');
        }
        await db.collection('shop_catalog_audit').createIndex(
            { item_id: 1, created_at: -1 },
            { name: 'shop_catalog_audit_history' }
        );
        await db.collection('shop_purchases').createIndex(
            { operation_id: 1 },
            { unique: true, name: 'shop_purchase_operation_unique' }
        );
        await db.collection('shop_purchases').createIndex(
            { limit_key: 1 },
            {
                unique: true,
                sparse: true,
                name: 'shop_purchase_limit_unique'
            }
        );
        await db.collection('shop_purchases').createIndex(
            { player_id: 1, item_id: 1, period_key: 1, status: 1 },
            { name: 'shop_purchase_player_period' }
        );

        if (!collectionNames.includes('shop_orders')) {
            await db.createCollection('shop_orders');
        }
        await db.collection('shop_orders').createIndex(
            { public_id: 1 },
            { unique: true, name: 'shop_order_public_unique' }
        );
        await db.collection('shop_orders').createIndex(
            { operation_id: 1 },
            { unique: true, name: 'shop_order_operation_unique' }
        );
        await db.collection('shop_orders').createIndex(
            { status: 1, created_at: -1 },
            { name: 'shop_order_review_queue' }
        );
        await db.collection('shop_orders').createIndex(
            { player_id: 1, created_at: -1 },
            { name: 'shop_order_player_history' }
        );

        if (!collectionNames.includes('active_effects')) {
            await db.createCollection('active_effects');
        }
        await db.collection('active_effects').createIndex(
            { player_id: 1, effect_key: 1 },
            { unique: true, name: 'active_effect_player_key_unique' }
        );
        await db.collection('active_effects').createIndex(
            { expires_at: 1 },
            { expireAfterSeconds: 0, name: 'active_effect_expiry_ttl' }
        );

        if (!collectionNames.includes('economy_ledger')) {
            await db.createCollection('economy_ledger');
        }
        await db.collection('economy_ledger').createIndex(
            { operation_id: 1 },
            { unique: true, name: 'economy_ledger_operation_unique' }
        );
        await db.collection('economy_ledger').createIndex(
            { player_id: 1, created_at: -1 },
            { name: 'economy_ledger_player_history' }
        );

        if (!collectionNames.includes('training_blocks')) {
            await db.createCollection('training_blocks');
        }
        await db.collection('training_blocks').createIndex(
            { user_id: 1, training: 1, slot: 1 },
            { name: 'training_blocks_user_training_slot' }
        );
        await db.collection('training_blocks').createIndex(
            { user_id: 1, is_active: 1 },
            { name: 'training_blocks_user_active' }
        );
        await db.collection('training_blocks').createIndex(
            { expires_at: 1 },
            { name: 'training_blocks_expires' }
        );

        // Persistent state for button/select/modal panels. The message id is the
        // session key, so a panel survives a bot restart; the TTL index sweeps
        // abandoned panels without a cron job.
        if (!collectionNames.includes('interaction_sessions')) {
            await db.createCollection('interaction_sessions');
        }
        await db.collection('interaction_sessions').createIndex(
            { message_id: 1 },
            { unique: true, name: 'interaction_session_message_unique' }
        );
        await db.collection('interaction_sessions').createIndex(
            { expires_at: 1 },
            { expireAfterSeconds: 0, name: 'interaction_session_expiry_ttl' }
        );
        await db.collection('interaction_sessions').createIndex(
            { namespace: 1, owner_id: 1, updated_at: -1 },
            { name: 'interaction_session_owner_history' }
        );

        // 4. Missions collection and indexes
        if (!collectionNames.includes('missions')) {
            await db.createCollection('missions');
        }
        await db.collection('missions').createIndex(
            { public_id: 1 },
            { unique: true, name: 'mission_public_id_unique' }
        );
        await db.collection('missions').createIndex(
            { message_id: 1 },
            { sparse: true, name: 'mission_message_id' }
        );
        await db.collection('missions').createIndex(
            { guild_id: 1, status: 1, created_at: -1 },
            { name: 'mission_guild_status' }
        );
        await db.collection('missions').createIndex(
            { guild_id: 1, organization_key: 1 },
            { name: 'mission_guild_org' }
        );
        await db.collection('missions').createIndex(
            { channel_id: 1 },
            { name: 'mission_channel' }
        );

        // 5. Organization mission channel settings
        if (!collectionNames.includes('organization_mission_settings')) {
            await db.createCollection('organization_mission_settings');
        }
        await db.collection('organization_mission_settings').createIndex(
            { guild_id: 1, organization_key: 1 },
            { unique: true, name: 'org_mission_channel_unique' }
        );
        await db.collection('organization_mission_settings').createIndex(
            { guild_id: 1, channel_id: 1 },
            { name: 'org_mission_guild_channel' }
        );
        await db.collection('organization_mission_settings').createIndex(
            { channel_id: 1 },
            { name: 'org_mission_channel' }
        );

        await initializeShopCatalog(db);
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
export const getDatabase = getDB;

export function setDB(customDb) {
    db = customDb;
}

async function normalizeInventory() {
    const inventory = db.collection('inventory');
    const indexes = await inventory.indexes();
    if (indexes.some(index => index.name === 'inventory_player_item_unique')) return;
    const duplicates = await inventory.aggregate([
        {
            $group: {
                _id: { player_id: '$player_id', item_name: '$item_name' },
                ids: { $push: '$_id' },
                totalQty: { $sum: { $convert: { input: '$qty', to: 'long', onError: 0, onNull: 0 } } },
                count: { $sum: 1 }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ]).toArray();

    for (const duplicate of duplicates) {
        const [keepId, ...removeIds] = duplicate.ids;
        const totalQty = Number(duplicate.totalQty || 0);
        if (!Number.isSafeInteger(totalQty) || totalQty < 1) {
            throw new Error(`Unsafe duplicate inventory quantity for ${duplicate._id.player_id}`);
        }
        await inventory.updateOne({ _id: keepId }, { $set: { qty: totalQty } });
        if (removeIds.length > 0) {
            await inventory.deleteMany({ _id: { $in: removeIds } });
        }
    }

    await inventory.createIndex(
        { player_id: 1, item_name: 1 },
        { unique: true, name: 'inventory_player_item_unique' }
    );
}

export async function withTransaction(work) {
    if (!client || !db) throw new Error('Database is not connected');
    const session = client.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        }, {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
        });
        return result;
    } finally {
        await session.endSession();
    }
}

export async function closeDatabase() {
    if (client) {
        await client.close();
        console.log('Database connection closed');
    }
}

export { connectDatabase };
