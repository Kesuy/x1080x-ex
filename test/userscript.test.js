import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

function installDomGlobals(window) {
  const names = [
    'window', 'document', 'location', 'URL', 'Blob', 'FileReader', 'AbortController',
    'GM_info', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand',
    'GM_xmlhttpRequest',
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

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  };
}

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
