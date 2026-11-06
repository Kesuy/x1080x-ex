import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

function installDomGlobals(window) {
  const names = [
    'window', 'document', 'location', 'URL', 'Blob', 'FileReader', 'AbortController',
    'GM_info', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand',
    'GM_xmlhttpRequest', 'GM_openInTab', 'GM_download',
  ];
  const previous = new Map(names.map((name) => [name, globalThis[name]]));

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.URL = window.URL;
  globalThis.Blob = window.Blob;
  globalThis.FileReader = window.FileReader;
  globalThis.AbortController = window.AbortController;
  globalThis.GM_info = {
    downloadMode: 'default',
    scriptHandler: 'Tampermonkey',
    version: '5.5.0',
  };
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.GM_setValue = () => {};
  globalThis.GM_registerMenuCommand = () => {};
  globalThis.GM_openInTab = () => {};
  delete globalThis.GM_download;

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  };
}

test('版块页按钮按 DOM 顺序逐个后台打开普通主题', async () => {
  const dom = new JSDOM(`
    <title>agaghhh 列表</title>
    <div id="pgt"></div>
    <div id="threadlist"><table>
      <tbody id="stickthread_100"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=100">置顶</a></th></tr></tbody>
      <tbody id="normalthread_303"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=303">主题 303</a></th></tr></tbody>
      <tbody id="normalthread_302"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=302">主题 302</a></th></tr></tbody>
      <tbody id="normalthread_301"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=301">主题 301</a></th></tr></tbody>
    </table></div>
    <div class="pg"><a class="nxt" href="forum.php?mod=forumdisplay&fid=75&page=2">下一页</a></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75' });
  const restore = installDomGlobals(dom.window);
  const opened = [];
  const syntheticClicks = [];
  const delays = [];
  const originalSetTimeout = dom.window.setTimeout;
  const originalClearTimeout = dom.window.clearTimeout;
  dom.window.setTimeout = (callback, delay) => {
    delays.push(delay);
    queueMicrotask(callback);
    return 1;
  };
  dom.window.clearTimeout = () => {};
  const stored = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-history-limit', 2],
    ['x1080x-ex:agaghhh-batch-open-history-color', '#123456'],
    ['x1080x-ex:agaghhh-batch-open-history', ['tid:302']],
  ]);
  globalThis.GM_getValue = (key, fallback) => {
    if (key === 'x1080x-ex:agaghhh-batch-open-interval-min-ms') return 2200;
    if (key === 'x1080x-ex:agaghhh-batch-open-interval-max-ms') return 2200;
    return stored.has(key) ? stored.get(key) : fallback;
  };
  globalThis.GM_setValue = (key, value) => stored.set(key, value);
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });
  dom.window.document.querySelectorAll('a.xst').forEach((link) => {
    link.addEventListener('click', () => syntheticClicks.push(link.textContent));
  });

  try {
    await import(`../src/userscript.js?forum-list=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-open-page');
    const progressButton = dom.window.document.querySelector('#x1080x-ex-batch-progress-locator');
    assert.ok(button);
    assert.ok(progressButton);
    assert.equal(progressButton.textContent, '定位浏览进度');
    assert.equal(button.textContent, '批量打开本页（3）');
    assert.equal(button.dataset.x1080xCompact, 'batch');
    assert.equal(button.getAttribute('data-x1080x-count'), '3');
    assert.ok(button.querySelector('svg[data-x1080x-icon="batch"]'));
    assert.equal(progressButton.dataset.x1080xCompact, 'locator');
    assert.equal(progressButton.getAttribute('data-x1080x-count'), '');
    assert.ok(progressButton.querySelector('svg[data-x1080x-icon="locator"]'));
    assert.match(button.title, /当前模式：打开本页全部/);
    assert.match(progressButton.title, /跨页寻找已浏览与未浏览主题/);
    const compactCss = dom.window.document.getElementById('x1080x-ex-batch-compact-controls');
    assert.match(compactCss.textContent, /content:attr\(data-x1080x-count\)/);
    assert.match(compactCss.textContent, /visually-hidden/);
    assert.equal(
      dom.window.document.querySelector('a[href*="tid=302"]').getAttribute('data-x1080x-batch-opened'),
      '1'
    );
    assert.match(
      dom.window.document.querySelector('#x1080x-ex-batch-open-history-style').textContent,
      /#123456/
    );
    button.click();
    assert.equal(dom.window.document.title, '↗ 批量打开中 · agaghhh 列表');
    const agaghhhBeforeUnload = new dom.window.Event('beforeunload', { cancelable: true });
    assert.equal(dom.window.dispatchEvent(agaghhhBeforeUnload), false);
    assert.equal(agaghhhBeforeUnload.defaultPrevented, true);
    await waitFor(() => opened.length === 3, 'all normal threads should open in order');

    assert.deepEqual(opened, [303, 302, 301].map((tid) => ({
      url: `https://agaghhh.cc/forum.php?mod=viewthread&tid=${tid}`,
      options: { active: false, insert: false, setParent: true },
    })));
    assert.deepEqual(syntheticClicks, []);
    assert.equal(delays.filter((delay) => delay === 2200).length, 2);
    assert.deepEqual(
      stored.get('x1080x-ex:agaghhh-batch-open-history'),
      ['tid:302', 'tid:301']
    );
    assert.equal(
      dom.window.document.querySelector('a[href*="tid=303"]').hasAttribute('data-x1080x-batch-opened'),
      false
    );
    assert.equal(
      dom.window.document.querySelector('a[href*="tid=302"]').getAttribute('data-x1080x-batch-opened'),
      '1'
    );
    assert.equal(
      dom.window.document.querySelector('a[href*="tid=301"]').getAttribute('data-x1080x-batch-opened'),
      '1'
    );
    assert.equal(progressButton.textContent, '定位浏览进度');
    assert.equal(
      stored.get('x1080x-ex:agaghhh-batch-progress-map')['https://agaghhh.cc/forum:75'].url,
      'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75&page=2'
    );
    assert.equal(dom.window.document.title, 'agaghhh 列表');
  } finally {
    dom.window.setTimeout = originalSetTimeout;
    dom.window.clearTimeout = originalClearTimeout;
    restore();
    dom.window.close();
  }
});

test('hdblog 标签页把按钮放在归档标题同行并按文章顺序后台打开', async () => {
  const dom = new JSDOM(`
    <title>HDBlog 标签</title>
    <main id="genesis-content">
      <div class="archive-description"><h1>FC2-PPV</h1></div>
      <article class="entry" id="post-983859"><header class="entry-header"><h2 class="entry-title">
        <a href="/983859/fc2ppv-4968311/">主题 4968311</a>
      </h2></header></article>
      <article class="entry" id="post-983856"><header class="entry-header"><h2 class="entry-title">
        <a href="/983856/fc2ppv-4968203/">主题 4968203</a>
      </h2></header></article>
      <nav class="archive-pagination"><a href="/tag/fc2-ppv/page/2/">下一页</a></nav>
    </main>
    <aside id="genesis-sidebar-primary"><a href="/999999/sidebar-post/">侧栏主题</a></aside>
  `, { url: 'https://hdblog.me/tag/fc2-ppv/' });
  const restore = installDomGlobals(dom.window);
  const opened = [];
  const delays = [];
  const originalSetTimeout = dom.window.setTimeout;
  const originalClearTimeout = dom.window.clearTimeout;
  dom.window.setTimeout = (callback, delay) => {
    delays.push(delay);
    queueMicrotask(callback);
    return 1;
  };
  dom.window.clearTimeout = () => {};
  const stored = new Map([
    ['x1080x-ex:hdblog-batch-open-history-enabled', true],
    ['x1080x-ex:hdblog-batch-open-history-limit', 2],
    ['x1080x-ex:hdblog-batch-open-history-color', '#345678'],
    ['x1080x-ex:hdblog-batch-open-history', ['post:983856']],
  ]);
  globalThis.GM_getValue = (key, fallback) => {
    if (key === 'x1080x-ex:domains') return 'agaghhh.cc';
    if (key === 'x1080x-ex:hdblog-batch-open-interval-min-ms') return 900;
    if (key === 'x1080x-ex:hdblog-batch-open-interval-max-ms') return 900;
    return stored.has(key) ? stored.get(key) : fallback;
  };
  globalThis.GM_setValue = (key, value) => stored.set(key, value);
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });

  try {
    await import(`../src/userscript.js?hdblog-list=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-open-page');
    const progressButton = dom.window.document.querySelector('#x1080x-ex-batch-progress-locator');
    const archiveDescription = dom.window.document.querySelector('.archive-description');
    const firstArticle = dom.window.document.querySelector('article.entry');
    assert.ok(button);
    assert.ok(progressButton);
    assert.equal(progressButton.textContent, '定位浏览进度');
    const batchSplit = dom.window.document.querySelector('#x1080x-ex-batch-split');
    assert.equal(button.parentElement, batchSplit);
    assert.equal(batchSplit.parentElement, archiveDescription);
    assert.equal(archiveDescription.firstElementChild, batchSplit);
    assert.equal(batchSplit.nextElementSibling, progressButton);
    assert.equal(archiveDescription.nextElementSibling, firstArticle);
    assert.equal(dom.window.document.querySelector('#x1080x-ex-open-page-toolbar'), null);
    assert.equal(button.textContent, '批量打开本页（2）');
    assert.equal(
      dom.window.document.querySelector('a[href^="/983856/"]').getAttribute('data-x1080x-batch-opened'),
      '1'
    );
    const historyStyle = dom.window.document.querySelector('#x1080x-ex-batch-open-history-style').textContent;
    assert.match(historyStyle, /a:visited/);
    assert.match(historyStyle, /#345678/);

    button.click();
    assert.equal(dom.window.document.title, '↗ 批量打开中 · HDBlog 标签');
    const hdblogBeforeUnload = new dom.window.Event('beforeunload', { cancelable: true });
    assert.equal(dom.window.dispatchEvent(hdblogBeforeUnload), false);
    assert.equal(hdblogBeforeUnload.defaultPrevented, true);
    await waitFor(() => opened.length === 2, 'all hdblog articles should open in order');

    assert.deepEqual(opened, [
      'https://hdblog.me/983859/fc2ppv-4968311/',
      'https://hdblog.me/983856/fc2ppv-4968203/',
    ].map((url) => ({
      url,
      options: { active: false, insert: false, setParent: true },
    })));
    assert.equal(delays.filter((delay) => delay === 900).length, 1);
    assert.deepEqual(
      stored.get('x1080x-ex:hdblog-batch-open-history'),
      ['post:983859', 'post:983856']
    );
    assert.equal(
      dom.window.document.querySelector('a[href^="/983859/"]').getAttribute('data-x1080x-batch-opened'),
      '1'
    );
    assert.equal(
      dom.window.document.querySelector('a[href^="/983856/"]').getAttribute('data-x1080x-batch-opened'),
      '1'
    );
    assert.equal(progressButton.textContent, '定位浏览进度');
    assert.equal(
      stored.get('x1080x-ex:hdblog-batch-progress-map')['https://hdblog.me/tag/fc2-ppv/'].url,
      'https://hdblog.me/tag/fc2-ppv/page/2/'
    );
    assert.equal(dom.window.document.title, 'HDBlog 标签');
  } finally {
    dom.window.setTimeout = originalSetTimeout;
    dom.window.clearTimeout = originalClearTimeout;
    restore();
    dom.window.close();
  }
});


test('agaghhh 开启只打开未打开主题后跳过历史记录', async () => {
  const dom = new JSDOM(`
    <title>agaghhh 未打开过滤</title>
    <div id="pgt"></div>
    <div id="threadlist"><table>
      <tbody id="normalthread_303"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=303">主题 303</a></th></tr></tbody>
      <tbody id="normalthread_302"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=302">主题 302</a></th></tr></tbody>
      <tbody id="normalthread_301"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=301">主题 301</a></th></tr></tbody>
    </table></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75' });
  const restore = installDomGlobals(dom.window);
  const opened = [];
  const stored = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
    ['x1080x-ex:agaghhh-batch-open-history', ['tid:302']],
  ]);
  const originalSetTimeout = dom.window.setTimeout;
  const originalClearTimeout = dom.window.clearTimeout;
  dom.window.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  dom.window.clearTimeout = () => {};
  globalThis.GM_getValue = (key, fallback) => stored.has(key) ? stored.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => stored.set(key, value);
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });

  try {
    await import(`../src/userscript.js?agaghhh-unopened=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-open-page');
    assert.ok(button);
    assert.equal(button.textContent, '批量打开未浏览（2）');

    button.click();
    await waitFor(() => opened.length === 2, 'only unopened agaghhh threads should open');
    assert.deepEqual(opened.map(({ url }) => url), [
      'https://agaghhh.cc/forum.php?mod=viewthread&tid=303',
      'https://agaghhh.cc/forum.php?mod=viewthread&tid=301',
    ]);
    assert.deepEqual(
      stored.get('x1080x-ex:agaghhh-batch-open-history'),
      ['tid:302', 'tid:303', 'tid:301']
    );
    await waitFor(
      () => button.textContent === '批量打开未浏览（0）',
      'agaghhh button should refresh the unopened count'
    );
  } finally {
    dom.window.setTimeout = originalSetTimeout;
    dom.window.clearTimeout = originalClearTimeout;
    restore();
    dom.window.close();
  }
});

test('hdblog 开启只打开未打开主题后跳过历史记录', async () => {
  const dom = new JSDOM(`
    <title>HDBlog 未打开过滤</title>
    <main id="genesis-content">
      <div class="archive-description"><h1>测试</h1></div>
      <article class="entry"><header class="entry-header"><h2 class="entry-title">
        <a href="/983859/topic-a/">主题 A</a>
      </h2></header></article>
      <article class="entry"><header class="entry-header"><h2 class="entry-title">
        <a href="/983856/topic-b/">主题 B</a>
      </h2></header></article>
    </main>
  `, { url: 'https://hdblog.me/tag/test/' });
  const restore = installDomGlobals(dom.window);
  const opened = [];
  const stored = new Map([
    ['x1080x-ex:hdblog-batch-open-history-enabled', true],
    ['x1080x-ex:hdblog-batch-open-unopened-only', true],
    ['x1080x-ex:hdblog-batch-open-history', ['post:983856']],
  ]);
  const originalSetTimeout = dom.window.setTimeout;
  const originalClearTimeout = dom.window.clearTimeout;
  dom.window.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  dom.window.clearTimeout = () => {};
  globalThis.GM_getValue = (key, fallback) => stored.has(key) ? stored.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => stored.set(key, value);
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });

  try {
    await import(`../src/userscript.js?hdblog-unopened=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-open-page');
    assert.ok(button);
    assert.equal(button.textContent, '批量打开未浏览（1）');

    button.click();
    await waitFor(() => opened.length === 1, 'only unopened hdblog articles should open');
    assert.deepEqual(opened.map(({ url }) => url), [
      'https://hdblog.me/983859/topic-a/',
    ]);
    assert.deepEqual(
      stored.get('x1080x-ex:hdblog-batch-open-history'),
      ['post:983856', 'post:983859']
    );
    await waitFor(
      () => button.textContent === '批量打开未浏览（0）',
      'hdblog button should refresh the unopened count'
    );
  } finally {
    dom.window.setTimeout = originalSetTimeout;
    dom.window.clearTimeout = originalClearTimeout;
    restore();
    dom.window.close();
  }
});

