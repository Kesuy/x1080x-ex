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
dom.window.GM_getValue = (_key, fallback) => fallback;
dom.window.GM_setValue = () => {};
dom.window.GM_registerMenuCommand = () => {};
dom.window.GM_download = (details) => {
  calls.push({ url: details.url, name: details.name });
  queueMicrotask(() => details.onload?.());
};
dom.window.alert = () => {};
dom.window.prompt = () => null;

dom.window.eval(artifact);
const button = dom.window.document.querySelector('#x1080x-ex-download');
assert.ok(button, '构建产物应在 Discuz 帖子页插入下载按钮');
button.click();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.deepEqual(calls, [
  {
    url: 'https://agaghhh.cc/attachment.php?aid=encoded-x15-id',
    name: 'ABCD-123 本文タイトル.rar',
  },
  {
    url: 'https://agaghhh.cc/data/attachment/forum/cover.jpg',
    name: 'ABCD-123.jpg',
  },
]);
assert.equal(dom.window.location.href, 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806');
assert.equal(dom.window.document.querySelector('a[download]'), null);

dom.window.close();
console.log('Built userscript smoke test passed: attachment and image use GM_download.');
