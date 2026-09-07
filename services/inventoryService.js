import { getDB } from '../utils/db.js';
import { getItemDefinition, formatItemEffect } from '../utils/itemSystem.js';

const DEMO_INVENTORY_ITEMS = [
    { item_name: 'Том боевой дисциплины', qty: 5 },
    { item_name: 'Большой том дисциплины', qty: 2 },
    { item_name: 'SP Scroll: Стиль сонной луны', qty: 3 },
    { item_name: 'Клинок Бездны', qty: 1 },
    { item_name: 'Визитка Kuroink', qty: 1 }
];

export async function getCharacterInventory(playerId) {
    const db = getDB();
    
    let items;
    if (!db) {
        // Fallback for preview mode
        items = DEMO_INVENTORY_ITEMS;
    } else {
        items = await db.collection('inventory')
            .find({ player_id: playerId })
            .sort({ item_name: 1 })
            .toArray();
    }

    const formattedItems = items.map(entry => {
        const name = entry.item_name || 'Неизвестный предмет';
        const qty = Number(entry.qty || 1);
        const def = getItemDefinition(name);
        const effectSummary = formatItemEffect(name, qty);

        return {
            id: entry._id?.toString() || name,
            name: name,
            quantity: qty,
            kind: def.kind,
            rarity: {
                key: Object.keys({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }).find(k => def.rarity?.name?.toLowerCase().includes(k)) || 'common',
                name: def.rarity?.name || 'Обычный',
                color: def.rarity?.color ? `#${def.rarity.color.toString(16).padStart(6, '0')}` : '#94a3b8'
            },
            usable: def.usable,
            emoji: def.emoji || '📦',
            title: def.title || name,
            description: def.description || 'Предмет инвентаря персонажа.',
            effect_text: def.effectText || '—',
            total_effect_summary: effectSummary
        };
    });

    const totalCount = formattedItems.reduce((acc, curr) => acc + curr.quantity, 0);

    return {
        playerId,
        totalItemsCount: totalCount,
        distinctItemsCount: formattedItems.length,
        items: formattedItems
    };
}
