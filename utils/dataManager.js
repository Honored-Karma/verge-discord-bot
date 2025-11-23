import db from './db.js';
import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logPath = join(__dirname, '..', 'logs', 'actions.log');

function logAdminAction(adminId, action, details) {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
        const stmt = db.prepare('INSERT INTO admin_actions (admin_id, action, details, timestamp) VALUES (?, ?, ?, ?)');
        stmt.run(adminId, action, details, timestamp);
        
        const logEntry = `[${new Date().toISOString()}] Admin ${adminId}: ${action} - ${details}\n`;
        appendFileSync(logPath, logEntry);
    } catch (error) {
        console.error('Error logging admin action:', error);
    }
}

export function getPlayer(playerId) {
    try {
        const stmt = db.prepare('SELECT * FROM players WHERE id = ?');
        return stmt.get(playerId);
    } catch (error) {
        console.error('Error getting player:', error);
        return null;
    }
}

export function createPlayer(playerId, username, characterName, characterAvatar = null) {
    try {
        const stmt = db.prepare('INSERT INTO players (id, username, character_name, character_avatar, krw, yen, ap, last_train_timestamp, last_socialrp_timestamp, unlocked_avatar, ap_multiplier) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 100.0)');
        stmt.run(playerId, username, characterName, characterAvatar);
        return true;
    } catch (error) {
        console.error('Error creating player:', error);
        return false;
    }
}

export function addAP(playerId, amount, actionType = 'train') {
    try {
        const player = getPlayer(playerId);
        if (!player) return false;
        
        // Apply AP multiplier (multiplier is stored as percentage, e.g., 150 = 150%)
        const multiplier = (player.ap_multiplier || 100) / 100;
        const adjustedAmount = Math.round(amount * multiplier);
        const newAP = player.ap + adjustedAmount;
        const timestamp = Math.floor(Date.now() / 1000);
        
        let updateStmt;
        if (actionType === 'train') {
            updateStmt = db.prepare('UPDATE players SET ap = ?, last_train_timestamp = ? WHERE id = ?');
            updateStmt.run(newAP, timestamp, playerId);
        } else if (actionType === 'socialrp') {
            updateStmt = db.prepare('UPDATE players SET ap = ?, last_socialrp_timestamp = ? WHERE id = ?');
            updateStmt.run(newAP, timestamp, playerId);
        } else {
            updateStmt = db.prepare('UPDATE players SET ap = ? WHERE id = ?');
            updateStmt.run(newAP, playerId);
        }
        
        if (newAP >= 1000 && player.ap < 1000) {
            const avatarStmt = db.prepare('UPDATE players SET unlocked_avatar = 1 WHERE id = ?');
            avatarStmt.run(playerId);
        }
        
        // Add "+Техника" items for every 100 AP milestone
        const oldMilestones = Math.floor(player.ap / 100);
        const newMilestones = Math.floor(newAP / 100);
        const newTechniques = newMilestones - oldMilestones;
        
        if (newTechniques > 0) {
            for (let i = 0; i < newTechniques; i++) {
                giveItem(playerId, '+Техника', 1, 'system');
            }
        }
        
        return newAP;
    } catch (error) {
        console.error('Error adding AP:', error);
        return false;
    }
}