function threadDom() {
  return new JSDOM(`
    <h1 class="ts"><span id="thread_subject">ABCD-123 (HD1080P)(abcd00123)本文タイトル</span></h1>
    <div id="postlist"><div id="post_1">
      <div id="postmessage_1">
        <img id="aimg_1" src="/data/attachment/forum/cover.jpg" width="1920" height="1080">
      </div>
      <div class="pattl"><a href="attachment.php?aid=encoded-x15-id">abcd00123.rar</a></div>
    </div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806' });
}

function mockNativeAttachmentFetch(dom) {
  const calls = [];
  dom.window.fetch = async (url, options) => {
    calls.push({ url, options });
    const value = url.endsWith('/preview') ? { status: 'claimable', file_ready: true, payable_points: '0.00', price_points: '4.00', viewer_id: 'viewer', version_id: 'version' }
      : url.endsWith('/csrf') ? { csrf_token: 'csrf' } : { receipt_id: 'testReceipt' };
    return { ok: true, status: 200, url, json: async () => value, headers: new Map([['content-type', 'application/zip']]), blob: async () => new dom.window.Blob(['PK\u0003\u0004zip'], { type: 'application/zip' }) };
  };
  return calls;
}

async function waitFor(predicate, message) {
  // Board updates are debounced for 120 ms. Zero-delay iteration counts can
  // expire before that timer on Linux even when the same test passes on Windows.
  const deadline = performance.now() + 3000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

test('附件和图片先请求 Blob，再用指定 download 文件名保存；跳转地址不改名且 Object URL 被回收', async () => {
  const dom = threadDom();
  const restore = installDomGlobals(dom.window);
  const requests = [];
  const saved = [];
  const revoked = [];
  const releaseDelays = [];
  const setTimeout = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (callback, delay) => {
    if (delay === 10000) releaseDelays.push(delay);
    return setTimeout(callback, delay === 10000 ? 0 : delay);
  };
  let objectUrlIndex = 0;
  dom.window.URL.createObjectURL = () => `blob:test-${++objectUrlIndex}`;
  dom.window.URL.revokeObjectURL = (url) => revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    saved.push({ href: this.href, name: this.download });
  };
  dom.window.fetch = async (url, details) => {
    requests.push({ transport: 'fetch', url, ...details });
    return {
      status: 200,
      url: 'https://agaghhh.cc/forum.php?mod=attachment&aid=redirected',
      headers: new Map([
        ['content-type', 'application/vnd.rar'],
        ['content-disposition', 'attachment; filename="server-name.bin"'],
      ]),
      blob: async () => new dom.window.Blob(
        [new Uint8Array([0x52, 0x61, 0x72, 0x21])],
        { type: 'application/vnd.rar' }
      ),
    };
  };
  globalThis.GM_xmlhttpRequest = (details) => {
    requests.push({ transport: 'gm', ...details });
    const body = new Uint8Array([0xff, 0xd8, 0xff]);
    queueMicrotask(() => details.onload({
      status: 200,
      finalUrl: details.url,
      responseHeaders: 'Content-Type: image/jpeg\r\nContent-Disposition: attachment; filename="server-name.bin"',
      response: new dom.window.Blob([body], { type: 'image/jpeg' }),
    }));
  };

  try {
    await import(`../src/userscript.js?success=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-download');
    assert.ok(button);
    assert.ok(button.querySelector('svg path'));
  assert.equal(button.textContent, '');
    button.click();
    await waitFor(
      () => saved.length === 2 && revoked.length === 2,
      'all Blob downloads should finish and revoke their Object URLs'
    );

    assert.deepEqual(requests.map(({
      transport, method, url, responseType, timeout, anonymous, credentials, redirect,
    }) => ({
      transport, method, url, responseType, timeout, anonymous, credentials, redirect,
    })), [
      {
        transport: 'fetch',
        method: 'GET',
        url: 'https://agaghhh.cc/attachment.php?aid=encoded-x15-id',
        responseType: undefined,
        timeout: undefined,
        anonymous: undefined,
        credentials: 'include',
        redirect: 'follow',
      },
      {
        transport: 'gm',
        method: 'GET',
        url: 'https://agaghhh.cc/data/attachment/forum/cover.jpg',
        responseType: 'blob',
        timeout: 60000,
        anonymous: undefined,
        credentials: undefined,
        redirect: undefined,
      },
    ]);
    assert.deepEqual(saved, [
      { href: 'blob:test-1', name: 'ABCD-123 本文タイトル.rar' },
      { href: 'blob:test-2', name: 'ABCD-123.jpg' },
    ]);
    assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);
    assert.deepEqual(releaseDelays, [10000, 10000]);
    assert.equal(dom.window.location.href, 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806');
    assert.equal(dom.window.document.querySelector('a[download]'), null);
  } finally {
    restore();
    dom.window.close();
  }
});

test('agaghhh 下载前检查 Pixhost show，失效 Preview 直接跳过不保存 B.jpg', async () => {
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">EBWH-319 [BT] 示例标题</span></h1>
    <a href="forum.php?mod=forumdisplay&fid=244">BT</a>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="https://agaghhh.cc/cover.jpg" width="1200" height="900">
      <a href="https://pixhost.to/show/9006/ebwh-319-preview.jpg">
        <img src="https://t6.pixhost.to/thumbs/9006/ebwh-319-preview.jpg" width="320" height="180">
      </a>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1018214&highlight=EBWH-319' });
  const restore = installDomGlobals(dom.window);
  const requests = [];
  const saved = [];
  dom.window.URL.createObjectURL = () => 'blob:forum-image';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) saved.push(this.download);
  };
  globalThis.GM_xmlhttpRequest = (details) => {
    requests.push({ url: details.url, responseType: details.responseType });
    if (details.url === 'https://agaghhh.cc/cover.jpg') {
      queueMicrotask(() => details.onload({
        status: 200,
        finalUrl: details.url,
        responseHeaders: 'Content-Type: image/jpeg',
        response: new dom.window.Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      }));
      return;
    }
    if (details.url === 'https://pixhost.to/show/9006/ebwh-319-preview.jpg') {
      queueMicrotask(() => details.onload({
        status: 200,
        responseText: '<html><body><strong>Picture removed</strong><p>This image is no longer available.</p></body></html>',
      }));
      return;
    }
    assert.fail(`unexpected request: ${details.url}`);
  };

  try {
    await import(`../src/userscript.js?forum-removed-preview=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-download');
    assert.ok(button);
    button.click();
    await waitFor(() => button.textContent === '已跳过失效 Preview', 'removed Pixhost preview should be skipped');

    assert.deepEqual(saved, ['EBWH-319.jpg']);
    assert.deepEqual(requests, [
      { url: 'https://agaghhh.cc/cover.jpg', responseType: 'blob' },
      { url: 'https://pixhost.to/show/9006/ebwh-319-preview.jpg', responseType: 'text' },
    ]);
  } finally {
    restore();
    dom.window.close();
  }
});

test('agaghhh 遇到孤立 Pixhost 缩略图时只下载封面并跳过 B.jpg', async () => {
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">EBWH-319 [BT] 示例标题</span></h1>
    <a href="forum.php?mod=forumdisplay&fid=244">BT</a>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="https://agaghhh.cc/cover.jpg" width="1200" height="900">
      <div class="preview-copy">
        <img src="https://t8.pixhost.to/thumbs/9008/ebwh-319-preview.jpg" width="320" height="240">
      </div>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1018214&highlight=EBWH-319' });
  const restore = installDomGlobals(dom.window);
  const requests = [];
  const saved = [];
  dom.window.URL.createObjectURL = () => 'blob:forum-image';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) saved.push(this.download);
  };
  globalThis.GM_xmlhttpRequest = (details) => {
    requests.push({ url: details.url, responseType: details.responseType });
    if (details.url === 'https://agaghhh.cc/cover.jpg') {
      queueMicrotask(() => details.onload({
        status: 200,
        finalUrl: details.url,
        responseHeaders: 'Content-Type: image/jpeg',
        response: new dom.window.Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      }));
      return;
    }
    assert.fail(`standalone Pixhost thumbnail must not be requested: ${details.url}`);
  };

  try {
    await import(`../src/userscript.js?forum-standalone-thumb=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-download');
    assert.ok(button);
    button.click();
    await waitFor(() => button.textContent === '已跳过失效 Preview', 'standalone Pixhost thumbnail should be skipped');

    assert.deepEqual(saved, ['EBWH-319.jpg']);
    assert.deepEqual(requests, [
      { url: 'https://agaghhh.cc/cover.jpg', responseType: 'blob' },
    ]);
  } finally {
    restore();
    dom.window.close();
  }
});

