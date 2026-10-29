import test from 'node:test';
import assert from 'node:assert/strict';
import { alternateImageUrls } from '../src/image-fallbacks.js';

test('retries old hxmmdd image path using the v2 path', () => {
  assert.deepEqual(
    alternateImageUrls('https://www.hxmmdd.com/images/pics/off/2026/10/29/off_FNS-267.jpg.webp'),
    ['https://www.hxmmdd.com/images-v2/pics/off/2026/10/29/off_FNS-267.jpg.webp']
  );
});

test('retries v2 hxmmdd image path using the legacy path', () => {
  assert.deepEqual(
    alternateImageUrls('https://www.hxmmdd.com/images-v2/pics/my/2026/20261021/suji00322pl.jpg.webp'),
    ['https://www.hxmmdd.com/images/pics/my/2026/20261021/suji00322pl.jpg.webp']
  );
});

test('does not rewrite unrelated image hosts or paths', () => {
  assert.deepEqual(alternateImageUrls('https://imgfor80.me/images/2026/10/29/FNS-267_s.jpg'), []);
  assert.deepEqual(alternateImageUrls('https://www.hxmmdd.com/static/logo.webp'), []);
});
