import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_COPY_CODE_ENABLED_KEY,
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  installAgaghhhEnhancement,
  openX1080xSettingsPanel,
} from '../src/agaghhh-enhancement.js';
import {
  HDBLOG_SHOW_COPY_CODE_BUTTON_KEY,
  installHdblogArticleEnhancement,
  openHdblogSettingsPanel,
} from '../src/hdblog-article.js';

async function withGlobals(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldClipboard = globalThis.GM_setClipboard;
  const copied = [];
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setClipboard = (text, type) => copied.push({ text, type });
  try {
    await callback(copied);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldClipboard === undefined) delete globalThis.GM_setClipboard;
    else globalThis.GM_setClipboard = oldClipboard;
  }
}

function agaghhhDom() {
  return new JSDOM(`<!doctype html><html><head><title>SVMGM-050</title></head><body>
    <div class="vwthd"><span id="thread_subject">SVMGM-050 Sample</span>
      <button id="x1080x-ex-download">⬇</button>
    </div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1062893' });
}

function hdblogDom() {
  return new JSDOM(`<!doctype html><html><body class="single single-post">
    <main id="genesis-content"><article class="entry">
      <header class="entry-header"><h1 class="entry-title">SVMGM-050 Sample</h1></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article></main>
  </body></html>`, { url: 'https://hdblog.me/964139/svmgm-050/' });
}

test('agaghhh inserts copy-code button between search and download and copies the parsed code', async () => {
  const dom = agaghhhDom();
  const values = new Map([
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, true],
    [AGAGHHH_COPY_CODE_ENABLED_KEY, true],
    [AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);

  await withGlobals(values, async (copied) => {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
    const download = dom.window.document.querySelector('#x1080x-ex-download');
    const copy = dom.window.document.querySelector('#x1080x-ex-agaghhh-copy-code');
    const search = dom.window.document.querySelector('#x1080x-ex-agaghhh-hdblog-search');
    assert.ok(download);
    assert.ok(copy);
    assert.ok(search);
    assert.equal(download.nextElementSibling, copy);
    assert.equal(copy.nextElementSibling, search);
    assert.equal(copy.textContent, '📋');
    assert.equal(search.style.margin, '0px 0px 6px 6px');
    assert.equal(copy.style.margin, '0px 0px 6px 6px');

    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(copied, [{ text: 'SVMGM-050', type: 'text' }]);
    assert.equal(copy.textContent, '✓');
  });
  dom.window.close();
});

test('agaghhh copy-code switch removes only the copy button', async () => {
  const dom = agaghhhDom();
  const values = new Map([
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, true],
    [AGAGHHH_COPY_CODE_ENABLED_KEY, false],
    [AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);

  await withGlobals(values, async () => {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
    assert.equal(dom.window.document.querySelector('#x1080x-ex-agaghhh-copy-code'), null);
    assert.ok(dom.window.document.querySelector('#x1080x-ex-download'));
    assert.ok(dom.window.document.querySelector('#x1080x-ex-agaghhh-hdblog-search'));
  });
  dom.window.close();
});

test('hdblog inserts copy-code button between download and search and copies the article code', async () => {
  const dom = hdblogDom();
  const values = new Map([[HDBLOG_SHOW_COPY_CODE_BUTTON_KEY, true]]);

  await withGlobals(values, async (copied) => {
    installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {});
    const download = dom.window.document.querySelector('#x1080x-ex-hdblog-image-download');
    const copy = dom.window.document.querySelector('#x1080x-ex-hdblog-copy-code');
    const search = dom.window.document.querySelector('#x1080x-ex-hdblog-agaghhh-search');
    assert.ok(download);
    assert.ok(copy);
    assert.ok(search);
    assert.equal(download.nextElementSibling, copy);
    assert.equal(copy.nextElementSibling, search);
    assert.equal(download.style.margin, '0px 0px 4px 8px');
    assert.equal(copy.style.margin, '0px 0px 4px 8px');
    assert.equal(search.style.margin, '0px 0px 4px 8px');

    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(copied, [{ text: 'SVMGM-050', type: 'text' }]);
    assert.equal(copy.textContent, '✓');
  });
  dom.window.close();
});

test('hdblog copy-code switch removes only the copy button', async () => {
  const dom = hdblogDom();
  const values = new Map([[HDBLOG_SHOW_COPY_CODE_BUTTON_KEY, false]]);

  await withGlobals(values, async () => {
    installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {});
    assert.equal(dom.window.document.querySelector('#x1080x-ex-hdblog-copy-code'), null);
    assert.ok(dom.window.document.querySelector('#x1080x-ex-hdblog-image-download'));
    assert.ok(dom.window.document.querySelector('#x1080x-ex-hdblog-agaghhh-search'));
  });
  dom.window.close();
});

test('both site settings panels expose copy-code switches enabled by default', async () => {
  const agaghhh = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const hdblog = new JSDOM('<!doctype html><body></body>', { url: 'https://hdblog.me/' });

  await withGlobals(new Map(), async () => {
    const agaghhhOverlay = openX1080xSettingsPanel(agaghhh.window.document);
    const hdblogOverlay = openHdblogSettingsPanel(hdblog.window.document);
    const agaghhhSwitch = agaghhhOverlay.querySelector('[data-setting="copy-code"]');
    const hdblogSwitch = hdblogOverlay.querySelector('[data-setting="copy-code"]');
    assert.ok(agaghhhSwitch);
    assert.ok(hdblogSwitch);
    assert.equal(agaghhhSwitch.checked, true);
    assert.equal(hdblogSwitch.checked, true);
  });

  agaghhh.window.close();
  hdblog.window.close();
});