test('agaghhh 注入的 Pixhost Picture removed 小图不保存 B.jpg，并显示已跳过失效 Preview', async () => {
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">EBWH-319 [BT] 示例标题</span></h1>
    <a href="forum.php?mod=forumdisplay&fid=244">BT</a>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="https://agaghhh.cc/cover.jpg" width="1200" height="900">
      <section id="x1080x-ex-agaghhh-hdblog-preview">
        <img
          src="https://img8.pixhost.to/images/9008/ebwh-319-preview.jpg"
          data-x1080x-hdblog-preview-url="https://img8.pixhost.to/images/9008/ebwh-319-preview.jpg"
          width="640"
          height="320"
        >
      </section>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1018214&highlight=EBWH-319' });
  const restore = installDomGlobals(dom.window);
  const requests = [];
  const saved = [];
  dom.window.URL.createObjectURL = () => 'blob:forum-image';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) saved.push(this.download);
  };
  globalThis.GM_xmlhttpRequest = (details) => {
    requests.push({ url: details.url, responseType: details.responseType });
    if (details.url === 'https://agaghhh.cc/cover.jpg') {
      queueMicrotask(() => details.onload({
        status: 200,
        finalUrl: details.url,
        responseHeaders: 'Content-Type: image/jpeg',
        response: new dom.window.Blob([new Uint8Array(128 * 1024)], { type: 'image/jpeg' }),
      }));
      return;
    }
    if (details.url === 'https://img8.pixhost.to/images/9008/ebwh-319-preview.jpg') {
      queueMicrotask(() => details.onload({
        status: 200,
        finalUrl: details.url,
        responseHeaders: 'Content-Type: image/jpeg',
        response: new dom.window.Blob([new Uint8Array(15800)], { type: 'image/jpeg' }),
      }));
      return;
    }
    assert.fail(`unexpected request: ${details.url}`);
  };

  try {
    await import(`../src/userscript.js?forum-pixhost-placeholder=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-download');
    assert.ok(button);
    button.click();
    await waitFor(() => button.textContent === '已跳过失效 Preview', 'placeholder should be reported as skipped');

    assert.deepEqual(saved, ['EBWH-319.jpg']);
    assert.deepEqual(requests, [
      { url: 'https://agaghhh.cc/cover.jpg', responseType: 'blob' },
      { url: 'https://img8.pixhost.to/images/9008/ebwh-319-preview.jpg', responseType: 'blob' },
    ]);
  } finally {
    restore();
    dom.window.close();
  }
});

test('附件返回登录 HTML 时拒绝保存并显示可操作原因', async () => {
  const dom = threadDom();
  const restore = installDomGlobals(dom.window);
  const saved = [];
  const alerts = [];
  dom.window.URL.createObjectURL = () => {
    saved.push('created');
    return 'blob:should-not-exist';
  };
  dom.window.alert = (message) => alerts.push(message);
  dom.window.fetch = async () => ({
    status: 200,
    url: 'https://agaghhh.cc/member.php?mod=logging&action=login',
    headers: new Map([['content-type', 'text/html; charset=utf-8']]),
    blob: async () => new dom.window.Blob(
      ['<!doctype html><html><title>登录</title></html>'],
      { type: 'text/html' }
    ),
  });
  globalThis.GM_xmlhttpRequest = () => assert.fail('same-origin attachment should use page fetch');

  try {
    await import(`../src/userscript.js?html=${Date.now()}`);
    dom.window.document.querySelector('#x1080x-ex-download').click();
    await waitFor(() => alerts.length === 1, 'HTML rejection should show one failure summary');

    assert.deepEqual(saved, []);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /返回登录页/);
    assert.match(alerts[0], /HTTP 200/);
    assert.match(alerts[0], /Content-Type：text\/html/);
  } finally {
    restore();
    dom.window.close();
  }
});

test('网络请求失败时显示 error 和 details，但会脱敏 Cookie', async () => {
  const dom = threadDom();
  const restore = installDomGlobals(dom.window);
  const alerts = [];
  const errors = [];
  dom.window.alert = (message) => alerts.push(message);
  const originalConsoleError = console.error;
  console.error = (...args) => errors.push(args);
  dom.window.fetch = async () => {
    const error = new Error('socket closed; Cookie=session-secret');
    error.name = 'TypeError';
    throw error;
  };
  globalThis.GM_xmlhttpRequest = () => assert.fail('same-origin attachment should use page fetch');

  try {
    await import(`../src/userscript.js?network=${Date.now()}`);
    dom.window.document.querySelector('#x1080x-ex-download').click();
    await waitFor(() => alerts.length === 1, 'network errors should show one failure summary');

    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /error=TypeError/);
    assert.match(alerts[0], /details=socket closed/);
    assert.doesNotMatch(alerts[0], /session-secret/);
    assert.doesNotMatch(JSON.stringify(errors), /session-secret/);
  } finally {
    console.error = originalConsoleError;
    restore();
    dom.window.close();
  }
});

test('GM_xmlhttpRequest 图片失败时保留 error 和 details 并脱敏 Cookie', async () => {
  const dom = threadDom();
  const restore = installDomGlobals(dom.window);
  const alerts = [];
  dom.window.alert = (message) => alerts.push(message);
  dom.window.fetch = async () => ({
    status: 200,
    url: 'https://agaghhh.cc/attachment.php?aid=encoded-x15-id',
    headers: new Map([['content-type', 'application/vnd.rar']]),
    blob: async () => new dom.window.Blob(['Rar!'], { type: 'application/vnd.rar' }),
  });
  dom.window.URL.createObjectURL = () => 'blob:attachment';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  globalThis.GM_xmlhttpRequest = (details) => queueMicrotask(() => details.onerror({
    error: 'xhr_failed',
    details: 'socket closed; Cookie=session-secret',
  }));

  try {
    await import(`../src/userscript.js?gm-network=${Date.now()}`);
    dom.window.document.querySelector('#x1080x-ex-download').click();
    await waitFor(() => alerts.length === 1, 'GM request errors should show one failure summary');

    assert.match(alerts[0], /error=xhr_failed/);
    assert.match(alerts[0], /details=socket closed/);
    assert.doesNotMatch(alerts[0], /session-secret/);
  } finally {
    restore();
    dom.window.close();
  }
});

function integratedTorrentFixture() {
  const infoBytes = new TextEncoder().encode('d4:name9:My Movie!e');
  const torrentBytes = new TextEncoder().encode('d4:infod4:name9:My Movie!ee');
  const hash = createHash('sha1').update(infoBytes).digest('hex').toUpperCase();
  return { hash, torrentBytes };
}

test('内置种子下载按帖子标题保存且不修改原磁力脚本布局', async () => {
  const { hash, torrentBytes } = integratedTorrentFixture();
  const magnet = `magnet:?xt=urn:btih:${hash}&dn=FC2-PPV-4960963`;
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">FC2-PPV-4960963 [BT](FC2) 示例标题</span></h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">${magnet}</div></div></div>
    <span id="original-mtt-layout" class="mtt-code-buttons" data-mtt-owned>
      <a class="mtt-button" href="https://itorrents.net/torrent/${hash}.torrent" data-mtt-filename-support="1">📥 种子</a>
    </span>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1057382' });
  const restore = installDomGlobals(dom.window);
  const originalLayout = dom.window.document.querySelector('#original-mtt-layout').outerHTML;
  const saved = [];
  globalThis.GM_download = () => assert.fail('validated torrents must use the browser save path, independent of the extension whitelist');
  dom.window.URL.createObjectURL = () => 'blob:integrated-torrent';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) saved.push({ href: this.href, name: this.download });
  };
  globalThis.GM_xmlhttpRequest = (details) => queueMicrotask(() => details.onload({
    status: 200,
    response: torrentBytes.buffer.slice(
      torrentBytes.byteOffset,
      torrentBytes.byteOffset + torrentBytes.byteLength
    ),
  }));

  try {
    await import(`../src/userscript.js?integrated-torrent=${Date.now()}`);
    dom.window.document.querySelector('#x1080x-ex-download').click();
    await waitFor(() => saved.length === 1, 'integrated torrent should be saved');

    assert.deepEqual(saved, [{
      href: 'blob:integrated-torrent',
      name: 'FC2-4960963 示例标题.torrent',
    }]);
    assert.equal(
      dom.window.document.querySelector('#original-mtt-layout').outerHTML,
      originalLayout
    );
  } finally {
    restore();
    dom.window.close();
  }
});

test('没有安装磁力脚本时仍能独立下载并校验 torrent', async () => {
  const { hash, torrentBytes } = integratedTorrentFixture();
  const magnet = `magnet:?xt=urn:btih:${hash}&dn=FC2-PPV-4960963`;
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">FC2-PPV-4960963 [BT](FC2) 独立下载</span></h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">${magnet}</div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1057382' });
  const restore = installDomGlobals(dom.window);
  const saved = [];
  dom.window.URL.createObjectURL = () => 'blob:standalone-torrent';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) saved.push(this.download);
  };
  globalThis.GM_xmlhttpRequest = (details) => queueMicrotask(() => details.onload({
    status: 200,
    response: torrentBytes.buffer.slice(
      torrentBytes.byteOffset,
      torrentBytes.byteOffset + torrentBytes.byteLength
    ),
  }));

  try {
    await import(`../src/userscript.js?standalone-torrent=${Date.now()}`);
    dom.window.document.querySelector('#x1080x-ex-download').click();
    await waitFor(() => saved.length === 1, 'standalone torrent should be saved');

    assert.deepEqual(saved, ['FC2-4960963 独立下载.torrent']);
    assert.equal(dom.window.document.querySelector('.mtt-button'), null);
  } finally {
    restore();
    dom.window.close();
  }
});


test('1080xin inherits old batch-open history and records manually visited threads', async () => {
  const dom = new JSDOM(String.raw`
    <title>1080xin 论坛</title>
    <div id="pgt"></div>
    <div id="threadlist"><table>
      <tbody id="normalthread_303"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=303">未打开</a></th></tr></tbody>
      <tbody id="normalthread_302"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=302">旧站已打开</a></th></tr></tbody>
    </table></div>`, { url: 'https://1080xin.com/forum.php?mod=forumdisplay&fid=75' });
  const restore = installDomGlobals(dom.window);
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
    ['x1080x-ex:agaghhh-batch-open-history', ['tid:302']],
    ['x1080x-ex:agaghhh-batch-progress-map', {
      'https://agaghhh.cc/forum:75': {
        url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75&page=4',
        updatedAt: 111,
      },
    }],
  ]);
  const menus = new Map();
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_registerMenuCommand = (name, callback) => menus.set(name, callback);
  try {
    await import(`../src/userscript.js?replacement-domain=${Date.now()}`);
    assert.equal(
      dom.window.document.querySelector('a[href*="tid=302"]')?.getAttribute('data-x1080x-batch-opened'), '1'
    );
    assert.match(dom.window.document.querySelector('#x1080x-ex-open-page')?.textContent || '', /未浏览（1）/);
    assert.deepEqual([...menus.keys()], ['⚙️ 设置匹配域名', '➕ 添加当前域名']);
    assert.deepEqual(values.get('x1080x-ex:agaghhh-batch-open-history'), ['tid:302']);
  } finally {
    restore();
    dom.window.close();
  }

  const visited = new JSDOM('<!doctype html><body><span id="thread_subject">SVMGM-050</span></body></html>', {
    url: 'https://1080xin.com/forum.php?mod=viewthread&tid=303',
  });
  const restoreVisit = installDomGlobals(visited.window);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try {
    await import(`../src/userscript.js?replacement-visit=${Date.now()}`);
    assert.deepEqual(values.get('x1080x-ex:agaghhh-batch-open-history'), ['tid:302', 'tid:303']);
  } finally {
    restoreVisit();
    visited.window.close();
  }
});

test('modern 1080xin board renders bulk controls, skips visited links and restores marks after SPA paging', async () => {
  const boardUrl = 'https://1080xin.com/boards/6Rj9of8m6shoqhAaXiXJje';
  const visited = '5Sf2HTs5zogM0TuHJz1LD5';
  const remaining = '04KTRwQA2TTlDe3JY9qGYx';
  const dom = new JSDOM(`<!doctype html><html><head><title>FC2视频 - x1080x</title></head><body>
    <div class="thread-list">
      <div class="pgt"><div class="pg"><strong>1</strong><button aria-label="下一页"></button></div></div>
      <article class="thread-row is-sticky"><a class="resource-title" href="/resources/StickyID">置顶</a></article>
      <article class="thread-row"><div class="thread-line"><a class="resource-title" href="/resources/${visited}?return=%2Fboards%2F6Rj9of8m6shoqhAaXiXJje"><font>已读</font></a></div></article>
      <article class="thread-row"><div class="thread-line"><a class="resource-title" href="/resources/${remaining}"><font>未读</font></a></div></article>
    </div>
  </body></html>`, { url: boardUrl });
  const restore = installDomGlobals(dom.window);
  const oldTimeout = dom.window.setTimeout;
  const oldClearTimeout = dom.window.clearTimeout;
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
    ['x1080x-ex:agaghhh-batch-open-history', [`resource:${visited}`]],
    ['x1080x-ex:agaghhh-batch-open-history-color', '#bd10e0'],
  ]);
  const opened = [];
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });
  dom.window.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  dom.window.clearTimeout = () => {};

  try {
    await import(`../src/userscript.js?modern-board=${Date.now()}`);
    const button = dom.window.document.getElementById('x1080x-ex-open-page');
    const progress = dom.window.document.getElementById('x1080x-ex-batch-progress-locator');
    const toolbar = dom.window.document.getElementById('x1080x-ex-open-page-toolbar');
    assert.ok(button, 'modern board must render batch-open button');
    assert.ok(progress, 'modern board must render progress locator');
    assert.ok(toolbar, 'modern board must render toolbar before pagination');
    assert.equal(toolbar.nextElementSibling?.className, 'pgt');
    assert.equal(button.textContent, '批量打开未浏览（1）');
    assert.equal(button.getAttribute('data-x1080x-count'), '1');
    assert.match(button.title, /当前模式：仅打开未浏览/);
    assert.ok(button.querySelector('svg[data-x1080x-icon="batch"]'));
    assert.ok(progress.querySelector('svg[data-x1080x-icon="locator"]'));
    assert.equal(dom.window.document.querySelector(`a[href*="${visited}"]`)?.getAttribute('data-x1080x-batch-opened'), '1');
    assert.match(dom.window.document.getElementById('x1080x-ex-batch-open-history-style').textContent, /resource-title.*#bd10e0/s);

    button.click();
    await waitFor(() => opened.length === 1, 'modern board should open unvisited topic');
    assert.match(opened[0].url, /04KTRwQA2TTlDe3JY9qGYx/);
    assert.equal(opened[0].options.active, false);
    assert.deepEqual(values.get('x1080x-ex:1080xin-resource-history'), [`resource:${remaining}`]);
    assert.deepEqual(values.get('x1080x-ex:agaghhh-batch-open-history'), [`resource:${visited}`], 'old beta data remains untouched');
    assert.equal(values.get('x1080x-ex:agaghhh-batch-progress-map')[`https://agaghhh.cc/boards/6Rj9of8m6shoqhAaXiXJje`].url,
      boardUrl + '?page=2');


    // Client-side navigation to a resource must persist history even if the userscript is not reloaded.
    const openedFromSpa = 'SpaOpened2026';
    dom.window.history.pushState({}, '', '/resources/' + openedFromSpa);
    dom.window.document.body.insertAdjacentHTML('beforeend',
      '<article class="post" id="first-post"><div class="post-text">内容</div></article>');
    await waitFor(
          () => values.get('x1080x-ex:1080xin-resource-history')?.includes('resource:' + openedFromSpa),
      'client side resource navigation must save visited history'
    );
    dom.window.history.pushState({}, '', boardUrl);
    dom.window.document.getElementById('first-post').remove();

    // Simulate the Next.js app replacing list items without reloading the document.
    const list = dom.window.document.querySelector('.thread-list');
    list.querySelectorAll('article.thread-row').forEach((item) => item.remove());
    list.insertAdjacentHTML('beforeend', `<article class="thread-row">
      <a class="resource-title" href="/resources/${visited}"><font>已读（新的 DOM）</font></a>
    </article>`);
    await waitFor(() => list.querySelector('a.resource-title[data-x1080x-batch-opened="1"]')?.textContent.includes('新的 DOM'),
      'modern history marks should recover after client-side pagination');
    await waitFor(() => button.textContent === '批量打开未浏览（0）',
      'modern bulk open count should follow new list contents');
    assert.equal(button.getAttribute('data-x1080x-count'), '0', 'compact counter follows SPA pagination');
    assert.match(button.title, /批量打开未浏览（0）/);

    // A zero-unread board still offers an all-posts action without opening settings.
    const modeTrigger = dom.window.document.getElementById('x1080x-ex-batch-mode-trigger');
    modeTrigger.click();
    const allMode = dom.window.document.querySelector('[data-batch-mode="all"]');
    assert.match(allMode.textContent, /打开本页全部（1）/);
    allMode.click();
    await waitFor(() => opened.length === 2, 'modern all-mode should open visited-only page');
    assert.match(opened.at(-1).url, /5Sf2HTs5zogM0TuHJz1LD5/);
    await waitFor(() => button.textContent === '批量打开本页（1）',
      'modern all-mode should remain selected for the next page');
  } finally {
    dom.window.setTimeout = oldTimeout;
    dom.window.clearTimeout = oldClearTimeout;
    restore();
    dom.window.close();
  }
});

