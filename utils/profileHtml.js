import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '..', 'assets', 'fonts');
const FONT_PATH = join(FONT_DIR, 'Inter-Bold.ttf');
const FONT_FAMILY = 'CardFont';
let fontReady = false;

async function ensureFont() {
    if (fontReady) return;

    // 1. Already cached on disk
    if (existsSync(FONT_PATH)) {
        GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
        fontReady = true;
        return;
    }

    // 2. Auto-download Inter Bold from CDN and cache it
    if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });

    const urls = [
        'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
        'https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-Bold.otf',
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, { redirect: 'follow' });
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                writeFileSync(FONT_PATH, buf);
                GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
                console.log('✅ Font downloaded and registered:', url);
                fontReady = true;
                return;
            }
        } catch (e) {
            console.warn('⚠️ Font download failed:', url, e.message);
        }
    }

    // 3. Fallback: try system font dirs
    const sysDirs = ['/usr/share/fonts', '/usr/local/share/fonts'];
    for (const dir of sysDirs) {
        if (existsSync(dir)) {
            try { GlobalFonts.loadFontsFromDir(dir); } catch {}
        }
    }

    fontReady = true;
}

const FONT = `'${FONT_FAMILY}', 'Inter', 'DejaVu Sans', sans-serif`;

const W = 840;
const H = 280;

// ── Colors ───────────────────────────────────────────────────────────
const BG_GRADIENT = [
    [0, '#1a0a2e'],
    [0.4, '#16213e'],
    [1, '#0f3460'],
];
const PURPLE = '#8b5cf6';
const PURPLE_DIM = 'rgba(139,92,246,0.35)';
const AP_GRAD = ['#f59e0b', '#f97316', '#ef4444'];
const SP_GRAD = ['#06b6d4', '#8b5cf6', '#a855f7'];
const TEXT_WHITE = '#FFFFFF';
const TEXT_DIM = '#94a3b8';
const TEXT_LIGHT = '#cbd5e1';

// ── Helpers ──────────────────────────────────────────────────────────
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

function drawBar(ctx, x, y, w, h, ratio, colors) {
    const r = h / 2;
    // Track
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    // Fill
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped > 0) {
        const fillW = Math.max(h, w * clamped);
        const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
        colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
        ctx.save();
        ctx.shadowColor = colors[0];
        ctx.shadowBlur = 10;
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, fillW, h, r);
        ctx.fill();
        ctx.restore();
    }
}

function drawText(ctx, text, x, y, { font = `bold 14px ${FONT}`, color = TEXT_WHITE, align = 'left', maxW } = {}) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    if (maxW) ctx.fillText(text, x, y, maxW);
    else ctx.fillText(text, x, y);
    ctx.restore();
}

async function fetchImage(url, timeoutMs = 4000) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        return await loadImage(Buffer.from(await res.arrayBuffer()));
    } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════════════════════════════
/**
 * Generates a Juniper-style profile banner using @napi-rs/canvas.
 * Returns a PNG buffer suitable for AttachmentBuilder.
 */
