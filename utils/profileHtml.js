import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '..', 'assets', 'fonts');
const FONT_PATH = join(FONT_DIR, 'InterCyr.ttf');
const FONT_FAMILY = 'CardFont';
let fontReady = false;

async function ensureFont() {
    if (fontReady) return;

    if (existsSync(FONT_PATH) && (await import('fs')).statSync(FONT_PATH).size > 100_000) {
        GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
        fontReady = true;
        return;
    }

    if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });

    // Full font with Cyrillic + Latin support
    const urls = [
        'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf',
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, { redirect: 'follow' });
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length > 50_000) {
                    writeFileSync(FONT_PATH, buf);
                    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
                    console.log(`✅ Font downloaded (${(buf.length / 1024).toFixed(0)}KB):`, url);
                    fontReady = true;
                    return;
                }
            }
        } catch (e) {
            console.warn('⚠️ Font download failed:', url, e.message);
        }
    }

    const sysDirs = ['/usr/share/fonts', '/usr/local/share/fonts'];
    for (const dir of sysDirs) {
        if (existsSync(dir)) {
            try { GlobalFonts.loadFontsFromDir(dir); } catch {}
        }
    }
    fontReady = true;
}

const F = `'${FONT_FAMILY}', sans-serif`;

const W = 840;
const H = 240;

const PURPLE = '#8b5cf6';
const PURPLE_DIM = 'rgba(139,92,246,0.35)';
const AP_GRAD = ['#f59e0b', '#f97316', '#ef4444'];
const SP_GRAD = ['#06b6d4', '#8b5cf6', '#a855f7'];
const TEXT_WHITE = '#FFFFFF';
const TEXT_DIM = '#94a3b8';
const TEXT_LIGHT = '#cbd5e1';
const EMPTY_BORDER = 'rgba(255,255,255,0.12)';
const EMPTY_BG = 'rgba(255,255,255,0.04)';

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
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
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

function txt(ctx, text, x, y, { font = `bold 16px ${F}`, color = TEXT_WHITE, align = 'left', maxW } = {}) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    if (maxW) ctx.fillText(text, x, y, maxW);
    else ctx.fillText(text, x, y);
    ctx.restore();
}

