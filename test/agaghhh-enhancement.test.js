import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs, getResolvedThreadActress, parseCurrentThreadTitle } from '../src/core.js';
import {
  AGAGHHH_BATCH_OPEN_ENABLED_KEY,
  AGAGHHH_BLOCKED_KEYWORDS_KEY,
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  AGAGHHH_SEARCH_FILTER_ENABLED_KEY,
  DEFAULT_AGAGHHH_BLOCKED_KEYWORDS,
  appendActressToTitleText,
  extractThreadPerformerField,
  fetchRealActressFromAvWiki,
  filterAgaghhhSearchResults,
  findAgaghhhSingleSearchResultUrl,
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

function searchResultsDom() {
  return new JSDOM(`<!doctype html><html><body>
    <div id="ct"><div class="slst"><ul>
      <li class="pbw" data-id="blocked-1">
        <h3 class="xs3"><a href="/forum.php?mod=viewthread&tid=1017750&highlight=PJAM-045">[115](LADA) PJAM-045 sample</a></h3>
        <p>【破解/ED2K/lada0.11.0】PJAM-045 sample</p>
        <p><a href="/forum.php?mod=forumdisplay&fid=263" class="xi1">无码破解</a></p>
      </li>
      <li class="pbw" data-id="blocked-2">
        <h3 class="xs3"><a href="/forum.php?mod=viewthread&tid=964565&highlight=PJAM-045">[115][JAVPLAYER] PJAM-045 sample</a></h3>
        <p>【破解/ED2K/Jav3.0D】PJAM-045 sample</p>
        <p><a href="/forum.php?mod=forumdisplay&fid=263" class="xi1">无码破解</a></p>
      </li>
      <li class="pbw" data-id="keep">
        <h3 class="xs3"><a href="/forum.php?mod=viewthread&tid=964537&highlight=PJAM-045">PJAM-045 [BT] sample</a></h3>
        <p>配信開始日：2025-10-15</p>
        <p><a href="/forum.php?mod=forumdisplay&fid=244" class="xi1">BT综合区</a></p>
      </li>
    </ul></div></div>
  </body></html>`, {
    url: 'https://agaghhh.cc/search.php?mod=forum&srchtxt=PJAM-045&searchsubmit=yes',
  });
}

test('agaghhh search filtering removes 无码破解 results and keeps BT综合区', () => {
  const dom = searchResultsDom();
  const result = filterAgaghhhSearchResults(
    dom.window.document,
    DEFAULT_AGAGHHH_BLOCKED_KEYWORDS.split('\n')
  );
  assert.equal(result.blocked.length, 2);
  assert.equal(result.remaining.length, 1);
  assert.equal(result.remaining[0].forum, 'BT综合区');
  assert.equal(dom.window.document.querySelectorAll('#ct .slst li.pbw').length, 1);
  assert.equal(
    findAgaghhhSingleSearchResultUrl(dom.window.document, dom.window.location),
    'https://agaghhh.cc/forum.php?mod=viewthread&tid=964537&highlight=PJAM-045'
  );
});

test('agaghhh search filtering can match summary text as well as forum name', () => {
  const dom = searchResultsDom();
  const result = filterAgaghhhSearchResults(dom.window.document, ['Jav3.0D']);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0].text, /Jav3\.0D/);
  assert.equal(result.remaining.length, 2);
});

test('detects an empty 出演者 field and leaves a populated field alone', () => {
  const empty = extractThreadPerformerField(threadDom('').window.document);
  assert.deepEqual(empty, { found: true, value: '' });

  const populated = extractThreadPerformerField(threadDom('既知演员').window.document);
  assert.deepEqual(populated, { found: true, value: '既知演员' });
});

test('DVMM-458 modern post detects empty performer even when Chromium innerText collapses lines', () => {
  const dom = new JSDOM(`<!doctype html><head><title>DVMM-458</title></head><body>
    <header class="thread-header"><h1>DVMM-458 (HD1080P)(DEEP’S)(dvmm00458)</h1></header>
    <article id="first-post"><div class="post-text"><div class="protected-text discuz-body">
      <span>配信開始日：2026-10-29
商品発売日：2026-11-02
収録時間：163分
出演者：
監督：上田キノコ
メーカー：DEEP’S
レーベル：ザ・マジックミラー
品番：dvmm00458</span>
    </div></div></article></body>`, { url: 'https://1080xin.com/resources/testDVMM458' });
  try {
    const post = dom.window.document.querySelector('.post-text');
    Object.defineProperty(post, 'innerText', {
      get: () => '配信開始日：2026-10-29 商品発売日：2026-11-02 収録時間：163分 出演者： 監督：上田キノコ メーカー：DEEP’S 品番：dvmm00458',
    });
    assert.deepEqual(extractThreadPerformerField(dom.window.document), { found: true, value: '' });
    dom.window.document.querySelector('.protected-text span').textContent =
      '収録時間：163分 出演者： 監督：上田キノコ メーカー：DEEP’S';
    assert.deepEqual(extractThreadPerformerField(dom.window.document), { found: true, value: '' });
    dom.window.document.querySelector('.protected-text span').textContent =
      '収録時間：163分 出演者：流川はる香 監督：上田キノコ';
    assert.deepEqual(extractThreadPerformerField(dom.window.document), { found: true, value: '流川はる香' });
  } finally {
    dom.window.close();
  }
});

