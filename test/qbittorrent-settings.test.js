import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { enhanceQbittorrentSettingsPanel } from '../src/qbittorrent-settings.js';

function withGmStorage(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try {
    return callback();
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = oldSet;
  }
}

test('在 x1080x 设置面板中注入 qBittorrent 回退配置', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="x1080x-ex-settings-panel"><form><div data-existing>existing</div><div data-actions>actions</div></form></div>
  </body>`, { url: 'https://agaghhh.cc/' });
  const values = new Map([
    ['x1080x-ex:qb-enabled', true],
    ['x1080x-ex:qb-url', 'http://192.0.2.10:8080'],
    ['x1080x-ex:qb-username', 'tester'],
    ['x1080x-ex:qb-password', 'secret'],
    ['x1080x-ex:qb-metadata-timeout-ms', 90000],
  ]);

  withGmStorage(values, () => {
    const changed = enhanceQbittorrentSettingsPanel(dom.window.document, () => {});
    assert.equal(changed, true);
    const section = dom.window.document.querySelector('[data-x1080x-qb-settings]');
    assert.ok(section);
    assert.equal(section.querySelector('[data-setting="qb-enabled"]').checked, true);
    assert.equal(section.querySelector('[data-setting="qb-url"]').value, 'http://192.0.2.10:8080');
    assert.equal(section.querySelector('[data-setting="qb-username"]').value, 'tester');
    assert.equal(section.querySelector('[data-setting="qb-password"]').value, 'secret');
    assert.equal(section.querySelector('[data-setting="qb-timeout"]').value, '90');
    assert.ok(section.querySelector('[data-action="qb-test"]'));
    assert.equal(enhanceQbittorrentSettingsPanel(dom.window.document, () => {}), false);
  });
});
