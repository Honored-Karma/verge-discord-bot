// Compare the stored value, not its normalized default, so missing legacy
// fields and simultaneous updates are both handled without overwriting a gain.
export async function adjustStat(collection, query, field, delta, {
    session, minimum = 0, defaultValue = 0, extra = () => ({})
} = {}) {
    if (!Number.isSafeInteger(delta)) throw new Error('Invalid stat adjustment');
    const options = session ? { session } : {};
    for (let attempt = 0; attempt < 64; attempt += 1) {
        const document = await collection.findOne(query, options);
        if (!document) return null;
        const before = Number(document[field] ?? defaultValue);
        const after = Math.max(minimum, before + delta);
        if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after)) throw new Error('Unsafe stat value');
        const result = await collection.updateOne({
            ...query, [field]: Object.hasOwn(document, field) ? document[field] : { $exists: false },
        }, { $set: { [field]: after, ...extra(after, document) } }, options);
        if (result.matchedCount === 1) return { before, after };
    }
    throw new Error('Stat was changed too frequently; retry the operation');
}