export async function generateProfileCard(data) {
    await ensureFont();

    const {
        characterName = 'Unknown',
        avatarUrl,
        level = 0,
        xp = 0,
        xpToNextLevel = 100,
        styles = [],
        attributeName,
        attributeValue = 0,
        totalSP = 0,
        orgName,
        orgRank,
        playerId = '',
        slot = 1,
    } = data;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── 1. Background gradient + rounded card ────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    BG_GRADIENT.forEach(([stop, color]) => bgGrad.addColorStop(stop, color));
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, H, 20);
    ctx.fill();

    // Subtle purple radial glow
    const glow = ctx.createRadialGradient(160, H / 2, 20, 160, H / 2, 300);
    glow.addColorStop(0, 'rgba(139,92,246,0.15)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.save();
    ctx.strokeStyle = PURPLE_DIM;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, W - 2, H - 2, 20);
    ctx.stroke();
    ctx.restore();

    // ── 2. Avatar (circular) ─────────────────────────────────────────
    const avCX = 110, avCY = 115, avR = 60;

    // Ring gradient
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR + 4, 0, Math.PI * 2);
    const ringGrad = ctx.createLinearGradient(avCX - avR, avCY - avR, avCX + avR, avCY + avR);
    ringGrad.addColorStop(0, '#8b5cf6');
    ringGrad.addColorStop(0.5, '#3b82f6');
    ringGrad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = ringGrad;
    ctx.shadowColor = PURPLE;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();

    // Avatar image (clipped circle)
    let avatarImg = avatarUrl ? await fetchImage(avatarUrl) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
        const s = Math.max(avR * 2 / avatarImg.width, avR * 2 / avatarImg.height);
        const dw = avatarImg.width * s, dh = avatarImg.height * s;
        ctx.drawImage(avatarImg, avCX - dw / 2, avCY - dh / 2, dw, dh);
    } else {
        ctx.fillStyle = '#2C003E';
        ctx.fillRect(avCX - avR, avCY - avR, avR * 2, avR * 2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 40px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', avCX, avCY);
    }
    ctx.restore();

    // Level badge below avatar
    const badgeText = `LVL ${level}`;
    const badgeY = avCY + avR + 22;
    ctx.save();
    ctx.font = `bold 15px ${FONT}`;
    const badgeW = ctx.measureText(badgeText).width + 28;
    const badgeX = avCX - badgeW / 2;
    const badgeGrad = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
    badgeGrad.addColorStop(0, '#8b5cf6');
    badgeGrad.addColorStop(1, '#6d28d9');
    ctx.shadowColor = PURPLE;
    ctx.shadowBlur = 10;
    ctx.fillStyle = badgeGrad;
    roundRect(ctx, badgeX, badgeY - 12, badgeW, 24, 12);
    ctx.fill();
    ctx.restore();
    drawText(ctx, badgeText, avCX, badgeY, { font: `bold 14px ${FONT}`, align: 'center' });

    // ── 3. Right section: info ───────────────────────────────────────
    const rx = 210; // right section start X

    // Character name
    drawText(ctx, characterName, rx, 36, {
        font: `bold 26px ${FONT}`,
        maxW: 400,
    });

    // Attribute badge
    const attrLabel = attributeName ? `AP | ${attributeName}` : 'AP';
    ctx.save();
    ctx.font = `bold 13px ${FONT}`;
    const attrW = ctx.measureText(attrLabel).width + 22;
    const attrX = W - 30 - attrW;
    ctx.fillStyle = 'rgba(139,92,246,0.2)';
    ctx.strokeStyle = 'rgba(139,92,246,0.5)';
    ctx.lineWidth = 1;
    roundRect(ctx, attrX, 22, attrW, 26, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawText(ctx, attrLabel, attrX + attrW / 2, 35, {
        font: `bold 13px ${FONT}`,
        color: '#c4b5fd',
        align: 'center',
    });

    // Org & Rank
    const orgStr = `Организация: ${orgName || 'Нет'}`;
    const rankStr = `Ранг: ${orgRank || 'Нет'}`;
    drawText(ctx, orgStr, rx, 62, { font: `13px ${FONT}`, color: TEXT_DIM, maxW: 300 });
    drawText(ctx, rankStr, rx + 310, 62, { font: `13px ${FONT}`, color: TEXT_DIM, maxW: 200 });

    // ── 4. AP Progress Bar ───────────────────────────────────────────
    const barX = rx, barW = W - rx - 30, barH = 16;
    const apBarY = 100;

    drawText(ctx, 'АП (Очки Атрибута)', barX, apBarY - 12, { font: `bold 12px ${FONT}`, color: TEXT_LIGHT });
    drawText(ctx, `${xp} / ${xpToNextLevel} XP`, barX + barW, apBarY - 12, {
        font: `bold 12px ${FONT}`, color: TEXT_DIM, align: 'right',
    });
    const apRatio = xpToNextLevel > 0 ? xp / xpToNextLevel : 0;
    drawBar(ctx, barX, apBarY, barW, barH, apRatio, AP_GRAD);

    // ── 5. SP Progress Bar ───────────────────────────────────────────
    const spBarY = 145;
    drawText(ctx, 'СП (Очки Стиля)', barX, spBarY - 12, { font: `bold 12px ${FONT}`, color: TEXT_LIGHT });
    drawText(ctx, `${totalSP} SP`, barX + barW, spBarY - 12, {
        font: `bold 12px ${FONT}`, color: TEXT_DIM, align: 'right',
    });
    const spRatio = totalSP > 0 ? Math.min(totalSP / 1000, 1) : 0;
    drawBar(ctx, barX, spBarY, barW, barH, spRatio, SP_GRAD);

    // ── 6. Style tags ────────────────────────────────────────────────
    const topStyles = styles.slice(0, 3);
    let tagX = barX;
    const tagY = 190;

    if (topStyles.length === 0) {
        drawText(ctx, 'Нет стилей', tagX, tagY, { font: `12px ${FONT}`, color: '#64748b' });
    } else {
        for (const s of topStyles) {
            const label = `${s.name}  ${s.sp}`;
            ctx.font = `bold 12px ${FONT}`;
            const tw = ctx.measureText(label).width + 18;

            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            roundRect(ctx, tagX, tagY - 11, tw, 22, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Draw name part
            drawText(ctx, s.name, tagX + 8, tagY, { font: `12px ${FONT}`, color: TEXT_LIGHT });
            // Draw SP part in purple
            ctx.font = `12px ${FONT}`;
            const nameW = ctx.measureText(s.name + '  ').width;
            drawText(ctx, `${s.sp}`, tagX + 8 + nameW, tagY, { font: `bold 12px ${FONT}`, color: '#a78bfa' });

            tagX += tw + 8;
        }
    }

    // ── 7. Footer ID ─────────────────────────────────────────────────
    const footerText = `ID: ${playerId} • Слот №${slot}`;
    drawText(ctx, footerText, W - 16, H - 14, {
        font: `10px ${FONT}`,
        color: 'rgba(255,255,255,0.25)',
        align: 'right',
    });

    return canvas.toBuffer('image/png');
}
