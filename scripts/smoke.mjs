import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const artifact = await readFile(new URL('../dist/x1080x-ex.user.js', import.meta.url), 'utf8');
assert.match(artifact, /^\/\/ ==UserScript==/);

const dom = new JSDOM(`
  <h1 class="ts"><span id="thread_subject">ABCD-123 (HD1080P)(abcd00123)本文タイトル</span></h1>
  <div id="postlist"><div id="post_1">
    <div id="postmessage_1">
      <img id="aimg_1" src="/data/attachment/forum/cover.jpg" width="1920" height="1080">
      <section><a href="https://hdblog.me/123/abcd-123/"><img src="https://img1.pixhost.to/images/preview.jpg" data-x1080x-hdblog-preview-url="https://img1.pixhost.to/images/preview.jpg" data-x1080x-preview-referer="https://hdblog.me/123/abcd-123/"></a></section>
    </div>
    <div class="pattl"><a href="attachment.php?aid=encoded-x15-id">abcd00123.rar</a></div>
  </div></div>
`, {
  url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806',
  runScripts: 'outside-only',
});

const calls = [];
const saved = [];
const revoked = [];
const releaseDelays = [];
const scheduleTimeout = dom.window.setTimeout.bind(dom.window);
dom.window.setTimeout = (callback, delay) => {
  if (delay === 10000) releaseDelays.push(delay);
  return scheduleTimeout(callback, delay === 10000 ? 0 : delay);
};
let objectUrlCount = 0;
dom.window.GM_getValue = (key, fallback) => (
  key === 'x1080x-ex:agaghhh-hdblog-preview-enabled' ? false : fallback
);
dom.window.GM_setValue = () => {};
dom.window.GM_registerMenuCommand = () => {};
dom.window.GM_info = {
  downloadMode: 'default',
  scriptHandler: 'Tampermonkey',
  version: '5.5.0',
};
dom.window.URL.createObjectURL = (blob) => {
  objectUrlCount += 1;
  const url = `blob:smoke-${objectUrlCount}`;
  if (calls.length) calls.at(-1).blobSize = blob.size;
  return url;
};
dom.window.URL.revokeObjectURL = (url) => revoked.push(url);
dom.window.HTMLAnchorElement.prototype.click = function click() {
  saved.push({ url: this.href, name: this.download });
};
dom.window.fetch = async (url, details) => {
  calls.push({
    transport: 'fetch',
    method: details.method,
    url,
    credentials: details.credentials,
    redirect: details.redirect,
  });
  return {
    status: 200,
    url: 'https://agaghhh.cc/forum.php?mod=attachment&aid=redirected',
    headers: new Map([['content-type', 'application/vnd.rar']]),
    blob: async () => new dom.window.Blob(['Rar!'], { type: 'application/vnd.rar' }),
  };
};
dom.window.GM_xmlhttpRequest = (details) => {
  calls.push({
    transport: 'gm',
    method: details.method,
    url: details.url,
    responseType: details.responseType,
    anonymous: details.anonymous,
    referer: details.headers?.Referer,
  });
  const imageBytes = details.url.includes('img1.pixhost.to')
    ? new Uint8Array(64 * 1024)
    : new Uint8Array([0xff, 0xd8, 0xff]);
  queueMicrotask(() => details.onload?.({
    status: 200,
    finalUrl: details.url,
    responseHeaders: 'Content-Type: image/jpeg',
    response: new dom.window.Blob([imageBytes], { type: 'image/jpeg' }),
  }));
};
dom.window.alert = () => {};
dom.window.prompt = () => null;

