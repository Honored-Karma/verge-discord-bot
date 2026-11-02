// Unit fixtures implement rollback explicitly. Production never falls back to
// this adapter; replica-set integration tests exercise the real driver as well.
export function attachMockTransactions(db) {
    let tail = Promise.resolve();
    db.client = {
        startSession() {
            return {
                async withTransaction(work) {
                    const previous = tail;
                    let release;
                    tail = new Promise(resolve => { release = resolve; });
                    await previous;
                    const snapshot = structuredClone(db._store);
                    try { return await work(); }
                    catch (error) {
                        for (const key of Object.keys(db._store)) {
                            const values = snapshot[key] || [];
                            db._store[key].splice(0, db._store[key].length, ...values);
                        }
                        throw error;
                    } finally { release(); }
                },
                async endSession() {},
            };
        },
    };
    return db;
}
