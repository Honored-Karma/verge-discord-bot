import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Шрифт для карточек персонажа.
 *
 * Основной путь — файл, положенный на сборке скриптом scripts/ensure-card-font.mjs.
 * Системные шрифты и загрузка по сети остались только аварийными вариантами:
 * в образе Railway кириллических шрифтов нет, а сетевой путь тормозил первый
 * рендер после каждого рестарта и зависел от доступности CDN.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, "..", "assets", "fonts");

const BOLD_CANDIDATES = [
  join(FONT_DIR, "CardFont.ttf"),
  // Прежнее имя того же файла — оставлено ради старых образов.
  join(FONT_DIR, "InterCyr.ttf"),
];
const REGULAR_CANDIDATES = [join(FONT_DIR, "CardFont-Regular.ttf")];

const FAMILY_BOLD = "CardFont";
const FAMILY_REGULAR = "CardFontRegular";
const MIN_FONT_BYTES = 200_000;

/**
 * У обычного начертания указан запасной вариант: если Regular не приехал,
 * канвас возьмёт жирный, а не системный шрифт без кириллицы.
 */
export const FONT_BOLD = FAMILY_BOLD;
export const FONT_REGULAR = `${FAMILY_REGULAR}, ${FAMILY_BOLD}`;

// Кириллицу покрывают не все системные шрифты, поэтому список короткий и
// проверенный.
const SYSTEM_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
  "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
];

const DOWNLOAD_SOURCES = [
  "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf",
];

let boldReady = false;
let regularReady = false;

function usable(path) {
  try {
    return existsSync(path) && statSync(path).size >= MIN_FONT_BYTES;
  } catch {
    return false;
  }
}

function firstUsable(candidates) {
  return candidates.find((candidate) => usable(candidate)) || null;
}

function registerRegular() {
  if (regularReady) return;
  const path = firstUsable(REGULAR_CANDIDATES);
  if (!path) return;
  try {
    GlobalFonts.registerFromPath(path, FAMILY_REGULAR);
    regularReady = true;
  } catch {}
}

async function downloadBold() {
  if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });
  for (const url of DOWNLOAD_SOURCES) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < MIN_FONT_BYTES) continue;
      writeFileSync(BOLD_CANDIDATES[0], bytes);
      return BOLD_CANDIDATES[0];
    } catch (error) {
      console.warn(`⚠️  Не удалось скачать шрифт карточек: ${error.message}`);
    }
  }
  return null;
}

/**
 * @returns {Promise<{ok: boolean, source: string, regular: boolean}>}
 * source: bundled — файл из сборки, system — системный шрифт,
 * download — пришлось идти в сеть, none — шрифта нет.
 */
export async function ensureCardFont() {
  registerRegular();
  if (boldReady) return { ok: true, source: "cached", regular: regularReady };

  const bundled = firstUsable(BOLD_CANDIDATES);
  if (bundled) {
    GlobalFonts.registerFromPath(bundled, FAMILY_BOLD);
    boldReady = true;
    return { ok: true, source: "bundled", regular: regularReady };
  }

  const system = firstUsable(SYSTEM_CANDIDATES);
  if (system) {
    GlobalFonts.registerFromPath(system, FAMILY_BOLD);
    boldReady = true;
    return { ok: true, source: "system", regular: regularReady };
  }

  const downloaded = await downloadBold();
  if (downloaded) {
    GlobalFonts.registerFromPath(downloaded, FAMILY_BOLD);
    boldReady = true;
    return { ok: true, source: "download", regular: regularReady };
  }

  return { ok: false, source: "none", regular: regularReady };
}

export const __testables = { usable, firstUsable, BOLD_CANDIDATES, REGULAR_CANDIDATES };
