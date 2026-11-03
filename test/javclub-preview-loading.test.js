import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  JAVCLUB_PREVIEW_TIMEOUT_KEY, JAVCLUB_PREVIEW_RETRIES_KEY,
  getJavclubPreviewLoadingSettings,
} from '../src/javclub-preview-loading.js';
import { getHdblogPreviewLoadingSettings } from '../src/agaghhh-hdblog-preview.js';
import { openHdblogSettingsPanel } from '../src/hdblog-article.js';
import { expandHdblogPixhostPreviewImages } from '../src/hdblog-preview.js';
import { resolveHdblogReferUrl } from '../src/hdblog-refer.js';
import { resolvePixhostShowUrl } from '../src/pixhost.js';

function withStoredValues(store, run) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => store.set(key, value);
  const restore = () => {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = oldSet;
  };
  try {
    const result = run();
    if (result?.then) return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('JavClub Preview 默认 30 秒/2 次重试，独立于 x1080x 并限制无效值', () => withStoredValues(new Map(), () => {
  assert.deepEqual(getJavclubPreviewLoadingSettings(), { timeoutMs: 30000, retryCount: 2 });
  const store = new Map([
    [JAVCLUB_PREVIEW_TIMEOUT_KEY, 12000],
    [JAVCLUB_PREVIEW_RETRIES_KEY, 4],
    ['x1080x-ex:hdblog-preview-request-timeout-ms', 9000],
    ['x1080x-ex:hdblog-preview-retry-count', 1],
  ]);
  return withStoredValues(store, () => {
    assert.deepEqual(getJavclubPreviewLoadingSettings(), { timeoutMs: 12000, retryCount: 4 });
    assert.deepEqual(getHdblogPreviewLoadingSettings(), { timeoutMs: 9000, retryCount: 1 });
    store.set(JAVCLUB_PREVIEW_TIMEOUT_KEY, 100);
    store.set(JAVCLUB_PREVIEW_RETRIES_KEY, 99);
    assert.deepEqual(getJavclubPreviewLoadingSettings(), { timeoutMs: 30000, retryCount: 2 });
  });
}));

test('JavClub Preview 设置：显示、联动禁用、恢复默认、范围校验和持久化', () => withStoredValues(new Map([
  [JAVCLUB_PREVIEW_TIMEOUT_KEY, 15000], [JAVCLUB_PREVIEW_RETRIES_KEY, 3],
]), () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://javclub.me/1013935.html' });
  const alerts = [];
  dom.window.alert = (message) => alerts.push(message);
  try {
    const overlay = openHdblogSettingsPanel(dom.window.document);
    const form = overlay.querySelector('form');
    const preview = form.querySelector('[data-setting="expand-preview"]');
    const timeout = form.querySelector('[data-setting="javclub-preview-timeout"]');
    const retries = form.querySelector('[data-setting="javclub-preview-retries"]');
    const reset = form.querySelector('[data-action="reset-javclub-preview-settings"]');
    assert.ok(preview && timeout && retries && reset);
    assert.equal(timeout.closest('[data-settings-section]').dataset.settingsSection, 'preview');
    assert.equal(timeout.value, '15');
    assert.equal(retries.value, '3');
    preview.checked = false;
    preview.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(timeout.disabled, true);
    assert.equal(retries.disabled, true);
    assert.equal(reset.disabled, true);
    preview.checked = true;
    preview.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(timeout.disabled, false);
    reset.click();
    assert.equal(timeout.value, '30');
    assert.equal(retries.value, '2');
    timeout.value = '121';
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true, bubbles: true }));
    assert.match(alerts.at(-1), /3–120/);
    timeout.value = '4';
    retries.value = '1';
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true, bubbles: true }));
    assert.equal(globalThis.GM_getValue(JAVCLUB_PREVIEW_TIMEOUT_KEY), 4000);
    assert.equal(globalThis.GM_getValue(JAVCLUB_PREVIEW_RETRIES_KEY), 1);
    assert.deepEqual(getHdblogPreviewLoadingSettings(), { timeoutMs: 30000, retryCount: 2 });
  } finally {
    dom.window.close();
  }
}));

test('JavClub Preview Pixhost 超时后按照设置重新请求，再成功展开大图', () => withStoredValues(
  new Map([[JAVCLUB_PREVIEW_TIMEOUT_KEY, 7000], [JAVCLUB_PREVIEW_RETRIES_KEY, 2]]),
  async () => {
    const full = 'https://img2.pixhost.to/images/7211/abc-2026.jpg';
    const show = 'https://pixhost.to/show/7211/abc-2026.jpg';
    const dom = new JSDOM(`<main id="genesis-content"><article class="entry"><div class="entry-content">
      <p>Preview:</p><p><a href="${show}"><img id="preview" src="https://t2.pixhost.to/thumbs/7211/abc-2026.jpg"></a></p>
    </div></article></main>`, { url: 'https://javclub.me/1013935.html' });
    const calls = [];
    const request = (details) => {
      calls.push(details);
      queueMicrotask(() => {
        if (calls.length < 3) details.ontimeout();
        else details.onload({ status: 200, responseText: `<img class="image-img" src="${full}">`, finalUrl: show });
      });
    };
    try {
      const count = await expandHdblogPixhostPreviewImages(dom.window.document, dom.window.location, request);
      assert.equal(count, 1);
      assert.equal(dom.window.document.getElementById('preview').src, full);
      assert.deepEqual(calls.map(({ timeout }) => timeout), [7000, 7000, 7000]);
    } finally {
      dom.window.close();
    }
  }
));

test('明确删除的 Pixhost 图片不重试，设置为零则超时不重试', () => withStoredValues(
  new Map([[JAVCLUB_PREVIEW_TIMEOUT_KEY, 4000], [JAVCLUB_PREVIEW_RETRIES_KEY, 0]]),
  async () => {
    const dom = new JSDOM('', { url: 'https://javclub.me/1013935.html' });
    const show404 = 'https://pixhost.to/show/9915/never-again.jpg';
    const showTimeout = 'https://pixhost.to/show/9915/timeout-only.jpg';
    let failedCalls = 0;
    let timeoutCalls = 0;
    try {
      const missing = await resolvePixhostShowUrl(dom.window.document, show404, '', (details) => {
        failedCalls++;
        queueMicrotask(() => details.onload({ status: 404 }));
      }, 4000, 5);
      assert.equal(missing, '');
      assert.equal(failedCalls, 1);
      const timedOut = await resolvePixhostShowUrl(dom.window.document, showTimeout, '', (details) => {
        timeoutCalls++;
        queueMicrotask(() => details.ontimeout());
      }, 4000, 0);
      assert.equal(timedOut, '');
      assert.equal(timeoutCalls, 1);
    } finally {
      dom.window.close();
    }
  }
));

test('JavClub /refer/ Preview 按超时和重试设置工作，并保留原链接解析', () => withStoredValues(new Map(), async () => {
  const dom = new JSDOM('', { url: 'https://javclub.me/1013935.html' });
  const referUrl = 'https://javclub.me/refer/test-timeout-2026';
  const full = 'https://pixhost.cc/show/9999/preview-new.jpg';
  const times = [];
  const request = (details) => {
    times.push(details.timeout);
    queueMicrotask(() => {
      if (times.length === 1) details.ontimeout();
      else details.onload({ status: 200, finalUrl: full, responseText: '' });
    });
  };
  try {
    const resolved = await resolveHdblogReferUrl(dom.window.document, referUrl, request, 11000, 1);
    assert.equal(resolved, full);
    assert.deepEqual(times, [11000, 11000]);
  } finally {
    dom.window.close();
  }
}));
