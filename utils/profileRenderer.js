import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ASSETS_DIR = join(__dirname, '..', 'assets');

// ── Font Registration ────────────────────────────────────────────────
const FONT_FAMILY = 'HUD';
let fontRegistered = false;

function ensureFont() {
    if (fontRegistered) return;
    const candidates = [
        join(ASSETS_DIR, 'fonts', 'Orbitron-Bold.ttf'),
        join(ASSETS_DIR, 'fonts', 'Michroma-Regular.ttf'),
        join(ASSETS_DIR, 'fonts', 'Orbitron-Regular.ttf'),
    ];
    for (const fontPath of candidates) {
        if (existsSync(fontPath)) {
            GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
            fontRegistered = true;
            return;
        }
    }
    fontRegistered = true;
}

function fontStr(size, weight = 'bold') {
    ensureFont();
    return `${weight} ${size}px "${FONT_FAMILY}", sans-serif`;
}

// ── Helper: draw text with black outer glow ──────────────────────────
function drawGlowText(ctx, text, x, y, {
    font = fontStr(20),
    color = '#FFFFFF',
    align = 'center',
    baseline = 'middle',
    shadowBlur = 6,
    shadowColor = 'rgba(0,0,0,0.95)',
    maxWidth = undefined,
} = {}) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    if (maxWidth) {
        ctx.fillText(text, x, y, maxWidth);
    } else {
        ctx.fillText(text, x, y);
    }
    ctx.restore();
}

// ── Helper: draw a dark overlay to cover template placeholder text ───
function coverZone(ctx, x, y, w, h, opacity = 0.8) {
    ctx.save();
    ctx.fillStyle = `rgba(10, 0, 18, ${opacity})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}

// ── Helper: fetch image from URL with timeout ────────────────────────
async function fetchImage(url, timeoutMs = 5000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        const buffer = Buffer.from(await res.arrayBuffer());
        return await loadImage(buffer);
    } catch {
        return null;
    }
}

// ── Helper: generate placeholder avatar ──────────────────────────────
function createPlaceholderAvatar(size = 512) {
    const c = createCanvas(size, size);
    const cx = c.getContext('2d');
    const gradient = cx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#2C003E');
    gradient.addColorStop(1, '#5B0080');
    cx.fillStyle = gradient;
    cx.fillRect(0, 0, size, size);
    cx.fillStyle = '#FFFFFF';
    cx.font = `bold ${Math.floor(size * 0.35)}px sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('?', size / 2, size / 2);
    return c;
}

// ── Segmented progress bar (AP-style blocks) ─────────────────────────
function drawSegmentedBar(ctx, x, y, w, h, ratio, totalSegments = 12) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const gap = 4;
    const segW = (w - gap * (totalSegments - 1)) / totalSegments;
    const filledCount = Math.round(clamped * totalSegments);

    for (let i = 0; i < totalSegments; i++) {
        const sx = x + i * (segW + gap);
        if (i < filledCount) {
            ctx.save();
            ctx.shadowColor = '#B026FF';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#B026FF';
            ctx.fillRect(sx, y, segW, h);
            ctx.restore();
            // brighter inner
            ctx.fillStyle = '#D070FF';
            ctx.fillRect(sx + 1, y + 1, segW - 2, h - 2);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(sx, y, segW, h);
        }
    }
}