dom.window.eval(artifact);
const button = dom.window.document.querySelector('#x1080x-ex-download');
assert.ok(button, '构建产物应在 Discuz 帖子页插入下载按钮');
assert.equal(button.style.margin, '0px 8px 6px 6px', '下载按钮应与相邻操作按钮保持统一 6px 间距');
button.click();
for (let attempt = 0; attempt < 100 && (saved.length < 3 || revoked.length < 3); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal(saved.length, 3, 'attachment, original cover and Preview should all be saved');
assert.equal(revoked.length, 3, 'all Object URLs should be revoked');
assert.deepEqual(releaseDelays, [10000, 10000, 10000], 'fallback Object URLs remain valid while the browser starts downloads');

assert.deepEqual(calls, [
  {
    transport: 'fetch',
    method: 'GET',
    url: 'https://agaghhh.cc/attachment.php?aid=encoded-x15-id',
    credentials: 'include',
    redirect: 'follow',
    blobSize: 4,
  },
  {
    transport: 'gm',
    method: 'GET',
    url: 'https://agaghhh.cc/data/attachment/forum/cover.jpg',
    responseType: 'blob',
    anonymous: undefined,
    referer: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806',
  },
  {
    transport: 'gm',
    method: 'GET',
    url: 'https://img1.pixhost.to/images/preview.jpg',
    responseType: 'blob',
    anonymous: undefined,
    referer: 'https://hdblog.me/123/abcd-123/',
    blobSize: 65536,
  },
]);
assert.deepEqual(saved, [
  { url: 'blob:smoke-1', name: 'ABCD-123 本文タイトル.rar' },
  { url: 'blob:smoke-2', name: 'ABCD-123 A.jpg' },
  { url: 'blob:smoke-3', name: 'ABCD-123 B.jpg' },
]);
assert.deepEqual(revoked, ['blob:smoke-1', 'blob:smoke-2', 'blob:smoke-3']);
assert.equal(dom.window.location.href, 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806');
assert.equal(dom.window.document.querySelector('a[download]'), null);

dom.window.close();
console.log('Built userscript smoke test passed: attachment, original cover and Preview all use validated Blob downloads.');

// Exercise the actual bundled entry point on 98堂, including native form dispatch.
for (const enabled of [true, false]) {
  const sht = new JSDOM(`<body><div id="postlist"><div id="post_1">
    <a id="postnum1">楼主</a><div id="postmessage_1"><span id="attach_1"><a href="forum.php?mod=attachment&aid=file">附件.txt</a></span>
    <div class="locked">如果您要查看本帖隐藏内容请<a href="forum.php?mod=post&action=reply">回复</a></div></div>
    </div></div><form id="fastpostform"><textarea id="fastpostmessage"></textarea>
    <button id="fastpostsubmit" type="submit">发表回复</button></form></body>`, {
    url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=123', runScripts: 'outside-only',
  });
  const menus = new Map();
  let requests = 0;
  let replies = 0;
  let attachmentClicks = 0;
  sht.window.GM_getValue = (key, fallback) => key.startsWith('x1080x-ex:sehuatang-')
    && key.endsWith('-enabled') ? enabled : fallback;
  sht.window.GM_setValue = () => {};
  sht.window.GM_registerMenuCommand = (name, callback) => menus.set(name, callback);
  sht.window.GM_xmlhttpRequest = () => requests++;
  sht.window.fetch = () => { requests++; throw new Error('Unexpected network request'); };
  sht.window.document.getElementById('fastpostform').addEventListener('submit', event => {
    event.preventDefault();
    replies++;
  });
  sht.window.document.querySelector('#attach_1 a').addEventListener('click', event => {
    event.preventDefault();
    attachmentClicks++;
  });
  sht.window.eval(artifact);
  assert.ok(menus.has('⚙️ 98堂设置'));
  const toolbar = sht.window.document.getElementById('x1080x-ex-sehuatang-toolbar');
  assert.equal(Boolean(toolbar), enabled);
  assert.equal(replies, 0);
  assert.equal(attachmentClicks, 0);
  if (enabled) {
    assert.equal(toolbar.shadowRoot.querySelectorAll('.attachment-row').length, 1);
    assert.match(toolbar.shadowRoot.querySelector('.hidden-notice').textContent, /回复后可见/);
    toolbar.shadowRoot.querySelector('[data-action="download-attachment"]').click();
    assert.equal(attachmentClicks, 1);
    toolbar.shadowRoot.querySelector('[data-action="reply"]').click();
    assert.equal(replies, 1);
    assert.equal(sht.window.document.getElementById('fastpostmessage').value, '感谢楼主分享，辛苦了！');
  }
  assert.equal(requests, 0);
  sht.window.close();
}
console.log('Built userscript smoke test passed: 98堂 independent switches, native attachment download/quick reply and no automatic requests.');