test('modern x1080x resource downloads its authorized ZIP with a title-based filename', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>SUJI-322 - x1080x</title></head><body>
    <div class="panel detail-panel"><header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
        <button class="button dock-main small">回覆主題</button>
      </div></span></div>
      <h1><span class="topic-tags">亞洲SM</span>SUJI-322 (HD1080P)(姦乱者)(suji00322)影片</h1>
    </header><article class="post" id="first-post"><div class="post-content">
      <div class="post-text"><div class="protected-text discuz-body">内容</div></div>
      <section class="attachments-section"><div class="attachment-list">
        <article class="attachment" data-slot-id="4bLI6T1ydu8yKs7WDHAxjf">
          <div class="file-main"><span class="file-name" title="suji00322.zip">suji00322.zip</span></div>
          <div class="file-get"><button class="button secondary tool" type="button">按次數下載</button></div>
        </article>
      </div></section>
    </div></article></div></body></html>`, {
    url: 'https://1080xin.com/resources/1Dw4hDQzhfzZdV9ZZWeQWU?page=1&order=asc'
  });
  const restore = installDomGlobals(dom.window);
  const values = new Map([['x1080x-ex:agaghhh-batch-open-history-enabled', true]]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  dom.window.confirm = () => true;
  let nativeClicks = 0;
  const saves = [];
  mockNativeAttachmentFetch(dom);
  dom.window.URL.createObjectURL = () => 'blob:renamed-zip';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { saves.push(this.download); };
  dom.window.document.querySelector('.file-get button').addEventListener('click', () => { nativeClicks += 1; });
  try {
    await import(`../src/userscript.js?modern-zip-button=${Date.now()}`);
    const button = dom.window.document.getElementById('x1080x-ex-download');
    assert.ok(button, 'modern resource download button must be visible');
    const group = dom.window.document.getElementById('x1080x-ex-resource-actions');
    assert.ok(group, 'modern resource buttons must have a shared action group');
    assert.equal(button.parentElement, group);
    assert.equal(group.nextElementSibling, dom.window.document.querySelector('.thread-actions .dock-side'),
      'the action group must be immediately left of favorite');
    assert.ok(button.querySelector('svg[data-icon="idle"]'));
    assert.equal(button.getAttribute('aria-label'), '下载资源');
    assert.equal(button.style.display, 'inline-flex');
    assert.ok(values.get('x1080x-ex:1080xin-resource-history').includes('resource:1Dw4hDQzhfzZdV9ZZWeQWU'));
    button.click();
    await waitFor(() => saves.length === 1 && !button.disabled, 'ZIP should be saved under the parsed thread title');
    assert.equal(nativeClicks, 0, 'the native button must not trigger a second quota claim');
    assert.match(saves[0], /^SUJI-322 .*\.zip$/);
  } finally {
    restore();
    dom.window.close();
  }
});

test('modern resource download button is anchored below the title and reappears after React replaces it', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>FNS-267</title></head><body>
    <div class="panel detail-panel"><header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
        <button class="button dock-main small">回复主题</button>
      </div></span></div>
      <h1>FNS-267 [BT] Sample</h1>
    </header></div>
    <article class="post" id="first-post"><div class="post-text">magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/7OvLVLtpZ0qy7wEUHSsi7D?page=1&order=asc' });
  const restore = installDomGlobals(dom.window);
  try {
    await import(`../src/userscript.js?modern-hydration=${Date.now()}`);
    let title = dom.window.document.querySelector('.thread-header h1');
    let button = dom.window.document.getElementById('x1080x-ex-download');
    assert.ok(button);
    let group = dom.window.document.getElementById('x1080x-ex-resource-actions');
    assert.equal(button.parentElement, group);
    assert.equal(group.nextElementSibling, dom.window.document.querySelector('.thread-actions .dock-side'));
    dom.window.document.querySelector('.thread-header').outerHTML = `<header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
        <button class="button dock-main small">回复主题</button>
      </div></span></div>
      <h1>FNS-267 [BT] Sample (new render)</h1>
    </header>`;
    await waitFor(() => {
      title = dom.window.document.querySelector('.thread-header h1');
      button = dom.window.document.getElementById('x1080x-ex-download');
      group = dom.window.document.getElementById('x1080x-ex-resource-actions');
      return Boolean(title && button && group && button.parentElement === group
        && group.nextElementSibling === dom.window.document.querySelector('.thread-actions .dock-side'));
    }, 'download button should be re-anchored into the favorite toolbar after React replaces the header');
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  } finally {
    restore();
    dom.window.close();
  }
});

test('native JSON delivery errors cannot be saved as ZIP or trigger a second claim', async () => {
  const dom = new JSDOM(`<header class="thread-header"><h1>MFYD-220 Example</h1></header>
    <article id="first-post"><section class="attachments-section"><article class="attachment" data-slot-id="zipSlot">
    <span class="file-name">mfyd00220.zip</span><div class="file-get"><button>按次數下載</button></div></article></section></article>`, { url: 'https://1080xin.com/resources/zipError' });
  const restore = installDomGlobals(dom.window);
  const calls = mockNativeAttachmentFetch(dom);
  const originalFetch = dom.window.fetch;
  dom.window.fetch = async (url, options) => {
    if (url.includes('/downloads/file/')) return { status: 200, url, headers: new Map([['content-type', 'application/json']]), blob: async () => new dom.window.Blob(['{"error":"delivery_busy"}'], { type: 'application/json' }) };
    return originalFetch(url, options);
  };
  const alerts = [];
  let nativeClicks = 0;
  dom.window.alert = message => alerts.push(message);
  dom.window.document.querySelector('.file-get button').addEventListener('click', () => { nativeClicks += 1; });
  dom.window.URL.createObjectURL = () => assert.fail('error JSON must never become a ZIP');
  try {
    await import(`../src/userscript.js?native-json-error=${Date.now()}`);
    const button = dom.window.document.getElementById('x1080x-ex-download');
    button.click();
    await waitFor(() => alerts.length === 1 && !button.disabled, 'delivery error should finish with an actionable failure');
    assert.equal(nativeClicks, 0);
    assert.equal(calls.filter(call => call.url.endsWith('/claim')).length, 1);
    assert.match(alerts[0], /错误信息/);
    assert.equal(button.dataset.downloadState, 'error');
  } finally { dom.window.close(); await Promise.resolve(); restore(); }
});

test('legacy TID history migrates by title/code and marks the matching modern resource purple', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>x1080x</title></head><body>
    <div class="thread-list">
      <div class="pgt"><div class="pg"><strong>1</strong><button aria-label="下一页" disabled></button></div></div>
      <article class="thread-row"><div class="thread-line">
        <a class="resource-title" href="/resources/modernFc2ID">（fc4939392）新版标题与旧标题略有不同</a>
      </div></article>
    </div>
  </body></html>`, { url: 'https://1080xin.com/boards/modernBoardID' });
  const restore = installDomGlobals(dom.window);
  const stored = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-history-limit', 5000],
    ['x1080x-ex:agaghhh-batch-open-history', ['tid:12345']],
  ]);
  globalThis.GM_getValue = (key, fallback) => stored.has(key) ? stored.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => stored.set(key, value);
  globalThis.GM_xmlhttpRequest = (options) => {
    assert.match(options.url, /forum\.php\?mod=viewthread&tid=12345/);
    queueMicrotask(() => options.onload({
      status: 200,
      finalUrl: options.url,
      responseText: '<!doctype html><html><body><div class="vwthd"><h1 id="thread_subject">(fc4939392) 旧版标题</h1></div></body></html>',
    }));
  };
  try {
    await import(`../src/userscript.js?legacy-history-migration=${Date.now()}`);
    await waitFor(() => (
      dom.window.document.querySelector('a.resource-title')?.getAttribute('data-x1080x-batch-opened') === '1'
    ), 'the old TID should resolve to FC2 code alias and mark the matching new resource');
    assert.ok(stored.get('x1080x-ex:agaghhh-history-title-aliases').includes('code:FC2-4939392'));
    assert.deepEqual(stored.get('x1080x-ex:agaghhh-batch-open-history'), ['tid:12345'],
      'legacy TID history must remain unchanged');
  } finally {
    restore();
    dom.window.close();
  }
});