test('empty modern performer triggers lookup before download and retains the actor suffix across async tasks', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button dock-side">收藏</button>
      </div></span></div>
      <h1>DVMM-458 (HD1080P)(DEEP’S)(dvmm00458) 作品</h1>
    </header>
    <button id="x1080x-ex-download" type="button"><svg data-icon="download"></svg></button>
    <article id="first-post"><div class="post-text"><div class="protected-text discuz-body">
      <span>配信開始日：2026-10-29
出演者：
監督：上田キノコ
品番：dvmm00458</span>
      <a href="forum.php?mod=attachment&amp;aid=abc">dvmm00458.rar</a>
    </div></div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/testDVMM458' });
  const settings = new Map([
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, true],
    ['x1080x-ex:agaghhh-hdblog-preview-enabled', false],
    ['x1080x-ex:agaghhh-cross-search-enabled', false],
    ['x1080x-ex:agaghhh-copy-code-enabled', false],
  ]);
  const requests = [];
  const downloaded = [];
  const gmRequest = (options) => {
    requests.push(options.url);
    queueMicrotask(() => options.onload({
      status: 200,
      responseText: '<!doctype html><article><h1>DVMM-458</h1><dl><dt>AV女優名</dt><dd><a>流川はる香</a><a>那賀崎ゆきね</a><a>鈴木真夕</a></dd></dl></article>',
    }));
  };
  const oldGetValue = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => settings.has(key) ? settings.get(key) : fallback;
  try {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, gmRequest);
    const button = dom.window.document.getElementById('x1080x-ex-download');
    assert.ok(button?.hasAttribute('data-x1080x-real-actress-bound'));
    button.addEventListener('click', () => downloaded.push(
      buildDownloadJobs(dom.window.document).find(job => job.kind === 'attachment')?.name
    ));
    button.click();
    assert.deepEqual(downloaded, [], 'first click must wait for actress lookup');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(requests, ['https://av-wiki.net/dvmm-458/']);
    assert.deepEqual(downloaded, ['DVMM-458 作品 流川はる香 那賀崎ゆきね 鈴木真夕.rar']);
    assert.equal(getResolvedThreadActress(dom.window.document, 'DVMM-458'),
      '流川はる香 那賀崎ゆきね 鈴木真夕');
    assert.equal(dom.window.document.querySelector('.thread-header h1').textContent,
      'DVMM-458 (HD1080P)(DEEP’S)(dvmm00458) 作品', 'React heading should remain untouched');
    assert.ok(button.querySelector('svg[data-icon="download"]'), 'lookup must restore the original SVG button');
    assert.match(parseCurrentThreadTitle(dom.window.document).cleanTitle, /鈴木真夕$/);
    button.click();
    assert.equal(requests.length, 1, 'repeated download must reuse the resolved actress');
    assert.equal(downloaded.length, 2);
  } finally {
    if (oldGetValue === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGetValue;
    dom.window.close();
  }
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

test('DVMM-458 uses the canonical AV-Wiki article and reads multiple real actresses', async () => {
  const browser = new JSDOM('<!doctype html><body></body>', { url: 'https://1080xin.com/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    options.onload({
      status: 200,
      responseText: `<!doctype html><article><h1>DVMM-458</h1><dl>
        <dt>AV女優名</dt><dd><a>流川はる香</a><a>那賀崎ゆきね</a><a>鈴木真夕</a></dd>
        <dt>メーカー品番</dt><dd>DVMM-458</dd>
      </dl></article>`,
    });
  };
  try {
    assert.equal(
      await fetchRealActressFromAvWiki('DVMM-458', gmRequest, browser.window.document),
      '流川はる香 那賀崎ゆきね 鈴木真夕'
    );
    assert.deepEqual(requested, ['https://av-wiki.net/dvmm-458/']);
  } finally {
    browser.window.close();
  }
});

