import 'dotenv/config';
import { connectDatabase, closeDatabase } from '../utils/db.js';
import { batchImportApplications } from '../services/applicationService.js';

async function main() {
    console.log('🚀 [Applications Import CLI] Starting application import from MongoDB player records...');

    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI is not set in environment variables. Aborting.');
        process.exit(1);
    }

    try {
        await connectDatabase();
        console.log('✅ Connected to MongoDB.');

        const report = await batchImportApplications();

        console.log('\n📊 === ИТОГОВЫЙ ОТЧЁТ ИМПОРТА АНКЕТ ===');
        console.log(`Всего персонажей со ссылками: ${report.totalFound}`);
        console.log(`✅ Успешно импортировано:     ${report.imported}`);
        console.log(`ℹ️ Уже существовали:          ${report.already_exists}`);
        console.log(`⏩ Пропущено (без ссылок):     ${report.skipped}`);
        console.log(`❌ Ошибок импорта:             ${report.failed}`);
        console.log('=====================================\n');

        await closeDatabase();
        process.exit(0);
    } catch (err) {
        console.error('❌ Fatal error during application import:', err);
        process.exit(1);
    }
}

main();