test('modern download counts native attachments and uses the image element referrer policy', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>FNS-267</title></head><body>
    <div class="panel detail-panel"><header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
        <button class="button dock-main small">回复主题</button>
      </div></span></div>
      <h1><span class="topic-tags">有码HD</span>FNS-267 [BT] Sample</h1>
    </header></div>
    <article class="post" id="first-post"><div class="post-content">
      <div class="post-text"><div class="protected-text discuz-body">
        <img class="body-image" referrerpolicy="strict-origin-when-cross-origin" src="https://www.hxmmdd.com/images-v2/pics/off/2026/10/29/off_FNS-267.jpg.webp">
        <img class="body-image" referrerpolicy="no-referrer" src="https://imgfor80.me/images/2026/10/29/FNS-267_s.jpg">
      </div></div>
      <section class="attachments-section"><div class="attachment-list"><article class="attachment" data-slot-id="slotTest">
        <span class="file-name" title="sample.zip">sample.zip</span>
        <div class="file-get"><button class="button secondary tool" type="button">站内下载</button></div>
      </article></div></section>
    </div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/7OvLVLtpZ0qy7wEUHSsi7D?page=1&order=asc' });
  const restore = installDomGlobals(dom.window);
  const requests = [];
  let nativeClicks = 0;
  mockNativeAttachmentFetch(dom);
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => {
    if (key === 'x1080x-ex:agaghhh-hdblog-preview-enabled') return false;
    if (key === 'x1080x-ex:agaghhh-real-actress-enabled') return false;
    return fallback;
  };
  globalThis.GM_xmlhttpRequest = (options) => {
    requests.push(options);
    queueMicrotask(() => options.onload({
      status: 200,
      finalUrl: options.url,
      responseHeaders: 'Content-Type: image/webp',
      response: new dom.window.Blob(['image-bytes'], { type: 'image/webp' }),
    }));
  };
  dom.window.URL.createObjectURL = () => 'blob:x1080x-test';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.document.querySelector('.file-get button').addEventListener('click', () => { nativeClicks += 1; });

  try {
    await import(`../src/userscript.js?modern-count-referer=${Date.now()}`);
    const { installAgaghhhEnhancement } = await import(`../src/agaghhh-enhancement.js?modern-actions-count=${Date.now()}`);
    installAgaghhhEnhancement(dom.window.document, dom.window.location, globalThis.GM_xmlhttpRequest);

    const button = dom.window.document.getElementById('x1080x-ex-download');
    const group = dom.window.document.getElementById('x1080x-ex-resource-actions');
    assert.ok(button);
    assert.ok(group);
    assert.deepEqual([...group.children].map((item) => item.id), [
      'x1080x-ex-download',
      'x1080x-ex-agaghhh-hdblog-search',
      'x1080x-ex-agaghhh-copy-code',
    ]);
    assert.equal(group.nextElementSibling, dom.window.document.querySelector('.thread-actions .dock-side'));

    button.click();
    assert.equal(button.textContent, '0/3');
    assert.match(dom.window.document.getElementById('x1080x-ex-download-status').textContent, /处理中 0\/3/,
      'two image jobs plus one native attachment should be counted as three total tasks');
    await waitFor(() => !button.disabled, 'completion status should account for the renamed native attachment');
    assert.equal(nativeClicks, 0);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers?.Referer, 'https://1080xin.com/',
      'cross-origin image request should follow strict-origin-when-cross-origin');
    await waitFor(() => !button.disabled, 'download job should finish');
    assert.match(dom.window.document.getElementById('x1080x-ex-download-status').textContent, /已处理 3\/3 · 已保存 0 · 已发起 3/);
    assert.equal(button.textContent, '3/3');
    assert.equal(button.dataset.downloadState, 'done');
    assert.equal(requests[1].headers.Referer, '',
      'no-referrer images must not receive a Referer header');
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    restore();
    dom.window.close();
  }
});

test('modern button shows progress and failures while details remain in the left status area', async () => {
  const dom = new JSDOM(`<header class="thread-header"><h1>FNS-267 [BT] Sample</h1></header>
    <article id="first-post"><div class="post-text">
      <img class="body-image" src="https://www.hxmmdd.com/one.webp" referrerpolicy="no-referrer">
      <img class="body-image" src="https://imgfor80.me/two.jpg" referrerpolicy="no-referrer">
    </div></article>`, { url: 'https://1080xin.com/resources/testDownload' });
  const restore = installDomGlobals(dom.window);
  const saves = [];
  const alerts = [];
  const resetCallbacks = [];
  const schedule = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (callback, delay) => {
    if (delay === 2500) { resetCallbacks.push(callback); return 0; }
    return schedule(callback, delay);
  };
  dom.window.alert = message => alerts.push(message);
  globalThis.GM_download = options => { saves.push(options); };
  globalThis.GM_xmlhttpRequest = options => queueMicrotask(() => options.onload({
    status: 200, responseHeaders: 'Content-Type: image/jpeg',
    response: new dom.window.Blob(['image'], { type: 'image/jpeg' }),
  }));
  try {
    await import(`../src/userscript.js?save-progress=${Date.now()}`);
    let button = dom.window.document.getElementById('x1080x-ex-download');
    button.click();
    button.click();
    await waitFor(() => saves.length === 1, 'first save should start');
    let status = dom.window.document.getElementById('x1080x-ex-download-status');
    assert.match(status.textContent, /处理中 0\/2 · 已保存 0/);
    assert.equal(button.textContent, '0/2');
    assert.equal(button.disabled, true);
    dom.window.document.querySelector('.thread-header').outerHTML = `<header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button dock-side">收藏</button></div></span></div><h1>FNS-267 [BT] Sample</h1></header>`;
    await waitFor(() => {
      button = dom.window.document.getElementById('x1080x-ex-download');
      return button?.disabled && button.textContent === '0/2';
    }, 'React replacement must restore the busy button and prevent duplicate downloads');
    status = dom.window.document.getElementById('x1080x-ex-download-status');
    button.click();
    assert.equal(saves.length, 1);
    saves[0].onload();
    await waitFor(() => saves.length === 2, 'second save should wait for first callback');
    assert.match(status.textContent, /处理中 1\/2 · 已保存 1/);
    saves[1].onerror({ error: 'not_permitted' });
    await waitFor(() => !button.disabled, 'save failure must release the button');
    assert.match(status.textContent, /已处理 2\/2 · 已保存 1 · 失败 1/);
    assert.equal(button.dataset.downloadState, 'error');
    assert.match(button.getAttribute('aria-label'), /失败 1/);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /下载权限/);
    resetCallbacks.at(-1)();
    assert.ok(button.querySelector('svg[data-icon="idle"]'));
    assert.match(status.textContent, /已保存 1 · 失败 1/, 'detail remains available after the button resets');
  } finally {
    dom.window.close();
    await Promise.resolve();
    restore();
  }
});

