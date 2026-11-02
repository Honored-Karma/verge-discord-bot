import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkNativeCanvas } from '../scripts/check-native-deps.mjs';

test('canvas lockfile includes every declared native platform, not only the developer OS', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const canvas = lock.packages['node_modules/@napi-rs/canvas'];
  assert.ok(canvas?.optionalDependencies, 'Canvas must declare native dependencies');
  for (const [name, version] of Object.entries(canvas.optionalDependencies)) {
    const binary = lock.packages[`node_modules/${name}`];
    assert.ok(binary, `Missing ${name}; npm can prune foreign-platform entries when updating on Windows`);
    assert.equal(binary.version, version, `${name} must match the canvas wrapper`);
    assert.equal(binary.optional, true, `${name} must remain platform-selectable`);
    assert.ok(binary.os?.length && binary.cpu?.length, `${name} must declare its platform`);
    assert.match(binary.integrity, /^sha512-/);
  }
});

test('native canvas loads and renders PNG on the current runtime platform', async () => {
  const result = await checkNativeCanvas();
  assert.equal(result.platform, process.platform);
  assert.equal(result.arch, process.arch);
  assert.ok(result.bytes > 8);
});
