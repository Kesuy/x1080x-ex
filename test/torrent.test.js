import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  extractBtih,
  normalizeBtih,
  parseTorrentName,
  requestTorrentBytes,
  verifyTorrentHash,
} from '../src/torrent.js';

const HEX_HASH = '0123456789ABCDEF0123456789ABCDEF01234567';
const BASE32_HASH = 'AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH';
const INFO_BYTES = new TextEncoder().encode('d4:name9:My Movie!e');
const TORRENT_BYTES = new TextEncoder().encode('d4:infod4:name9:My Movie!ee');
const TORRENT_HASH = createHash('sha1').update(INFO_BYTES).digest('hex').toUpperCase();

test('从十六进制和 Base32 磁力链提取同一 BTIH', () => {
  assert.equal(normalizeBtih(BASE32_HASH), HEX_HASH);
  assert.equal(extractBtih(`magnet:?xt=urn:btih:${BASE32_HASH}&dn=test`), HEX_HASH);
  assert.equal(extractBtih(`magnet:?xt=urn:btih:${HEX_HASH.toLowerCase()}`), HEX_HASH);
});

test('解析 torrent 名称并校验 infohash', () => {
  assert.equal(parseTorrentName(TORRENT_BYTES), 'My Movie!');
  assert.equal(verifyTorrentHash(TORRENT_BYTES, TORRENT_HASH), true);
  assert.throws(() => verifyTorrentHash(TORRENT_BYTES, HEX_HASH), /infohash 不匹配/);
});

test('缓存源失败时回退并只返回通过 BTIH 校验的 torrent', async () => {
  const requested = [];
  const gmRequest = (details) => {
    requested.push(details.url);
    if (requested.length === 1) {
      queueMicrotask(() => details.onload({ status: 404, response: new ArrayBuffer(0) }));
      return;
    }
    queueMicrotask(() => details.onload({
      status: 200,
      response: TORRENT_BYTES.buffer.slice(
        TORRENT_BYTES.byteOffset,
        TORRENT_BYTES.byteOffset + TORRENT_BYTES.byteLength
      ),
    }));
  };

  const result = await requestTorrentBytes(
    `magnet:?xt=urn:btih:${TORRENT_HASH}&dn=test`,
    gmRequest
  );

  assert.equal(result.hash, TORRENT_HASH);
  assert.equal(result.torrentName, 'My Movie!');
  assert.equal(result.sourceUrl, `https://torrage.info/torrent/${TORRENT_HASH}.torrent`);
  assert.deepEqual([...result.bytes], [...TORRENT_BYTES]);
  assert.deepEqual(requested, [
    `https://itorrents.net/torrent/${TORRENT_HASH}.torrent`,
    `https://torrage.info/torrent/${TORRENT_HASH}.torrent`,
  ]);
});