export function setAP(playerId, amount, adminId) {
    try {
        const stmt = db.prepare('UPDATE players SET ap = ? WHERE id = ?');
        stmt.run(amount, playerId);
        
        if (amount >= 1000) {
            const avatarStmt = db.prepare('UPDATE players SET unlocked_avatar = 1 WHERE id = ?');
            avatarStmt.run(playerId);
        }
        
        logAdminAction(adminId, 'SET_AP', `Установил AP на ${amount} для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting AP:', error);
        return false;
    }
}

export function getSP(playerId, styleId) {
    try {
        const stmt = db.prepare('SELECT sp FROM player_sp WHERE player_id = ? AND style_id = ?');
        const result = stmt.get(playerId, styleId);
        return result ? result.sp : 0;
    } catch (error) {
        console.error('Error getting SP:', error);
        return 0;
    }
}

export function getAllPlayerSP(playerId) {
    try {
        const stmt = db.prepare(`
            SELECT s.id, s.name, COALESCE(ps.sp, 0) as sp 
            FROM styles s 
            LEFT JOIN player_sp ps ON s.id = ps.style_id AND ps.player_id = ?
            WHERE ps.sp > 0
            ORDER BY sp DESC
        `);
        return stmt.all(playerId);
    } catch (error) {
        console.error('Error getting all player SP:', error);
        return [];
    }
}

export function getTotalSP(playerId) {
    try {
        const stmt = db.prepare('SELECT SUM(sp) as total FROM player_sp WHERE player_id = ?');
        const result = stmt.get(playerId);
        return result?.total || 0;
    } catch (error) {
        console.error('Error getting total SP:', error);
        return 0;
    }
}

export function addSP(playerId, styleId, amount, adminId) {
    try {
        const currentSP = getSP(playerId, styleId);
        const newSP = currentSP + amount;
        
        if (currentSP === 0) {
            const insertStmt = db.prepare('INSERT INTO player_sp (player_id, style_id, sp) VALUES (?, ?, ?)');
            insertStmt.run(playerId, styleId, newSP);
        } else {
            const updateStmt = db.prepare('UPDATE player_sp SET sp = ? WHERE player_id = ? AND style_id = ?');
            updateStmt.run(newSP, playerId, styleId);
        }
        
        logAdminAction(adminId, 'ADD_SP', `Добавил ${amount} SP (стиль ${styleId}) игроку ${playerId}`);
        return newSP;
    } catch (error) {
        console.error('Error adding SP:', error);
        return false;
    }
}

export function setSP(playerId, styleId, amount, adminId) {
    try {
        const currentSP = getSP(playerId, styleId);
        
        if (currentSP === 0) {
            const insertStmt = db.prepare('INSERT INTO player_sp (player_id, style_id, sp) VALUES (?, ?, ?)');
            insertStmt.run(playerId, styleId, amount);
        } else {
            const updateStmt = db.prepare('UPDATE player_sp SET sp = ? WHERE player_id = ? AND style_id = ?');
            updateStmt.run(amount, playerId, styleId);
        }
        
        logAdminAction(adminId, 'SET_SP', `Установил SP на ${amount} (стиль ${styleId}) для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting SP:', error);
        return false;
    }
}

export function listStyles() {
    try {
        const stmt = db.prepare('SELECT * FROM styles ORDER BY name');
        return stmt.all();
    } catch (error) {
        console.error('Error listing styles:', error);
        return [];
    }
}

export function getStyleByName(name) {
    try {
        const stmt = db.prepare('SELECT * FROM styles WHERE name = ?');
        return stmt.get(name);
    } catch (error) {
        console.error('Error getting style by name:', error);
        return null;
    }
}

export function addStyle(name, adminId) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('INSERT INTO styles (name, created_by, created_at) VALUES (?, ?, ?)');
        stmt.run(name, adminId, timestamp);
        
        logAdminAction(adminId, 'ADD_STYLE', `Создал стиль: ${name}`);
        return true;
    } catch (error) {
        console.error('Error adding style:', error);
        return false;
    }
}

export function getStylePlayerCount(styleId) {
    try {
        const stmt = db.prepare('SELECT COUNT(DISTINCT player_id) as count FROM player_sp WHERE style_id = ? AND sp > 0');
        const result = stmt.get(styleId);
        return result?.count || 0;
    } catch (error) {
        console.error('Error getting style player count:', error);
        return 0;
    }
}

export function getPlayerInventory(playerId) {
    try {
        const stmt = db.prepare(`
            SELECT item_name, qty 
            FROM inventory 
            WHERE player_id = ?
            ORDER BY id DESC
        `);
        return stmt.all(playerId);
    } catch (error) {
        console.error('Error getting inventory:', error);
        return [];
    }
}

