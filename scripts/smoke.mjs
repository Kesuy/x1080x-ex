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
dom.window.GM_getValue = (_key, fallback) => fallback;
dom.window.GM_setValue = () => {};
dom.window.GM_registerMenuCommand = () => {};
dom.window.GM_info = {
  downloadMode: 'default',
  scriptHandler: 'Tampermonkey',
  version: '5.5.0',
};
dom.window.URL.createObjectURL = (blob) => {
  const url = `blob:smoke-${calls.length}`;
  calls.at(-1).blobSize = blob.size;
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
  });
  queueMicrotask(() => details.onload?.({
    status: 200,
    finalUrl: details.url,
    responseHeaders: 'Content-Type: image/jpeg',
    response: new dom.window.Blob(['jpg'], { type: 'image/jpeg' }),
  }));
};
dom.window.alert = () => {};
dom.window.prompt = () => null;

dom.window.eval(artifact);
const button = dom.window.document.querySelector('#x1080x-ex-download');
assert.ok(button, '构建产物应在 Discuz 帖子页插入下载按钮');
button.click();
for (let attempt = 0; attempt < 100 && (saved.length < 2 || revoked.length < 2); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal(saved.length, 2, 'both Blob downloads should be saved');
assert.equal(revoked.length, 2, 'both Object URLs should be revoked');

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
    blobSize: 3,
  },
]);
assert.deepEqual(saved, [
  { url: 'blob:smoke-1', name: 'ABCD-123 本文タイトル.rar' },
  { url: 'blob:smoke-2', name: 'ABCD-123.jpg' },
]);
assert.deepEqual(revoked, ['blob:smoke-1', 'blob:smoke-2']);
assert.equal(dom.window.location.href, 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806');
assert.equal(dom.window.document.querySelector('a[download]'), null);

dom.window.close();
console.log('Built userscript smoke test passed: attachment and image use validated Blob downloads.');