// ── Smooth XP bar ────────────────────────────────────────────────────
function drawXPBar(ctx, x, y, w, h, ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));

    // Background track
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    // Filled portion
    if (clamped > 0) {
        const fillW = Math.max(h, w * clamped);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#B026FF';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#B026FF';
        roundRect(ctx, x, y, fillW, h, h / 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// ══════════════════════════════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════════════════════════════
/**
 * @param {object} data
 * @param {string}  data.characterName
 * @param {string|null} data.avatarUrl
 * @param {number}  data.level
 * @param {number}  data.xp
 * @param {number}  data.xpToNextLevel
 * @param {Array<{name:string, sp:number}>} data.styles   – up to 3
 * @param {string|null} data.attributeName
 * @param {number}  data.attributeValue
 * @param {string|null} data.orgName
 * @param {string|null} data.orgRank
 * @param {string|null} data.playerId
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generateProfileImage(data) {
    ensureFont();

    // ── 1. Load background & create canvas at its native size ────────
    const bgPath = join(ASSETS_DIR, 'beb.jpg');
    let bg = null;
    let W = 1196;
    let H = 761;
    if (existsSync(bgPath)) {
        bg = await loadImage(bgPath);
        W = bg.width;
        H = bg.height;
    }

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    if (bg) {
        ctx.drawImage(bg, 0, 0, W, H);
    } else {
        // Fallback gradient
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#0D001A');
        grad.addColorStop(0.5, '#1A003D');
        grad.addColorStop(1, '#0D001A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#B026FF';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#B026FF';
        ctx.shadowBlur = 15;
        ctx.strokeRect(30, 20, W - 60, H - 40);
        ctx.shadowBlur = 0;
    }

    // ══════════════════════════════════════════════════════════════════
    // Layout coordinates for 1196×761 template
    // ══════════════════════════════════════════════════════════════════
    // All positions matched to beb.jpg visual zones.

    // ── 2. Avatar — rectangular clip inside the template frame ───────
    const avX = 72, avY = 82, avW = 370, avH = 390;

    let avatarImg = null;
    if (data.avatarUrl) {
        avatarImg = await fetchImage(data.avatarUrl);
    }
    if (!avatarImg) {
        avatarImg = createPlaceholderAvatar(512);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(avX, avY, avW, avH);
    ctx.clip();
    const imgW = avatarImg.width || avW;
    const imgH = avatarImg.height || avH;
    const scale = Math.max(avW / imgW, avH / imgH);
    const dW = imgW * scale;
    const dH = imgH * scale;
    const dX = avX + (avW - dW) / 2;
    const dY = avY + (avH - dH) / 2;
    ctx.drawImage(avatarImg, dX, dY, dW, dH);
    ctx.restore();

    // ── 3. Character name — covers "АВАТАРКА" label on template ─────
    coverZone(ctx, 60, 38, 400, 38);
    drawGlowText(ctx, (data.characterName || 'Unknown').toUpperCase(), 80, 57, {
        font: fontStr(26),
        align: 'left',
        shadowBlur: 8,
    });

    // ── 4. СТИЛИ section — top-right ─────────────────────────────────
    // Cover the "СТИЛИ (1-3)" and "SP (1-3)" template labels
    coverZone(ctx, 500, 38, 650, 40);
    drawGlowText(ctx, 'СТИЛИ:', 520, 58, {
        font: fontStr(28),
        align: 'left',
        shadowBlur: 8,
    });

    const styles = (data.styles || []).slice(0, 3);
    const styleStartY = 100;
    const styleRowH = 45;

    for (let i = 0; i < 3; i++) {
        const rowY = styleStartY + i * styleRowH;
        coverZone(ctx, 500, rowY - 16, 650, 38);

        if (i < styles.length) {
            drawGlowText(ctx, (styles[i].name || '—').toUpperCase(), 530, rowY, {
                font: fontStr(20),
                align: 'left',
                maxWidth: 480,
            });
            drawGlowText(ctx, `${styles[i].sp || 0}`, 1100, rowY, {
                font: fontStr(24),
                align: 'right',
            });
        } else {
            drawGlowText(ctx, '—', 530, rowY, {
                font: fontStr(20),
                align: 'left',
                color: 'rgba(255,255,255,0.25)',
            });
            drawGlowText(ctx, '0', 1100, rowY, {
                font: fontStr(24),
                align: 'right',
                color: 'rgba(255,255,255,0.25)',
            });
        }
    }

    // ── 5. AP | Attribute — middle-right ─────────────────────────────
    const attrName = data.attributeName || null;
    const attrVal = data.attributeValue ?? 0;
    const apLabel = attrName ? `AP | ${attrName}` : `AP`;

    coverZone(ctx, 500, 280, 650, 55);
    drawGlowText(ctx, apLabel, 530, 310, {
        font: fontStr(32),
        align: 'left',
        shadowBlur: 8,
    });

    // Segmented AP progress bar
    const apBarY = 360;
    coverZone(ctx, 500, apBarY - 8, 650, 36);
    const apRatio = Math.min(1, attrVal / 1000);
    drawSegmentedBar(ctx, 530, apBarY, 560, 20, apRatio, 14);

    // ── 6. LVL — bottom-left ─────────────────────────────────────────
    const level = data.level || 0;
    const xp = data.xp || 0;
    const xpMax = data.xpToNextLevel || 100;
    const xpRatio = xpMax > 0 ? xp / xpMax : 0;

    coverZone(ctx, 60, 520, 410, 50);
    drawGlowText(ctx, `LVL: ${level}`, 265, 545, {
        font: fontStr(30),
        shadowBlur: 8,
    });

    // XP bar under level
    drawXPBar(ctx, 80, 580, 360, 14, xpRatio);
    drawGlowText(ctx, `${xp} / ${xpMax} XP`, 260, 587, {
        font: fontStr(10),
        shadowBlur: 4,
    });

    // ── 7. Organization & Rank — bottom-right ────────────────────────
    const orgText = data.orgName || 'Нет организации';
    const rankText = data.orgRank || 'Нет ранга';

    coverZone(ctx, 500, 450, 650, 160);

    drawGlowText(ctx, `ОРГАНИЗАЦИЯ: ${orgText.toUpperCase()}`, 530, 490, {
        font: fontStr(20),
        align: 'left',
        shadowBlur: 6,
        maxWidth: 580,
    });
    drawGlowText(ctx, `РАНГ: ${rankText.toUpperCase()}`, 530, 540, {
        font: fontStr(20),
        align: 'left',
        shadowBlur: 6,
        maxWidth: 580,
    });

    // ── 8. Player ID — bottom-right corner ──────────────────────────
    if (data.playerId) {
        drawGlowText(ctx, data.playerId, 1140, 720, {
            font: fontStr(12),
            align: 'right',
            color: 'rgba(255,255,255,0.5)',
            shadowBlur: 3,
        });
    }

    // ── Encode to PNG buffer ─────────────────────────────────────────
    return canvas.toBuffer('image/png');
}
