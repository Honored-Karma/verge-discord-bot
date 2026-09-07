import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { slugifyCharacterName, generatePublicId } from '../services/playerService.js';

config();

export async function migratePublicIds(customDb = null) {
    let client = null;
    let db = customDb;

    if (!db) {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.log('⚠️ MONGODB_URI not found. Running in simulation mode.');
            return { migrated: 0, unchanged: 0, failed: 0, total: 0, simulated: true };
        }
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db('discord_bot');
    }

    const report = {
        total: 0,
        migrated: 0,
        unchanged: 0,
        failed: 0,
        details: []
    };

    try {
        const players = await db.collection('players').find({}).toArray();
        report.total = players.length;

        // Collect all existing slugs in DB to avoid collisions
        const usedSlugs = new Set();
        for (const p of players) {
            if (p.slug) usedSlugs.add(p.slug);
        }

        for (const player of players) {
            try {
                if (player.public_id && player.slug) {
                    report.unchanged++;
                    continue;
                }

                const slot = String(player.id).endsWith('_2') ? 2 : 1;
                const publicId = player.public_id || generatePublicId(player.id, slot);

                let slug = player.slug;
                if (!slug) {
                    const baseSlug = slugifyCharacterName(player.character_name || player.username || 'character');
                    slug = baseSlug;
                    let counter = 2;
                    while (usedSlugs.has(slug)) {
                        slug = `${baseSlug}-${counter}`;
                        counter++;
                    }
                    usedSlugs.add(slug);
                }

                await db.collection('players').updateOne(
                    { _id: player._id },
                    { $set: { public_id: publicId, slug: slug } }
                );

                // If an application document exists for this player, sync its slug and public_id as well
                await db.collection('applications').updateOne(
                    { player_id: player.id },
                    { $set: { public_id: publicId, slug: slug } }
                );

                report.migrated++;
                report.details.push({
                    id: player.id,
                    character_name: player.character_name,
                    public_id: publicId,
                    slug: slug
                });
            } catch (err) {
                report.failed++;
                console.error(`Failed to migrate player ${player.id}:`, err);
            }
        }

        // Ensure unique indexes exist
        await db.collection('players').createIndex(
            { slug: 1 },
            { unique: true, sparse: true, name: 'player_slug_unique' }
        );
        await db.collection('players').createIndex(
            { public_id: 1 },
            { unique: true, sparse: true, name: 'player_public_id_unique' }
        );

        return report;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('migrate-public-ids.js')) {
    console.log('🔄 Starting Public ID & Slug Migration for Verge TRP Players...');
    migratePublicIds()
        .then(res => {
            console.log('\n========================================');
            console.log('✅ Public ID Migration Completed');
            console.log(`Total Players Checked : ${res.total}`);
            console.log(`Migrated              : ${res.migrated}`);
            console.log(`Already Up to Date    : ${res.unchanged}`);
            console.log(`Failed                : ${res.failed}`);
            console.log('========================================\n');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Migration failed with error:', err);
            process.exit(1);
        });
}
