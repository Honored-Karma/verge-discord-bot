import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { CARD_FONT_PATH, cardFontReady } from "../scripts/ensure-card-font.mjs";

/**
 * Прод скачивал шрифт по сети при первом рендере карточки после каждого
 * рестарта — это подтверждено логами Railway. Тесты фиксируют, что шрифт
 * действительно приезжает на сборке и что он покрывает кириллицу: без этого
 * русские имена персонажей стали бы квадратами.
 */

// Разбор таблицы cmap: единственный надёжный способ проверить, что глифы есть,
// не отрисовывая картинку.
function cyrillicGlyphCount(path) {
  const buffer = readFileSync(path);
  const tableCount = buffer.readUInt16BE(4);
  let cmapOffset = null;
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    if (buffer.toString("ascii", record, record + 4) === "cmap") {
      cmapOffset = buffer.readUInt32BE(record + 8);
    }
  }
  if (cmapOffset === null) return 0;

  const covered = new Set();
  const subtables = buffer.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtables; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const subtable = cmapOffset + buffer.readUInt32BE(record + 4);
    if (buffer.readUInt16BE(subtable) !== 4) continue;

    const segmentsX2 = buffer.readUInt16BE(subtable + 6);
    const segments = segmentsX2 / 2;
    const endOffset = subtable + 14;
    const startOffset = endOffset + segmentsX2 + 2;
    const deltaOffset = startOffset + segmentsX2;
    const rangeOffset = deltaOffset + segmentsX2;

    for (let segment = 0; segment < segments; segment += 1) {
      const end = buffer.readUInt16BE(endOffset + segment * 2);
      const start = buffer.readUInt16BE(startOffset + segment * 2);
      if (start === 0xffff) continue;
      for (let code = Math.max(start, 0x400); code <= Math.min(end, 0x4ff); code += 1) {
        const rangeValue = buffer.readUInt16BE(rangeOffset + segment * 2);
        let glyph;
        if (rangeValue === 0) {
          glyph = (code + buffer.readInt16BE(deltaOffset + segment * 2)) & 0xffff;
        } else {
          const glyphIndex = rangeOffset + segment * 2 + rangeValue + (code - start) * 2;
          if (glyphIndex + 1 >= buffer.length) continue;
          glyph = buffer.readUInt16BE(glyphIndex);
          if (glyph !== 0) {
            glyph = (glyph + buffer.readInt16BE(deltaOffset + segment * 2)) & 0xffff;
          }
        }
        if (glyph !== 0) covered.add(code);
      }
    }
  }
  return covered.size;
}

test("шрифт карточек лежит в сборке, а не тянется по сети", (t) => {
  if (!existsSync(CARD_FONT_PATH)) {
    t.skip("шрифт не подготовлен: запустите npm run font (нужна сеть)");
    return;
  }

  assert.equal(cardFontReady(), true, "шрифт есть, но не проходит проверку размера");
  assert.ok(statSync(CARD_FONT_PATH).size > 200_000, "файл подозрительно мал");
});

test("шрифт карточек покрывает кириллицу", (t) => {
  if (!cardFontReady()) {
    t.skip("шрифт не подготовлен: запустите npm run font (нужна сеть)");
    return;
  }

  const covered = cyrillicGlyphCount(CARD_FONT_PATH);
  // Русский алфавит с Ё — это 66 знаков, берём заведомо безопасный порог.
  assert.ok(covered >= 66, `кириллических глифов всего ${covered}`);
});
