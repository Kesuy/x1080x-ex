import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { openX1080xSettingsPanel } from '../src/agaghhh-enhancement.js';
import { openHdblogSettingsPanel } from '../src/hdblog-article.js';
import { openJavfreeSettingsPanel } from '../src/javfree.js';
import { injectOfficialPreviewFallbackSetting } from '../src/agaghhh-preview-official.js';
import { enhanceQbittorrentSettingsPanel } from '../src/qbittorrent-settings.js';
import { addSettingsExtraSection } from '../src/settings-layout.js';

function withSettings(fn) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.GM_setValue = () => {};
  try { return fn(); }
  finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = oldSet;
  }
}

function checkTabs(form, keys) {
  assert.ok(form.querySelector('[data-settings-workspace]'));
  assert.deepEqual(
    [...form.querySelectorAll('[data-settings-tab]')].map((tab) => tab.dataset.settingsTab),
    keys
  );
  assert.equal(
    [...form.querySelectorAll('[data-settings-section]:not([hidden])')].length,
    1
  );
}

test('x1080x groups settings without replacing live form controls and saves shared state', () => withSettings(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://1080xin.com/' });
  const overlay = openX1080xSettingsPanel(dom.window.document);
  const form = overlay.querySelector('form');
  checkTabs(form, ['batch', 'history', 'filter', 'download', 'preview']);
  const history = form.querySelector('[data-setting="batch-open-history"]');
  const download = form.querySelector('[data-setting="download"]');
  assert.ok(history && download);
  form.querySelector('[data-settings-tab="history"]').click();
  assert.equal(form.querySelector('[data-settings-section="history"]').hidden, false);
  assert.equal(form.querySelector('[data-settings-section="batch"]').hidden, true);
  history.checked = true;
  form.querySelector('[data-settings-tab="download"]').click();
  download.checked = false;
  form.querySelector('[data-settings-tab="history"]').click();
  assert.equal(history.checked, true);
  assert.equal(download.checked, false);
  assert.equal(form.querySelector('[data-setting="batch-open-unopened-only"]')?.closest('[data-settings-section]')?.dataset.settingsSection, 'history');
  assert.equal(form.querySelector('[data-setting="blocked-keywords"]')?.closest('[data-settings-section]')?.dataset.settingsSection, 'filter');
  assert.equal(form.querySelector('[data-setting="real-actress"]')?.closest('[data-settings-section]')?.dataset.settingsSection, 'preview');

  // Previously missed injected features must be located inside the Shadow DOM.
  assert.equal(injectOfficialPreviewFallbackSetting(dom.window.document), true);
  assert.equal(
    form.querySelector('[data-setting="official-preview-fallback"]')?.closest('[data-settings-section]')?.dataset.settingsSection,
    'preview'
  );
  assert.equal(enhanceQbittorrentSettingsPanel(dom.window.document, () => {}), true);
  assert.ok(form.querySelector('[data-settings-tab="qbittorrent"]'));
  assert.ok(form.querySelector('[data-settings-section="qbittorrent"] [data-setting="qb-url"]'));
  assert.equal(form.style.width, 'min(850px, 100%)');
  dom.window.close();
}));

test('HDblog separates layout/download/preview/batch/history/filter and accepts dynamically inserted host settings', () => withSettings(() => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://hdblog.me/123/test/' });
  const overlay = openHdblogSettingsPanel(dom.window.document);
  const form = overlay.querySelector('form');
  checkTabs(form, ['layout', 'download', 'preview', 'batch', 'history', 'filter']);
  assert.equal(form.querySelector('[data-setting="width"]').closest('[data-settings-section]').dataset.settingsSection, 'layout');
  assert.equal(form.querySelector('[data-setting="download-guard"]').closest('[data-settings-section]').dataset.settingsSection, 'download');
  assert.equal(form.querySelector('[data-setting="batch-open-history"]').closest('[data-settings-section]').dataset.settingsSection, 'history');
  assert.equal(form.querySelector('[data-setting="keywords"]').closest('[data-settings-section]').dataset.settingsSection, 'filter');
  const textarea = dom.window.document.createElement('textarea');
  textarea.dataset.setting = 'image-hosts';
  assert.equal(addSettingsExtraSection(form, {
    key: 'image-hosts', title: '图床设置', description: '自定义图片站域名',
  }, textarea), true);
  form.querySelector('[data-settings-tab="image-hosts"]').click();
  assert.equal(form.querySelector('[data-settings-section="image-hosts"]').hidden, false);
  assert.equal(textarea.closest('[data-settings-section]').dataset.settingsSection, 'image-hosts');
  dom.window.close();
}));

test('JavFree uses the same categorized layout and retains all its original settings', () => withSettings(() => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://javfree.me/' });
  const overlay = openJavfreeSettingsPanel(dom.window.document);
  const form = overlay.querySelector('form');
  checkTabs(form, ['search', 'buttons']);
  for (const id of ['search-auto-redirect', 'agaghhh-search', 'copy-code', 'preview-download']) {
    assert.ok(form.querySelector('[data-setting="' + id + '"]'), id);
  }
  form.querySelector('[data-settings-tab="buttons"]').click();
  assert.equal(form.querySelector('[data-setting="preview-download"]').closest('[data-settings-section]').hidden, false);
  dom.window.close();
}));
