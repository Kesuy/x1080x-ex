import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY,
  beginDownloadGuard,
  isDownloadGuardEnabled,
} from '../src/download-guard.js';

test('download guard marks the tab and blocks beforeunload only while active', () => {
  const dom = new JSDOM('<!doctype html><title>SVMGM-050</title><body></body>', {
    url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1',
  });
  const end = beginDownloadGuard(dom.window.document);
  assert.equal(dom.window.document.title, '⬇ 下载中 · SVMGM-050');

  const event = new dom.window.Event('beforeunload', { cancelable: true });
  assert.equal(dom.window.dispatchEvent(event), false);
  assert.equal(event.defaultPrevented, true);

  end();
  assert.equal(dom.window.document.title, 'SVMGM-050');

  const after = new dom.window.Event('beforeunload', { cancelable: true });
  assert.equal(dom.window.dispatchEvent(after), true);
  assert.equal(after.defaultPrevented, false);
  dom.window.close();
});

test('download guard reference-counts concurrent activity and restores title once', () => {
  const dom = new JSDOM('<!doctype html><title>Original</title><body></body>');
  const endFirst = beginDownloadGuard(dom.window.document);
  const endSecond = beginDownloadGuard(dom.window.document);
  assert.equal(dom.window.document.title, '⬇ 下载中 · Original');

  endFirst();
  assert.equal(dom.window.document.title, '⬇ 下载中 · Original');
  endSecond();
  assert.equal(dom.window.document.title, 'Original');
  dom.window.close();
});

test('download guard switch defaults to enabled and respects an explicit false value', () => {
  const oldGet = globalThis.GM_getValue;
  try {
    globalThis.GM_getValue = (_key, fallback) => fallback;
    assert.equal(isDownloadGuardEnabled(AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY), true);
    globalThis.GM_getValue = () => false;
    assert.equal(isDownloadGuardEnabled(AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY), false);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
  }
});
