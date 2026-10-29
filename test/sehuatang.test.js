import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  DEFAULT_SHT_REPLY_PHRASE, SHT_ATTACHMENTS_ENABLED_KEY, SHT_DOWNLOAD_ENABLED_KEY, SHT_REPLY_ENABLED_KEY,
  SHT_REPLY_PHRASE_KEY, SHT_POSITION_KEY, collectSehuatangAttachments,
  SHT_HIDDEN_NOTICE_ENABLED_KEY, hasSehuatangReplyHiddenContent,
  downloadSehuatangAttachment, getSehuatangSettings, installSehuatangEnhancement, isSehuatangHost,
  openSehuatangSettings, sehuatangFirstPageUrl, submitSehuatangQuickReply,
} from '../src/sehuatang.js';

const URL = 'https://www.sehuatang.org/forum.php?mod=viewthread&tid=3856383&extra=page%3D1';
function fixture(url = URL) {
  // Structure observed in the supplied Discuz page; no user profile or attachment tokens.
  const dom = new JSDOM(`<!doctype html><body><div id="ct"><div id="postlist">
    <div id="post_101"><table id="pid101"><tr><td><a id="postnum101">楼主</a>
      <div id="postmessage_101">
        <span id="attach_1"><a href="forum.php?mod=attachment&aid=tree">目录树.txt</a></span>
        <div id="attach_1_menu"><a href="forum.php?mod=attachment&aid=tree">副本</a></div>
        <img id="aimg_3" src="/preview.jpg">
        <a href="forum.php?mod=attachment&aid=image"><img src="/image.jpg"></a>
        <span id="attach_2"><a href="forum.php?mod=attachment&aid=links">资源链接.txt</a></span>
        <a href="forum.php?mod=attachment&aid=links">重复附件</a>
        <a href="https://other.example/forum.php?mod=attachment&aid=outside">外链</a>
      </div>
      <div class="pattl"><a href="attachment.php?aid=zip">压缩包.zip</a></div>
    </td></tr></table></div>
    <div id="post_102"><a id="postnum102">沙发</a><a href="forum.php?mod=attachment&aid=reply">回帖附件</a></div>
    </div></div>
    <form id="fastpostform"><textarea id="fastpostmessage"></textarea>
    <button type="submit" id="fastpostsubmit">发表回复</button></form></body>`, { url });
  dom.window.document.getElementById('fastpostform').addEventListener('submit', e => e.preventDefault());
  return dom;
}

function withSettings(values, action) {
  const keys = ['GM_getValue', 'GM_setValue', 'GM_registerMenuCommand'];
  const old = keys.map(key => globalThis[key]);
  const menus = new Map();
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_registerMenuCommand = (label, callback) => menus.set(label, callback);
  try { return action(menus); }
  finally { keys.forEach((key, i) => { if (old[i] === undefined) delete globalThis[key]; else globalThis[key] = old[i]; }); }
}

function toolbar(dom) {
  return installSehuatangEnhancement(dom.window.document, dom.window.location)?.shadowRoot;
}

test('98堂 domains are exact and settings preserve defaults on old installations', () => {
  for (const hostname of ['sehuatang.org', 'www.sehuatang.org']) assert.equal(isSehuatangHost({ hostname }), true);
  for (const hostname of ['fake-sehuatang.org', 'sehuatang.org.evil.example', 'hdblog.me']) assert.equal(isSehuatangHost({ hostname }), false);
  withSettings(new Map(), () => assert.deepEqual(getSehuatangSettings(), {
    attachments: true, download: true, reply: true, hiddenNotice: true, phrase: DEFAULT_SHT_REPLY_PHRASE,
  }));
});

function addReplyLock(dom, parent = dom.window.document.getElementById('postmessage_101')) {
  const lock = dom.window.document.createElement('div');
  lock.className = 'locked';
  lock.innerHTML = '如果您要查看本帖隐藏内容请<a href="forum.php?mod=post&action=reply">回复</a>';
  parent.append(lock);
  return lock;
}

