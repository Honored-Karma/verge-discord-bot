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

// Минимальный размер: усечённый или ошибочный ответ CDN не должен выглядеть
// как валидный шрифт.
const MIN_FONT_BYTES = 200_000;

const SOURCES = [
  "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf",
  "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf",
];

export function cardFontReady() {
  try {
    return existsSync(CARD_FONT_PATH) && statSync(CARD_FONT_PATH).size >= MIN_FONT_BYTES;
  } catch {
    return false;
  }
}

export async function ensureCardFontFile({ log = console } = {}) {
  if (cardFontReady()) {
    log.log(`✅ Шрифт карточек на месте: ${CARD_FONT_PATH}`);
    return { ok: true, cached: true };
  }

  if (!existsSync(FONT_DIR)) mkdirSync(FONT_DIR, { recursive: true });

  for (const url of SOURCES) {
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
      writeFileSync(CARD_FONT_PATH, bytes);
      log.log(`✅ Шрифт карточек загружен (${Math.round(bytes.length / 1024)} КБ): ${url}`);
      return { ok: true, cached: false };
    } catch (error) {
      log.warn(`⚠️  Не удалось скачать шрифт: ${url} — ${error.message}`);
    }
  }

  log.warn(
    "⚠️  Шрифт карточек не подготовлен на сборке. Рантайм попробует системные "
    + "шрифты и повторную загрузку — карточки могут отрисоваться без кириллицы.",
  );
  return { ok: false, cached: false };
}

// Запуск напрямую (postinstall) — не валим установку из-за сети.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await ensureCardFontFile();
  process.exit(0);
}
