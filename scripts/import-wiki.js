import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { 
    loadNormalizedLoreArticles, 
    generateWikiPublicId,
    computeSourceHash
} from '../services/wikiService.js';

config();

export async function importWikiArticles(customDb = null) {
    let client = null;
    let db = customDb;
    const articles = loadNormalizedLoreArticles();

    if (!db) {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.log('⚠️ MONGODB_URI not found. Running in simulation mode with in-memory lore.');
            return {
                created: 0,
                updated: 0,
                unchanged: articles.length,
                skipped: 0,
                failed: 0,
                total: articles.length,
                simulated: true
            };
        }
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db('discord_bot');
    }

    const report = {
        total: articles.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        failed: 0,
        articles: []
    };

    try {
        const collection = db.collection('wiki_articles');

        for (const articleData of articles) {
            try {
                const publicId = generateWikiPublicId(articleData.slug);
                const currentHash = computeSourceHash(articleData.content + articleData.title + articleData.summary);

                const existing = await collection.findOne({ slug: articleData.slug });
                const now = new Date().toISOString();

                const docToSave = {
                    public_id: publicId,
                    slug: articleData.slug,
                    category: articleData.category,
                    title: articleData.title,
                    summary: articleData.summary,
                    content: articleData.content,
                    sections: articleData.sections || [],
                    aliases: articleData.aliases || [],
                    tags: articleData.tags || [],
                    related_articles: articleData.related_articles || [],
                    related_characters: articleData.related_characters || [],
                    source: {
                        type: articleData.provenance?.type || 'verge_lore_document',
                        source_file: articleData.provenance?.source_file || 'lore_source.txt',
                        source_sections: articleData.provenance?.source_sections || [],
                        source_hash: currentHash,
                        import_version: articleData.provenance?.import_version || 1,
                        imported_at: now
                    },
                    status: articleData.status || 'published',
                    sort_order: articleData.sort_order || 0,
                    updated_at: now
                };

                if (!existing) {
                    docToSave.created_at = now;
                    await collection.insertOne(docToSave);
                    report.created++;
                    report.articles.push({ slug: articleData.slug, action: 'created', title: articleData.title });
                } else if (existing.is_manually_overridden) {
                    // Respect manual admin edits: do not overwrite
                    report.skipped++;
                    report.articles.push({ slug: articleData.slug, action: 'skipped', title: `${articleData.title} (сохранена ручная правка)` });
                } else {
                    const existingHash = existing.source?.source_hash;
                    const isIdentical = existingHash === currentHash &&
                        existing.title === docToSave.title &&
                        existing.summary === docToSave.summary &&
                        existing.category === docToSave.category &&
                        existing.status === docToSave.status;

                    if (isIdentical) {
                        report.unchanged++;
                        report.articles.push({ slug: articleData.slug, action: 'unchanged', title: articleData.title });
                    } else {
                        await collection.updateOne(
                            { _id: existing._id },
                            { $set: docToSave }
                        );
                        report.updated++;
                        report.articles.push({ slug: articleData.slug, action: 'updated', title: articleData.title });
                    }
                }
            } catch (err) {
                report.failed++;
                console.error(`❌ Failed to import article ${articleData.slug}:`, err);
            }
        }

        // Ensure unique indexes
        await collection.createIndex({ slug: 1 }, { unique: true, name: 'wiki_article_slug_unique' });
        await collection.createIndex({ public_id: 1 }, { unique: true, name: 'wiki_article_public_id_unique' });
        await collection.createIndex({ category: 1, status: 1, sort_order: 1 }, { name: 'wiki_articles_category_status' });

        return report;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('import-wiki.js')) {
    console.log('📖 Starting Source-Driven Lore & Wiki Import for Verge TRP...');
    importWikiArticles()
        .then(res => {
            console.log('\n========================================');
            console.log('✅ Wiki Lore Import Completed');
            console.log(`Total Articles Processed : ${res.total}`);
            console.log(`Created                  : ${res.created}`);
            console.log(`Updated                  : ${res.updated}`);
            console.log(`Unchanged                : ${res.unchanged}`);
            console.log(`Skipped                  : ${res.skipped}`);
            console.log(`Failed                   : ${res.failed}`);
            console.log('========================================\n');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Wiki import failed with error:', err);
            process.exit(1);
        });
}
