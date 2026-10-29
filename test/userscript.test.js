import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

function installDomGlobals(window) {
  const names = [
    'window', 'document', 'location', 'URL', 'Blob', 'FileReader', 'AbortController',
    'GM_info', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand',
    'GM_xmlhttpRequest', 'GM_openInTab',
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
    assert.equal(button.textContent, '后台顺序打开本页主题（3）');
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
    assert.equal(button.parentElement, archiveDescription);
    assert.equal(archiveDescription.firstElementChild, button);
    assert.equal(archiveDescription.nextElementSibling, firstArticle);
    assert.equal(dom.window.document.querySelector('#x1080x-ex-open-page-toolbar'), null);
    assert.equal(button.textContent, '后台顺序打开本页主题（2）');
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
    assert.equal(button.textContent, '后台顺序打开未打开主题（2）');

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
      () => button.textContent === '后台顺序打开未打开主题（0）',
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
    assert.equal(button.textContent, '后台顺序打开未打开主题（1）');

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
      () => button.textContent === '后台顺序打开未打开主题（0）',
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

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

test('附件和图片先请求 Blob，再用指定 download 文件名保存；跳转地址不改名且 Object URL 被回收', async () => {
  const dom = threadDom();
  const restore = installDomGlobals(dom.window);
  const requests = [];
  const saved = [];
  const revoked = [];
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
    assert.equal(button.textContent, '⬇');
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
    assert.match(dom.window.document.querySelector('#x1080x-ex-open-page')?.textContent || '', /未打开主题（1）/);
    assert.ok([...menus.keys()].some((name) => name.includes('设置 x1080x 站点域名')));
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
    assert.equal(button.textContent, '后台顺序打开未打开主题（1）');
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
    await waitFor(() => button.textContent === '后台顺序打开未打开主题（0）',
      'modern bulk open count should follow new list contents');
  } finally {
    dom.window.setTimeout = oldTimeout;
    dom.window.clearTimeout = oldClearTimeout;
    restore();
    dom.window.close();
  }
});

test('modern x1080x resource restores the visible blue download button and routes ZIP to the original site without a prompt', async () => {
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
    assert.match(button.textContent, /下载资源/);
    assert.equal(button.style.display, 'inline-flex');
    assert.ok(values.get('x1080x-ex:1080xin-resource-history').includes('resource:1Dw4hDQzhfzZdV9ZZWeQWU'));
    button.click();
    await waitFor(() => nativeClicks === 1, 'ZIP download is handed to the original site button exactly once');
    assert.equal(nativeClicks, 1);
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
