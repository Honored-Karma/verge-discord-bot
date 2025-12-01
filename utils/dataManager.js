import pool from './db.js';
import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logPath = join(__dirname, '..', 'logs', 'actions.log');

function logAdminAction(adminId, action, details) {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
        pool.query('INSERT INTO admin_actions (admin_id, action, details, timestamp) VALUES ($1, $2, $3, $4)', 
            [adminId, action, details, timestamp]).catch(err => console.error('Error logging to DB:', err));
        
        const logEntry = `[${new Date().toISOString()}] Admin ${adminId}: ${action} - ${details}\n`;
        appendFileSync(logPath, logEntry);
    } catch (error) {
        console.error('Error logging admin action:', error);
    }
}

export async function getPlayer(playerId) {
    try {
        const result = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting player:', error);
        return null;
    }
}

export async function createPlayer(playerId, username, characterName, characterAvatar = null) {
    try {
        await pool.query(
            'INSERT INTO players (id, username, character_name, character_avatar, krw, yen, ap, last_train_timestamp, last_socialrp_timestamp, unlocked_avatar, ap_multiplier) VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0, 100.0)',
            [playerId, username, characterName, characterAvatar]
        );
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
        
        const multiplier = (player.ap_multiplier || 100) / 100;
        const adjustedAmount = Math.round(amount * multiplier);
        const newAP = player.ap + adjustedAmount;
        const timestamp = Math.floor(Date.now() / 1000);
        
        let updateQuery = '';
        if (actionType === 'train') {
            updateQuery = 'UPDATE players SET ap = $1, last_train_timestamp = $2 WHERE id = $3';
            await pool.query(updateQuery, [newAP, timestamp, playerId]);
        } else if (actionType === 'socialrp') {
            updateQuery = 'UPDATE players SET ap = $1, last_socialrp_timestamp = $2 WHERE id = $3';
            await pool.query(updateQuery, [newAP, timestamp, playerId]);
        } else {
            updateQuery = 'UPDATE players SET ap = $1 WHERE id = $2';
            await pool.query(updateQuery, [newAP, playerId]);
        }
        
        if (newAP >= 1000 && player.ap < 1000) {
            await pool.query('UPDATE players SET unlocked_avatar = 1 WHERE id = $1', [playerId]);
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
        await pool.query('UPDATE players SET ap = $1 WHERE id = $2', [amount, playerId]);
        
        if (amount >= 1000) {
            await pool.query('UPDATE players SET unlocked_avatar = 1 WHERE id = $1', [playerId]);
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
        const result = await pool.query('SELECT sp FROM player_sp WHERE player_id = $1 AND style_id = $2', [playerId, styleId]);
        return result.rows[0] ? result.rows[0].sp : 0;
    } catch (error) {
        console.error('Error getting SP:', error);
        return 0;
    }
}

export async function getAllPlayerSP(playerId) {
    try {
        const result = await pool.query(`
            SELECT s.id, s.name, COALESCE(ps.sp, 0) as sp 
            FROM styles s 
            LEFT JOIN player_sp ps ON s.id = ps.style_id AND ps.player_id = $1
            WHERE ps.sp > 0
            ORDER BY sp DESC
        `, [playerId]);
        return result.rows;
    } catch (error) {
        console.error('Error getting all player SP:', error);
        return [];
    }
}

export async function getTotalSP(playerId) {
    try {
        const result = await pool.query('SELECT SUM(sp) as total FROM player_sp WHERE player_id = $1', [playerId]);
        return result.rows[0]?.total || 0;
    } catch (error) {
        console.error('Error getting total SP:', error);
        return 0;
    }
}

export async function addSP(playerId, styleId, amount, adminId) {
    try {
        const player = await getPlayer(playerId);
        if (!player) return false;
        
        const multiplier = (player.sp_multiplier || 100) / 100;
        const adjustedAmount = Math.round(amount * multiplier);
        
        const currentSP = await getSP(playerId, styleId);
        const newSP = currentSP + adjustedAmount;
        
        if (currentSP === 0) {
            await pool.query('INSERT INTO player_sp (player_id, style_id, sp) VALUES ($1, $2, $3)', [playerId, styleId, newSP]);
        } else {
            await pool.query('UPDATE player_sp SET sp = $1 WHERE player_id = $2 AND style_id = $3', [newSP, playerId, styleId]);
        }
        
        logAdminAction(adminId, 'ADD_SP', `Добавил ${amount} SP (×${player.sp_multiplier}% = ${adjustedAmount}) стиль ${styleId} игроку ${playerId}`);
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
            await pool.query('INSERT INTO player_sp (player_id, style_id, sp) VALUES ($1, $2, $3)', [playerId, styleId, amount]);
        } else {
            await pool.query('UPDATE player_sp SET sp = $1 WHERE player_id = $2 AND style_id = $3', [amount, playerId, styleId]);
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
        const result = await pool.query('SELECT * FROM styles ORDER BY name');
        return result.rows;
    } catch (error) {
        console.error('Error listing styles:', error);
        return [];
    }
}

export async function getStyleByName(name) {
    try {
        const result = await pool.query('SELECT * FROM styles WHERE name = $1', [name]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting style by name:', error);
        return null;
    }
}

export async function getStyleById(styleId) {
    try {
        const result = await pool.query('SELECT * FROM styles WHERE id = $1', [styleId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting style by ID:', error);
        return null;
    }
}

export async function addStyle(name, adminId) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        await pool.query('INSERT INTO styles (name, created_by, created_at) VALUES ($1, $2, $3)', [name, adminId, timestamp]);
        logAdminAction(adminId, 'ADD_STYLE', `Создал стиль: ${name}`);
        return true;
    } catch (error) {
        console.error('Error adding style:', error);
        return false;
    }
}

export async function getStylePlayerCount(styleId) {
    try {
        const result = await pool.query('SELECT COUNT(DISTINCT player_id) as count FROM player_sp WHERE style_id = $1 AND sp > 0', [styleId]);
        return result.rows[0]?.count || 0;
    } catch (error) {
        console.error('Error getting style player count:', error);
        return 0;
    }
}

export async function getPlayerInventory(playerId) {
    try {
        const result = await pool.query('SELECT item_name, qty FROM inventory WHERE player_id = $1 ORDER BY id DESC', [playerId]);
        return result.rows;
    } catch (error) {
        console.error('Error getting inventory:', error);
        return [];
    }
}

export async function giveItem(playerId, itemName, qty, adminId) {
    try {
        const existing = await pool.query('SELECT * FROM inventory WHERE player_id = $1 AND item_name = $2', [playerId, itemName]);
        
        if (existing.rows.length > 0) {
            await pool.query('UPDATE inventory SET qty = qty + $1 WHERE player_id = $2 AND item_name = $3', [qty, playerId, itemName]);
        } else {
            await pool.query('INSERT INTO inventory (player_id, item_name, qty) VALUES ($1, $2, $3)', [playerId, itemName, qty]);
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
        let query = '';
        
        if (sortBy === 'ap') {
            query = 'SELECT id, username, character_name, ap, krw, yen FROM players ORDER BY ap DESC LIMIT $1';
        } else if (sortBy === 'krw') {
            query = 'SELECT id, username, character_name, ap, krw, yen FROM players WHERE krw > 0 ORDER BY krw DESC LIMIT $1';
        } else if (sortBy === 'yen') {
            query = 'SELECT id, username, character_name, ap, krw, yen FROM players WHERE yen > 0 ORDER BY yen DESC LIMIT $1';
        } else if (sortBy === 'sp') {
            query = `
                SELECT p.id, p.username, p.character_name, p.ap, p.krw, p.yen, COALESCE(SUM(ps.sp), 0) as total_sp 
                FROM players p 
                LEFT JOIN player_sp ps ON p.id = ps.player_id 
                GROUP BY p.id 
                ORDER BY total_sp DESC 
                LIMIT $1
            `;
        }
        
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

export async function useItem(playerId, itemName, qty) {
    try {
        const result = await pool.query('SELECT * FROM inventory WHERE player_id = $1 AND item_name = $2', [playerId, itemName]);
        if (result.rows.length === 0) return { success: false, reason: 'Предмет не в инвентаре' };
        
        const inv = result.rows[0];
        if (inv.qty < qty) return { success: false, reason: 'Недостаточно предметов' };
        
        const newQty = inv.qty - qty;
        if (newQty === 0) {
            await pool.query('DELETE FROM inventory WHERE player_id = $1 AND item_name = $2', [playerId, itemName]);
        } else {
            await pool.query('UPDATE inventory SET qty = $1 WHERE player_id = $2 AND item_name = $3', [newQty, playerId, itemName]);
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
        
        const currentAmount = Number(player[currency]) || 0;
        const newAmount = currentAmount + Number(amount);
        if (currency === 'krw') {
            await pool.query('UPDATE players SET krw = $1 WHERE id = $2', [newAmount, playerId]);
        } else {
            await pool.query('UPDATE players SET yen = $1 WHERE id = $2', [newAmount, playerId]);
        }
        
        logAdminAction(adminId, 'ADD_CURRENCY', `Добавил ${amount} ${currency.toUpperCase()} игроку ${playerId}`);
        return newAmount;
    } catch (error) {
        console.error('Error adding currency:', error);
        return false;
    }
}

export async function setCurrency(playerId, currency, amount, adminId) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const numAmount = Number(amount);
        if (currency === 'krw') {
            await pool.query('UPDATE players SET krw = $1 WHERE id = $2', [numAmount, playerId]);
        } else {
            await pool.query('UPDATE players SET yen = $1 WHERE id = $2', [numAmount, playerId]);
        }
        
        logAdminAction(adminId, 'SET_CURRENCY', `Установил ${currency.toUpperCase()} на ${numAmount} для игрока ${playerId}`);
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
        
        const fromBalance = Number(from[currency]) || 0;
        const numAmount = Number(amount);
        if (fromBalance < numAmount) return { success: false, reason: 'Недостаточно средств' };
        
        const tax = Math.ceil(numAmount * 0.02);
        const received = numAmount - tax;
        
        if (currency === 'krw') {
            await pool.query('UPDATE players SET krw = krw - $1 WHERE id = $2', [numAmount, fromId]);
            await pool.query('UPDATE players SET krw = krw + $1 WHERE id = $2', [received, toId]);
        } else {
            await pool.query('UPDATE players SET yen = yen - $1 WHERE id = $2', [numAmount, fromId]);
            await pool.query('UPDATE players SET yen = yen + $1 WHERE id = $2', [received, toId]);
        }
        
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
        
        await pool.query('DELETE FROM player_sp WHERE player_id = $1', [playerId]);
        await pool.query('DELETE FROM inventory WHERE player_id = $1', [playerId]);
        await pool.query('DELETE FROM players WHERE id = $1', [playerId]);
        
        logAdminAction(adminId, 'DELETE_PLAYER', `Удалил игрока ${playerId} (${player.character_name})`);
        return true;
    } catch (error) {
        console.error('Error deleting player:', error);
        return false;
    }
}

export async function deleteStyle(styleId, adminId) {
    try {
        const result = await pool.query('SELECT * FROM styles WHERE id = $1', [styleId]);
        if (result.rows.length === 0) return false;
        
        const style = result.rows[0];
        await pool.query('DELETE FROM player_sp WHERE style_id = $1', [styleId]);
        await pool.query('DELETE FROM styles WHERE id = $1', [styleId]);
        
        logAdminAction(adminId, 'DELETE_STYLE', `Удалил стиль: ${style.name}`);
        return true;
    } catch (error) {
        console.error('Error deleting style:', error);
        return false;
    }
}

export async function setAPMultiplier(playerId, multiplier, adminId) {
    try {
        const validMultiplier = Math.max(50, Math.min(500, multiplier));
        await pool.query('UPDATE players SET ap_multiplier = $1 WHERE id = $2', [validMultiplier, playerId]);
        logAdminAction(adminId, 'SET_AP_MULTIPLIER', `Установил множитель AP ${validMultiplier}% для игрока ${playerId}`);
        return validMultiplier;
    } catch (error) {
        console.error('Error setting AP multiplier:', error);
        return false;
    }
}

export async function setSPMultiplier(playerId, multiplier, adminId) {
    try {
        const validMultiplier = Math.max(50, Math.min(500, multiplier));
        await pool.query('UPDATE players SET sp_multiplier = $1 WHERE id = $2', [validMultiplier, playerId]);
        logAdminAction(adminId, 'SET_SP_MULTIPLIER', `Установил множитель SP ${validMultiplier}% для игрока ${playerId}`);
        return validMultiplier;
    } catch (error) {
        console.error('Error setting SP multiplier:', error);
        return false;
    }
}

export async function giveStyle(playerId, styleName, initialSp = 0, adminId) {
    try {
        const style = await getStyleByName(styleName);
        if (!style) return false;
        
        const existing = await pool.query('SELECT * FROM player_sp WHERE player_id = $1 AND style_id = $2', [playerId, style.id]);
        if (existing.rows.length === 0) {
            await pool.query('INSERT INTO player_sp (player_id, style_id, sp) VALUES ($1, $2, $3)', [playerId, style.id, initialSp]);
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
            await pool.query('UPDATE players SET yen = yen - $1, krw = krw + $2 WHERE id = $3', [numAmount, krwReceived, playerId]);
            
            return { success: true, received: krwReceived };
        } else if (currency === 'krw') {
            // Обменять воны на йены
            const playerKrw = Number(player.krw) || 0;
            if (playerKrw < numAmount) return { success: false, reason: `Недостаточно вон! У вас только ${playerKrw.toLocaleString('ru-RU')} ₩` };
            
            const yenReceived = Math.floor(numAmount / EXCHANGE_RATE);
            if (yenReceived === 0) return { success: false, reason: `Слишком мало вон! Минимум ${Math.ceil(EXCHANGE_RATE)} ₩` };
            
            await pool.query('UPDATE players SET krw = krw - $1, yen = yen + $2 WHERE id = $3', [numAmount, yenReceived, playerId]);
            
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
        const result = await pool.query('SELECT * FROM admin_actions ORDER BY timestamp DESC LIMIT $1', [limit]);
        return result.rows;
    } catch (error) {
        console.error('Error getting admin actions:', error);
        return [];
    }
}
