import db from './db.js';
import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logPath = join(__dirname, '..', 'logs', 'actions.log');

const playersCollection = () => db.collection('players');
const playerSpCollection = () => db.collection('player_sp');
const stylesCollection = () => db.collection('styles');
const inventoryCollection = () => db.collection('inventory');
const adminActionsCollection = () => db.collection('admin_actions');

function logAdminAction(adminId, action, details) {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
        adminActionsCollection().insertOne({
            admin_id: adminId,
            action,
            details,
            timestamp
        }).catch(err => console.error('Error logging to DB:', err));
        
        const logEntry = `[${new Date().toISOString()}] Admin ${adminId}: ${action} - ${details}\n`;
        appendFileSync(logPath, logEntry);
    } catch (error) {
        console.error('Error logging admin action:', error);
    }
}

export async function getPlayer(playerId) {
    try {
        return await playersCollection().findOne({ id: playerId });
    } catch (error) {
        console.error('Error getting player:', error);
        return null;
    }
}

export async function createPlayer(playerId, username, characterName, characterAvatar = null) {
    try {
        await playersCollection().insertOne({
            id: playerId,
            username,
            character_name: characterName,
            character_avatar: characterAvatar,
            krw: 0,
            yen: 0,
            ap: 0,
            last_train_timestamp: 0,
            last_socialrp_timestamp: 0,
            unlocked_avatar: 0,
            ap_multiplier: 100.0
        });
        return true;
    } catch (error) {
        console.error('Error creating player:', error);
        return false;
    }
}

export async function addAP(playerId, amount, actionType = 'train') {
    try {
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        // Apply AP multiplier (multiplier is stored as percentage, e.g., 150 = 150%)
        const multiplier = (player.ap_multiplier || 100) / 100;
        const adjustedAmount = Math.round(amount * multiplier);
        const newAP = player.ap + adjustedAmount;
        const timestamp = Math.floor(Date.now() / 1000);
        
        const updateObj = { ap: newAP };
        if (actionType === 'train') {
            updateObj.last_train_timestamp = timestamp;
        } else if (actionType === 'socialrp') {
            updateObj.last_socialrp_timestamp = timestamp;
        }
        
        await playersCollection().updateOne({ id: playerId }, { $set: updateObj });
        
        if (newAP >= 1000 && player.ap < 1000) {
            await playersCollection().updateOne({ id: playerId }, { $set: { unlocked_avatar: 1 } });
        }
        
        // Add "+Техника" items for every 100 AP milestone
        const oldMilestones = Math.floor(player.ap / 100);
        const newMilestones = Math.floor(newAP / 100);
        const newTechniques = newMilestones - oldMilestones;
        
        if (newTechniques > 0) {
            for (let i = 0; i < newTechniques; i++) {
                await giveItem(playerId, '+Техника', 1, 'system');
            }
        }
        
        return newAP;
    } catch (error) {
        console.error('Error adding AP:', error);
        return false;
    }
}