test('native reply lock is detected only in original-post body, excluding quotes and hidden markers', () => {
  const dom = fixture();
  const document = dom.window.document;
  const lock = addReplyLock(dom);
  assert.equal(hasSehuatangReplyHiddenContent(document), true);
  lock.hidden = true;
  assert.equal(hasSehuatangReplyHiddenContent(document), false);
  lock.hidden = false;
  lock.style.display = 'none';
  assert.equal(hasSehuatangReplyHiddenContent(document), false);
  lock.style.display = '';
  const quote = document.createElement('blockquote');
  lock.replaceWith(quote);
  quote.append(lock);
  assert.equal(hasSehuatangReplyHiddenContent(document), false);
  lock.remove();
  addReplyLock(dom, document.getElementById('post_102'));
  assert.equal(hasSehuatangReplyHiddenContent(document), false);
  const paid = document.createElement('div');
  paid.className = 'locked';
  paid.textContent = '隐藏内容需要积分购买';
  document.getElementById('postmessage_101').append(paid);
  assert.equal(hasSehuatangReplyHiddenContent(document), false);
  paid.textContent = '如果您要查看本帖隱藏內容請回覆';
  assert.equal(hasSehuatangReplyHiddenContent(document), true);
  dom.window.close();
});

test('reply-hidden hint coexists with a visible file and never invents hidden file counts or links', () => withSettings(new Map(), () => {
  const dom = fixture();
  addReplyLock(dom);
  let replies = 0;
  dom.window.document.getElementById('fastpostform').addEventListener('submit', () => replies++);
  const root = toolbar(dom);
  assert.match(root.querySelector('.hidden-notice').textContent, /回复后可见/);
  assert.equal(root.querySelectorAll('.attachment-row').length, 3);
  assert.equal(root.querySelectorAll('[data-action="download-attachment"]').length, 3);
  assert.equal(root.querySelector('.files-heading').textContent, '楼主附件（3）');
  assert.equal(replies, 0);
  assert.equal(dom.window.document.getElementById('fastpostmessage').value, '');
  dom.window.close();
}));

test('hidden hint has an independent switch and can run without locating, download or reply', () => {
  for (let mask = 0; mask < 16; mask++) {
    const values = new Map([
      [SHT_ATTACHMENTS_ENABLED_KEY, Boolean(mask & 1)],
      [SHT_DOWNLOAD_ENABLED_KEY, Boolean(mask & 2)],
      [SHT_REPLY_ENABLED_KEY, Boolean(mask & 4)],
      [SHT_HIDDEN_NOTICE_ENABLED_KEY, Boolean(mask & 8)],
    ]);
    withSettings(values, () => {
      const dom = fixture();
      const lock = addReplyLock(dom);
      if (!(mask & 8)) Object.defineProperty(lock, 'textContent', { get() { throw new Error('Disabled hidden notice scanned the lock'); } });
      const root = toolbar(dom);
      assert.equal(Boolean(root?.querySelector('.hidden-notice')?.textContent), Boolean(mask & 8));
      assert.equal(Boolean(root?.querySelector('[data-action="attachment"]')), Boolean(mask & 1));
      assert.equal(Boolean(root?.querySelector('[data-action="download-attachment"]')), Boolean(mask & 2));
      assert.equal(Boolean(root?.querySelector('[data-action="reply"]')), Boolean(mask & 4));
      if (mask === 0) assert.equal(root, undefined);
      dom.window.close();
    });
  }
});

test('reply-hidden hint updates when only the lock changes, without any attachment count change', async () => {
  const dom = fixture();
  const lock = addReplyLock(dom);
  const root = toolbar(dom);
  assert.match(root.querySelector('.hidden-notice').textContent, /回复后可见/);
  lock.style.display = 'none';
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(root.querySelector('.hidden-notice').textContent, '');
  lock.style.display = '';
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.match(root.querySelector('.hidden-notice').textContent, /回复后可见/);
  lock.remove();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(root.querySelector('.hidden-notice').textContent, '');
  assert.equal(root.querySelectorAll('.attachment-row').length, 3);
  dom.window.close();
});

test('hidden-only posts show the reply hint instead of claiming no visible attachment', () => withSettings(new Map(), () => {
  const dom = fixture();
  const document = dom.window.document;
  document.getElementById('postmessage_101').replaceChildren();
  document.querySelector('.pattl').remove();
  addReplyLock(dom);
  const root = toolbar(dom);
  assert.match(root.querySelector('.hidden-notice').textContent, /回复后可见/);
  assert.equal(root.querySelector('.status').textContent, '');
  assert.equal(root.querySelectorAll('[data-action="download-attachment"]').length, 0);
  const panel = openSehuatangSettings(document);
  panel.querySelector('[data-setting="hidden-notice"]').checked = false;
  panel.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.equal(getSehuatangSettings().hiddenNotice, false);
  assert.equal(document.getElementById('x1080x-ex-sehuatang-toolbar').shadowRoot.querySelector('.hidden-notice').textContent, '');
  dom.window.close();
}));

