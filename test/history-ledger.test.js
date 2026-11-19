import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LEDGER_PREFIX,
  HISTORY_LEDGER_REVISION_KEY,
  durableVisitMarkerKey,
  listedDurableVisitIds,
  readRecentHistoryArray,
  wordpressPostIdFromUrl,
} from '../src/history-ledger.js';

test('only valid thread IDs get independent durable keys', () => {
  for (const id of ['tid:1234', 'resource:05aBZ98', 'post:1013750', 'url:/an-article/?foo=1']) {
    assert.equal(durableVisitMarkerKey(id), HISTORY_LEDGER_PREFIX + id);
  }
  for (const id of ['', 'tid:abc', 'resource:../../escape', 'code:FNS-267',
    'title:sample', 'url:javascript:bad', 'url:/bad\nkey']) {
    assert.equal(durableVisitMarkerKey(id), '');
  }
});

test('key enumeration deduplicates independent entries and rejects unrelated keys', () => {
  assert.deepEqual(listedDurableVisitIds([
    HISTORY_LEDGER_PREFIX + 'tid:4',
    HISTORY_LEDGER_PREFIX + 'resource:One',
    HISTORY_LEDGER_PREFIX + 'resource:One',
    HISTORY_LEDGER_PREFIX + 'code:FNS-267',
    HISTORY_LEDGER_REVISION_KEY,
    'x1080x-ex:hdblog-visited-id-v2:post:123',
    null,
  ]), ['tid:4', 'resource:One']);
  assert.deepEqual(listedDurableVisitIds(null), []);
});

test('reads legacy JavClub arrays serialized as JSON strings', () => {
  assert.deepEqual(readRecentHistoryArray('["post:11","post:12"]'), ['post:11', 'post:12']);
  assert.deepEqual(readRecentHistoryArray('broken JSON'), []);
  assert.deepEqual(readRecentHistoryArray(['post:11', null, 99]), ['post:11']);
});

test('canonical WordPress URLs resolve the same JavClub post ID', () => {
  const variants = [
    'https://hdblog.me/1013750/roe-573/',
    'https://javclub.me/1013750.html',
    'https://www.javclub.me/1013750/',
    'https://javclub.me/1013750',
    'https://javclub.me/1013750/roe-573.html',
    'https://javclub.me/?p=1013750',
  ];
  for (const url of variants) assert.equal(wordpressPostIdFromUrl(url), '1013750', url);
  for (const url of [
    'https://javclub.me/category/av-censored/',
    'https://javclub.me/?page_id=1013750',
    'https://javclub.me/?p=not-a-post',
    'https://javclub.me/1013750/slug/more/',
    'https://javclub.me/1013750?test=abc',
    'javascript:alert(1)',
  ]) {
    // Numeric permalink query strings must not change the identity.
    if (url.includes('/1013750?')) assert.equal(wordpressPostIdFromUrl(url), '1013750');
    else assert.equal(wordpressPostIdFromUrl(url), '', url);
  }
});
