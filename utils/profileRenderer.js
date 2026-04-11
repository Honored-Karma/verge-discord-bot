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
    // Try to load Orbitron / Michroma if bundled in assets/fonts/
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
    // Fallback – no custom font file found; we'll use sans-serif via canvas default
    fontRegistered = true;
}

function fontStr(size, weight = 'bold') {
    ensureFont();
    return `${weight} ${size}px "${FONT_FAMILY}", sans-serif`;
}

// ── Canvas Dimensions (match beb.jpg) ────────────────────────────────
const W = 1024;
const H = 580;

// ── Layout coordinates derived from the template image ───────────────
const LAYOUT = {
    // Avatar hexagonal frame (left side)
    avatar: { cx: 235, cy: 230, size: 170 },
    // XP progress bar (below avatar)
    xpBar: { x: 80, y: 440, w: 360, h: 18 },
    // Level text (above XP bar)
    level: { x: 260, y: 430 },
    // Styles grid (top-right, up to 3 rows)
    styles: { x: 545, y: 70, lineHeight: 38, maxItems: 3 },
    // SP values (right of styles)
    sp: { x: 860, y: 70, lineHeight: 38, maxItems: 3 },
    // Attribute section
    attribute: { x: 680, y: 265 },
    // Organization + Rank (bottom-right)
    org: { x: 740, y: 430 },
    rank: { x: 740, y: 470 },
    // Character name (top of avatar area)
    name: { x: 235, y: 60 },
};