test('only original-post native file attachments are collected, with images and duplicates excluded', () => {
  const dom = fixture();
  assert.deepEqual(collectSehuatangAttachments(dom.window.document).map(x => x.name), ['目录树.txt', '资源链接.txt', '压缩包.zip']);
  dom.window.document.getElementById('post_101').remove();
  assert.deepEqual(collectSehuatangAttachments(dom.window.document), []);
  dom.window.close();
});

test('attachments appear immediately with filename and two independent icon actions per row', () => withSettings(new Map(), () => {
  const dom = fixture();
  const root = toolbar(dom);
  let downloaded = 0;
  let scrolled = 0;
  const link = dom.window.document.querySelector('#attach_2 a');
  link.addEventListener('click', () => downloaded++);
  link.scrollIntoView = () => scrolled++;
  assert.deepEqual([...root.querySelectorAll('.attachment-name')].map(node => node.textContent), ['目录树.txt', '资源链接.txt', '压缩包.zip']);
  assert.equal(root.querySelectorAll('.attachment-row').length, 3);
  assert.equal(root.querySelectorAll('[data-action="attachment"]').length, 3);
  assert.equal(root.querySelectorAll('[data-action="download-attachment"]').length, 3);
  assert.equal(root.querySelector('[data-action="attachment"]').getAttribute('aria-label'), '定位附件：目录树.txt');
  root.querySelectorAll('[data-action="attachment"]')[1].click();
  assert.equal(scrolled, 1);
  assert.equal(downloaded, 0);
  assert.equal(dom.window.document.activeElement, link);
  dom.window.close();
}));

test('single attachment is listed without auto-scroll; its locate icon scrolls directly', () => withSettings(new Map(), () => {
  const dom = fixture();
  const document = dom.window.document;
  document.querySelector('.pattl').remove();
  document.querySelector('#attach_2').remove();
  document.querySelector('a[href$="aid=links"]').remove();
  const root = toolbar(dom);
  let scrolled = 0;
  document.querySelector('#attach_1 a').scrollIntoView = () => scrolled++;
  assert.equal(scrolled, 0);
  assert.equal(root.querySelectorAll('.attachment-row').length, 1);
  root.querySelector('[data-action="attachment"]').click();
  assert.equal(scrolled, 1);
  dom.window.close();
}));

test('all three switches independently control DOM, and disabling all starts no listeners/tasks', () => {
  for (let mask = 0; mask < 8; mask++) {
    const attachments = Boolean(mask & 1);
    const download = Boolean(mask & 2);
    const reply = Boolean(mask & 4);
    withSettings(new Map([[SHT_ATTACHMENTS_ENABLED_KEY, attachments], [SHT_DOWNLOAD_ENABLED_KEY, download], [SHT_REPLY_ENABLED_KEY, reply]]), menus => {
      const dom = fixture();
      let listeners = 0;
      const add = dom.window.addEventListener.bind(dom.window);
      dom.window.addEventListener = (...args) => { listeners++; return add(...args); };
      const root = toolbar(dom);
      assert.equal(Boolean(root?.querySelector('[data-action="attachment"]')), attachments);
      assert.equal(Boolean(root?.querySelector('[data-action="download-attachment"]')), download);
      assert.equal(Boolean(root?.querySelector('.attachment-row')), attachments || download);
      assert.equal(Boolean(root?.querySelector('[data-action="reply"]')), reply);
      if (!attachments && !download && !reply) {
        assert.equal(root, undefined);
        assert.equal(listeners, 0);
      }
      assert.ok(menus.has('⚙️ 98堂设置'));
      assert.equal(dom.window.document.getElementById('fastpostmessage').value, '');
      dom.window.close();
    });
  }
});

test('no toolbar on list/other sites, while 98堂 menu remains available on list pages', () => {
  for (const [url, hasMenu] of [['https://sehuatang.org/forum.php?mod=forumdisplay&fid=141', true], ['https://hdblog.me/', false]]) {
    withSettings(new Map(), menus => {
      const dom = fixture(url);
      assert.equal(toolbar(dom), undefined);
      assert.equal(menus.has('⚙️ 98堂设置'), hasMenu);
      dom.window.close();
    });
  }
});

