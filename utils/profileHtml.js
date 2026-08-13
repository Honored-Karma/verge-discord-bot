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

    // Reliable Cyrillic-capable fallbacks for local Windows development and
    // common Linux hosts. Registering under the card family also prevents
    // missing-glyph squares when the bundled Inter subset is Latin-only.
    const systemFontPaths = [
        'C:/Windows/Fonts/arialbd.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    ];
    for (const fontPath of systemFontPaths) {
        if (existsSync(fontPath)) {
            GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
            fontReady = true;
            return;
        }
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
const PHYSICAL_H = 320;

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

function formatStatValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function physicalBarRatio(key, rawValue) {
    const value = Math.max(0, Number(rawValue) || 0);

    // The stats don't share a common maximum. These curves keep the bars useful
    // for both realistic and enhanced characters without changing stored values.
    if (key === 'stamina_percent') return Math.min(value / 100, 1);
    if (key === 'reaction_ms') return value > 0 ? 250 / (value + 250) : 0;

    const visualScale = {
        punch_strength_kg: 100,
        lifting_strength_kg: 200,
        speed_kmh: 30,
    }[key] || 100;
    return value / (value + visualScale);
}

// ── Image cache & robust fetcher ─────────────────────────────────────
// Keeps successfully decoded avatars in memory so transient CDN hiccups
// don't cause the avatar to vanish on repeated /profile renders.
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const IMAGE_CACHE_MAX = 200;
const NEG_CACHE_TTL_MS = 60 * 1000;        // 1 min for failures
const imageCache = new Map();              // url -> { img, expires }
const negativeCache = new Map();           // url -> expires

function cacheGet(url) {
    const e = imageCache.get(url);
    if (!e) return null;
    if (e.expires < Date.now()) { imageCache.delete(url); return null; }
    // Refresh LRU position
    imageCache.delete(url);
    imageCache.set(url, e);
    return e.img;
}

function cacheSet(url, img) {
    if (imageCache.size >= IMAGE_CACHE_MAX) {
        const firstKey = imageCache.keys().next().value;
        if (firstKey !== undefined) imageCache.delete(firstKey);
    }
    imageCache.set(url, { img, expires: Date.now() + IMAGE_CACHE_TTL_MS });
}

function negGet(url) {
    const exp = negativeCache.get(url);
    if (!exp) return false;
    if (exp < Date.now()) { negativeCache.delete(url); return false; }
    return true;
}

function negSet(url) {
    negativeCache.set(url, Date.now() + NEG_CACHE_TTL_MS);
}

async function fetchImageOnce(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            redirect: 'follow',
            headers: {
                // Some CDNs (imgur, etc.) reject requests without UA/Accept.
                'User-Agent': 'Mozilla/5.0 (compatible; VergeBot/1.0; +https://discord.com)',
                'Accept': 'image/*,*/*;q=0.8',
            },
        });
        if (!res.ok) return { ok: false, status: res.status };
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return { ok: false, status: 0 };
        const img = await loadImage(buf);
        return { ok: true, img };
    } catch (e) {
        return { ok: false, error: e };
    } finally {
        clearTimeout(t);
    }
}

async function fetchImage(url, { timeoutMs = 6000, retries = 2 } = {}) {
    if (!url) return null;
    const cached = cacheGet(url);
    if (cached) return cached;
    if (negGet(url)) return null;

    let lastStatus = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const r = await fetchImageOnce(url, timeoutMs);
        if (r.ok) { cacheSet(url, r.img); return r.img; }
        lastStatus = r.status ?? null;
        // Don't retry on definitive client errors (404/410/403/401).
        if (lastStatus && [400, 401, 403, 404, 410].includes(lastStatus)) break;
        if (attempt < retries) {
            await new Promise(res => setTimeout(res, 250 * (attempt + 1)));
        }
    }
    negSet(url);
    return null;
}