test('falls back to av-wiki search when the canonical detail URL fails', async () => {
  const browser = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    if (options.url === 'https://av-wiki.net/blor-306/') {
      options.onload({ status: 404, responseText: '' });
    } else if (options.url.includes('?s=BLOR-306')) {
      options.onload({
        status: 200,
        responseText: '<!doctype html><body><article><h2><a href="https://av-wiki.net/articles/blor-306/">BLOR-306 sample</a></h2></article></body>',
      });
    } else {
      options.onload({
        status: 200,
        responseText: '<!doctype html><body><article><h1>BLOR-306</h1><table><tr><th>AV女優名</th><td><a>桜野桃</a></td></tr></table></article></body>',
      });
    }
  };
  try {
    assert.equal(await fetchRealActressFromAvWiki('BLOR-306', gmRequest, browser.window.document), '桜野桃');
    assert.deepEqual(requested, [
      'https://av-wiki.net/blor-306/',
      'https://av-wiki.net/?s=BLOR-306',
      'https://av-wiki.net/articles/blor-306/',
    ]);
  } finally {
    browser.window.close();
  }
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

test('agaghhh settings expose search filtering and save custom blocked keywords', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  const values = new Map();
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try {
    const overlay = openX1080xSettingsPanel(dom.window.document);
    const filter = overlay.querySelector('[data-setting="search-filter"]');
    const keywords = overlay.querySelector('[data-setting="blocked-keywords"]');
    assert.ok(filter);
    assert.ok(keywords);
    assert.equal(filter.checked, true);
    assert.equal(keywords.disabled, false);
    assert.equal(keywords.value, DEFAULT_AGAGHHH_BLOCKED_KEYWORDS);

    filter.click();
    assert.equal(keywords.disabled, true);
    filter.click();
    keywords.value = '无码破解\n破解/ED2K\n无码破解';
    overlay.querySelector('form')?.dispatchEvent(new dom.window.Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    assert.equal(values.get(AGAGHHH_SEARCH_FILTER_ENABLED_KEY), true);
    assert.equal(values.get(AGAGHHH_BLOCKED_KEYWORDS_KEY), '无码破解\n破解/ED2K');
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = oldSet;
    dom.window.close();
  }
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

test('新域名设置页统一显示 x1080x 名称', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://1080xin.com/' });
  withGmValues(new Map(), () => {
    const panel = openX1080xSettingsPanel(dom.window.document);
    assert.match(panel.querySelector('h2')?.textContent || '', /x1080x 设置/);
    assert.ok(panel.querySelector('[data-settings-tab="batch"]'));
    assert.ok(panel.querySelector('[data-settings-tab="download"]'));
    assert.doesNotMatch(panel.textContent, /agaghhh\.cc/);
    assert.match(panel.textContent, /x1080x 论坛搜索/);
  });
  dom.window.close();
});

test('新版详情页搜索、复制、下载按钮统一放在收藏左侧，并在 React 重绘后恢复', async () => {
  const makeHeader = () => `<header class="thread-header">
    <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
      <button class="button secondary dock-side small">收藏</button>
      <button class="button dock-main small">回复主题</button>
    </div></span></div>
    <h1><span class="topic-tags">有码HD</span>FNS-267 [BT] 示例标题</h1>
    <button id="x1080x-ex-download" type="button">⬇ 下载资源</button>
  </header>`;
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="panel detail-panel">${makeHeader()}</div>
    <article class="post" id="first-post"><div class="post-text">内容</div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/7OvLVLtpZ0qy7wEUHSsi7D' });
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => (
    key === 'x1080x-ex:agaghhh-hdblog-preview-enabled' ? false
      : key === 'x1080x-ex:agaghhh-real-actress-enabled' ? false
        : fallback
  );
  try {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
    const doc = dom.window.document;
    const group = doc.getElementById('x1080x-ex-resource-actions');
    assert.ok(group);
    assert.equal(group.nextElementSibling, doc.querySelector('.thread-actions .dock-side'));
    assert.deepEqual([...group.children].map((button) => button.id), [
      'x1080x-ex-download',
      'x1080x-ex-agaghhh-hdblog-search',
      'x1080x-ex-agaghhh-preview-toggle',
      'x1080x-ex-agaghhh-copy-code',
    ]);

    doc.querySelector('.thread-header').outerHTML = makeHeader();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
    const restoredGroup = doc.getElementById('x1080x-ex-resource-actions');
    assert.ok(restoredGroup);
    assert.equal(restoredGroup.nextElementSibling, doc.querySelector('.thread-actions .dock-side'));
    assert.deepEqual([...restoredGroup.children].map((button) => button.id), [
      'x1080x-ex-download',
      'x1080x-ex-agaghhh-hdblog-search',
      'x1080x-ex-agaghhh-preview-toggle',
      'x1080x-ex-agaghhh-copy-code',
    ]);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    dom.window.close();
  }
});
