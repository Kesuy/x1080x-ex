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
