import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import {
  saveCharacterAvatar,
  getCharacterAvatarBuffer,
  getCharacterAvatarData,
  deleteCharacterAvatar,
  isDiscordCdnUrl,
  isExpiredDiscordCdnUrl,
} from '../utils/avatarStorage.js';
import { renderProfileCard } from '../utils/profileCard.js';
import { createExpressApp } from '../server/app.js';

// Create a small test PNG buffer
function createTestImageBuffer(color = 'blue', width = 32, height = 32) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

test('avatarStorage: save and retrieve avatar buffer and data', async () => {
  const playerId = 'test_user_avatar_1';
  const testBuffer = createTestImageBuffer('red');

  const saveRes = await saveCharacterAvatar(playerId, testBuffer);
  assert.equal(saveRes.success, true);
  assert.ok(saveRes.avatarUrl);
  assert.equal(saveRes.contentType, 'image/png');

  // Retrieve buffer
  const retrievedBuffer = await getCharacterAvatarBuffer(playerId);
  assert.ok(retrievedBuffer);
  assert.equal(Buffer.isBuffer(retrievedBuffer), true);
  assert.deepEqual(retrievedBuffer, testBuffer);

  // Retrieve data
  const retrievedData = await getCharacterAvatarData(playerId);
  assert.ok(retrievedData);
  assert.equal(retrievedData.contentType, 'image/png');
  assert.deepEqual(retrievedData.data, testBuffer);

  // Clean up
  await deleteCharacterAvatar(playerId);
  const deletedBuffer = await getCharacterAvatarBuffer(playerId);
  assert.equal(deletedBuffer, null);
});

test('avatarStorage: validation rejects invalid formats and oversized payloads', async () => {
  const playerId = 'test_invalid_avatar';

  // 1. Text bytes (not an image)
  const invalidBuffer = Buffer.from('this is not an image');
  const resInvalid = await saveCharacterAvatar(playerId, invalidBuffer);
  assert.equal(resInvalid.success, false);
  assert.match(resInvalid.error, /Некорректный формат изображения/);

  // 2. Oversized buffer (> 8 MB)
  const hugeBuffer = Buffer.alloc(9 * 1024 * 1024);
  // Give it JPEG magic bytes
  hugeBuffer[0] = 0xFF;
  hugeBuffer[1] = 0xD8;
  hugeBuffer[2] = 0xFF;
  const resHuge = await saveCharacterAvatar(playerId, hugeBuffer);
  assert.equal(resHuge.success, false);
  assert.match(resHuge.error, /превышает лимит 8 МБ/);
});

test('avatarStorage: detect and check expired Discord CDN URLs', () => {
  const validDiscordUrl = 'https://cdn.discordapp.com/attachments/123/456/test.png?ex=67c00000&is=67bee80&hm=abcdef';
  assert.equal(isDiscordCdnUrl(validDiscordUrl), true);
  assert.equal(isDiscordCdnUrl('https://example.com/image.png'), false);

  // Past timestamp: 0x60000000 = 1610612736 (year 2021)
  const expiredUrl = 'https://cdn.discordapp.com/attachments/123/456/test.png?ex=60000000&is=123&hm=abc';
  assert.equal(isExpiredDiscordCdnUrl(expiredUrl), true);

  // Far future timestamp: 0x7fffffff = 2147483647 (year 2038)
  const futureUrl = 'https://cdn.discordapp.com/attachments/123/456/test.png?ex=7fffffff&is=123&hm=abc';
  assert.equal(isExpiredDiscordCdnUrl(futureUrl), false);
});

test('renderProfileCard: renders cleanly with avatarBuffer', async () => {
  const testBuffer = createTestImageBuffer('#b209d4', 64, 64);

  const cardBuffer = await renderProfileCard({
    characterName: 'Карма Тест',
    avatarBuffer: testBuffer,
    avatarUrl: null,
    fallbackAvatarUrl: null,
    styles: [],
    attributeName: 'Гром',
    ap: 500,
    totalSP: 1200,
    apMultiplier: 100,
    spMultiplier: 100,
    krw: 150000,
    yen: 5000,
    reputation: 25,
    reputationTier: 'Известный',
    orgName: 'Verge',
    orgRank: 'A',
    slot: 1,
    playerId: 'test_card_player',
  });

  assert.ok(cardBuffer);
  assert.ok(Buffer.isBuffer(cardBuffer));
  assert.ok(cardBuffer.length > 1000);
});

test('express API: GET /api/avatar/:playerId returns avatar with cache headers', async () => {
  const playerId = 'test_express_avatar';
  const testBuffer = createTestImageBuffer('#00ff00', 32, 32);
  await saveCharacterAvatar(playerId, testBuffer);

  const app = createExpressApp();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/avatar/${playerId}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.ok(res.headers.get('etag'));
    assert.ok(res.headers.get('cache-control')?.includes('public'));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(buf, testBuffer);

    // Test ETag 304 response
    const etag = res.headers.get('etag');
    const res304 = await fetch(`http://127.0.0.1:${port}/api/avatar/${playerId}`, {
      headers: { 'If-None-Match': etag }
    });
    assert.equal(res304.status, 304);

    // Test non-existent player
    const res404 = await fetch(`http://127.0.0.1:${port}/api/avatar/non_existent_player_12345`);
    assert.equal(res404.status, 404);
  } finally {
    server.close();
    await deleteCharacterAvatar(playerId);
  }
});