// ══════════════════════════════════════════════════════════════════════
export async function generateProfileCard(data) {
    await ensureFont();

    const {
        characterName = 'Неизвестно',
        avatarUrl,
        fallbackAvatarUrl = null,
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
    if (!avatarImg && fallbackAvatarUrl && fallbackAvatarUrl !== avatarUrl) {
        avatarImg = await fetchImage(fallbackAvatarUrl);
    }
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

// ══════════════════════════════════════════════════════════════════════
export async function generatePhysicalStatsCard(data) {
    await ensureFont();

    const {
        characterName = 'Неизвестно',
        avatarUrl,
        fallbackAvatarUrl = null,
        stats = {},
        playerId = '',
        slot = 1,
    } = data;

    const canvas = createCanvas(W, PHYSICAL_H);
    const ctx = canvas.getContext('2d');

    // Same dark violet/blue visual language as the main profile banner.
    const bgGrad = ctx.createLinearGradient(0, 0, W, PHYSICAL_H);
    bgGrad.addColorStop(0, '#1a0a2e');
    bgGrad.addColorStop(0.42, '#16213e');
    bgGrad.addColorStop(1, '#0f3460');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, PHYSICAL_H, 20);
    ctx.fill();

    const leftGlow = ctx.createRadialGradient(105, PHYSICAL_H / 2, 18, 105, PHYSICAL_H / 2, 280);
    leftGlow.addColorStop(0, 'rgba(139,92,246,0.20)');
    leftGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, W, PHYSICAL_H);

    const rightGlow = ctx.createRadialGradient(W - 80, 20, 0, W - 80, 20, 320);
    rightGlow.addColorStop(0, 'rgba(6,182,212,0.10)');
    rightGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = rightGlow;
    ctx.fillRect(0, 0, W, PHYSICAL_H);

    // Subtle diagonal HUD lines.
    ctx.save();
    roundRect(ctx, 0, 0, W, PHYSICAL_H, 20);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 250; x < W + PHYSICAL_H; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - PHYSICAL_H, PHYSICAL_H);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = PURPLE_DIM;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, W - 2, PHYSICAL_H - 2, 20);
    ctx.stroke();
    ctx.restore();

    // Avatar block.
    const avCX = 102, avCY = 151, avR = 58;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR + 5, 0, Math.PI * 2);
    const ringGrad = ctx.createLinearGradient(avCX - avR, avCY - avR, avCX + avR, avCY + avR);
    ringGrad.addColorStop(0, '#8b5cf6');
    ringGrad.addColorStop(0.5, '#06b6d4');
    ringGrad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = ringGrad;
    ctx.shadowColor = PURPLE;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();

    let avatarImg = avatarUrl ? await fetchImage(avatarUrl) : null;
    if (!avatarImg && fallbackAvatarUrl && fallbackAvatarUrl !== avatarUrl) {
        avatarImg = await fetchImage(fallbackAvatarUrl);
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
        const scale = Math.max(avR * 2 / avatarImg.width, avR * 2 / avatarImg.height);
        const dw = avatarImg.width * scale;
        const dh = avatarImg.height * scale;
        ctx.drawImage(avatarImg, avCX - dw / 2, avCY - dh / 2, dw, dh);
    } else {
        ctx.fillStyle = '#2C003E';
        ctx.fillRect(avCX - avR, avCY - avR, avR * 2, avR * 2);
        txt(ctx, '?', avCX, avCY, { font: `bold 36px ${F}`, align: 'center' });
    }
    ctx.restore();

    txt(ctx, 'ФИЗИЧЕСКИЙ ПРОФИЛЬ', avCX, 46, {
        font: `bold 11px ${F}`,
        color: '#a78bfa',
        align: 'center',
    });
    txt(ctx, characterName, avCX, 232, {
        font: `bold 18px ${F}`,
        align: 'center',
        maxW: 160,
    });
    txt(ctx, `СЛОТ ${slot}`, avCX, 258, {
        font: `bold 11px ${F}`,
        color: TEXT_DIM,
        align: 'center',
    });

    // Divider between identity and stats.
    const divider = ctx.createLinearGradient(0, 42, 0, PHYSICAL_H - 42);
    divider.addColorStop(0, 'transparent');
    divider.addColorStop(0.5, 'rgba(139,92,246,0.55)');
    divider.addColorStop(1, 'transparent');
    ctx.fillStyle = divider;
    ctx.fillRect(193, 28, 1, PHYSICAL_H - 56);

    const startX = 224;
    const barW = W - startX - 28;
    const rows = [
        { key: 'punch_strength_kg', label: 'СИЛА УДАРА', unit: 'кг', colors: ['#f59e0b', '#ef4444'] },
        { key: 'lifting_strength_kg', label: 'СИЛА НА ПОДЪЁМ', unit: 'кг', colors: ['#facc15', '#f97316'] },
        { key: 'speed_kmh', label: 'СКОРОСТЬ', unit: 'км/ч', colors: ['#22d3ee', '#3b82f6'] },
        { key: 'stamina_percent', label: 'СТАМИНА', unit: '%', colors: ['#34d399', '#14b8a6'] },
        { key: 'reaction_ms', label: 'РЕАКЦИЯ', unit: 'мс', colors: ['#a78bfa', '#ec4899'] },
    ];

    rows.forEach((row, index) => {
        const y = 47 + index * 51;
        const value = stats[row.key];
        const displayValue = formatStatValue(value);

        ctx.save();
        ctx.fillStyle = row.colors[0];
        ctx.shadowColor = row.colors[0];
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(startX + 4, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        txt(ctx, row.label, startX + 18, y, {
            font: `bold 13px ${F}`,
            color: TEXT_LIGHT,
        });
        txt(ctx, displayValue === '—' ? displayValue : `${displayValue} ${row.unit}`, W - 28, y, {
            font: `bold 15px ${F}`,
            align: 'right',
        });
        drawBar(ctx, startX, y + 14, barW, 9, physicalBarRatio(row.key, value), row.colors);
    });

    txt(ctx, 'Чем меньше время реакции, тем лучше результат', startX, PHYSICAL_H - 16, {
        font: `10px ${F}`,
        color: 'rgba(255,255,255,0.30)',
    });
    txt(ctx, `ID: ${playerId}`, W - 16, PHYSICAL_H - 16, {
        font: `10px ${F}`,
        color: 'rgba(255,255,255,0.25)',
        align: 'right',
    });

    return canvas.toBuffer('image/png');
}