test('page-one targets clear reply filters and support Discuz pretty URLs', () => {
  const target = new globalThis.URL(sehuatangFirstPageUrl(new globalThis.URL(URL + '&page=3&authorid=42&ordertype=1&pid=99&goto=findpost')));
  assert.equal(target.searchParams.get('page'), '1');
  for (const key of ['authorid', 'ordertype', 'pid', 'goto']) assert.equal(target.searchParams.has(key), false);
  assert.equal(target.hash, '#x1080x-ex-locate-attachments');
  assert.equal(sehuatangFirstPageUrl(new globalThis.URL('https://sehuatang.org/thread-3856383-4-1.html')), 'https://sehuatang.org/thread-3856383-1-1.html#x1080x-ex-locate-attachments');
});

test('navigation intent selects attachments on arrival and clears its own hash only when enabled', () => {
  for (const enabled of [true, false]) withSettings(new Map([[SHT_ATTACHMENTS_ENABLED_KEY, enabled]]), () => {
    const dom = fixture(URL + '#x1080x-ex-locate-attachments');
    const root = toolbar(dom);
    assert.equal(root.querySelectorAll('[data-action="attachment"]').length, enabled ? 3 : 0);
    assert.equal(dom.window.location.hash, enabled ? '' : '#x1080x-ex-locate-attachments');
    dom.window.close();
  });
});

test('quick reply fills configured phrase, triggers native rule initialization and submits once', () => withSettings(new Map([[SHT_REPLY_PHRASE_KEY, '感谢分享，整理辛苦了！']]), () => {
  const dom = fixture();
  const document = dom.window.document;
  const events = [];
  document.getElementById('fastpostmessage').addEventListener('input', () => events.push('input'));
  document.getElementById('fastpostsubmit').addEventListener('mouseover', () => events.push('rules'));
  document.getElementById('fastpostform').addEventListener('submit', () => events.push('submit'));
  const root = toolbar(dom);
  const reply = root.querySelector('[data-action="reply"]');
  reply.click();
  reply.click();
  assert.deepEqual(events, ['input', 'rules', 'submit']);
  assert.equal(document.getElementById('fastpostmessage').value, '感谢分享，整理辛苦了！');
  assert.equal(reply.disabled, true);
  assert.match(root.querySelector('.status').textContent, /已交给网站/);
  dom.window.close();
}));

test('empty phrase, draft, logged-out and restricted editor never submit or overwrite', () => {
  for (const mode of ['empty', 'draft', 'same-draft', 'logout', 'disabled', 'readonly', 'button-disabled']) {
    const dom = fixture();
    const document = dom.window.document;
    const editor = document.getElementById('fastpostmessage');
    let submits = 0;
    document.getElementById('fastpostform').addEventListener('submit', () => submits++);
    if (mode === 'draft') editor.value = '未发送草稿';
    if (mode === 'same-draft') editor.value = DEFAULT_SHT_REPLY_PHRASE;
    if (mode === 'logout') editor.remove();
    if (mode === 'disabled') editor.disabled = true;
    if (mode === 'readonly') editor.readOnly = true;
    if (mode === 'button-disabled') document.getElementById('fastpostsubmit').disabled = true;
    const previous = editor.value;
    const result = submitSehuatangQuickReply(document, mode === 'empty' ? '  ' : DEFAULT_SHT_REPLY_PHRASE);
    assert.equal(result.submitted, false, mode);
    assert.equal(submits, 0, mode);
    assert.equal(editor.value, previous, mode);
    dom.window.close();
  }
});

test('settings save switches and phrase immediately, reset position, and stop disabled controls', () => {
  const values = new Map([[SHT_POSITION_KEY, { x: 300, y: 200 }]]);
  withSettings(values, menus => {
    const dom = fixture();
    const document = dom.window.document;
    toolbar(dom);
    menus.get('⚙️ 98堂设置')();
    const panel = document.getElementById('x1080x-ex-sehuatang-settings');
    panel.querySelector('[data-setting="attachments"]').checked = false;
    panel.querySelector('[data-setting="phrase"]').value = '自定义回复';
    panel.querySelector('[data-action="reset-position"]').click();
    panel.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(values.get(SHT_ATTACHMENTS_ENABLED_KEY), false);
    assert.equal(values.get(SHT_DOWNLOAD_ENABLED_KEY), true);
    assert.equal(values.get(SHT_REPLY_ENABLED_KEY), true);
    assert.equal(values.get(SHT_REPLY_PHRASE_KEY), '自定义回复');
    assert.equal(values.get(SHT_POSITION_KEY), null);
    const root = document.getElementById('x1080x-ex-sehuatang-toolbar').shadowRoot;
    assert.equal(root.querySelector('[data-action="attachment"]'), null);
    assert.match(root.querySelector('[data-action="reply"]').title, /自定义回复/);
    const disable = openSehuatangSettings(document);
    disable.querySelector('[data-setting="reply"]').checked = false;
    disable.querySelector('[data-setting="download"]').checked = false;
    disable.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(document.getElementById('x1080x-ex-sehuatang-toolbar'), null);
    dom.window.close();
  });
});

