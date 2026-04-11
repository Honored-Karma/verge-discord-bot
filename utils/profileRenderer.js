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

// ── Canvas Dimensions (match beb.jpg) ────────────────────────────────
const W = 1024;
const H = 580;

// ══════════════════════════════════════════════════════════════════════
// Layout zones — pixel positions matched to beb.jpg template
// ══════════════════════════════════════════════════════════════════════
const LAYOUT = {
    // Avatar — rectangular frame on the left side of the template
    avatar: { x: 90, y: 90, w: 280, h: 280 },

    // Character name — centered above avatar frame
    name: { x: 230, y: 55 },

    // XP progress bar — bottom-left, the horizontal track on the template
    xpBar: { x: 78, y: 435, w: 365, h: 16 },
    // Level text — just above the XP bar
    level: { x: 260, y: 418 },

    // Styles grid (top-right): 3 rows for style names
    // Each row has a style name on the left and SP value on the right
    stylesHeader: { x: 490, y: 50, w: 480, h: 28 },    // "СТИЛИ" / "SP" header zone
    styleRows: [
        { nameX: 500, spX: 940, y: 92 },
        { nameX: 500, spX: 940, y: 130 },
        { nameX: 500, spX: 940, y: 168 },
    ],

    // AP / Attribute — middle-right section
    attrZone: { x: 480, y: 210, w: 500, h: 100 },
    attrLabel: { x: 680, y: 240 },
    attrValue: { x: 680, y: 280 },

    // Organization & Rank — bottom-right section
    orgZone: { x: 510, y: 370, w: 470, h: 110 },
    orgName: { x: 730, y: 410 },
    orgRank: { x: 730, y: 450 },
};