export async function setAP(playerId, amount, adminId) {
    try {
        await playersCollection().updateOne({ id: playerId }, { $set: { ap: amount } });
        
        if (amount >= 1000) {
            await playersCollection().updateOne({ id: playerId }, { $set: { unlocked_avatar: 1 } });
        }
        
        logAdminAction(adminId, 'SET_AP', `Установил AP на ${amount} для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting AP:', error);
        return false;
    }
}

export async function getSP(playerId, styleId) {
    try {
        const result = await playerSpCollection().findOne({ player_id: playerId, style_id: styleId });
        return result ? result.sp : 0;
    } catch (error) {
        console.error('Error getting SP:', error);
        return 0;
    }
}

export async function getAllPlayerSP(playerId) {
    try {
        const styles = await stylesCollection().find({}).sort({ name: 1 }).toArray();
        const result = [];
        
        for (const style of styles) {
            const playerSp = await playerSpCollection().findOne({ player_id: playerId, style_id: style.id });
            if (playerSp && playerSp.sp > 0) {
                result.push({
                    id: style.id,
                    name: style.name,
                    sp: playerSp.sp
                });
            }
        }
        
        return result.sort((a, b) => b.sp - a.sp);
    } catch (error) {
        console.error('Error getting all player SP:', error);
        return [];
    }
}

export async function getTotalSP(playerId) {
    try {
        const result = await playerSpCollection().aggregate([
            { $match: { player_id: playerId } },
            { $group: { _id: null, total: { $sum: '$sp' } } }
        ]).toArray();
        return result.length > 0 ? result[0].total : 0;
    } catch (error) {
        console.error('Error getting total SP:', error);
        return 0;
    }
}

export async function addSP(playerId, styleId, amount, adminId) {
    try {
        const currentSP = await getSP(playerId, styleId);
        const newSP = currentSP + amount;
        
        if (currentSP === 0) {
            await playerSpCollection().insertOne({
                player_id: playerId,
                style_id: styleId,
                sp: newSP
            });
        } else {
            await playerSpCollection().updateOne(
                { player_id: playerId, style_id: styleId },
                { $set: { sp: newSP } }
            );
        }
        
        logAdminAction(adminId, 'ADD_SP', `Добавил ${amount} SP (стиль ${styleId}) игроку ${playerId}`);
        return newSP;
    } catch (error) {
        console.error('Error adding SP:', error);
        return false;
    }
}

export async function setSP(playerId, styleId, amount, adminId) {
    try {
        const currentSP = await getSP(playerId, styleId);
        
        if (currentSP === 0) {
            await playerSpCollection().insertOne({
                player_id: playerId,
                style_id: styleId,
                sp: amount
            });
        } else {
            await playerSpCollection().updateOne(
                { player_id: playerId, style_id: styleId },
                { $set: { sp: amount } }
            );
        }
        
        logAdminAction(adminId, 'SET_SP', `Установил SP на ${amount} (стиль ${styleId}) для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting SP:', error);
        return false;
    }
}

export async function listStyles() {
    try {
        return await stylesCollection().find({}).sort({ name: 1 }).toArray();
    } catch (error) {
        console.error('Error listing styles:', error);
        return [];
    }
}

export async function getStyleByName(name) {
    try {
        return await stylesCollection().findOne({ name });
    } catch (error) {
        console.error('Error getting style by name:', error);
        return null;
    }
}

export async function getStyleById(styleId) {
    try {
        return await stylesCollection().findOne({ id: styleId });
    } catch (error) {
        console.error('Error getting style by ID:', error);
        return null;
    }
}

export async function addStyle(name, adminId) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        
        // Get next ID (simple counter approach)
        const maxStyle = await stylesCollection().findOne({}, { sort: { id: -1 } });
        const nextId = (maxStyle?.id || 0) + 1;
        
        await stylesCollection().insertOne({
            id: nextId,
            name,
            created_by: adminId,
            created_at: timestamp
        });
        
        logAdminAction(adminId, 'ADD_STYLE', `Создал стиль: ${name}`);
        return true;
    } catch (error) {
        console.error('Error adding style:', error);
        return false;
    }
}

export async function getStylePlayerCount(styleId) {
    try {
        return await playerSpCollection().countDocuments({ style_id: styleId, sp: { $gt: 0 } });
    } catch (error) {
        console.error('Error getting style player count:', error);
        return 0;
    }
}

export async function getPlayerInventory(playerId) {
    try {
        return await inventoryCollection()
            .find({ player_id: playerId })
            .sort({ _id: -1 })
            .toArray();
    } catch (error) {
        console.error('Error getting inventory:', error);
        return [];
    }
}

export async function giveItem(playerId, itemName, qty, adminId) {
    try {
        const existing = await inventoryCollection().findOne({ player_id: playerId, item_name: itemName });
        
        if (existing) {
            await inventoryCollection().updateOne(
                { player_id: playerId, item_name: itemName },
                { $inc: { qty } }
            );
        } else {
            await inventoryCollection().insertOne({
                player_id: playerId,
                item_name: itemName,
                qty
            });
        }
        
        if (adminId !== 'system') {
            logAdminAction(adminId, 'GIVE_ITEM', `Выдал ${qty}x ${itemName} игроку ${playerId}`);
        }
        return true;
    } catch (error) {
        console.error('Error giving item:', error);
        return false;
    }
}

export async function getLeaderboard(sortBy = 'ap', limit = 10) {
    try {
        let pipeline = [];
        
        if (sortBy === 'ap') {
            pipeline = [
                { $sort: { ap: -1 } },
                { $limit: limit },
                { $project: { id: 1, username: 1, character_name: 1, ap: 1, krw: 1, yen: 1 } }
            ];
        } else if (sortBy === 'krw') {
            pipeline = [
                { $match: { krw: { $gt: 0 } } },
                { $sort: { krw: -1 } },
                { $limit: limit },
                { $project: { id: 1, username: 1, character_name: 1, ap: 1, krw: 1, yen: 1 } }
            ];
        } else if (sortBy === 'yen') {
            pipeline = [
                { $match: { yen: { $gt: 0 } } },
                { $sort: { yen: -1 } },
                { $limit: limit },
                { $project: { id: 1, username: 1, character_name: 1, ap: 1, krw: 1, yen: 1 } }
            ];
        } else if (sortBy === 'sp') {
            pipeline = [
                {
                    $lookup: {
                        from: 'player_sp',
                        localField: 'id',
                        foreignField: 'player_id',
                        as: 'sp_data'
                    }
                },
                {
                    $addFields: {
                        total_sp: { $sum: '$sp_data.sp' }
                    }
                },
                { $sort: { total_sp: -1 } },
                { $limit: limit },
                { $project: { id: 1, username: 1, character_name: 1, ap: 1, krw: 1, yen: 1, total_sp: 1 } }
            ];
        }
        
        return await playersCollection().aggregate(pipeline).toArray();
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

export async function useItem(playerId, itemName, qty) {
    try {
        const inv = await inventoryCollection().findOne({ player_id: playerId, item_name: itemName });
        if (!inv) return { success: false, reason: 'Предмет не в инвентаре' };
        if (inv.qty < qty) return { success: false, reason: 'Недостаточно предметов' };
        
        const newQty = inv.qty - qty;
        if (newQty === 0) {
            await inventoryCollection().deleteOne({ player_id: playerId, item_name: itemName });
        } else {
            await inventoryCollection().updateOne(
                { player_id: playerId, item_name: itemName },
                { $set: { qty: newQty } }
            );
        }
        
        return { success: true, itemName };
    } catch (error) {
        console.error('Error using item:', error);
        return { success: false, reason: 'Ошибка использования предмета' };
    }
}

export async function addCurrency(playerId, currency, amount, adminId) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        const updateObj = {};
        updateObj[currency] = player[currency] + amount;
        
        await playersCollection().updateOne({ id: playerId }, { $set: updateObj });
        
        logAdminAction(adminId, 'ADD_CURRENCY', `Добавил ${amount} ${currency.toUpperCase()} игроку ${playerId}`);
        return updateObj[currency];
    } catch (error) {
        console.error('Error adding currency:', error);
        return false;
    }
}