test('disabled modern download enhancement creates neither the button nor an empty status area', async () => {
  const dom = new JSDOM(`<header class="thread-header"><div class="thread-header-nums">
    <span class="thread-header-actions"><div class="thread-actions"><button class="button dock-side">收藏</button></div></span>
    </div><h1>FNS-267 [BT] Sample</h1></header>`, { url: 'https://1080xin.com/resources/downloadOff' });
  const restore = installDomGlobals(dom.window);
  globalThis.GM_getValue = (key, fallback) => key === 'x1080x-ex:agaghhh-download-enabled' ? false : fallback;
  try {
    await import(`../src/userscript.js?download-off-no-status=${Date.now()}`);
    assert.equal(dom.window.document.getElementById('x1080x-ex-download'), null);
    assert.equal(dom.window.document.getElementById('x1080x-ex-download-status'), null);
  } finally {
    dom.window.close();
    await Promise.resolve();
    restore();
  }
});

test('modern marks, unopened count and progress locator reuse the durable legacy resolver cache', async () => {
  const dom = new JSDOM(`<div class="thread-list"><div class="pgt"><div class="pg"><strong>1</strong></div></div>
    <article class="thread-row"><a class="resource-title" href="/resources/resolvedID">Title without a code</a></article>
    <article class="thread-row"><a class="resource-title" href="/resources/newID">New unread title</a></article>
    </div>`, { url: 'https://1080xin.com/boards/testHistory' });
  const restore = installDomGlobals(dom.window);
  const stored = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
    ['x1080x-ex:agaghhh-batch-open-history', ['tid:123']],
    ['x1080x-ex:agaghhh-legacy-history-migration-v1', { resolved: { 123: ['resource:resolvedID'] } }],
  ]);
  globalThis.GM_getValue = (key, fallback) => stored.has(key) ? stored.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => stored.set(key, value);
  globalThis.GM_xmlhttpRequest = () => assert.fail('resolved cache must not be fetched again');
  try {
    await import(`../src/userscript.js?cached-history=${Date.now()}`);
    assert.equal(dom.window.document.querySelector('[href="/resources/resolvedID"]').getAttribute('data-x1080x-batch-opened'), '1');
    assert.equal(dom.window.document.getElementById('x1080x-ex-open-page').textContent, '批量打开未浏览（1）');
    assert.match(dom.window.document.getElementById('x1080x-ex-batch-progress-locator').title, /现有 1 条脚本记录/);
    assert.deepEqual(stored.get('x1080x-ex:agaghhh-batch-open-history'), ['tid:123']);
  } finally {
    dom.window.close();
    await Promise.resolve();
    restore();
  }
});

test('history diagnosis distinguishes loaded old TIDs from records with a usable mapping', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://1080xin.com/' });
  const restore = installDomGlobals(dom.window);
  const menus = new Map();
  const alerts = [];
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history', '[123,"tid:456",{"tid":789}]'],
    ['x1080x-ex:agaghhh-legacy-history-migration-v1', { resolved: { 123: ['resource:known'] } }],
  ]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_registerMenuCommand = (name, callback) => menus.set(name, callback);
  dom.window.alert = message => alerts.push(message);
  try {
    const { runSiteSettingsTool } = await import(`../src/userscript.js?history-diagnosis=${Date.now()}`);
    assert.equal(runSiteSettingsTool('inspect-history'), true);
    assert.match(alerts[0], /旧版数字 TID：3 条/);
    assert.match(alerts[0], /已取得对应信息：1 条/);
    assert.match(alerts[0], /仍缺对应信息：2 条/);
    assert.equal(values.get('x1080x-ex:agaghhh-batch-open-history'), '[123,"tid:456",{"tid":789}]');
  } finally { dom.window.close(); restore(); }
});

test('local recovery import restores modern marks and unopened counts without changing the old TID array', async () => {
  const dom = new JSDOM(`<div class="thread-list"><div class="pgt"><div class="pg"><strong>1</strong></div></div>
    <article class="thread-row"><a class="resource-title" href="/resources/oldRecovered">MFYD-220 Example</a></article>
    <article class="thread-row"><a class="resource-title" href="/resources/stillUnread">FNS-267 Example</a></article>
    </div>`, { url: 'https://1080xin.com/boards/recoveryTest' });
  const restore = installDomGlobals(dom.window);
  const menus = new Map();
  const alerts = [];
  const pendingLegacyRequests = [];
  const old = ['tid:123', 'tid:456'];
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history', old],
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
  ]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_registerMenuCommand = (name, callback) => menus.set(name, callback);
  globalThis.GM_xmlhttpRequest = request => {
    if (request.url.startsWith('https://1080xin.com/')) pendingLegacyRequests.push(request);
    else queueMicrotask(() => request.onerror({ error: 'legacy site unavailable' }));
  };
  dom.window.alert = message => alerts.push(message);
  try {
    await import(`../src/userscript.js?history-recovery-import=${Date.now()}`);
    assert.equal(dom.window.document.getElementById('x1080x-ex-open-page').textContent, '批量打开未浏览（2）');
    await waitFor(() => pendingLegacyRequests.length === 2, 'automatic migration should be pending while a file is imported');
    assert.equal((await import('../src/settings-actions.js')).runSiteSettingsTool('import-history'), true);
    const root = dom.window.document.getElementById('x1080x-ex-history-import').shadowRoot;
    const input = root.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [{ size: 200, text: async () => JSON.stringify({
      format: 'x1080x-history-recovery-v1',
      entries: [{ tid: '123', url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=123', title: 'MFYD-220 Example - x1080x.com' }],
    }) }] });
    input.dispatchEvent(new dom.window.Event('change'));
    root.querySelector('[type="submit"]').click();
    await waitFor(() => /已匹配/.test(root.querySelector('[role="status"]').textContent), 'import should report its actual match count');
    assert.match(root.querySelector('[role="status"]').textContent, /已匹配 1 条旧 TID/);
    assert.equal(values.get('x1080x-ex:agaghhh-batch-open-history'), old);
    assert.deepEqual(old, ['tid:123', 'tid:456']);
    assert.ok(values.has('x1080x-ex:agaghhh-history-recovery-backup-v1'));
    assert.equal(dom.window.document.querySelector('[href="/resources/oldRecovered"]').getAttribute('data-x1080x-batch-opened'), '1');
    assert.equal(dom.window.document.querySelector('[href="/resources/stillUnread"]').getAttribute('data-x1080x-batch-opened'), null);
    assert.equal(dom.window.document.getElementById('x1080x-ex-open-page').textContent, '批量打开未浏览（1）');
    for (const request of pendingLegacyRequests) request.onerror({ error: 'mapping unavailable' });
    await waitFor(() => Object.keys(values.get('x1080x-ex:agaghhh-legacy-history-migration-v1')?.attemptedAt || {}).length === 2,
      'pending migration batch should finish after import');
    assert.ok(values.get('x1080x-ex:agaghhh-legacy-history-migration-v1').resolved['123'].includes('code:MFYD-220'),
      'finishing a stale background batch must not overwrite imported mappings');
    values.set('x1080x-ex:agaghhh-legacy-history-migration-v1', { resolved: {}, attemptedAt: {} });
    values.set('x1080x-ex:agaghhh-history-title-aliases', []);
    dom.window.document.querySelector('.thread-list').innerHTML = `<div class="pgt"><div class="pg"><strong>1</strong></div></div>
      <article class="thread-row"><a class="resource-title" href="/resources/oldRecovered">MFYD-220 Example</a></article>
      <article class="thread-row"><a class="resource-title" href="/resources/stillUnread">FNS-267 Example</a></article>`;
    await waitFor(() => dom.window.document.querySelector('[href="/resources/oldRecovered"]')?.getAttribute('data-x1080x-batch-opened') === '1',
      'recovered titles must survive even if an older open tab overwrites the old migration cache and alias index');
  } finally { dom.window.close(); await Promise.resolve(); restore(); }
});

test('recorded resource IDs and hydrated title aliases survive a custom domain change', async () => {
  const values = new Map([
    ['x1080x-ex:agaghhh-primary-domain', 'first.example.net'],
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
    ['x1080x-ex:agaghhh-download-enabled', false],
    ['x1080x-ex:1080xin-resource-history', '["resource:earlier"]'],
    ['x1080x-ex:agaghhh-batch-progress-map', {
      'https://agaghhh.cc/boards/domainTest': { url: 'https://first.example.net/boards/domainTest?page=4', updatedAt: 100 },
    }],
  ]);
  const installStorage = () => {
    globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
    globalThis.GM_setValue = (key, value) => values.set(key, value);
    globalThis.GM_xmlhttpRequest = () => assert.fail('domain compatibility should not need external lookups');
  };
  const visited = new JSDOM('<body><header class="thread-header"><h1>载入中</h1></header></body>', {
    url: 'https://first.example.net/resources/recordedID',
  });
  const restoreVisit = installDomGlobals(visited.window);
  installStorage();
  const menus = new Map();
  globalThis.GM_registerMenuCommand = (name, callback) => menus.set(name, callback);
  visited.window.prompt = () => 'second.example.net';
  visited.window.alert = () => {};
  try {
    await import(`../src/userscript.js?domain-visit=${Date.now()}`);
    visited.window.document.querySelector('h1').firstChild.nodeValue = 'FNS-267 后加载的标题';
    await waitFor(() => values.get('x1080x-ex:agaghhh-history-title-aliases')?.includes('code:FNS-267'),
      'the actual asynchronously rendered title must be saved');
    assert.deepEqual(values.get('x1080x-ex:1080xin-resource-history'), ['resource:earlier', 'resource:recordedID']);
    assert.equal((await import('../src/settings-actions.js')).runSiteSettingsTool('primary-domain'), true);
    assert.equal(values.get('x1080x-ex:agaghhh-primary-domain'), 'second.example.net');
    assert.ok(values.get('x1080x-ex:agaghhh-domain-aliases').includes('first.example.net'));
  } finally { visited.window.close(); await Promise.resolve(); restoreVisit(); }

  const board = new JSDOM(`<body><div class="thread-list"><div class="pgt"><div class="pg"><strong>1</strong></div></div>
    <article class="thread-row"><a class="resource-title" href="/resources/recordedID">标题已经修改</a></article>
    <article class="thread-row"><a class="resource-title" href="/resources/reindexedID">FNS-267 新版标题</a></article>
    <article class="thread-row"><a class="resource-title" href="/resources/unreadID">MFYD-220 未浏览</a></article>
    </div></body>`, { url: 'https://second.example.net/boards/domainTest' });
  const restoreBoard = installDomGlobals(board.window);
  installStorage();
  try {
    await import(`../src/userscript.js?domain-board=${Date.now()}`);
    for (const id of ['recordedID', 'reindexedID']) {
      assert.equal(board.window.document.querySelector(`[href="/resources/${id}"]`).getAttribute('data-x1080x-batch-opened'), '1');
    }
    assert.equal(board.window.document.querySelector('[href="/resources/unreadID"]').hasAttribute('data-x1080x-batch-opened'), false);
    assert.equal(board.window.document.getElementById('x1080x-ex-open-page').textContent, '批量打开未浏览（1）');
    const locator = board.window.document.getElementById('x1080x-ex-batch-progress-locator');
    locator.click();
    await waitFor(() => values.get('x1080x-ex:agaghhh-batch-progress-map')['https://agaghhh.cc/boards/domainTest'].url
      === 'https://second.example.net/boards/domainTest', 'progress should keep the domain-independent scope and use the new domain');
  } finally { board.window.close(); await Promise.resolve(); restoreBoard(); }
});

