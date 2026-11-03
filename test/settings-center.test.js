import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  openUnifiedSettingsCenter, installUnifiedSettingsMenu, SETTINGS_CENTER_SITES,
} from '../src/settings-center.js';
import { FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY } from '../src/fc2cmadb.js';
import { HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY } from '../src/hdblog-article.js';
import { SHT_REPLY_PHRASE_KEY } from '../src/sehuatang.js';

function withStore(values, run) {
  const previous = ['GM_getValue', 'GM_setValue', 'GM_registerMenuCommand', 'GM_xmlhttpRequest']
    .map(key => [key, globalThis[key]]);
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_registerMenuCommand = () => {};
  globalThis.GM_xmlhttpRequest = () => assert.fail('settings must not initiate network requests');
  try { return run(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}
function formIn(host, key) {
  return host.shadowRoot.querySelector('[data-site-pane="' + key + '"] form');
}
function switchSite(host, key) {
  host.shadowRoot.querySelector('[data-site-tab="' + key + '"]').click();
  return formIn(host, key);
}
function submit(document, form) {
  form.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
}

test('central menu is available from unrelated sites and has one entry', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://www.example.com/' });
  const registered = [];
  withStore(new Map(), () => {
    globalThis.GM_registerMenuCommand = (label, callback) => registered.push({ label, callback });
    assert.equal(installUnifiedSettingsMenu(dom.window.document), true);
    assert.deepEqual(registered.map(item => item.label), ['⚙️ x1080x-ex 设置中心']);
    registered[0].callback();
    assert.ok(dom.window.document.getElementById('x1080x-ex-unified-settings-center'));
  });
  dom.window.close();
});

test('cross-site center exposes all five sites with lazy forms and retained values', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  const values = new Map([
    [HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, false],
    [SHT_REPLY_PHRASE_KEY, '测试短语'],
  ]);
  withStore(values, () => {
    const host = openUnifiedSettingsCenter(dom.window.document);
    assert.equal(host.shadowRoot.querySelectorAll('[data-site-tab]').length, SETTINGS_CENTER_SITES.length);
    assert.ok(formIn(host, 'x1080x'));
    assert.equal(formIn(host, 'javclub'), null);
    assert.ok(formIn(host, 'x1080x').querySelector('[data-setting="qb-enabled"]'));
    assert.ok(formIn(host, 'x1080x').querySelector('[data-tool="import-history"]'));
    const javclub = switchSite(host, 'javclub');
    assert.equal(javclub.querySelector('[data-setting="layout-enabled"]').checked, false);
    assert.ok(javclub.querySelector('[data-setting="image-hosts"]'));
    const sehuatang = switchSite(host, 'sehuatang');
    assert.equal(sehuatang.querySelector('[data-setting="phrase"]').value, '测试短语');
    assert.ok(switchSite(host, 'javfree').querySelector('[data-setting="preview-download"]'));
    assert.ok(switchSite(host, 'fc2cmadb').querySelector('[data-setting="fc2cmadb-search"]'));
  });
  dom.window.close();
});

test('switching sites retains unsaved edits and does not overwrite other site keys', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  const values = new Map([[HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, true]]);
  withStore(values, () => {
    const host = openUnifiedSettingsCenter(dom.window.document);
    const javclub = switchSite(host, 'javclub');
    const layout = javclub.querySelector('[data-setting="layout-enabled"]');
    layout.checked = false;
    layout.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(host.shadowRoot.querySelector('[data-site-tab="javclub"]').getAttribute('data-dirty'), 'true');
    const fc2 = switchSite(host, 'fc2cmadb');
    fc2.querySelector('[data-setting="fc2cmadb-search"]').checked = false;
    submit(dom.window.document, fc2);
    assert.equal(values.get(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY), false);
    assert.equal(values.get(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY), true);
    assert.equal(switchSite(host, 'javclub').querySelector('[data-setting="layout-enabled"]').checked, false);
    submit(dom.window.document, javclub);
    assert.equal(values.get(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY), false);
    assert.equal(host.shadowRoot.querySelector('[data-site-tab="javclub"]').hasAttribute('data-dirty'), false);
    assert.ok(dom.window.document.getElementById('x1080x-ex-unified-settings-center'));
  });
  dom.window.close();
});

test('98堂 settings can be saved from unrelated domain with no toolbar injection', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  const values = new Map();
  withStore(values, () => {
    const host = openUnifiedSettingsCenter(dom.window.document, { initialSite: 'sehuatang' });
    const form = formIn(host, 'sehuatang');
    form.querySelector('[data-setting="phrase"]').value = '从别的网站保存';
    submit(dom.window.document, form);
    assert.equal(values.get(SHT_REPLY_PHRASE_KEY), '从别的网站保存');
    assert.equal(dom.window.document.getElementById('x1080x-ex-sehuatang-toolbar'), null);
  });
  dom.window.close();
});