// ── Helper: draw text with black outer glow ──────────────────────────
function drawGlowText(ctx, text, x, y, {
    font = fontStr(20),
    color = '#FFFFFF',
    align = 'center',
    baseline = 'middle',
    shadowBlur = 5,
    shadowColor = 'rgba(0,0,0,0.9)',
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

// ── Helper: create hexagonal clip path ───────────────────────────────
function hexClip(ctx, cx, cy, r) {
    ctx.beginPath();
    // Irregular hexagon / rhombus shape matching the template
    const squeeze = 0.75; // Vertical squeeze factor for the rhombus look
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * squeeze * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();
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
    const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#2C003E');
    gradient.addColorStop(1, '#5B0080');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(size * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', size / 2, size / 2);
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
        const fillW = Math.max(h, w * clamped); // at least round-cap width
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
 * Generates a HUD profile image buffer (PNG).
 *
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
    let bg;
    if (existsSync(bgPath)) {
        bg = await loadImage(bgPath);
    } else {
        // Fallback: procedural dark-purple HUD gradient
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#0D001A');
        grad.addColorStop(0.5, '#1A003D');
        grad.addColorStop(1, '#0D001A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Draw decorative border
        ctx.strokeStyle = '#B026FF';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#B026FF';
        ctx.shadowBlur = 15;
        ctx.strokeRect(30, 20, W - 60, H - 40);
        ctx.shadowBlur = 0;

        // Inner border
        ctx.strokeStyle = 'rgba(176, 38, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(40, 30, W - 80, H - 60);

        // Corner accents
        drawCornerAccent(ctx, 30, 20, 1, 1);
        drawCornerAccent(ctx, W - 30, 20, -1, 1);
        drawCornerAccent(ctx, 30, H - 20, 1, -1);
        drawCornerAccent(ctx, W - 30, H - 20, -1, -1);

        // Grid lines
        ctx.strokeStyle = 'rgba(176, 38, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let gx = 50; gx < W; gx += 30) {
            ctx.beginPath();
            ctx.moveTo(gx, 30);
            ctx.lineTo(gx, H - 30);
            ctx.stroke();
        }
        for (let gy = 30; gy < H; gy += 30) {
            ctx.beginPath();
            ctx.moveTo(40, gy);
            ctx.lineTo(W - 40, gy);
            ctx.stroke();
        }
    }
    if (bg) {
        ctx.drawImage(bg, 0, 0, W, H);
    }

    // ── 2. Avatar with hex clip ──────────────────────────────────────
    const { cx, cy, size: avatarR } = LAYOUT.avatar;
    let avatarImg = null;
    if (data.avatarUrl) {
        avatarImg = await fetchImage(data.avatarUrl);
    }
    if (!avatarImg) {
        avatarImg = createPlaceholderAvatar(avatarR * 2);
    }

    ctx.save();
    hexClip(ctx, cx, cy, avatarR);
    const drawSize = avatarR * 2;
    ctx.drawImage(avatarImg, cx - avatarR, cy - avatarR, drawSize, drawSize);
    ctx.restore();

    // Hex border glow
    ctx.save();
    ctx.strokeStyle = '#B026FF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#B026FF';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    const squeeze = 0.75;
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + avatarR * Math.cos(angle);
        const py = cy + avatarR * squeeze * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── 3. Character Name ────────────────────────────────────────────
    drawGlowText(ctx, data.characterName || 'Unknown', LAYOUT.name.x, LAYOUT.name.y, {
        font: fontStr(26),
        shadowBlur: 8,
    });

    // ── 4. Level & XP Bar ────────────────────────────────────────────
    const level = data.level || 0;
    const xp = data.xp || 0;
    const xpMax = data.xpToNextLevel || 100;
    const xpRatio = xpMax > 0 ? xp / xpMax : 0;

    drawGlowText(ctx, `LVL ${level}`, LAYOUT.level.x, LAYOUT.level.y, {
        font: fontStr(18),
        shadowBlur: 6,
    });

    drawXPBar(ctx, LAYOUT.xpBar.x, LAYOUT.xpBar.y, LAYOUT.xpBar.w, LAYOUT.xpBar.h, xpRatio);

    // XP text on bar
    drawGlowText(ctx, `${xp} / ${xpMax} XP`, LAYOUT.xpBar.x + LAYOUT.xpBar.w / 2, LAYOUT.xpBar.y + LAYOUT.xpBar.h / 2, {
        font: fontStr(11),
        shadowBlur: 4,
    });

    // ── 5. Styles (top-right, up to 3) ──────────────────────────────
    const styles = (data.styles || []).slice(0, 3);
    for (let i = 0; i < styles.length; i++) {
        const sy = LAYOUT.styles.y + i * LAYOUT.styles.lineHeight;
        drawGlowText(ctx, styles[i].name || '—', LAYOUT.styles.x, sy, {
            font: fontStr(17),
            align: 'left',
            maxWidth: 280,
        });
        // SP value on the right
        const spY = LAYOUT.sp.y + i * LAYOUT.sp.lineHeight;
        drawGlowText(ctx, `${styles[i].sp || 0} SP`, LAYOUT.sp.x, spY, {
            font: fontStr(16),
            align: 'right',
        });
    }
    // Fill empty rows with dashes
    for (let i = styles.length; i < 3; i++) {
        const sy = LAYOUT.styles.y + i * LAYOUT.styles.lineHeight;
        drawGlowText(ctx, '—', LAYOUT.styles.x, sy, {
            font: fontStr(17),
            align: 'left',
            color: 'rgba(255,255,255,0.35)',
        });
    }

    // ── 6. Attribute Section ─────────────────────────────────────────
    const attrLabel = data.attributeName || 'Нет';
    const attrValue = data.attributeValue ?? 0;
    drawGlowText(ctx, `AP | ${attrLabel}`, LAYOUT.attribute.x, LAYOUT.attribute.y, {
        font: fontStr(24),
        shadowBlur: 7,
    });
    drawGlowText(ctx, `${attrValue}`, LAYOUT.attribute.x, LAYOUT.attribute.y + 36, {
        font: fontStr(30),
        shadowBlur: 8,
        color: '#E0C0FF',
    });

    // ── 7. Organization & Rank ──────────────────────────────────────
    const orgText = data.orgName || 'Нет организации';
    const rankText = data.orgRank || 'Нет ранга';
    drawGlowText(ctx, orgText, LAYOUT.org.x, LAYOUT.org.y, {
        font: fontStr(20),
        shadowBlur: 6,
        maxWidth: 300,
    });
    drawGlowText(ctx, rankText, LAYOUT.rank.x, LAYOUT.rank.y, {
        font: fontStr(16),
        color: '#C8A0FF',
        shadowBlur: 5,
        maxWidth: 300,
    });

    // ── Encode to PNG buffer ─────────────────────────────────────────
    return canvas.toBuffer('image/png');
}

// ── Decorative corner accent for fallback background ─────────────────
function drawCornerAccent(ctx, x, y, dx, dy) {
    const len = 25;
    ctx.save();
    ctx.strokeStyle = '#B026FF';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#B026FF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, y + dy * len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * len, y);
    ctx.stroke();
    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#B026FF';
    ctx.fill();
    ctx.restore();
}