test('one visible file downloads through its row icon and original link handlers', () => withSettings(new Map(), () => {
  const dom = fixture();
  const document = dom.window.document;
  document.querySelector('#postmessage_101').replaceChildren();
  const link = document.querySelector('.pattl a');
  link.target = '_blank';
  const href = link.getAttribute('href');
  let clicks = 0;
  let scrolled = 0;
  link.addEventListener('click', event => {
    event.preventDefault();
    assert.equal(link.getAttribute('download'), '压缩包.zip');
    clicks++;
  });
  link.scrollIntoView = () => scrolled++;
  const root = toolbar(dom);
  assert.equal(clicks, 0);
  root.querySelector('[data-action="download-attachment"]').click();
  assert.equal(clicks, 1);
  assert.equal(scrolled, 0);
  assert.equal(link.getAttribute('href'), href);
  assert.equal(link.target, '_blank');
  assert.equal(link.hasAttribute('download'), false);
  assert.match(root.querySelector('.status').textContent, /已触发网站附件下载/);
  assert.equal(root.querySelectorAll('.attachment-row').length, 1);
  dom.window.close();
}));

test('native download attribute is restored even if click handling throws', () => withSettings(new Map(), () => {
  const dom = fixture();
  const link = dom.window.document.querySelector('#attach_1 a');
  link.setAttribute('download', 'existing.txt');
  link.click = () => { throw new Error('Native handler failed'); };
  assert.throws(() => downloadSehuatangAttachment(dom.window.document, link), /Native handler failed/);
  assert.equal(link.getAttribute('download'), 'existing.txt');
  dom.window.close();
}));

test('multiple files download only the selected original link and exclude replies/images', () => withSettings(new Map(), () => {
  const dom = fixture();
  const document = dom.window.document;
  const clicked = [];
  document.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    clicked.push(link.textContent);
  }));
  const root = toolbar(dom);
  assert.deepEqual(clicked, []);
  assert.equal(root.querySelectorAll('[data-action="download-attachment"]').length, 3);
  root.querySelectorAll('[data-action="download-attachment"]')[1].click();
  assert.deepEqual(clicked, ['资源链接.txt']);
  root.querySelector('[data-action="attachment"]').click();
  assert.deepEqual(clicked, ['资源链接.txt']);
  dom.window.close();
}));

test('download switch stops stale controls and is independent from locating/reply', () => {
  const values = new Map([[SHT_ATTACHMENTS_ENABLED_KEY, false], [SHT_REPLY_ENABLED_KEY, false]]);
  withSettings(values, () => {
    const dom = fixture();
    const document = dom.window.document;
    let clicks = 0;
    const link = document.querySelector('#attach_1 a');
    link.addEventListener('click', event => { event.preventDefault(); clicks++; });
    const root = toolbar(dom);
    values.set(SHT_DOWNLOAD_ENABLED_KEY, false);
    root.querySelector('[data-action="download-attachment"]').click();
    assert.match(downloadSehuatangAttachment(document, link), /已关闭/);
    assert.equal(clicks, 0);
    assert.equal(document.getElementById('fastpostmessage').value, '');
    dom.window.close();
  });
});

test('stale, external and reply attachment links cannot be downloaded', () => withSettings(new Map(), () => {
  const dom = fixture();
  const document = dom.window.document;
  const link = document.querySelector('#attach_1 a');
  link.remove();
  for (const candidate of [link, document.querySelector('#post_102 a[href]'), document.querySelector('a[href^="https://other"]')]) {
    let clicks = 0;
    candidate.addEventListener('click', event => { event.preventDefault(); clicks++; });
    assert.match(downloadSehuatangAttachment(document, candidate), /已变化/);
    assert.equal(clicks, 0);
  }
  dom.window.close();
}));

