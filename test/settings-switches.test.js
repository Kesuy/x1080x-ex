import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_CROSS_SEARCH_ENABLED_KEY,
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  installAgaghhhEnhancement,
  openX1080xSettingsPanel,
} from '../src/agaghhh-enhancement.js';
import {
  HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY,
  HDBLOG_BATCH_OPEN_ENABLED_KEY,
  HDBLOG_SEARCH_FILTER_ENABLED_KEY,
  HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY,
  installHdblogArticleEnhancement,
  openHdblogSettingsPanel,
} from '../src/hdblog-article.js';
import { applyHdblogSearchEnhancement } from '../src/hdblog-search.js';

function withGm(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try { return callback(); }
  finally {
    if (oldGet === undefined) delete globalThis.GM_getValue; else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue; else globalThis.GM_setValue = oldSet;
  }
}

function hdblogArticleDom() {
  return new JSDOM(`<!doctype html><html><body class="single single-post">
    <main id="genesis-content"><article class="entry">
      <header class="entry-header"><h1 class="entry-title">SVMGM-050 Sample</h1><p class="entry-meta">date</p></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article></main>
  </body></html>`, { url: 'https://hdblog.me/964139/svmgm-050/' });
}

test('x1080x settings exposes every independent agaghhh feature switch', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  withGm(new Map(), () => {
    const panel = openX1080xSettingsPanel(dom.window.document);
    for (const key of ['batch-open', 'download', 'cross-search', 'hdblog-preview', 'real-actress']) {
      assert.ok(panel.querySelector(`[data-setting="${key}"]`), key);
    }
  });
});

test('batch-open interval settings load custom values and restore current defaults', () => {
  const agaghhhDom = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const agaghhhValues = new Map([
    ['x1080x-ex:agaghhh-batch-open-interval-min-ms', 2200],
    ['x1080x-ex:agaghhh-batch-open-interval-max-ms', 4400],
  ]);
  withGm(agaghhhValues, () => {
    const panel = openX1080xSettingsPanel(agaghhhDom.window.document);
    const minInput = panel.querySelector('[data-setting="batch-open-interval-min"]');
    const maxInput = panel.querySelector('[data-setting="batch-open-interval-max"]');
    assert.equal(minInput.value, '2.2');
    assert.equal(maxInput.value, '4.4');
    panel.querySelector('[data-action="reset-batch-open-interval"]').click();
    assert.equal(minInput.value, '1.8');
    assert.equal(maxInput.value, '3.5');
  });

  const hdblogDom = hdblogArticleDom();
  const hdblogValues = new Map([
    ['x1080x-ex:hdblog-batch-open-interval-min-ms', 1200],
    ['x1080x-ex:hdblog-batch-open-interval-max-ms', 2400],
  ]);
  withGm(hdblogValues, () => {
    const panel = openHdblogSettingsPanel(hdblogDom.window.document);
    const minInput = panel.querySelector('[data-setting="batch-open-interval-min"]');
    const maxInput = panel.querySelector('[data-setting="batch-open-interval-max"]');
    assert.equal(minInput.value, '1.2');
    assert.equal(maxInput.value, '2.4');
    panel.querySelector('[data-action="reset-batch-open-interval"]').click();
    assert.equal(minInput.value, '0.8');
    assert.equal(maxInput.value, '1.6');
  });
});

test('agaghhh cross-search remains available when download enhancement is off', () => {
  const dom = new JSDOM(`<!doctype html><body><div class="vwthd">
    <span id="thread_subject">SVMGM-050 Sample</span><button id="x1080x-ex-download">⬇</button>
  </div></body>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1' });
  const values = new Map([
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, false],
    [AGAGHHH_CROSS_SEARCH_ENABLED_KEY, true],
    [AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);
  withGm(values, () => installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {}));
  assert.equal(dom.window.document.getElementById('x1080x-ex-download'), null);
  assert.ok(dom.window.document.getElementById('x1080x-ex-agaghhh-hdblog-search'));
});

test('hdblog settings exposes layout, cross-search, preview, batch-open and search-filter switches', () => {
  const dom = hdblogArticleDom();
  withGm(new Map(), () => {
    const panel = openHdblogSettingsPanel(dom.window.document);
    for (const key of ['layout-enabled', 'show-downloads', 'show-image-download', 'cross-search', 'expand-preview', 'batch-open', 'search-filter']) {
      assert.ok(panel.querySelector(`[data-setting="${key}"]`), key);
    }
  });
});

test('hdblog cross-search and image-download buttons can be controlled independently', () => {
  const dom = hdblogArticleDom();
  const values = new Map([
    [HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, false],
    [HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, true],
    ['x1080x-ex:hdblog-show-image-download-button', false],
  ]);
  withGm(values, () => installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {}));
  assert.equal(dom.window.document.getElementById('x1080x-ex-hdblog-image-download'), null);
  assert.ok(dom.window.document.getElementById('x1080x-ex-hdblog-agaghhh-search'));
});

test('disabling hdblog search filtering leaves search results untouched', () => {
  const dom = new JSDOM(`<!doctype html><body><main id="genesis-content">
    <article class="entry"><h2 class="entry-title"><a href="/1/a/">モザイク破壊 A</a></h2></article>
    <article class="entry"><h2 class="entry-title"><a href="/2/b/">SVMGM-050 B</a></h2></article>
  </main></body>`, { url: 'https://hdblog.me/?s=SVMGM-050' });
  const values = new Map([[HDBLOG_SEARCH_FILTER_ENABLED_KEY, false]]);
  withGm(values, () => {
    const result = applyHdblogSearchEnhancement(dom.window);
    assert.equal(result.redirectTarget, '');
  });
  assert.equal(dom.window.document.querySelectorAll('article.entry').length, 2);
});

test('new hdblog switches default to enabled except layout which preserves legacy blank-width behavior', () => {
  const dom = hdblogArticleDom();
  const values = new Map();
  withGm(values, () => {
    const panel = openHdblogSettingsPanel(dom.window.document);
    assert.equal(panel.querySelector('[data-setting="layout-enabled"]').checked, false);
    assert.equal(panel.querySelector('[data-setting="cross-search"]').checked, true);
    assert.equal(panel.querySelector('[data-setting="batch-open"]').checked, true);
    assert.equal(panel.querySelector('[data-setting="search-filter"]').checked, true);
  });
  assert.equal(HDBLOG_BATCH_OPEN_ENABLED_KEY, 'x1080x-ex:hdblog-batch-open-enabled');
});