test('disabled or unset history setting never saves a hydrated resource title', async () => {
  for (const setting of [undefined, false]) {
    const dom = new JSDOM('<body><header class="thread-header"><h1>载入中</h1></header></body>', {
      url: 'https://1080xin.com/resources/disabledHistory',
    });
    const restore = installDomGlobals(dom.window);
    const writes = [];
    globalThis.GM_getValue = (key, fallback) => key === 'x1080x-ex:agaghhh-batch-open-history-enabled' ? setting
      : key === 'x1080x-ex:agaghhh-download-enabled' ? false : fallback;
    globalThis.GM_setValue = (key, value) => writes.push({ key, value });
    try {
      await import(`../src/userscript.js?disabled-title-history=${setting}`);
      dom.window.document.querySelector('h1').textContent = 'FNS-267 后加载标题';
      await new Promise(resolve => dom.window.setTimeout(resolve, 0));
      assert.deepEqual(writes, []);
    } finally { dom.window.close(); await Promise.resolve(); restore(); }
  }
});

test('split batch button switches between unopened-only and all without visiting settings', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>论坛列表</title></head><body>
    <div id="pgt"></div>
    <div id="threadlist"><table>
      <tbody id="normalthread_401"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=401">已浏览</a></th></tr></tbody>
      <tbody id="normalthread_402"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=402">未浏览</a></th></tr></tbody>
    </table></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75' });
  const restore = installDomGlobals(dom.window);
  const oldTimeout = dom.window.setTimeout;
  const oldClearTimeout = dom.window.clearTimeout;
  dom.window.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  dom.window.clearTimeout = () => {};
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:agaghhh-batch-open-unopened-only', true],
    ['x1080x-ex:agaghhh-batch-open-history', ['tid:401']],
  ]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  const opened = [];
  globalThis.GM_openInTab = (url) => opened.push(new URL(url).searchParams.get('tid'));
  try {
    await import(`../src/userscript.js?split-open=${Date.now()}`);
    const doc = dom.window.document;
    const button = doc.getElementById('x1080x-ex-open-page');
    const trigger = doc.getElementById('x1080x-ex-batch-mode-trigger');
    const menu = doc.getElementById('x1080x-ex-batch-mode-menu');
    assert.equal(button.textContent, '批量打开未浏览（1）');
    trigger.click();
    assert.equal(menu.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    const all = menu.querySelector('[data-batch-mode="all"]');
    const unread = menu.querySelector('[data-batch-mode="unread"]');
    assert.match(all.textContent, /打开本页全部（2）/);
    assert.match(unread.textContent, /仅打开未浏览（1）/);

    all.click();
    assert.equal(menu.hidden, true);
    assert.equal(values.get('x1080x-ex:agaghhh-batch-open-unopened-only'), false);
    assert.ok(button.querySelector('svg[data-x1080x-icon="batch"]'), 'mode switching preserves icon');
    await waitFor(() => opened.length === 2, 'all mode must open both posts');
    await waitFor(() => button.textContent === '批量打开本页（2）', 'all mode must become default');
    assert.deepEqual(opened, ['401', '402']);

    // Simulate another unvisited item appearing after the all-mode run.
    values.set('x1080x-ex:agaghhh-batch-open-history', ['tid:401']);
    trigger.click();
    assert.match(unread.textContent, /仅打开未浏览（1）/);
    unread.click();
    assert.equal(values.get('x1080x-ex:agaghhh-batch-open-unopened-only'), true);
    await waitFor(() => opened.length === 3, 'unread mode must skip visited 401');
    assert.deepEqual(opened, ['401', '402', '402']);
  } finally {
    dom.window.setTimeout = oldTimeout;
    dom.window.clearTimeout = oldClearTimeout;
    restore();
    dom.window.close();
  }
});