// ── Helper: draw text with black outer glow ──────────────────────────
function drawGlowText(ctx, text, x, y, {
    font = fontStr(20),
    color = '#FFFFFF',
    align = 'center',
    baseline = 'middle',
    shadowBlur = 5,
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
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (maxWidth) {
        ctx.fillText(text, x, y, maxWidth);
    } else {
        ctx.fillText(text, x, y);
    }
    ctx.restore();
}

// ── Helper: draw a dark overlay rectangle to cover template text ─────
function coverZone(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(12, 0, 20, 0.75)';
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
function createPlaceholderAvatar(size = 256) {
    const c = createCanvas(size, size);
    const cx = c.getContext('2d');
    const gradient = cx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#2C003E');
    gradient.addColorStop(1, '#5B0080');
    cx.fillStyle = gradient;
    cx.fillRect(0, 0, size, size);
    cx.fillStyle = '#FFFFFF';
    cx.font = `bold ${Math.floor(size * 0.4)}px sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('?', size / 2, size / 2);
    return c;
}

// ── Neon XP Progress Bar ─────────────────────────────────────────────
function drawXPBar(ctx, x, y, w, h, ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));

    // Background track
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    // Filled portion with neon purple glow
    if (clamped > 0) {
        const fillW = Math.max(h, w * clamped);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#B026FF';
        ctx.shadowBlur = 12;
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
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generateProfileImage(data) {
    ensureFont();

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── 1. Base layer ────────────────────────────────────────────────
    const bgPath = join(ASSETS_DIR, 'beb.jpg');
    if (existsSync(bgPath)) {
        const bg = await loadImage(bgPath);
        ctx.drawImage(bg, 0, 0, W, H);
    } else {
        // Fallback: procedural dark-purple HUD gradient
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

    // ── 2. Avatar — rectangular clip inside the frame ────────────────
    const av = LAYOUT.avatar;
    let avatarImg = null;
    if (data.avatarUrl) {
        avatarImg = await fetchImage(data.avatarUrl);
    }
    if (!avatarImg) {
        avatarImg = createPlaceholderAvatar(512);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(av.x, av.y, av.w, av.h);
    ctx.clip();
    // Draw avatar covering the frame area (cover-fit)
    const imgW = avatarImg.width || av.w;
    const imgH = avatarImg.height || av.h;
    const scale = Math.max(av.w / imgW, av.h / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = av.x + (av.w - drawW) / 2;
    const drawY = av.y + (av.h - drawH) / 2;
    ctx.drawImage(avatarImg, drawX, drawY, drawW, drawH);
    ctx.restore();

    // ── 3. Character Name — above avatar frame ──────────────────────
    drawGlowText(ctx, data.characterName || 'Unknown', LAYOUT.name.x, LAYOUT.name.y, {
        font: fontStr(22),
        shadowBlur: 8,
    });

    // ── 4. Level & XP Bar ────────────────────────────────────────────
    const level = data.level || 0;
    const xp = data.xp || 0;
    const xpMax = data.xpToNextLevel || 100;
    const xpRatio = xpMax > 0 ? xp / xpMax : 0;

    drawGlowText(ctx, `LVL ${level}`, LAYOUT.level.x, LAYOUT.level.y, {
        font: fontStr(14),
        shadowBlur: 6,
    });

    drawXPBar(ctx, LAYOUT.xpBar.x, LAYOUT.xpBar.y, LAYOUT.xpBar.w, LAYOUT.xpBar.h, xpRatio);

    drawGlowText(ctx, `${xp} / ${xpMax} XP`, LAYOUT.xpBar.x + LAYOUT.xpBar.w / 2, LAYOUT.xpBar.y + LAYOUT.xpBar.h / 2, {
        font: fontStr(10),
        shadowBlur: 4,
    });

    // ── 5. Styles & SP — top-right grid (cover template labels) ─────
    // Cover the "СТИЛИ (1-3)" / "SP (1-3)" header text
    coverZone(ctx, LAYOUT.stylesHeader.x, LAYOUT.stylesHeader.y, LAYOUT.stylesHeader.w, LAYOUT.stylesHeader.h);

    // Header row
    drawGlowText(ctx, 'СТИЛИ', 600, LAYOUT.stylesHeader.y + 14, {
        font: fontStr(14),
        color: '#C8A0FF',
    });
    drawGlowText(ctx, 'SP', 920, LAYOUT.stylesHeader.y + 14, {
        font: fontStr(14),
        color: '#C8A0FF',
    });

    const styles = (data.styles || []).slice(0, 3);
    for (let i = 0; i < 3; i++) {
        const row = LAYOUT.styleRows[i];
        // Cover template decoration for this row
        coverZone(ctx, 490, row.y - 14, 480, 30);

        if (i < styles.length) {
            drawGlowText(ctx, styles[i].name || '—', row.nameX, row.y, {
                font: fontStr(16),
                align: 'left',
                maxWidth: 380,
            });
            drawGlowText(ctx, `${styles[i].sp || 0}`, row.spX, row.y, {
                font: fontStr(16),
                align: 'right',
                color: '#E0C0FF',
            });
        } else {
            drawGlowText(ctx, '—', row.nameX, row.y, {
                font: fontStr(16),
                align: 'left',
                color: 'rgba(255,255,255,0.3)',
            });
            drawGlowText(ctx, '0', row.spX, row.y, {
                font: fontStr(16),
                align: 'right',
                color: 'rgba(255,255,255,0.3)',
            });
        }
    }

    // ── 6. AP / Attribute — middle-right section ─────────────────────
    coverZone(ctx, LAYOUT.attrZone.x, LAYOUT.attrZone.y, LAYOUT.attrZone.w, LAYOUT.attrZone.h);

    const attrName = data.attributeName || 'AP';
    const attrVal = data.attributeValue ?? 0;

    drawGlowText(ctx, `${attrName} | АТРИБУТ`, LAYOUT.attrLabel.x, LAYOUT.attrLabel.y, {
        font: fontStr(22),
        shadowBlur: 7,
    });
    drawGlowText(ctx, `${attrVal}`, LAYOUT.attrValue.x, LAYOUT.attrValue.y, {
        font: fontStr(34),
        shadowBlur: 10,
        color: '#E0C0FF',
    });

    // ── 7. Organization & Rank — bottom-right section ────────────────
    coverZone(ctx, LAYOUT.orgZone.x, LAYOUT.orgZone.y, LAYOUT.orgZone.w, LAYOUT.orgZone.h);

    const orgText = data.orgName || 'Нет организации';
    const rankText = data.orgRank || 'Нет ранга';

    drawGlowText(ctx, orgText, LAYOUT.orgName.x, LAYOUT.orgName.y, {
        font: fontStr(20),
        shadowBlur: 6,
        maxWidth: 400,
    });
    drawGlowText(ctx, `Ранг: ${rankText}`, LAYOUT.orgRank.x, LAYOUT.orgRank.y, {
        font: fontStr(15),
        color: '#C8A0FF',
        shadowBlur: 5,
        maxWidth: 400,
    });

    // ── Encode to PNG buffer ─────────────────────────────────────────
    return canvas.toBuffer('image/png');
}
