import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Load and exercise the native addon during installation, before deployment. */
export async function checkNativeCanvas() {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(2, 2);
  canvas.getContext('2d').fillRect(0, 0, 2, 2);
  const png = canvas.toBuffer('image/png');
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Canvas did not produce a valid PNG');
  }
  return { platform: process.platform, arch: process.arch, bytes: png.length };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await checkNativeCanvas();
    console.log(`✅ Native canvas готов (${result.platform}/${result.arch})`);
  } catch (error) {
    console.error(`❌ Native canvas недоступен (${process.platform}/${process.arch}). Пересоберите зависимости командой npm ci --include=optional с полным package-lock.json.`);
    console.error(error.message);
    process.exitCode = 1;
  }
}