test('download intent returns to first page but requires a new click before downloading', () => {
  const target = new globalThis.URL(sehuatangFirstPageUrl(new globalThis.URL(URL + '&page=5'), 'download'));
  assert.equal(target.searchParams.get('page'), '1');
  assert.equal(target.hash, '#x1080x-ex-download-attachments');
  for (const enabled of [true, false]) withSettings(new Map([[SHT_DOWNLOAD_ENABLED_KEY, enabled]]), () => {
    const dom = fixture(URL + '#x1080x-ex-download-attachments');
    const document = dom.window.document;
    document.querySelector('#postmessage_101').replaceChildren();
    let clicks = 0;
    document.querySelector('.pattl a').addEventListener('click', event => { event.preventDefault(); clicks++; });
    const root = toolbar(dom);
    assert.equal(clicks, 0);
    assert.equal(root.querySelectorAll('[data-action="download-attachment"]').length, enabled ? 1 : 0);
    assert.equal(dom.window.location.hash, enabled ? '' : '#x1080x-ex-download-attachments');
    if (enabled) {
      root.querySelector('[data-action="download-attachment"]').click();
      assert.equal(clicks, 1);
    }
    dom.window.close();
  });
});

test('zero visible attachments does not trigger any native link or request', () => withSettings(new Map(), () => {
  const dom = fixture();
  dom.window.document.getElementById('post_101').replaceChildren(
    Object.assign(dom.window.document.createElement('a'), { id: 'postnum101', textContent: '楼主' })
  );
  const root = toolbar(dom);
  assert.match(root.querySelector('.status').textContent, /暂无可见/);
  assert.equal(root.querySelector('.choices').children.length, 0);
  dom.window.close();
}));

test('later pages show a return-to-original-post action without auto navigation or reply attachments', () => withSettings(new Map(), () => {
  const dom = fixture(URL + '&page=2');
  dom.window.document.getElementById('post_101').remove();
  const root = toolbar(dom);
  assert.ok(root.querySelector('[data-action="original-post"]'));
  assert.equal(root.querySelectorAll('.attachment-row').length, 0);
  assert.equal(dom.window.location.search.includes('page=2'), true);
  dom.window.close();
}));

test('attachment list refreshes when original-post attachments are revealed or removed', async () => {
  const dom = fixture();
  const document = dom.window.document;
  const root = toolbar(dom);
  const link = document.createElement('a');
  link.href = 'forum.php?mod=attachment&aid=new-file';
  link.textContent = '新附件.txt';
  document.getElementById('postmessage_101').append(link);
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(root.querySelectorAll('.attachment-row').length, 4);
  assert.equal(root.querySelectorAll('.attachment-name')[3].textContent, '压缩包.zip');
  link.remove();
  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(root.querySelectorAll('.attachment-row').length, 3);
  dom.window.close();
});

test('settings cancel is non-mutating; empty enabled phrase is validated', () => withSettings(new Map(), () => {
  const dom = fixture();
  let panel = openSehuatangSettings(dom.window.document);
  panel.querySelector('[data-setting="reply"]').checked = false;
  panel.querySelector('[data-action="cancel"]').click();
  assert.equal(getSehuatangSettings().reply, true);
  panel = openSehuatangSettings(dom.window.document);
  const phrase = panel.querySelector('[data-setting="phrase"]');
  phrase.value = '';
  panel.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.equal(phrase.validity.valid, false);
  assert.equal(panel.isConnected, true);
  dom.window.close();
}));

test('fixed toolbar remembers drag and clamps stale coordinates after resize', () => {
  const values = new Map([[SHT_POSITION_KEY, { x: 9000, y: -100 }]]);
  withSettings(values, () => {
    const dom = fixture();
    const root = toolbar(dom);
    const host = root.host;
    assert.equal(host.style.position, 'fixed');
    assert.equal(host.style.top, '8px');
    assert.ok(parseFloat(host.style.left) < 1024);
    const handle = root.querySelector('.handle');
    const fire = (name, x, y) => handle.dispatchEvent(new dom.window.MouseEvent(name, { button: 0, clientX: x, clientY: y, cancelable: true }));
    fire('pointerdown', 20, 20);
    fire('pointermove', 120, 160);
    fire('pointerup', 120, 160);
    assert.deepEqual(values.get(SHT_POSITION_KEY), { x: 100, y: 140 });
    Object.defineProperty(dom.window, 'innerWidth', { value: 80 });
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    assert.ok(parseFloat(host.style.left) <= 72);
    dom.window.close();
  });
});
