import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  openUnifiedSettingsCenter, installUnifiedSettingsMenu, SETTINGS_CENTER_SITES,
} from '../src/settings-center.js';
import { FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY } from '../src/fc2cmadb.js';
import { HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY } from '../src/hdblog-article.js';
import { JAVCLUB_TOP_PAGINATION_ENABLED_KEY } from '../src/javclub-top-pagination.js';
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

test('JavClub top pagination has its own toggle in the centralized settings center', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  const values = new Map();
  withStore(values, () => {
    const host = openUnifiedSettingsCenter(dom.window.document, { initialSite: 'javclub' });
    const javclub = formIn(host, 'javclub');
    const checkbox = javclub.querySelector('[data-setting="top-pagination"]');
    assert.ok(checkbox, 'new toggle must be available even on an unrelated site');
    assert.equal(checkbox.checked, true, 'top pagination is enabled by default');
    assert.equal(checkbox.closest('[data-settings-section]').dataset.settingsSection, 'list');
    assert.ok(javclub.querySelector('[data-settings-tab="list"]'));
    checkbox.checked = false;
    submit(dom.window.document, javclub);
    assert.equal(values.get(JAVCLUB_TOP_PAGINATION_ENABLED_KEY), false);
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


test('98堂 uses the same sidebar, grouped controls and styled footer as other sites', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  const values = new Map();
  withStore(values, () => {
    const host = openUnifiedSettingsCenter(dom.window.document, { initialSite: 'sehuatang' });
    const form = formIn(host, 'sehuatang');
    const sections = [...form.querySelectorAll('[data-settings-section]')];
    assert.deepEqual(sections.map(section => section.dataset.settingsSection), [
      'attachments', 'reply', 'position',
    ]);
    assert.equal(form.querySelectorAll('[data-settings-tab]').length, 3);
    assert.ok(form.querySelector('.sx-workspace'));
    assert.ok(form.querySelector('.sx-footer button[data-action="cancel"]'));
    assert.ok(form.querySelector('.sx-footer button[type="submit"]'));
    assert.ok(form.querySelector('[data-setting="attachments"]'));
    assert.ok(form.querySelector('[data-setting="download"]'));
    assert.ok(form.querySelector('[data-setting="hidden-notice"]'));
    assert.ok(form.querySelector('[data-setting="reply"]'));
    assert.ok(form.querySelector('[data-setting="phrase"]'));
    const reset = form.querySelector('[data-action="reset-position"]');
    assert.ok(reset, 'existing reset-position control must not be lost when moving nodes');
    assert.ok(form.querySelector('style').textContent.includes('.sx-group-body button[type="button"]'));
    assert.equal(reset.closest('[data-settings-section]').dataset.settingsSection, 'position');
    form.querySelector('[data-settings-tab="position"]').click();
    reset.click();
    assert.match(reset.textContent, /保存后恢复默认位置/);
    assert.equal(host.shadowRoot.querySelector('[data-site-tab="sehuatang"]').getAttribute('data-dirty'), 'true');
    submit(dom.window.document, form);
    assert.equal(values.get('x1080x-ex:sehuatang-toolbar-position'), null);
    assert.equal(host.shadowRoot.querySelector('[data-site-tab="sehuatang"]').hasAttribute('data-dirty'), false);
  });
  dom.window.close();
});

test('unified center styles qBittorrent action button and all existing site footers', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  withStore(new Map(), () => {
    const host = openUnifiedSettingsCenter(dom.window.document, { initialSite: 'x1080x' });
    for (const site of ['x1080x', 'javclub', 'javfree', 'sehuatang']) {
      const form = switchSite(host, site);
      assert.ok(form.querySelector('.sx-workspace'), site + ' must have shared settings layout');
      assert.ok(form.querySelector('.sx-nav'), site + ' must have a consistent sidebar');
      assert.ok(form.querySelector('.sx-footer button[type="submit"]'), site + ' must have shared Save styling');
      assert.ok(form.querySelector('style').textContent.includes('.sx-footer button'), site);
    }
    const qb = formIn(host, 'x1080x').querySelector('[data-action="qb-test"]');
    assert.ok(qb);
    assert.ok(qb.closest('.sx-group-body'));
    const fc2 = switchSite(host, 'fc2cmadb');
    assert.ok(fc2.classList.contains('simple'));
    assert.ok(fc2.querySelector('button[type="submit"]'));
  });
  dom.window.close();
});

test('dynamically added qBittorrent, domain tools and image hosts stay in their own tabs', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.org/' });
  withStore(new Map(), () => {
    const host = openUnifiedSettingsCenter(dom.window.document, { initialSite: 'x1080x' });
    const xForm = formIn(host, 'x1080x');
    assert.equal(xForm.querySelector('[data-settings-section="batch"]').hidden, false);
    assert.equal(xForm.querySelector('[data-settings-section="qbittorrent"]').hidden, true);
    assert.equal(xForm.querySelector('[data-settings-section="site-tools"]').hidden, true);
    xForm.querySelector('[data-settings-tab="qbittorrent"]').click();
    assert.equal(xForm.querySelector('[data-settings-section="batch"]').hidden, true);
    assert.equal(xForm.querySelector('[data-settings-section="qbittorrent"]').hidden, false);
    assert.equal(xForm.querySelector('[data-settings-section="site-tools"]').hidden, true);

    const javclub = switchSite(host, 'javclub');
    assert.equal(javclub.querySelector('[data-settings-section="layout"]').hidden, false);
    assert.equal(javclub.querySelector('[data-settings-section="image-hosts"]').hidden, true);
    javclub.querySelector('[data-settings-tab="image-hosts"]').click();
    assert.equal(javclub.querySelector('[data-settings-section="layout"]').hidden, true);
    assert.equal(javclub.querySelector('[data-settings-section="image-hosts"]').hidden, false);
  });
  dom.window.close();
});
