import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { downloadSehuatangNamedTxtBlob } from '../src/sehuatang-download.js';

test('98堂：Blob 下载强制使用帖子标题而不是 Content-Disposition 原文件名', async () => {
  const dom = new JSDOM('<body><a href="forum.php?mod=attachment&aid=test">TXT</a></body>', {
    url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3726253',
  });
  const doc = dom.window.document;
  const link = doc.querySelector('a');
  const saved = [];
  dom.window.URL.createObjectURL = blob => {
    assert.ok(blob.size > 0);
    return 'blob:renamed';
  };
  dom.window.URL.revokeObjectURL = () => {};
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function() {
    saved.push({ name: this.download, url: this.href });
  };
  dom.window.fetch = async (url, options) => {
    assert.equal(url, link.href);
    assert.equal(options.credentials, 'include');
    assert.equal(options.method, 'GET');
    return {
      ok: true, status: 200,
      headers: new Map([['content-type', 'application/octet-stream'],
        ['content-disposition', 'attachment; filename="original.txt"']]),
      blob: async () => new Blob(['valid text'], { type: 'application/octet-stream' }),
    };
  };
  try {
    assert.deepEqual(await downloadSehuatangNamedTxtBlob(doc, link, '帖子标题.txt'), { confirmed: false });
    assert.deepEqual(saved, [{ name: '帖子标题.txt', url: 'blob:renamed' }]);
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    dom.window.close();
  }
});

test('98堂：拒绝跨站来源、非 TXT、403 和伪装的 HTML 验证页面', async () => {
  const dom = new JSDOM('<body><a href="forum.php?mod=attachment&aid=valid">TXT</a></body>', {
    url: 'https://sehuatang.org/forum.php?mod=viewthread&tid=3726253',
  });
  const doc = dom.window.document, link = doc.querySelector('a');
  const requests = [];
  dom.window.fetch = async () => {
    requests.push(true);
    return { ok: false, status: 403 };
  };
  await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'ok.txt'), /HTTP 403/);
  await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'bad.zip'), /无效/);
  link.setAttribute('href', 'https://evil.example/attachment.php?aid=bad');
  await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'ok.txt'), /无效/);
  assert.equal(requests.length, 1);
  link.setAttribute('href', 'forum.php?mod=attachment&aid=valid');
  dom.window.fetch = async () => ({
    ok: true,
    headers: new Map([['content-type', 'application/octet-stream']]),
    blob: async () => new Blob(['<!doctype html><html>Permission denied</html>'], {
      type: 'application/octet-stream',
    }),
  });
  await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'ok.txt'), /登录或权限页面/);
  dom.window.close();
});

test('98堂：优先使用 GM_xmlhttpRequest 绕开页面 fetch 限制，保留 Cookie 会话和 Referer', async () => {
  const dom = new JSDOM('<body><a href="forum.php?mod=attachment&aid=signed">TXT</a></body>', {
    url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3726253',
  });
  const doc = dom.window.document;
  const link = doc.querySelector('a');
  const calls = [], saved = [];
  const originalGM = globalThis.GM_xmlhttpRequest;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.fetch = () => { throw new Error('page fetch is blocked by CSP or CORS'); };
  dom.window.URL.createObjectURL = () => 'blob:gm-renamed';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function() {
    saved.push(this.download);
  };
  globalThis.GM_xmlhttpRequest = options => {
    calls.push(options);
    queueMicrotask(() => options.onload({
      status: 200,
      responseHeaders: 'content-type: text/plain; charset=UTF-8\\r\\ncontent-disposition: attachment; filename="original.txt"',
      response: new Blob(['ed2k://example'], { type: 'text/plain' }),
    }));
  };
  try {
    const result = await downloadSehuatangNamedTxtBlob(doc, link, '正确的帖子名.txt');
    assert.deepEqual(result, { confirmed: false });
    assert.equal(calls.length, 1, 'only one request');
    assert.equal(calls[0].url, link.href);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].responseType, 'blob');
    assert.equal(calls[0].anonymous, false);
    assert.equal(calls[0].headers.Referer, doc.location.href);
    assert.deepEqual(saved, ['正确的帖子名.txt']);
  } finally {
    if (originalGM === undefined) delete globalThis.GM_xmlhttpRequest;
    else globalThis.GM_xmlhttpRequest = originalGM;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    dom.window.close();
  }
});

test('98堂：GM 请求 403 或网络失败时不重复调用 fetch，也不生成错误 TXT', async () => {
  const dom = new JSDOM('<body><a href="forum.php?mod=attachment&aid=signed">TXT</a></body>', {
    url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3726253',
  });
  const doc = dom.window.document, link = doc.querySelector('a');
  const originalGM = globalThis.GM_xmlhttpRequest;
  let fetched = 0;
  dom.window.fetch = () => { fetched++; throw new Error('page fetch forbidden'); };
  try {
    globalThis.GM_xmlhttpRequest = options => options.onload({
      status: 403, responseHeaders: 'content-type: text/html', response: new Blob(['Forbidden']),
    });
    await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'name.txt'), /HTTP 403/);
    globalThis.GM_xmlhttpRequest = options => options.onerror({ error: 'network_blocked' });
    await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'name.txt'), /network_blocked/);
    globalThis.GM_xmlhttpRequest = options => options.onload({
      status: 200, responseHeaders: 'content-type: text/html',
      response: new Blob(['<html><body>verify</body></html>']),
    });
    await assert.rejects(downloadSehuatangNamedTxtBlob(doc, link, 'name.txt'), /网页或验证提示/);
    assert.equal(fetched, 0, 'never retry through page fetch on GM failures');
  } finally {
    if (originalGM === undefined) delete globalThis.GM_xmlhttpRequest;
    else globalThis.GM_xmlhttpRequest = originalGM;
    dom.window.close();
  }
});
