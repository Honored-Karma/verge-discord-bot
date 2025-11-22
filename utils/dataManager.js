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

export function createPlayer(playerId, username) {
    try {
        const stmt = db.prepare('INSERT INTO players (id, username, balance, ap, last_train_timestamp, last_socialrp_timestamp, unlocked_avatar) VALUES (?, ?, 0, 0, 0, 0, 0)');
        stmt.run(playerId, username);
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
        
        const newAP = player.ap + amount;
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
        
        logAdminAction(adminId, 'SET_AP', `Set AP to ${amount} for player ${playerId}`);
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
        
        logAdminAction(adminId, 'ADD_SP', `Added ${amount} SP (style ${styleId}) to player ${playerId}`);
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
        
        logAdminAction(adminId, 'SET_SP', `Set SP to ${amount} (style ${styleId}) for player ${playerId}`);
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

export function addStyle(name, description, adminId) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('INSERT INTO styles (name, description, created_by, created_at) VALUES (?, ?, ?, ?)');
        stmt.run(name, description, adminId, timestamp);
        
        logAdminAction(adminId, 'ADD_STYLE', `Created style: ${name}`);
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
            SELECT i.id, i.name, i.type, i.effect, inv.qty 
            FROM inventory inv 
            JOIN items i ON inv.item_id = i.id 
            WHERE inv.player_id = ?
            ORDER BY inv.id DESC
        `);
        return stmt.all(playerId);
    } catch (error) {
        console.error('Error getting inventory:', error);
        return [];
    }
}

export function giveItem(playerId, itemId, qty, adminId) {
    try {
        const checkStmt = db.prepare('SELECT * FROM inventory WHERE player_id = ? AND item_id = ?');
        const existing = checkStmt.get(playerId, itemId);
        
        if (existing) {
            const updateStmt = db.prepare('UPDATE inventory SET qty = qty + ? WHERE player_id = ? AND item_id = ?');
            updateStmt.run(qty, playerId, itemId);
        } else {
            const insertStmt = db.prepare('INSERT INTO inventory (player_id, item_id, qty) VALUES (?, ?, ?)');
            insertStmt.run(playerId, itemId, qty);
        }
        
        logAdminAction(adminId, 'GIVE_ITEM', `Gave ${qty}x ${itemId} to player ${playerId}`);
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
            stmt = db.prepare('SELECT id, username, ap, balance FROM players ORDER BY ap DESC LIMIT ?');
        } else if (sortBy === 'balance') {
            stmt = db.prepare('SELECT id, username, ap, balance FROM players ORDER BY balance DESC LIMIT ?');
        } else if (sortBy === 'sp') {
            stmt = db.prepare(`
                SELECT p.id, p.username, p.ap, p.balance, COALESCE(SUM(ps.sp), 0) as total_sp 
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

export function getItem(itemId) {
    try {
        const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
        return stmt.get(itemId);
    } catch (error) {
        console.error('Error getting item:', error);
        return null;
    }
}
