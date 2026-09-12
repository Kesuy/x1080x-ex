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

function torrentArrayBuffer() {
  return TORRENT_BYTES.buffer.slice(
    TORRENT_BYTES.byteOffset,
    TORRENT_BYTES.byteOffset + TORRENT_BYTES.byteLength
  );
}

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
    queueMicrotask(() => details.onload({ status: 200, response: torrentArrayBuffer() }));
  };

  const result = await requestTorrentBytes(
    `magnet:?xt=urn:btih:${TORRENT_HASH}&dn=test`,
    gmRequest
  );

  assert.equal(result.hash, TORRENT_HASH);
  assert.equal(result.torrentName, 'My Movie!');
  assert.equal(result.sourceUrl, `https://torrage.info/torrent.php?h=${TORRENT_HASH}`);
  assert.deepEqual([...result.bytes], [...TORRENT_BYTES]);
  assert.deepEqual(requested, [
    `https://itorrents.net/torrent/${TORRENT_HASH}.torrent`,
    `https://torrage.info/torrent.php?h=${TORRENT_HASH}`,
  ]);
});

test('公共缓存全部失败后通过 qBittorrent 5.2 metadata API 导出 torrent', async () => {
  const magnet = `magnet:?xt=urn:btih:${TORRENT_HASH}&dn=My%20Movie`;
  const requests = [];
  let exportCount = 0;

  const gmRequest = (details) => {
    requests.push(details);
    const url = new URL(details.url);

    if (['itorrents.net', 'torrage.info', 'itorrents.org', 'btcache.me'].includes(url.hostname)) {
      queueMicrotask(() => details.onload({ status: 404, response: new ArrayBuffer(0) }));
      return;
    }
    if (url.pathname === '/api/v2/auth/login') {
      assert.equal(details.method, 'POST');
      queueMicrotask(() => details.onload({ status: 204, responseText: '' }));
      return;
    }
    if (url.pathname === '/api/v2/torrents/export') {
      exportCount += 1;
      queueMicrotask(() => details.onload({ status: 404, response: new ArrayBuffer(0) }));
      return;
    }
    if (url.pathname === '/api/v2/torrents/fetchMetadata') {
      assert.equal(details.method, 'POST');
      assert.match(details.headers['Content-Type'], /application\/x-www-form-urlencoded/i);
      assert.equal(new URLSearchParams(details.data).get('source'), magnet);
      queueMicrotask(() => details.onload({ status: 200, responseText: '{}' }));
      return;
    }
    if (url.pathname === '/api/v2/torrents/saveMetadata') {
      assert.equal(details.method, 'GET');
      assert.equal(url.searchParams.get('source'), magnet);
      queueMicrotask(() => details.onload({ status: 200, response: torrentArrayBuffer() }));
      return;
    }
    throw new Error(`unexpected request: ${details.method} ${details.url}`);
  };

  const result = await requestTorrentBytes(magnet, gmRequest, {
    enabled: true,
    url: 'http://192.0.2.10:8080',
    username: 'tester',
    password: 'secret',
    metadataTimeoutMs: 10000,
  });

  assert.equal(result.hash, TORRENT_HASH);
  assert.equal(result.torrentName, 'My Movie!');
  assert.match(result.sourceUrl, /^http:\/\/192\.0\.2\.10:8080\/api\/v2\/torrents\/fetchMetadata$/);
  assert.deepEqual([...result.bytes], [...TORRENT_BYTES]);
  assert.equal(exportCount, 2);
  assert.ok(requests.some((request) => new URL(request.url).pathname === '/api/v2/torrents/saveMetadata'));
});
