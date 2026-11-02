import { createHash } from 'node:crypto';
import { getDB, withTransaction } from './db.js';

export class OperationRejected extends Error {
    constructor(result) {
        super(result.reason || 'Operation rejected');
        this.result = result;
    }
}

export async function getOperationResult(operationId, database = getDB()) {
    return (await database.collection('operation_receipts').findOne({ _id: operationId }))?.result ?? null;
}

// The receipt and every effect share one transaction. A crash before commit
// changes neither; a crash after commit is resolved by reading the receipt.
export async function runOnceOperation(operationId, details, work, { database = getDB() } = {}) {
    if (typeof operationId !== 'string' || !operationId || operationId.length > 240) {
        throw new Error('Invalid operation identifier');
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(details)).digest('hex');
    const receipts = database.collection('operation_receipts');
    const replay = receipt => {
        if (receipt.fingerprint !== fingerprint) throw new Error('Operation parameters do not match the receipt');
        if (!Object.hasOwn(receipt, 'result')) throw new Error('Operation receipt is incomplete');
        return receipt.result;
    };
    try {
        return await withTransaction(async session => {
            const existing = await receipts.findOne({ _id: operationId }, { session });
            if (existing) return replay(existing);
            await receipts.insertOne({ _id: operationId, fingerprint, details, created_at: new Date() }, { session });
            const result = await work(session);
            if (result === false || result?.success === false) {
                throw new OperationRejected(result === false ? { success: false, reason: 'reward_failed' } : result);
            }
            await receipts.updateOne({ _id: operationId }, { $set: { result } }, { session });
            return result;
        }, { database });
    } catch (error) {
        if (error instanceof OperationRejected) return error.result;
        if (error?.code === 11000) {
            const existing = await receipts.findOne({ _id: operationId });
            if (existing) return replay(existing);
        }
        throw error;
    }
}
