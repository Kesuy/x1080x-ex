import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs } from '../src/core.js';
import { normalizeCodeForClipboard, copyCodeWithButtonFeedback } from '../src/clipboard.js';
import { installAgaghhhEnhancement, AGAGHHH_REAL_ACTRESS_ENABLED_KEY } from '../src/agaghhh-enhancement.js';
import { X1080X_PREVIEW_ENABLED_KEY } from '../src/preview-visibility.js';

function resourceDom() {
  return new JSDOM(`<!doctype html><html><body>
    <header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
      </div></span></div>
      <h1>FC2-PPV-4906444 示例标题</h1>
      <button id="x1080x-ex-download">下载</button>
    </header>
    <article id="first-post"><div class="post-content">
      <div class="post-text"><img class="body-image" src="https://example.com/cover.jpg"></div>
    </div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/resource01' });
}

function addPreview(document) {
  document.querySelector('#first-post .post-content').insertAdjacentHTML('beforeend',
    '<section id="x1080x-ex-agaghhh-hdblog-preview"><img data-x1080x-hdblog-preview-url="https://example.com/preview.jpg" src="https://example.com/preview.jpg"></section>');
}

test('Preview toolbar toggle persists and bulk-download excludes Preview while keeping original cover', () => {
  const dom = resourceDom();
  const values = new Map([[AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false], [X1080X_PREVIEW_ENABLED_KEY, false]]);
  const originalGet = globalThis.GM_getValue;
  const originalSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
    const doc = dom.window.document;
    const button = doc.getElementById('x1080x-ex-agaghhh-preview-toggle');
    assert.ok(button);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.deepEqual([...doc.querySelector('#x1080x-ex-resource-actions').children].map(node => node.id), [
      'x1080x-ex-download', 'x1080x-ex-agaghhh-hdblog-search',
      'x1080x-ex-agaghhh-preview-toggle', 'x1080x-ex-agaghhh-copy-code'
    ]);
    addPreview(doc);
    assert.deepEqual(buildDownloadJobs(doc).filter(j => j.kind === 'image').map(j => j.url), [
      'https://example.com/cover.jpg'
    ]);
    button.click();
    assert.equal(values.get(X1080X_PREVIEW_ENABLED_KEY), true);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    addPreview(doc);
    assert.deepEqual(buildDownloadJobs(doc).filter(j => j.kind === 'image').map(j => j.url), [
      'https://example.com/cover.jpg', 'https://example.com/preview.jpg'
    ]);
    button.click();
    assert.equal(values.get(X1080X_PREVIEW_ENABLED_KEY), false);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(doc.getElementById('x1080x-ex-agaghhh-hdblog-preview'), null);
    assert.deepEqual(buildDownloadJobs(doc).filter(j => j.kind === 'image').map(j => j.url), [
      'https://example.com/cover.jpg'
    ]);
    addPreview(doc);
    assert.deepEqual(buildDownloadJobs(doc).filter(j => j.kind === 'image').map(j => j.url), [
      'https://example.com/cover.jpg'
    ]);
  } finally {
    if (originalGet === undefined) delete globalThis.GM_getValue; else globalThis.GM_getValue = originalGet;
    if (originalSet === undefined) delete globalThis.GM_setValue; else globalThis.GM_setValue = originalSet;
    dom.window.close();
  }
});

test('FC2 clipboard normalizer keeps only digits, non-FC2 is unchanged', async () => {
  for (const value of ['FC2-PPV-4906444', 'FC2-4906444', 'FC2PPV4906444', 'fc2 ppv 4906444', 'FC2_4906444']) {
    assert.equal(normalizeCodeForClipboard(value), '4906444', value);
  }
  for (const value of ['SVSHA-036', 'T38-042', 'DVMM-458', 'OLM-331E']) {
    assert.equal(normalizeCodeForClipboard(value), value);
  }
  const dom = new JSDOM('<!doctype html><body><button id="copy">📋</button></body>', { url: 'https://1080xin.com/' });
  const oldClipboard = globalThis.GM_setClipboard;
  const captured = [];
  globalThis.GM_setClipboard = value => captured.push(value);
  try {
    assert.equal(await copyCodeWithButtonFeedback(dom.window.document.getElementById('copy'), dom.window.document, 'FC2-PPV-4906444'), true);
    assert.deepEqual(captured, ['4906444']);
  } finally {
    if (oldClipboard === undefined) delete globalThis.GM_setClipboard; else globalThis.GM_setClipboard = oldClipboard;
    dom.window.close();
  }
});