// ══════════════════════════════════════════════════════════════════════
export async function generateAPSPStatsCard(data) {
    await ensureFont();

    const {
        characterName = 'Неизвестно',
        avatarUrl,
        fallbackAvatarUrl = null,
        ap = 0,
        totalSP = 0,
        attributeName = null,
        apMultiplier = 100,
        spMultiplier = 100,
        dynamicBonus = 0,
        playerId = '',
        slot = 1,
    } = data;

    const canvas = createCanvas(W, PHYSICAL_H);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, W, PHYSICAL_H);
    bgGrad.addColorStop(0, '#1a0a2e');
    bgGrad.addColorStop(0.42, '#16213e');
    bgGrad.addColorStop(1, '#0f3460');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, PHYSICAL_H, 20);
    ctx.fill();

    const leftGlow = ctx.createRadialGradient(105, PHYSICAL_H / 2, 18, 105, PHYSICAL_H / 2, 280);
    leftGlow.addColorStop(0, 'rgba(139,92,246,0.20)');
    leftGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, W, PHYSICAL_H);

    const rightGlow = ctx.createRadialGradient(W - 80, 20, 0, W - 80, 20, 320);
    rightGlow.addColorStop(0, 'rgba(6,182,212,0.10)');
    rightGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = rightGlow;
    ctx.fillRect(0, 0, W, PHYSICAL_H);

    ctx.save();
    roundRect(ctx, 0, 0, W, PHYSICAL_H, 20);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 250; x < W + PHYSICAL_H; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - PHYSICAL_H, PHYSICAL_H);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = PURPLE_DIM;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, W - 2, PHYSICAL_H - 2, 20);
    ctx.stroke();
    ctx.restore();

    const avCX = 102, avCY = 151, avR = 58;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR + 5, 0, Math.PI * 2);
    const ringGrad = ctx.createLinearGradient(avCX - avR, avCY - avR, avCX + avR, avCY + avR);
    ringGrad.addColorStop(0, '#f59e0b');
    ringGrad.addColorStop(0.5, '#8b5cf6');
    ringGrad.addColorStop(1, '#06b6d4');
    ctx.fillStyle = ringGrad;
    ctx.shadowColor = PURPLE;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();

    let avatarImg = avatarUrl ? await fetchImage(avatarUrl) : null;
    if (!avatarImg && fallbackAvatarUrl && fallbackAvatarUrl !== avatarUrl) {
        avatarImg = await fetchImage(fallbackAvatarUrl);
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCX, avCY, avR, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
        const scale = Math.max(avR * 2 / avatarImg.width, avR * 2 / avatarImg.height);
        const dw = avatarImg.width * scale;
        const dh = avatarImg.height * scale;
        ctx.drawImage(avatarImg, avCX - dw / 2, avCY - dh / 2, dw, dh);
    } else {
        ctx.fillStyle = '#2C003E';
        ctx.fillRect(avCX - avR, avCY - avR, avR * 2, avR * 2);
        txt(ctx, '?', avCX, avCY, { font: `bold 36px ${F}`, align: 'center' });
    }
    ctx.restore();

    txt(ctx, 'ПРОГРЕСС', avCX, 46, {
        font: `bold 11px ${F}`,
        color: '#a78bfa',
        align: 'center',
    });
    txt(ctx, characterName, avCX, 232, {
        font: `bold 18px ${F}`,
        align: 'center',
        maxW: 160,
    });
    txt(ctx, `СЛОТ ${slot}`, avCX, 258, {
        font: `bold 11px ${F}`,
        color: TEXT_DIM,
        align: 'center',
    });

    const divider = ctx.createLinearGradient(0, 42, 0, PHYSICAL_H - 42);
    divider.addColorStop(0, 'transparent');
    divider.addColorStop(0.5, 'rgba(139,92,246,0.55)');
    divider.addColorStop(1, 'transparent');
    ctx.fillStyle = divider;
    ctx.fillRect(193, 28, 1, PHYSICAL_H - 56);

    const startX = 224;
    const contentW = W - startX - 28;
    const gap = 12;
    const metricW = (contentW - gap) / 2;
    const apValue = Math.max(0, Number(ap) || 0);
    const spValue = Math.max(0, Number(totalSP) || 0);

    const drawMetric = (x, label, value, unit, colors) => {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        roundRect(ctx, x, 25, metricW, 66, 12);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        txt(ctx, label, x + 16, 43, {
            font: `bold 11px ${F}`,
            color: TEXT_DIM,
            maxW: metricW - 32,
        });
        txt(ctx, formatStatValue(value), x + 16, 68, {
            font: `bold 25px ${F}`,
            maxW: metricW - 70,
        });
        txt(ctx, unit, x + metricW - 16, 69, {
            font: `bold 12px ${F}`,
            color: colors[0],
            align: 'right',
        });

        const accent = ctx.createLinearGradient(x, 0, x + metricW, 0);
        accent.addColorStop(0, colors[0]);
        accent.addColorStop(1, colors[1]);
        ctx.fillStyle = accent;
        roundRect(ctx, x + 12, 84, metricW - 24, 3, 1.5);
        ctx.fill();
    };

    drawMetric(startX, attributeName ? `${String(attributeName).toUpperCase()} • AP` : 'ОБЩИЙ AP', apValue, 'AP', AP_GRAD);
    drawMetric(startX + metricW + gap, 'ОБЩИЙ SP', spValue, 'SP', SP_GRAD);

    const apPrevious = Math.floor(apValue / 100) * 100;
    const apNext = apPrevious + 100;
    const apProgress = apValue - apPrevious;
    txt(ctx, `ДО ОТМЕТКИ ${formatStatValue(apNext)} AP`, startX, 117, {
        font: `bold 12px ${F}`,
        color: TEXT_LIGHT,
    });
    txt(ctx, `${formatStatValue(apProgress)} / 100`, W - 28, 117, {
        font: `bold 12px ${F}`,
        color: TEXT_DIM,
        align: 'right',
    });
    drawBar(ctx, startX, 132, contentW, 15, apProgress / 100, AP_GRAD);

    const spPrevious = Math.floor(spValue / 500) * 500;
    const spNext = spPrevious + 500;
    const spProgress = spValue - spPrevious;
    txt(ctx, `ДО ОТМЕТКИ ${formatStatValue(spNext)} SP`, startX, 174, {
        font: `bold 12px ${F}`,
        color: TEXT_LIGHT,
    });
    txt(ctx, `${formatStatValue(spProgress)} / 500`, W - 28, 174, {
        font: `bold 12px ${F}`,
        color: TEXT_DIM,
        align: 'right',
    });
    drawBar(ctx, startX, 189, contentW, 15, spProgress / 500, SP_GRAD);

    const pillY = 229;
    const pillW = (contentW - gap) / 2;
    const drawMultiplier = (x, label, value, colors) => {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.strokeStyle = 'rgba(255,255,255,0.11)';
        ctx.lineWidth = 1;
        roundRect(ctx, x, pillY, pillW, 42, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = colors[0];
        roundRect(ctx, x, pillY + 8, 3, 26, 1.5);
        ctx.fill();
        txt(ctx, label, x + 15, pillY + 21, { font: `bold 11px ${F}`, color: TEXT_DIM });
        txt(ctx, `${formatStatValue(value)}%`, x + pillW - 14, pillY + 21, {
            font: `bold 17px ${F}`,
            align: 'right',
        });
    };

    drawMultiplier(startX, 'МНОЖИТЕЛЬ AP', apMultiplier, AP_GRAD);
    drawMultiplier(startX + pillW + gap, 'МНОЖИТЕЛЬ SP', spMultiplier, SP_GRAD);

    if (Number(dynamicBonus) > 0) {
        txt(ctx, `В множители включён бонус +${formatStatValue(dynamicBonus)}%`, startX, PHYSICAL_H - 16, {
            font: `10px ${F}`,
            color: 'rgba(255,255,255,0.32)',
        });
    }
    txt(ctx, `ID: ${playerId}`, W - 16, PHYSICAL_H - 16, {
        font: `10px ${F}`,
        color: 'rgba(255,255,255,0.25)',
        align: 'right',
    });

    return canvas.toBuffer('image/png');
}