export async function setCurrency(playerId, currency, amount, adminId) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const updateObj = {};
        updateObj[currency] = amount;
        
        await playersCollection().updateOne({ id: playerId }, { $set: updateObj });
        
        logAdminAction(adminId, 'SET_CURRENCY', `Установил ${currency.toUpperCase()} на ${amount} для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting currency:', error);
        return false;
    }
}

export async function transferCurrency(fromId, toId, currency, amount) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return { success: false, reason: 'Неверная валюта' };
        
        const from = await getPlayer(fromId);
        const to = await getPlayer(toId);
        
        if (!from || !to) return { success: false, reason: 'Игрок не найден' };
        if (from[currency] < amount) return { success: false, reason: 'Недостаточно средств' };
        
        const tax = Math.ceil(amount * 0.02);
        const received = amount - tax;
        
        const updateFromObj = {};
        updateFromObj[currency] = from[currency] - amount;
        const updateToObj = {};
        updateToObj[currency] = to[currency] + received;
        
        await playersCollection().updateOne({ id: fromId }, { $set: updateFromObj });
        await playersCollection().updateOne({ id: toId }, { $set: updateToObj });
        
        return { success: true, tax, received };
    } catch (error) {
        console.error('Error transferring currency:', error);
        return { success: false, reason: 'Ошибка перевода' };
    }
}

export async function deletePlayer(playerId, adminId) {
    try {
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        await playerSpCollection().deleteMany({ player_id: playerId });
        await inventoryCollection().deleteMany({ player_id: playerId });
        await playersCollection().deleteOne({ id: playerId });
        
        logAdminAction(adminId, 'DELETE_PLAYER', `Удалил игрока ${playerId} (${player.character_name})`);
        return true;
    } catch (error) {
        console.error('Error deleting player:', error);
        return false;
    }
}

export async function deleteStyle(styleId, adminId) {
    try {
        const style = await stylesCollection().findOne({ id: styleId });
        if (!style) return false;
        
        await playerSpCollection().deleteMany({ style_id: styleId });
        await stylesCollection().deleteOne({ id: styleId });
        
        logAdminAction(adminId, 'DELETE_STYLE', `Удалил стиль: ${style.name}`);
        return true;
    } catch (error) {
        console.error('Error deleting style:', error);
        return false;
    }
}

export async function setAPMultiplier(playerId, multiplier, adminId) {
    try {
        // Ensure multiplier is within valid range (0.5 = 50%, 5 = 500%)
        const validMultiplier = Math.max(50, Math.min(500, multiplier));
        
        await playersCollection().updateOne({ id: playerId }, { $set: { ap_multiplier: validMultiplier } });
        
        logAdminAction(adminId, 'SET_AP_MULTIPLIER', `Установил множитель AP ${validMultiplier}% для игрока ${playerId}`);
        return validMultiplier;
    } catch (error) {
        console.error('Error setting AP multiplier:', error);
        return false;
    }
}

export async function giveStyle(playerId, styleName, initialSp = 0, adminId) {
    try {
        const style = await getStyleByName(styleName);
        if (!style) return false;
        
        // Ensure player has SP entry for this style
        const existing = await playerSpCollection().findOne({ player_id: playerId, style_id: style.id });
        if (!existing) {
            await playerSpCollection().insertOne({
                player_id: playerId,
                style_id: style.id,
                sp: initialSp
            });
        }
        
        logAdminAction(adminId, 'GIVE_STYLE', `Выдал стиль ${styleName} игроку ${playerId} с начальным SP ${initialSp}`);
        return true;
    } catch (error) {
        console.error('Error giving style:', error);
        return false;
    }
}

export async function getAdminActions(limit = 50) {
    try {
        return await adminActionsCollection()
            .find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    } catch (error) {
        console.error('Error getting admin actions:', error);
        return [];
    }
}
