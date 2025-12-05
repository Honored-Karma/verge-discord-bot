import { getDB } from './db.js';

function logAdminAction(adminId, action, details) {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
        const db = getDB();
        db.collection('admin_actions').insertOne({
            admin_id: adminId,
            action,
            details,
            timestamp
        }).catch(err => console.error('Error logging to DB:', err));
    } catch (error) {
        console.error('Error logging admin action:', error);
    }
}

export async function getPlayer(playerId) {
    try {
        const db = getDB();
        const player = await db.collection('players').findOne({ id: playerId });
        return player || null;
    } catch (error) {
        console.error('Error getting player:', error);
        return null;
    }
}

export async function createPlayer(playerId, username, characterName, characterAvatar = null) {
    try {
        const db = getDB();
        await db.collection('players').insertOne({
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
            ap_multiplier: 100.0,
            sp_multiplier: 100.0
        });
        return true;
    } catch (error) {
        console.error('Error creating player:', error);
        return false;
    }
}

export async function addAP(playerId, amount, actionType = 'train') {
    try {
        const db = getDB();
        const player = await getPlayer(playerId);
        if (!player) return false;
        
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
        
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: updateObj }
        );
        
        if (newAP >= 1000 && player.ap < 1000) {
            await db.collection('players').updateOne(
                { id: playerId },
                { $set: { unlocked_avatar: 1 } }
            );
        }
        
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
        const db = getDB();
        const updateObj = { ap: amount };
        if (amount >= 1000) {
            updateObj.unlocked_avatar = 1;
        }
        
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: updateObj }
        );
        
        logAdminAction(adminId, 'SET_AP', `Установил AP на ${amount} для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting AP:', error);
        return false;
    }
}

export async function getSP(playerId, styleId) {
    try {
        const db = getDB();
        const result = await db.collection('player_sp').findOne({
            player_id: playerId,
            style_id: styleId
        });
        return result ? result.sp : 0;
    } catch (error) {
        console.error('Error getting SP:', error);
        return 0;
    }
}

export async function getAllPlayerSP(playerId) {
    try {
        const db = getDB();
        const result = await db.collection('player_sp')
            .find({ player_id: playerId, sp: { $gt: 0 } })
            .sort({ sp: -1 })
            .toArray();
        
        const styles = [];
        for (const row of result) {
            const style = await db.collection('styles').findOne({ id: row.style_id });
            if (style) {
                styles.push({
                    id: row.style_id,
                    name: style.name,
                    sp: row.sp
                });
            }
        }
        return styles;
    } catch (error) {
        console.error('Error getting all player SP:', error);
        return [];
    }
}

export async function getTotalSP(playerId) {
    try {
        const db = getDB();
        const result = await db.collection('player_sp').aggregate([
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
        const db = getDB();
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        const multiplier = (player.sp_multiplier || 100) / 100;
        const adjustedAmount = Math.round(amount * multiplier);
        
        const currentSP = await getSP(playerId, styleId);
        const newSP = currentSP + adjustedAmount;
        
        await db.collection('player_sp').updateOne(
            { player_id: playerId, style_id: styleId },
            { $set: { player_id: playerId, style_id: styleId, sp: newSP } },
            { upsert: true }
        );
        
        logAdminAction(adminId, 'ADD_SP', `Добавил ${amount} SP (×${player.sp_multiplier}% = ${adjustedAmount}) стиль ${styleId} игроку ${playerId}`);
        return newSP;
    } catch (error) {
        console.error('Error adding SP:', error);
        return false;
    }
}

export async function setSP(playerId, styleId, amount, adminId) {
    try {
        const db = getDB();
        
        await db.collection('player_sp').updateOne(
            { player_id: playerId, style_id: styleId },
            { $set: { player_id: playerId, style_id: styleId, sp: amount } },
            { upsert: true }
        );
        
        logAdminAction(adminId, 'SET_SP', `Установил SP на ${amount} (стиль ${styleId}) для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting SP:', error);
        return false;
    }
}

export async function listStyles() {
    try {
        const db = getDB();
        const styles = await db.collection('styles')
            .find({})
            .sort({ name: 1 })
            .toArray();
        return styles;
    } catch (error) {
        console.error('Error listing styles:', error);
        return [];
    }
}

export async function getStyleByName(name) {
    try {
        const db = getDB();
        const style = await db.collection('styles').findOne({ name });
        return style || null;
    } catch (error) {
        console.error('Error getting style by name:', error);
        return null;
    }
}

export async function getStyleById(styleId) {
    try {
        const db = getDB();
        const style = await db.collection('styles').findOne({ id: styleId });
        return style || null;
    } catch (error) {
        console.error('Error getting style by ID:', error);
        return null;
    }
}

