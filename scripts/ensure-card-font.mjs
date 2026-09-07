#!/usr/bin/env node
/**
 * Кладёт шрифт для карточек персонажа рядом с кодом на этапе сборки.
 *
 * Зачем: в образе Railway нет системных шрифтов с кириллицей, поэтому
 * profileHtml.js скачивал NotoSans (617 КБ) прямо во время первого рендера
 * карточки. Это подтверждено логами прода:
 *
 *   2026-08-13T22:09:24Z  Font downloaded (617KB): cdn.jsdelivr.net/...
 *
 * Файловая система контейнера эфемерная, значит загрузка повторялась после
 * каждого рестарта, попадала в тайминг ответа Discord и полностью зависела от
 * доступности CDN — без сети русские имена превратились бы в квадраты.
 *
 * Скрипт запускается из postinstall, то есть на сборке, где сеть есть по
 * определению. Если скачать не удалось, сборка НЕ падает: в рантайме остаётся
 * прежний аварийный путь, просто он снова станет сетевым.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = join(__dirname, "..", "assets", "fonts");
export const CARD_FONT_PATH = join(FONT_DIR, "CardFont.ttf");
export const CARD_FONT_REGULAR_PATH = join(FONT_DIR, "CardFont-Regular.ttf");

// Минимальный размер: усечённый или ошибочный ответ CDN не должен выглядеть
// как валидный шрифт.
const MIN_FONT_BYTES = 200_000;

const NOTO = (weight) => [
  `https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-${weight}.ttf`,
  `https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-${weight}.ttf`,
];

// Двух насыщенностей достаточно для нормальной иерархии: до этого в сборке был
// только Bold, поэтому весь текст карточки был жирным и различался лишь
// размером.
const FACES = [
  { path: CARD_FONT_PATH, sources: NOTO("Bold"), label: "Bold", required: true },
  { path: CARD_FONT_REGULAR_PATH, sources: NOTO("Regular"), label: "Regular", required: false },
];

function fileReady(path) {
  try {
    return existsSync(path) && statSync(path).size >= MIN_FONT_BYTES;
  } catch {
    return false;
  }
}

export function cardFontReady() {
  return fileReady(CARD_FONT_PATH);
}

export function cardFontRegularReady() {
  return fileReady(CARD_FONT_REGULAR_PATH);
}

async function downloadFace(face, log) {
  if (fileReady(face.path)) {
    log.log(`✅ Шрифт карточек (${face.label}) на месте`);
    return true;
  }

  for (const url of face.sources) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        log.warn(`⚠️  Шрифт недоступен (${response.status}): ${url}`);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < MIN_FONT_BYTES) {
        log.warn(`⚠️  Ответ слишком мал (${bytes.length} Б), пропускаю: ${url}`);
        continue;
      }
      writeFileSync(face.path, bytes);
      log.log(`✅ Шрифт карточек (${face.label}) загружен: ${Math.round(bytes.length / 1024)} КБ`);
      return true;
    } catch (error) {
      log.warn(`⚠️  Не удалось скачать шрифт: ${url} — ${error.message}`);
    }
  }
  return false;
}

export async function ensureCardFontFile({ log = console } = {}) {
  if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });

  const results = [];
  for (const face of FACES) {
    results.push({ face, ok: await downloadFace(face, log) });
  }

  const bold = results.find((entry) => entry.face.required);
  if (!bold?.ok) {
    log.warn(
      "⚠️  Основной шрифт карточек не подготовлен на сборке. Рантайм попробует "
      + "системные шрифты и повторную загрузку — карточки могут отрисоваться "
      + "без кириллицы.",
    );
    return { ok: false, cached: false };
  }

  const regular = results.find((entry) => !entry.face.required);
  if (!regular?.ok) {
    log.warn("⚠️  Обычная насыщенность недоступна — карточки отрисуются одним жирным начертанием.");
  }

  return { ok: true, cached: false, regular: Boolean(regular?.ok) };
}

// Запуск напрямую (postinstall) — не валим установку из-за сети.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await ensureCardFontFile();
  process.exit(0);
}
