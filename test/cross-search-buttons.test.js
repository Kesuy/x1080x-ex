import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  buildAgaghhhSearchUrl,
  hdblogAgaghhhSearchKeyword,
  installHdblogArticleEnhancement,
} from '../src/hdblog-article.js';
import {
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  buildHdblogSearchUrlForThreadCode,
  installAgaghhhEnhancement,
} from '../src/agaghhh-enhancement.js';

function withGlobals(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldOpen = globalThis.GM_openInTab;
  const opened = [];
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });
  try {
    callback(opened);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldOpen === undefined) delete globalThis.GM_openInTab;
    else globalThis.GM_openInTab = oldOpen;
  }
}

test('hdblog builds agaghhh search URLs and strips uncensored studio names', () => {
  assert.equal(hdblogAgaghhhSearchKeyword('SVMGM-050'), 'SVMGM-050');
  assert.equal(hdblogAgaghhhSearchKeyword('1pondo 121125_001'), '121125_001');
  assert.equal(
    buildAgaghhhSearchUrl('SVMGM-050'),
    'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SVMGM-050&orderby=lastpost&ascdesc=desc'
  );
  assert.equal(
    buildAgaghhhSearchUrl('1pondo 121125_001'),
    'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=121125_001&orderby=lastpost&ascdesc=desc'
  );
});

test('hdblog article shows a search icon beside download and opens agaghhh search', () => {
  const dom = new JSDOM(`<!doctype html><html><body class="single single-post">
    <main id="genesis-content"><article class="entry">
      <header class="entry-header"><h1 class="entry-title">SVMGM-050 Sample</h1><p class="entry-meta">date</p></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article></main>
  </body></html>`, { url: 'https://hdblog.me/964139/svmgm-050/' });

  withGlobals(new Map(), (opened) => {
    installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {});
    const download = dom.window.document.querySelector('#x1080x-ex-hdblog-image-download');
    const search = dom.window.document.querySelector('#x1080x-ex-hdblog-agaghhh-search');
    assert.ok(download);
    assert.ok(search);
    assert.equal(search.textContent, '🔍');
    assert.equal(search.getAttribute('aria-label'), '在 agaghhh.cc 搜索当前番号');
    search.click();
    assert.equal(opened[0]?.url, 'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SVMGM-050&orderby=lastpost&ascdesc=desc');
  });
});

test('agaghhh builds hdblog URLs with normal and uncensored thread codes', () => {
  assert.equal(buildHdblogSearchUrlForThreadCode('SVMGM-050'), 'http://hdblog.me/?s=SVMGM-050');
  assert.equal(buildHdblogSearchUrlForThreadCode('1PON-121125_001'), 'http://hdblog.me/?s=121125_001');
  assert.equal(buildHdblogSearchUrlForThreadCode('CARIB-092425-001'), 'http://hdblog.me/?s=092425-001');
});

test('agaghhh thread shows a search icon beside download and opens hdblog search', () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>121125_001-1PON</title></head><body>
    <div class="vwthd"><span id="thread_subject">121125_001-1PON [BT](無碼) 一本道 M癡女 冨樫美緒</span>
      <button id="x1080x-ex-download">⬇</button>
    </div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424' });

  const values = new Map([
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, true],
    [AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);
  withGlobals(values, (opened) => {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
    const search = dom.window.document.querySelector('#x1080x-ex-agaghhh-hdblog-search');
    assert.ok(search);
    assert.equal(search.textContent, '🔍');
    assert.equal(search.getAttribute('aria-label'), '在 hdblog 搜索当前番号');
    search.click();
    assert.equal(opened[0]?.url, 'http://hdblog.me/?s=121125_001');
  });
});
