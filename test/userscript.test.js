import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function installDomGlobals(window) {
  const previous = new Map();
  for (const name of ['window', 'document', 'location', 'URL', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand', 'GM_download']) {
    previous.set(name, globalThis[name]);
  }

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.URL = window.URL;
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

test('点击下载按钮后，Discuz X1.5 附件和图片都交给 GM_download，不触发页面链接导航', async () => {
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">ABCD-123 (HD1080P)(abcd00123)本文タイトル</span></h1>
    <div id="postlist"><div id="post_1">
      <div id="postmessage_1">
        <img id="aimg_1" src="/data/attachment/forum/cover.jpg" width="1920" height="1080">
      </div>
      <div class="pattl"><a href="attachment.php?aid=encoded-x15-id">abcd00123.rar</a></div>
    </div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806' });
  const restore = installDomGlobals(dom.window);
  const calls = [];
  globalThis.GM_download = (details) => {
    calls.push(details);
    queueMicrotask(() => details.onload?.());
  };

  try {
    await import(`../src/userscript.js?test=${Date.now()}`);
    const button = dom.window.document.querySelector('#x1080x-ex-download');
    assert.ok(button, '帖子页应插入下载按钮');

    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(calls.map(({ url, name }) => ({ url, name })), [
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
  } finally {
    restore();
    dom.window.close();
  }
});