export async function addStyle(name, adminId) {
    try {
        const db = getDB();
        const timestamp = Math.floor(Date.now() / 1000);
        
        // Get next ID
        const lastStyle = await db.collection('styles')
            .findOne({}, { sort: { id: -1 } });
        const nextId = lastStyle ? lastStyle.id + 1 : 1;
        
        await db.collection('styles').insertOne({
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
        const db = getDB();
        const count = await db.collection('player_sp').countDocuments({
            style_id: styleId,
            sp: { $gt: 0 }
        });
        return count;
    } catch (error) {
        console.error('Error getting style player count:', error);
        return 0;
    }
}

export async function getPlayerInventory(playerId) {
    try {
        const db = getDB();
        const inventory = await db.collection('inventory')
            .find({ player_id: playerId })
            .sort({ _id: -1 })
            .toArray();
        return inventory;
    } catch (error) {
        console.error('Error getting inventory:', error);
        return [];
    }
}

export async function giveItem(playerId, itemName, qty, adminId) {
    try {
        const db = getDB();
        const existing = await db.collection('inventory').findOne({
            player_id: playerId,
            item_name: itemName
        });
        
        if (existing) {
            await db.collection('inventory').updateOne(
                { player_id: playerId, item_name: itemName },
                { $inc: { qty } }
            );
        } else {
            await db.collection('inventory').insertOne({
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
        const db = getDB();
        let pipeline = [];
        
        if (sortBy === 'sp') {
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
                        total_sp: {
                            $sum: '$sp_data.sp'
                        }
                    }
                },
                { $sort: { total_sp: -1 } },
                { $limit: limit },
                {
                    $project: {
                        id: 1,
                        username: 1,
                        character_name: 1,
                        ap: 1,
                        krw: 1,
                        yen: 1,
                        total_sp: 1
                    }
                }
            ];
        } else {
            const sortObj = {};
            if (sortBy === 'ap') sortObj.ap = -1;
            else if (sortBy === 'krw') sortObj.krw = -1;
            else if (sortBy === 'yen') sortObj.yen = -1;
            
            pipeline = [
                { $sort: sortObj },
                { $limit: limit },
                {
                    $project: {
                        id: 1,
                        username: 1,
                        character_name: 1,
                        ap: 1,
                        krw: 1,
                        yen: 1
                    }
                }
            ];
        }
        
        const result = await db.collection('players').aggregate(pipeline).toArray();
        return result;
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

export async function useItem(playerId, itemName, qty) {
    try {
        const db = getDB();
        const inv = await db.collection('inventory').findOne({
            player_id: playerId,
            item_name: itemName
        });
        
        if (!inv) return { success: false, reason: 'Предмет не в инвентаре' };
        if (inv.qty < qty) return { success: false, reason: 'Недостаточно предметов' };
        
        const newQty = inv.qty - qty;
        if (newQty === 0) {
            await db.collection('inventory').deleteOne({
                player_id: playerId,
                item_name: itemName
            });
        } else {
            await db.collection('inventory').updateOne(
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
        const db = getDB();
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        const updateObj = {};
        updateObj[currency] = (Number(player[currency]) || 0) + Number(amount);
        
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: updateObj }
        );
        
        logAdminAction(adminId, 'ADD_CURRENCY', `Добавил ${amount} ${currency.toUpperCase()} игроку ${playerId}`);
        return updateObj[currency];
    } catch (error) {
        console.error('Error adding currency:', error);
        return false;
    }
}

export async function setCurrency(playerId, currency, amount, adminId) {
    try {
        const db = getDB();
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const updateObj = {};
        updateObj[currency] = Number(amount);
        
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: updateObj }
        );
        
        logAdminAction(adminId, 'SET_CURRENCY', `Установил ${currency.toUpperCase()} на ${amount} для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting currency:', error);
        return false;
    }
}

export async function transferCurrency(fromId, toId, currency, amount) {
    try {
        const db = getDB();
        if (currency !== 'krw' && currency !== 'yen') return { success: false, reason: 'Неверная валюта' };
        
        const from = await getPlayer(fromId);
        const to = await getPlayer(toId);
        
        if (!from || !to) return { success: false, reason: 'Игрок не найден' };
        
        const fromBalance = Number(from[currency]) || 0;
        const numAmount = Number(amount);
        if (fromBalance < numAmount) return { success: false, reason: 'Недостаточно средств' };
        
        const tax = Math.ceil(numAmount * 0.02);
        const received = numAmount - tax;
        
        const updateObj1 = {};
        updateObj1[currency] = fromBalance - numAmount;
        
        const updateObj2 = {};
        updateObj2[currency] = (Number(to[currency]) || 0) + received;
        
        await db.collection('players').updateOne(
            { id: fromId },
            { $set: updateObj1 }
        );
        
        await db.collection('players').updateOne(
            { id: toId },
            { $set: updateObj2 }
        );
        
        return { success: true, tax, received };
    } catch (error) {
        console.error('Error transferring currency:', error);
        return { success: false, reason: 'Ошибка перевода' };
    }
}

export async function deletePlayer(playerId, adminId) {
    try {
        const db = getDB();
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        await db.collection('player_sp').deleteMany({ player_id: playerId });
        await db.collection('inventory').deleteMany({ player_id: playerId });
        await db.collection('players').deleteOne({ id: playerId });
        
        logAdminAction(adminId, 'DELETE_PLAYER', `Удалил игрока ${playerId} (${player.character_name})`);
        return true;
    } catch (error) {
        console.error('Error deleting player:', error);
        return false;
    }
}

export async function deleteStyle(styleId, adminId) {
    try {
        const db = getDB();
        const style = await db.collection('styles').findOne({ id: styleId });
        if (!style) return false;
        
        await db.collection('player_sp').deleteMany({ style_id: styleId });
        await db.collection('styles').deleteOne({ id: styleId });
        
        logAdminAction(adminId, 'DELETE_STYLE', `Удалил стиль: ${style.name}`);
        return true;
    } catch (error) {
        console.error('Error deleting style:', error);
        return false;
    }
}

export async function setAPMultiplier(playerId, multiplier, adminId) {
    try {
        const db = getDB();
        const validMultiplier = Math.max(50, Math.min(500, multiplier));
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: { ap_multiplier: validMultiplier } }
        );
        logAdminAction(adminId, 'SET_AP_MULTIPLIER', `Установил множитель AP ${validMultiplier}% для игрока ${playerId}`);
        return validMultiplier;
    } catch (error) {
        console.error('Error setting AP multiplier:', error);
        return false;
    }
}

export async function setSPMultiplier(playerId, multiplier, adminId) {
    try {
        const db = getDB();
        const validMultiplier = Math.max(50, Math.min(500, multiplier));
        await db.collection('players').updateOne(
            { id: playerId },
            { $set: { sp_multiplier: validMultiplier } }
        );
        logAdminAction(adminId, 'SET_SP_MULTIPLIER', `Установил множитель SP ${validMultiplier}% для игрока ${playerId}`);
        return validMultiplier;
    } catch (error) {
        console.error('Error setting SP multiplier:', error);
        return false;
    }
}

export async function giveStyle(playerId, styleName, initialSp = 0, adminId) {
    try {
        const db = getDB();
        const style = await getStyleByName(styleName);
        if (!style) return false;
        
        const existing = await db.collection('player_sp').findOne({
            player_id: playerId,
            style_id: style.id
        });
        
        if (!existing) {
            await db.collection('player_sp').insertOne({
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

export async function exchangeCurrency(playerId, currency, amount) {
    try {
        const db = getDB();
        const player = await getPlayer(playerId);
        if (!player) return { success: false, reason: 'Игрок не найден' };
        
        // Курс: 1 йен = 9.4 воны
        const EXCHANGE_RATE = 9.4;
        const numAmount = Number(amount);
        
        if (currency === 'yen') {
            // Обменять йены на воны
            const playerYen = Number(player.yen) || 0;
            if (playerYen < numAmount) return { success: false, reason: `Недостаточно йен! У вас только ${playerYen.toLocaleString('ru-RU')} ¥` };
            
            const krwReceived = Math.floor(numAmount * EXCHANGE_RATE);
            await db.collection('players').updateOne(
                { id: playerId },
                {
                    $set: {
                        yen: playerYen - numAmount,
                        krw: (Number(player.krw) || 0) + krwReceived
                    }
                }
            );
            
            return { success: true, received: krwReceived };
        } else if (currency === 'krw') {
            // Обменять воны на йены
            const playerKrw = Number(player.krw) || 0;
            if (playerKrw < numAmount) return { success: false, reason: `Недостаточно вон! У вас только ${playerKrw.toLocaleString('ru-RU')} ₩` };
            
            const yenReceived = Math.floor(numAmount / EXCHANGE_RATE);
            if (yenReceived === 0) return { success: false, reason: `Слишком мало вон! Минимум ${Math.ceil(EXCHANGE_RATE)} ₩` };
            
            await db.collection('players').updateOne(
                { id: playerId },
                {
                    $set: {
                        krw: playerKrw - numAmount,
                        yen: (Number(player.yen) || 0) + yenReceived
                    }
                }
            );
            
            return { success: true, received: yenReceived };
        }
        
        return { success: false, reason: 'Неверная валюта' };
    } catch (error) {
        console.error('Error exchanging currency:', error);
        return { success: false, reason: 'Ошибка обмена' };
    }
}

export async function getAdminActions(limit = 50) {
    try {
        const db = getDB();
        const actions = await db.collection('admin_actions')
            .find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
        return actions;
    } catch (error) {
        console.error('Error getting admin actions:', error);
        return [];
    }
}

export async function setCharacterAvatar(playerId, avatarUrl) {
    try {
        const db = getDB();
        const result = await db.collection('players').updateOne(
            { id: playerId },
            { $set: { character_avatar: avatarUrl } }
        );
        return result.modifiedCount > 0;
    } catch (error) {
        console.error('Error setting character avatar:', error);
        return false;
    }
}
