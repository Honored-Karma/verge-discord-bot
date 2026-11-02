import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fetchImageBuffer } from './avatarStorage.js';
import { TupperError } from './tupperErrors.js';

export async function cropTupperImage(source, rectangle, client = null) {
  const { x, y, width, height } = rectangle;
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width < 1 || height < 1
    || Math.max(x, y, width, height) > 16384) throw new TupperError('Кадрирование: укажите целые координаты от 0 и размеры от 1 до 16384 пикселей.');
  const { buffer } = await fetchImageBuffer(source, client);
  const image = await loadImage(buffer);
  if (x + width > image.width || y + height > image.height) throw new TupperError(`Область выходит за изображение ${image.width} × ${image.height}. Измените координаты или размер.`);
  const scale = Math.min(1, 2048 / Math.max(width, height));
  const canvas = createCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toBuffer('image/png');
}