export function giveItem(playerId, itemName, qty, adminId) {
    try {
        const checkStmt = db.prepare('SELECT * FROM inventory WHERE player_id = ? AND item_name = ?');
        const existing = checkStmt.get(playerId, itemName);
        
        if (existing) {
            const updateStmt = db.prepare('UPDATE inventory SET qty = qty + ? WHERE player_id = ? AND item_name = ?');
            updateStmt.run(qty, playerId, itemName);
        } else {
            const insertStmt = db.prepare('INSERT INTO inventory (player_id, item_name, qty) VALUES (?, ?, ?)');
            insertStmt.run(playerId, itemName, qty);
        }
        
        logAdminAction(adminId, 'GIVE_ITEM', `Выдал ${qty}x ${itemName} игроку ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error giving item:', error);
        return false;
    }
}

export function getLeaderboard(sortBy = 'ap', limit = 10) {
    try {
        let stmt;
        if (sortBy === 'ap') {
            stmt = db.prepare('SELECT id, username, character_name, ap, krw, yen FROM players ORDER BY ap DESC LIMIT ?');
        } else if (sortBy === 'krw') {
            stmt = db.prepare('SELECT id, username, character_name, ap, krw, yen FROM players WHERE krw > 0 ORDER BY krw DESC LIMIT ?');
        } else if (sortBy === 'yen') {
            stmt = db.prepare('SELECT id, username, character_name, ap, krw, yen FROM players WHERE yen > 0 ORDER BY yen DESC LIMIT ?');
        } else if (sortBy === 'sp') {
            stmt = db.prepare(`
                SELECT p.id, p.username, p.character_name, p.ap, p.krw, p.yen, COALESCE(SUM(ps.sp), 0) as total_sp 
                FROM players p 
                LEFT JOIN player_sp ps ON p.id = ps.player_id 
                GROUP BY p.id 
                ORDER BY total_sp DESC 
                LIMIT ?
            `);
        }
        return stmt.all(limit);
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

export function useItem(playerId, itemName, qty) {
    try {
        const inv = db.prepare('SELECT * FROM inventory WHERE player_id = ? AND item_name = ?').get(playerId, itemName);
        if (!inv) return { success: false, reason: 'Предмет не в инвентаре' };
        if (inv.qty < qty) return { success: false, reason: 'Недостаточно предметов' };
        
        const newQty = inv.qty - qty;
        if (newQty === 0) {
            db.prepare('DELETE FROM inventory WHERE player_id = ? AND item_name = ?').run(playerId, itemName);
        } else {
            db.prepare('UPDATE inventory SET qty = ? WHERE player_id = ? AND item_name = ?').run(newQty, playerId, itemName);
        }
        
        return { success: true, itemName };
    } catch (error) {
        console.error('Error using item:', error);
        return { success: false, reason: 'Ошибка использования предмета' };
    }
}

export function addCurrency(playerId, currency, amount, adminId) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const player = getPlayer(playerId);
        if (!player) return false;
        
        const newAmount = player[currency] + amount;
        const stmt = db.prepare(`UPDATE players SET ${currency} = ? WHERE id = ?`);
        stmt.run(newAmount, playerId);
        
        logAdminAction(adminId, 'ADD_CURRENCY', `Добавил ${amount} ${currency.toUpperCase()} игроку ${playerId}`);
        return newAmount;
    } catch (error) {
        console.error('Error adding currency:', error);
        return false;
    }
}

export function setCurrency(playerId, currency, amount, adminId) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return false;
        
        const stmt = db.prepare(`UPDATE players SET ${currency} = ? WHERE id = ?`);
        stmt.run(amount, playerId);
        
        logAdminAction(adminId, 'SET_CURRENCY', `Установил ${currency.toUpperCase()} на ${amount} для игрока ${playerId}`);
        return true;
    } catch (error) {
        console.error('Error setting currency:', error);
        return false;
    }
}

export function transferCurrency(fromId, toId, currency, amount) {
    try {
        if (currency !== 'krw' && currency !== 'yen') return { success: false, reason: 'Неверная валюта' };
        
        const from = getPlayer(fromId);
        const to = getPlayer(toId);
        
        if (!from || !to) return { success: false, reason: 'Игрок не найден' };
        if (from[currency] < amount) return { success: false, reason: 'Недостаточно средств' };
        
        const tax = Math.ceil(amount * 0.02);
        const received = amount - tax;
        
        const updateFrom = db.prepare(`UPDATE players SET ${currency} = ${currency} - ? WHERE id = ?`);
        const updateTo = db.prepare(`UPDATE players SET ${currency} = ${currency} + ? WHERE id = ?`);
        
        updateFrom.run(amount, fromId);
        updateTo.run(received, toId);
        
        return { success: true, tax, received };
    } catch (error) {
        console.error('Error transferring currency:', error);
        return { success: false, reason: 'Ошибка перевода' };
    }
}

export function deletePlayer(playerId, adminId) {
    try {
        const player = getPlayer(playerId);
        if (!player) return false;
        
        // Удаляем все данные игрока
        db.prepare('DELETE FROM player_sp WHERE player_id = ?').run(playerId);
        db.prepare('DELETE FROM inventory WHERE player_id = ?').run(playerId);
        db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
        
        logAdminAction(adminId, 'DELETE_PLAYER', `Удалил игрока ${playerId} (${player.character_name})`);
        return true;
    } catch (error) {
        console.error('Error deleting player:', error);
        return false;
    }
}

export function deleteStyle(styleId, adminId) {
    try {
        const style = db.prepare('SELECT * FROM styles WHERE id = ?').get(styleId);
        if (!style) return false;
        
        // Удаляем стиль и все связанные данные
        db.prepare('DELETE FROM player_sp WHERE style_id = ?').run(styleId);
        db.prepare('DELETE FROM styles WHERE id = ?').run(styleId);
        
        logAdminAction(adminId, 'DELETE_STYLE', `Удалил стиль: ${style.name}`);
        return true;
    } catch (error) {
        console.error('Error deleting style:', error);
        return false;
    }
}

export function setAPMultiplier(playerId, multiplier, adminId) {
    try {
        // Ensure multiplier is within valid range (0.5 = 50%, 5 = 500%)
        const validMultiplier = Math.max(0.5, Math.min(5, multiplier / 100)) * 100;
        
        const stmt = db.prepare('UPDATE players SET ap_multiplier = ? WHERE id = ?');
        stmt.run(validMultiplier, playerId);
        
        logAdminAction(adminId, 'SET_AP_MULTIPLIER', `Установил множитель AP ${validMultiplier}% для игрока ${playerId}`);
        return validMultiplier;
    } catch (error) {
        console.error('Error setting AP multiplier:', error);
        return false;
    }
}