test('split batch button disables unread-only when record saving is off', async () => {
  const dom = new JSDOM(`<!doctype html><body><div id="pgt"></div>
    <div id="threadlist"><table>
      <tbody id="normalthread_401"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=401">帖子</a></th></tr></tbody>
    </table></div>`, { url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75' });
  const restore = installDomGlobals(dom.window);
  globalThis.GM_getValue = (key, fallback) => (
    key === 'x1080x-ex:agaghhh-batch-open-history-enabled' ? false : fallback
  );
  try {
    await import(`../src/userscript.js?split-disabled=${Date.now()}`);
    const trigger = dom.window.document.getElementById('x1080x-ex-batch-mode-trigger');
    assert.ok(trigger);
    trigger.click();
    const unread = dom.window.document.querySelector('[data-batch-mode="unread"]');
    assert.equal(unread.disabled, true);
    assert.match(unread.title, /保存批量打开记录/);
    assert.ok(!dom.window.document.querySelector('[data-batch-mode="all"]').disabled);
  } finally {
    restore();
    dom.window.close();
  }
});

test('bulk download waits for HDblog Preview in flight, then saves cover and Preview', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>FNS-267</title></head><body>
    <div class="panel detail-panel"><header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
      </div></span></div>
      <h1>FNS-267 [BT] Sample</h1>
    </header></div>
    <article id="first-post" class="post"><div class="post-content">
      <div class="post-text"><div class="protected-text discuz-body">
        <img class="body-image" src="https://images.example.com/fns-267-cover.jpg">
      </div></div>
    </div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/modernfns267?page=1' });
  const restore = installDomGlobals(dom.window);
  const requests = [];
  const saved = [];
  let articleReply = null;
  const searchUrl = 'https://javclub.me/?s=FNS-267';
  const articleUrl = 'https://javclub.me/8765.html';
  const previewUrl = 'https://images.example.com/fns-267-preview.jpg';
  const originalGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => {
    if (key === 'x1080x-ex:agaghhh-javfree-preview-fallback-enabled') return false;
    if (key === 'x1080x-ex:agaghhh-official-preview-fallback-enabled') return false;
    return fallback;
  };
  dom.window.URL.createObjectURL = () => 'blob:preview-download-test';
  dom.window.URL.revokeObjectURL = () => {};
  globalThis.GM_download = (opts) => {
    saved.push(opts.name);
    queueMicrotask(() => opts.onload());
  };
  globalThis.GM_xmlhttpRequest = (opts) => {
    requests.push({ url: opts.url, type: opts.responseType });
    if (opts.responseType === 'text' && opts.url === searchUrl) {
      queueMicrotask(() => opts.onload({
        status: 200, finalUrl: searchUrl,
        responseText: `<main id="genesis-content"><article class="entry">
          <h2 class="entry-title"><a href="${articleUrl}">FNS-267</a></h2>
        </article></main>`,
      }));
      return;
    }
    if (opts.responseType === 'text' && opts.url === articleUrl) {
      articleReply = () => opts.onload({
        status: 200, finalUrl: articleUrl,
        responseText: `<main id="genesis-content"><article class="entry"><div class="entry-content">
          <p>Preview:</p><p><a href="${previewUrl}"><img src="${previewUrl}"></a></p><p>BTFile:</p>
        </div></article></main>`,
      });
      return;
    }
    if (opts.responseType === 'blob') {
      queueMicrotask(() => opts.onload({
        status: 200, finalUrl: opts.url,
        responseHeaders: 'Content-Type: image/jpeg',
        response: new dom.window.Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      }));
      return;
    }
    assert.fail(`unexpected Preview test request ${opts.url}`);
  };

  try {
    await import(`../src/userscript.js?modern-preview-wait=${Date.now()}`);
    const { installAgaghhhHdblogPreview } = await import('../src/agaghhh-hdblog-preview.js');
    const previewTask = installAgaghhhHdblogPreview(
      dom.window.document, dom.window.location, globalThis.GM_xmlhttpRequest
    );
    await waitFor(() => typeof articleReply === 'function', 'HDblog matching article lookup should be pending');

    const button = dom.window.document.getElementById('x1080x-ex-download');
    assert.ok(button);
    button.click();
    assert.equal(button.disabled, true);
    assert.equal(saved.length, 0, 'must not snapshot/download the cover before Preview lookup finishes');
    assert.match(dom.window.document.getElementById('x1080x-ex-download-status').textContent,
      /等待 Preview 加载完成/);
    articleReply();
    await previewTask;
    await waitFor(() => saved.length === 2 && !button.disabled, 'both images should be saved');
    assert.deepEqual(saved, ['FNS-267 A.jpg', 'FNS-267 B.jpg']);
    assert.ok(requests.some((request) => request.url === previewUrl && request.type === 'blob'));
    assert.match(dom.window.document.getElementById('x1080x-ex-download-status').textContent,
      /已处理 2\/2 · 已保存 2/);
  } finally {
    globalThis.GM_getValue = originalGet;
    restore();
    dom.window.close();
  }
});

test('JavClub 列表：按钮在顶栏右侧，先批量打开后定位；运行时按钮颜色一致', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <nav class="nav-primary"><div class="wrap"><ul class="genesis-nav-menu">
      <li><a href="/">Home</a></li><li><a href="/category/jav-censored/">JAV Censored</a></li>
    </ul></div></nav>
    <main id="genesis-content">
    <div class="archive-description">最新文章</div>
    <article class="entry"><header class="entry-header"><h2 class="entry-title">
      <a href="/1013749.html">START-662 新主题</a></h2></header></article>
    <article class="entry"><header class="entry-header"><h2 class="entry-title">
      <a href="/1013622.html">FC2-PPV 4999948 已访问</a></h2></header></article>
  </main></body></html>`, { url: 'https://javclub.me/category/jav-censored/' });
  const restore = installDomGlobals(dom.window);
  const store = new Map([
    ['x1080x-ex:hdblog-batch-open-history-enabled', true],
    ['x1080x-ex:hdblog-batch-open-unopened-only', true],
    ['x1080x-ex:hdblog-batch-open-history', ['post:1013622']],
  ]);
  globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => store.set(key, value);
  const opened = [];
  globalThis.GM_openInTab = (url) => opened.push(url);
  const originalTimeout = dom.window.setTimeout;
  dom.window.setTimeout = (callback) => { queueMicrotask(callback); return 1; };
  try {
    await import(`../src/userscript.js?javclub-toolbar-${Date.now()}`);
    const doc = dom.window.document;
    const locator = doc.getElementById('x1080x-ex-batch-progress-locator');
    const split = doc.getElementById('x1080x-ex-batch-split');
    const main = doc.getElementById('x1080x-ex-open-page');
    const dropdown = doc.getElementById('x1080x-ex-batch-mode-trigger');
    assert.ok(locator && split && main && dropdown);
    const toolbar = doc.querySelector('.nav-primary .wrap > #x1080x-ex-open-page-toolbar');
    assert.ok(toolbar, 'JavClub 工具栏应出现在顶栏右侧');
    assert.equal(split.parentElement, toolbar);
    assert.equal(locator.parentElement, toolbar);
    assert.equal(split.nextElementSibling, locator, '批量打开应在左、定位应在右');
    assert.equal(toolbar.style.right, '14px');
    assert.equal(doc.querySelector('.archive-description').contains(split), false);
    assert.equal(split.dataset.x1080xState, 'idle');
    assert.equal(main.style.background, '', '主按钮颜色由共享样式控制');
    assert.equal(dropdown.style.background, '', '下拉按钮颜色由共享样式控制');
    const compactStyles = doc.getElementById('x1080x-ex-batch-compact-controls').textContent;
    assert.match(compactStyles, /--x1080x-batch-bg:#398bd4/);
    assert.match(compactStyles, /data-x1080x-state="running"/);
    assert.match(compactStyles, /#x1080x-ex-batch-split:hover > #x1080x-ex-open-page/);
    assert.match(compactStyles, /#x1080x-ex-batch-split:hover > #x1080x-ex-batch-mode-trigger/);
    assert.match(compactStyles, /transition:background-color/);
    main.dispatchEvent(new dom.window.MouseEvent('mouseenter', { bubbles: true }));
    assert.equal(main.style.background, '', '鼠标移入不应覆盖统一配色');
    assert.equal(main.getAttribute('data-x1080x-count'), '1');
    assert.match(main.querySelector('svg[data-x1080x-icon="batch"]').innerHTML, /<rect/);
    main.click();
    assert.equal(split.dataset.x1080xState, 'running', '运行中由父容器统一设为红色');
    assert.equal(dropdown.disabled, true, '运行时禁止更改打开模式');
    await waitFor(() => opened.length === 1, 'should open only the unread JavClub article');
    assert.deepEqual(opened, ['https://javclub.me/1013749.html']);
    await waitFor(() => main.getAttribute('data-x1080x-count') === '0',
      'unopened count should update after completion');
    await waitFor(() => split.dataset.x1080xState === 'idle', '完成后整个按钮组恢复蓝色');
    assert.equal(main.style.background, dropdown.style.background, '完成后没有单独残留的红色背景');
    assert.ok(store.get('x1080x-ex:hdblog-batch-open-history').includes('post:1013749'));
  } finally {
    dom.window.setTimeout = originalTimeout;
    restore();
    dom.window.close();
  }
});

test('JavClub .html 正文浏览记入沿用的 HDblog 历史，不会丢失旧记录', async () => {
  const dom = new JSDOM(`<!doctype html><html><body class="single-post">
    <main id="genesis-content"><article class="entry">
      <header class="entry-header"><h1 class="entry-title">START-662 Sample</h1></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article></main></body></html>`, { url: 'https://javclub.me/1013749.html' });
  const restore = installDomGlobals(dom.window);
  const store = new Map([
    ['x1080x-ex:hdblog-batch-open-history-enabled', true],
    ['x1080x-ex:hdblog-batch-open-history', ['post:1013622']],
  ]);
  globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => store.set(key, value);
  try {
    await import(`../src/userscript.js?javclub-article-${Date.now()}`);
    const values = store.get('x1080x-ex:hdblog-batch-open-history');
    assert.deepEqual(values, ['post:1013622', 'post:1013749']);
  } finally {
    restore();
    dom.window.close();
  }
});


test('JavClub 无尾斜杠分类首页：能跨页扫描，不能错误提示只检查 1 页', async () => {
  const root = 'https://javclub.me/category/av-censored';
  const page2 = 'https://javclub.me/category/av-censored/page/2/';
  const dom = new JSDOM('<!doctype html><html><head></head><body>'
    + '<nav class="nav-primary"><div class="wrap"><ul class="genesis-nav-menu"></ul></div></nav>'
    + '<main id="genesis-content">'
    + '<article class="entry"><h2 class="entry-title"><a href="/1202.html">未浏览 1202</a></h2></article>'
    + '<article class="entry"><h2 class="entry-title"><a href="/1201.html">未浏览 1201</a></h2></article>'
    + '</main></body></html>', { url: root });
  const restore = installDomGlobals(dom.window);
  const store = new Map([
    ['x1080x-ex:hdblog-batch-open-history-enabled', true],
    ['x1080x-ex:hdblog-batch-open-history', ['post:1199']],
  ]);
  globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => store.set(key, value);
  const requests = [];
  dom.window.fetch = async (url) => {
    requests.push(String(url));
    assert.equal(String(url), page2);
    return {
      ok: true,
      text: async () => '<!doctype html><html><head></head><body>'
        + '<main id="genesis-content">'
        + '<article class="entry"><h2 class="entry-title"><a href="/1199.html">已浏览</a></h2></article>'
        + '<article class="entry"><h2 class="entry-title"><a href="/1198.html">未浏览</a></h2></article>'
        + '</main></body></html>',
    };
  };
  const alerts = [];
  dom.window.alert = (message) => alerts.push(String(message));
  try {
    await import('../src/userscript.js?javclub-no-trailing-slash=' + Date.now());
    const locator = dom.window.document.getElementById('x1080x-ex-batch-progress-locator');
    assert.ok(locator);
    locator.click();
    await waitFor(() => store.get('x1080x-ex:hdblog-batch-progress-map')
      ? Object.values(store.get('x1080x-ex:hdblog-batch-progress-map')).some((entry) => entry.url === page2)
      : false, 'no-slash archive should scan page 2 and locate a visited boundary');
    assert.deepEqual(requests, [page2]);
    assert.deepEqual(alerts, []);
    assert.ok(store.get('x1080x-ex:hdblog-batch-progress-map')['https://javclub.me/category/av-censored/']);
  } finally {
    restore();
    dom.window.close();
  }
});


test('x1080x board 7RHPO2w4jFUYiDhDsxz0wE scans ?page=2 with no known pagination element', async () => {
  const root = 'https://1080xin.com/boards/7RHPO2w4jFUYiDhDsxz0wE';
  const page2 = root + '?page=2';
  const dom = new JSDOM('<!doctype html><html><head></head><body>'
    + '<div class="thread-list"><div class="pgt"></div>'
    + '<article class="thread-row"><a class="resource-title" href="/resources/NEW1">NEW1</a></article>'
    + '<article class="thread-row"><a class="resource-title" href="/resources/NEW2">NEW2</a></article>'
    + '</div></body></html>', { url: root });
  const restore = installDomGlobals(dom.window);
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:1080xin-resource-history', ['resource:VISITED2']],
  ]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  const fetched = [];
  dom.window.fetch = async (url) => {
    fetched.push(String(url));
    assert.equal(String(url), page2);
    return {
      ok: true,
      text: async () => '<!doctype html><html><head></head><body><div class="thread-list">'
        + '<article class="thread-row"><a class="resource-title" href="/resources/VISITED2">已浏览</a></article>'
        + '<article class="thread-row"><a class="resource-title" href="/resources/UNREAD2">未浏览</a></article>'
        + '</div></body></html>',
    };
  };
  const alerts = [];
  dom.window.alert = (message) => alerts.push(String(message));
  try {
    await import('../src/userscript.js?modern-board-no-next=' + Date.now());
    const locator = dom.window.document.getElementById('x1080x-ex-batch-progress-locator');
    assert.ok(locator);
    locator.click();
    await waitFor(() => values.get('x1080x-ex:agaghhh-batch-progress-map')
      ? values.get('x1080x-ex:agaghhh-batch-progress-map')
        ['https://agaghhh.cc/boards/7RHPO2w4jFUYiDhDsxz0wE']?.url === page2
      : false, 'modern board progress must locate the visited/unvisited boundary on page 2');
    assert.deepEqual(fetched, [page2]);
    assert.deepEqual(alerts, []);
  } finally {
    restore();
    dom.window.close();
  }
});


test('x1080x no-history-match at page9 shell schedules same-tab browser hydration instead of an error', async () => {
  const root = 'https://1080xin.com/boards/7RHPO2w4jFUYiDhDsxz0wE';
  const makeBoard = (number) => '<!doctype html><html><head></head><body>'
    + '<div class="thread-list"><div class="pgt"></div>'
    + '<article class="thread-row"><a class="resource-title" href="/resources/DIFF' + number + '">主题</a></article>'
    + '</div></body></html>';
  const dom = new JSDOM(makeBoard(1), { url: root });
  const restore = installDomGlobals(dom.window);
  globalThis.GM_getValue = (key, fallback) => ({
    'x1080x-ex:agaghhh-batch-open-history-enabled': true,
    'x1080x-ex:1080xin-resource-history': ['resource:NOTFOUND8'],
  })[key] ?? fallback;
  globalThis.GM_setValue = () => {};
  const fetched = [];
  const alerts = [];
  dom.window.alert = (message) => alerts.push(String(message));
  dom.window.fetch = async (url) => {
    const number = Number(new URL(url).searchParams.get('page'));
    fetched.push(number);
    return {
      ok: true,
      text: async () => number === 9
        ? '<!doctype html><html><head></head><body><div id="__next"></div></body></html>'
        : makeBoard(number),
    };
  };
  try {
    await import('../src/userscript.js?modern-shell-recovery-' + Date.now());
    const button = dom.window.document.getElementById('x1080x-ex-batch-progress-locator');
    assert.ok(button);
    button.click();
    await waitFor(() => Boolean(dom.window.sessionStorage.getItem(
      'x1080x-ex:modern-board-locator-resume-v1')),
      'should store a bounded same-tab hydration handoff to page 9');
    const pending = JSON.parse(dom.window.sessionStorage.getItem(
      'x1080x-ex:modern-board-locator-resume-v1'));
    assert.equal(pending.targetUrl, root + '?page=9');
    assert.deepEqual(pending.visitedUrls, [root + '?page=9']);
    assert.deepEqual(fetched, [2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(alerts, []);
  } finally {
    restore();
    dom.window.close();
  }
});

test('x1080x resumed board uses actual hydrated document and clears pending state', async () => {
  const root = 'https://1080xin.com/boards/7RHPO2w4jFUYiDhDsxz0wE';
  const page9 = root + '?page=9';
  const dom = new JSDOM('<!doctype html><html><head></head><body><div class="thread-list">'
    + '<div class="pgt"></div>'
    + '<article class="thread-row"><a class="resource-title" href="/resources/VISITED">已浏览</a></article>'
    + '<article class="thread-row"><a class="resource-title" href="/resources/NEW">未浏览</a></article>'
    + '</div></body></html>', { url: page9 });
  const restore = installDomGlobals(dom.window);
  const state = {
    version: 1,
    scope: root,
    targetUrl: page9,
    startedAt: Date.now(),
    visitedUrls: [page9],
  };
  dom.window.sessionStorage.setItem('x1080x-ex:modern-board-locator-resume-v1', JSON.stringify(state));
  const values = new Map([
    ['x1080x-ex:agaghhh-batch-open-history-enabled', true],
    ['x1080x-ex:1080xin-resource-history', ['resource:VISITED']],
  ]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  const alerts = [];
  dom.window.alert = (message) => alerts.push(String(message));
  dom.window.fetch = async () => ({
    ok: true,
    text: async () => '<!doctype html><html><head></head><body><div id="__next"></div></body></html>',
  });
  try {
    await import('../src/userscript.js?modern-real-dom-resume-' + Date.now());
    await waitFor(() => dom.window.sessionStorage.getItem(
      'x1080x-ex:modern-board-locator-resume-v1') === null,
      'resumed locator should use hydrated topic rows and finish');
    assert.equal(values.get('x1080x-ex:agaghhh-batch-progress-map')
      ['https://agaghhh.cc/boards/7RHPO2w4jFUYiDhDsxz0wE']?.url, page9);
    assert.deepEqual(alerts, []);
  } finally {
    restore();
    dom.window.close();
  }
});
