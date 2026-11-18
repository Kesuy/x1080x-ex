import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_LEDGER_PREFIX,
  HISTORY_LEDGER_REVISION_KEY,
  durableVisitMarkerKey,
  listedDurableVisitIds,
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