function emptyBox(ctx, x, y, w, h, r = 8) {
    ctx.save();
    ctx.fillStyle = EMPTY_BG;
    ctx.strokeStyle = EMPTY_BORDER;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
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
export async function generateProfileCard(data) {
    await ensureFont();

    const {
        characterName = 'Unknown',
        avatarUrl,
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

    // ── 1. Background ────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#1a0a2e');
    bgGrad.addColorStop(0.4, '#16213e');
    bgGrad.addColorStop(1, '#0f3460');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, H, 20);
    ctx.fill();

    const glow = ctx.createRadialGradient(140, H / 2, 20, 140, H / 2, 280);
    glow.addColorStop(0, 'rgba(139,92,246,0.15)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = PURPLE_DIM;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, W - 2, H - 2, 20);
    ctx.stroke();
    ctx.restore();

    // ── 2. Avatar ────────────────────────────────────────────────────
    const avCX = 100, avCY = H / 2, avR = 56;

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
        ctx.font = `bold 36px ${F}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', avCX, avCY);
    }
    ctx.restore();

    // ── 3. Right section ─────────────────────────────────────────────
    const rx = 196;

    // Character name (large)
    txt(ctx, characterName, rx, 32, { font: `bold 28px ${F}`, maxW: 420 });

    // Attribute badge (top-right)
    if (attributeName) {
        const attrLabel = `AP | ${attributeName}`;
        ctx.font = `bold 14px ${F}`;
        const attrW = ctx.measureText(attrLabel).width + 24;
        const attrX = W - 24 - attrW;
        ctx.save();
        ctx.fillStyle = 'rgba(139,92,246,0.2)';
        ctx.strokeStyle = 'rgba(139,92,246,0.5)';
        ctx.lineWidth = 1;
        roundRect(ctx, attrX, 17, attrW, 28, 14);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        txt(ctx, attrLabel, attrX + attrW / 2, 31, { font: `bold 14px ${F}`, color: '#c4b5fd', align: 'center' });
    } else {
        // Empty attribute placeholder
        emptyBox(ctx, W - 24 - 80, 17, 80, 28, 14);
    }

    // Org & Rank row
    const infoY = 60;
    if (orgName) {
        txt(ctx, `Организация: ${orgName}`, rx, infoY, { font: `14px ${F}`, color: TEXT_DIM, maxW: 320 });
    } else {
        txt(ctx, 'Организация:', rx, infoY, { font: `14px ${F}`, color: TEXT_DIM });
        emptyBox(ctx, rx + 120, infoY - 10, 120, 20, 6);
    }
    if (orgRank) {
        txt(ctx, `Ранг: ${orgRank}`, rx + 340, infoY, { font: `14px ${F}`, color: TEXT_DIM, maxW: 200 });
    } else {
        txt(ctx, 'Ранг:', rx + 340, infoY, { font: `14px ${F}`, color: TEXT_DIM });
        emptyBox(ctx, rx + 394, infoY - 10, 100, 20, 6);
    }

    // ── 4. AP Bar ────────────────────────────────────────────────────
    const barX = rx, barW = W - rx - 24, barH = 18;
    const apBarY = 100;

    txt(ctx, 'AP', barX, apBarY - 12, { font: `bold 14px ${F}`, color: TEXT_LIGHT });
    txt(ctx, `${attributeValue} AP`, barX + barW, apBarY - 12, { font: `bold 14px ${F}`, color: TEXT_DIM, align: 'right' });
    const apRatio = attributeValue > 0 ? Math.min(attributeValue / 10000, 1) : 0;
    drawBar(ctx, barX, apBarY, barW, barH, apRatio, AP_GRAD);

    // ── 5. SP Bar ────────────────────────────────────────────────────
    const spBarY = 142;
    txt(ctx, 'SP', barX, spBarY - 12, { font: `bold 14px ${F}`, color: TEXT_LIGHT });
    txt(ctx, `${totalSP} SP`, barX + barW, spBarY - 12, { font: `bold 14px ${F}`, color: TEXT_DIM, align: 'right' });
    const spRatio = totalSP > 0 ? Math.min(totalSP / 1000, 1) : 0;
    drawBar(ctx, barX, spBarY, barW, barH, spRatio, SP_GRAD);

    // ── 6. Style tags ────────────────────────────────────────────────
    const topStyles = styles.slice(0, 3);
    let tagX = barX;
    const tagY = 185;

    if (topStyles.length === 0) {
        // 3 empty placeholder boxes
        for (let i = 0; i < 3; i++) {
            emptyBox(ctx, tagX, tagY - 12, 100, 24, 8);
            tagX += 108;
        }
    } else {
        for (const s of topStyles) {
            const label = `${s.name}  ${s.sp}`;
            ctx.font = `bold 13px ${F}`;
            const tw = ctx.measureText(label).width + 20;

            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            roundRect(ctx, tagX, tagY - 12, tw, 24, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            txt(ctx, s.name, tagX + 10, tagY, { font: `13px ${F}`, color: TEXT_LIGHT });
            ctx.font = `13px ${F}`;
            const nameW = ctx.measureText(s.name + '  ').width;
            txt(ctx, `${s.sp}`, tagX + 10 + nameW, tagY, { font: `bold 13px ${F}`, color: '#a78bfa' });

            tagX += tw + 10;
        }
        // Fill remaining slots with empty boxes
        for (let i = topStyles.length; i < 3; i++) {
            emptyBox(ctx, tagX, tagY - 12, 100, 24, 8);
            tagX += 108;
        }
    }

    // ── 7. Footer ────────────────────────────────────────────────────
    txt(ctx, `ID: ${playerId}`, W - 16, H - 16, { font: `10px ${F}`, color: 'rgba(255,255,255,0.25)', align: 'right' });

    return canvas.toBuffer('image/png');
}
