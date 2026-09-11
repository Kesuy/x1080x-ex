import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_BATCH_OPEN_ENABLED_KEY,
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  appendActressToTitleText,
  extractThreadPerformerField,
  fetchRealActressFromAvWiki,
  findAvWikiResultUrl,
  installAgaghhhEnhancement,
  openX1080xSettingsPanel,
  parseAvWikiActressesFromDocument,
} from '../src/agaghhh-enhancement.js';

function threadDom(performer = '') {
  return new JSDOM(`<!doctype html><html><head><title>BLOR-306</title></head><body>
    <div id="postlist">
      <div id="post_123">
        <div id="postmessage_123" class="t_f">番号：BLOR-306\n出演者：${performer}\n発売日：2026-08-22</div>
      </div>
    </div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1062893' });
}

function withGmValues(values, callback) {
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  try {
    return callback();
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
  }
}

test('detects an empty 出演者 field and leaves a populated field alone', () => {
  const empty = extractThreadPerformerField(threadDom('').window.document);
  assert.deepEqual(empty, { found: true, value: '' });

  const populated = extractThreadPerformerField(threadDom('既知演员').window.document);
  assert.deepEqual(populated, { found: true, value: '既知演员' });
});

test('finds the exact av-wiki result URL for a code', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <article><h2><a href="https://av-wiki.net/blor-305/">BLOR-305 other</a></h2></article>
    <article><h2><a href="https://av-wiki.net/blor-306/">BLOR-306 target</a></h2></article>
  </body>`, { url: 'https://av-wiki.net/?s=BLOR-306' });
  assert.equal(findAvWikiResultUrl(dom.window.document, 'BLOR-306'), 'https://av-wiki.net/blor-306/');
});

test('parses AV女優名 from a structured av-wiki detail page', () => {
  const dom = new JSDOM(`<!doctype html><body><article>
    <h1>BLOR-306 sample</h1>
    <table><tbody>
      <tr><th>メーカー</th><td>ブロッコリー</td></tr>
      <tr><th>AV女優名</th><td><a href="/actress/sakurano-momo/">桜野桃</a></td></tr>
      <tr><th>メーカー品番</th><td>BLOR-306</td></tr>
    </tbody></table>
  </article></body>`);
  assert.equal(parseAvWikiActressesFromDocument(dom.window.document, 'BLOR-306'), '桜野桃');
});

test('searches av-wiki then follows the matching detail page', async () => {
  const browser = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    if (options.url.includes('?s=BLOR-306')) {
      options.onload({
        status: 200,
        responseText: '<!doctype html><body><article><h2><a href="https://av-wiki.net/blor-306/">BLOR-306 sample</a></h2></article></body>',
      });
      return;
    }
    options.onload({
      status: 200,
      responseText: '<!doctype html><body><article><h1>BLOR-306</h1><table><tr><th>AV女優名</th><td><a href="/actor/momo/">桜野桃</a></td></tr></table></article></body>',
    });
  };

  const actress = await fetchRealActressFromAvWiki('BLOR-306', gmRequest, browser.window.document);
  assert.equal(actress, '桜野桃');
  assert.deepEqual(requested, [
    'https://av-wiki.net/?s=BLOR-306',
    'https://av-wiki.net/blor-306/',
  ]);
});

test('appends the actress once without disturbing the existing title', () => {
  const title = 'BLOR-306 れそう 酒とチポが大好きな塾講師おねえさん 陽ビッチが絶倫巨根にバコ責めされ、アヘトロ顔でイキ墮ちる';
  const expected = `${title} 桜野桃`;
  assert.equal(appendActressToTitleText(title, '桜野桃'), expected);
  assert.equal(appendActressToTitleText(expected, '桜野桃'), expected);
});

test('x1080x settings panel is independent from hdblog and exposes four granular switches', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  withGmValues(new Map(), () => {
    const overlay = openX1080xSettingsPanel(dom.window.document);
    assert.ok(overlay);
    assert.equal(overlay.querySelector('h2')?.textContent, 'x1080x 设置');
    assert.ok(overlay.querySelector('[data-setting="batch-open"]'));
    assert.ok(overlay.querySelector('[data-setting="download"]'));
    assert.ok(overlay.querySelector('[data-setting="hdblog-preview"]'));
    assert.ok(overlay.querySelector('[data-setting="real-actress"]'));
    assert.equal(overlay.textContent.includes('文章主内容区宽度'), false);
  });
});

test('batch-open, download and real-actress switches do not disable each other', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="x1080x-ex-download">download</button>
    <button id="x1080x-ex-open-page">batch</button>
    <div id="x1080x-ex-open-page-toolbar"></div>
  </body>`, { url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=1' });

  const values = new Map([
    [AGAGHHH_BATCH_OPEN_ENABLED_KEY, false],
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, true],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);
  withGmValues(values, () => {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
  });

  assert.equal(dom.window.document.getElementById('x1080x-ex-open-page'), null);
  assert.equal(dom.window.document.getElementById('x1080x-ex-open-page-toolbar'), null);
  assert.ok(dom.window.document.getElementById('x1080x-ex-download'));
  assert.equal(
    dom.window.document.getElementById('x1080x-ex-download')?.hasAttribute('data-x1080x-real-actress-bound'),
    false
  );
});

test('turning off download enhancement does not remove the batch-open feature', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="x1080x-ex-download">download</button>
    <button id="x1080x-ex-open-page">batch</button>
  </body>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1062893' });

  const values = new Map([
    [AGAGHHH_BATCH_OPEN_ENABLED_KEY, true],
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, true],
  ]);
  withGmValues(values, () => {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
  });

  assert.equal(dom.window.document.getElementById('x1080x-ex-download'), null);
  assert.ok(dom.window.document.getElementById('x1080x-ex-open-page'));
});
