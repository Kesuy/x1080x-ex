import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const EXT = new URL('../extras/sehuatang-chrome-filename/', import.meta.url);
const read = (name) => readFile(new URL(name, EXT), 'utf8');
const TITLE = '【ED2K丨整理】長浜みつり（长滨蜜璃）DMM原档合集【1.07TB/116V/116配额】';
const AID = 'MjE1NDcyMTF8NjNjYzRlYzB8MTc5NDI0NjU3MHwyNDM4NHwzNzI2NDAz';
const LINK = 'https://www.sehuatang.org/forum.php?mod=attachment&aid=' + AID;
const NAME = '長浜みつり（长滨蜜璃）DMM原档合集【1.07TB／116V／116配额】.txt';

test('可选 Chrome 扩展：先登记楼主主要 TXT，不包含目录或回帖附件', async () => {
  const html = `<!doctype html><body><span id="thread_subject">${TITLE}</span>
    <div id="postlist"><div id="post_100"><a id="postnum100">楼主</a>
      <div id="postmessage_100">
        <a href="forum.php?mod=attachment&aid=directory">www.98T.la@長浜みつり_目录.txt</a>
        <a href="${LINK}" target="_blank">www.98T.la@長浜みつり_eD2k.txt</a>
      </div></div>
      <div id="post_101"><a id="postnum101">沙发</a>
        <a href="forum.php?mod=attachment&aid=reply">回帖.txt</a>
      </div>
    </div></body>`;
  const dom = new JSDOM(html, { url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3726403', runScripts: 'outside-only' });
  const msgs = [];
  dom.window.document.documentElement.dataset.x1080xExShtRename = 'on';
  dom.window.chrome = { runtime: { sendMessage: (msg, cb) => { msgs.push(msg); cb?.(); }, lastError: null } };
  dom.window.eval(await read('content.js'));
  assert.equal(msgs.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(msgs[0])), { type: 'sht-suggest', url: LINK, filename: NAME });
  // Simulate a real page unloading so content-script DOM observers disconnect.
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  dom.window.close();
});

test('可选 Chrome 扩展：原生下载时回调修改目标文件名，不再次下载附件', async () => {
  let messageListener, downloadListener;
  const session = {};
  let downloadsRequested = 0;
  const chrome = {
    runtime: { onMessage: { addListener: callback => { messageListener = callback; } } },
    storage: { session: {
      set: async (items) => { Object.assign(session, items); },
      get: async (key) => ({ [key]: session[key] }),
      remove: async (key) => { delete session[key]; },
    }},
    downloads: {
      download: () => { downloadsRequested++; },
      onDeterminingFilename: { addListener: callback => { downloadListener = callback; } },
    },
  };
  vm.runInNewContext(await read('background.js'), { chrome, URL, Date, Promise, console });
  assert.equal(typeof messageListener, 'function');
  assert.equal(typeof downloadListener, 'function');
  await new Promise(resolve => {
    const returned = messageListener({ type: 'sht-suggest', url: LINK, filename: NAME },
      { url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3726403' },
      reply => { assert.equal(reply.ok, true); resolve(); });
    assert.equal(returned, true);
  });
  const suggestion = await new Promise(resolve => {
    const returned = downloadListener({ url: LINK, finalUrl: 'https://cdn.example.org/real-file.txt', filename: 'original.txt' }, resolve);
    assert.equal(returned, true, 'Chrome async suggest callback requires return true');
  });
  assert.equal(suggestion.filename, NAME);
  assert.equal(suggestion.conflictAction, 'uniquify');
  const missing = await new Promise(resolve => {
    const returned = downloadListener({ url: 'https://www.sehuatang.org/forum.php?mod=attachment&aid=other' }, resolve);
    assert.equal(returned, true);
  });
  assert.equal(missing, undefined, 'unknown files keep the server filename');
  await new Promise(resolve => {
    messageListener({ type: 'sht-remove', url: LINK },
      { url: 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3726403' }, resolve);
  });
  const disabled = await new Promise(resolve => {
    downloadListener({ url: LINK }, resolve);
  });
  assert.equal(disabled, undefined, 'disabling rename must clear saved suggestions');
  assert.equal(downloadsRequested, 0, 'extension must not issue another network download');
});

test('Chrome extension manifest has required native downloads APIs but no broad web access', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('downloads'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
});
