import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  HDBLOG_IMAGE_HOSTS_KEY,
  installHdblogImageHostSettings,
  parseHdblogImageHosts,
} from '../src/hdblog-image-hosts.js';
import {
  derivePixhostImageUrlFromThumbnail,
  isPixhostShowUrl,
  parsePixhostImagePage,
} from '../src/pixhost.js';
import { expandHdblogPixhostPreviewImages } from '../src/hdblog-preview.js';

test('hdblog 图床设置可解析域名和完整 URL，并自动去重', () => {
  assert.deepEqual(
    parseHdblogImageHosts('newhost.example\nhttps://www.other.example/path newhost.example'),
    ['newhost.example', 'www.other.example']
  );
});

test('图床设置并入现有 hdblog 设置面板，不再注册独立油猴菜单', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://hdblog.me/987652/fc2-4973170/' });
  const previousGetValue = globalThis.GM_getValue;
  const previousSetValue = globalThis.GM_setValue;
  const previousRegisterMenu = globalThis.GM_registerMenuCommand;
  const writes = [];
  let menuRegistrations = 0;
  globalThis.GM_getValue = (key, fallback) => (
    key === HDBLOG_IMAGE_HOSTS_KEY ? 'future-host.example' : fallback
  );
  globalThis.GM_setValue = (key, value) => writes.push([key, value]);
  globalThis.GM_registerMenuCommand = () => { menuRegistrations += 1; };

  try {
    installHdblogImageHostSettings(dom.window.document, dom.window.location);
    const overlay = dom.window.document.createElement('div');
    overlay.id = 'x1080x-ex-hdblog-settings-panel';
    overlay.innerHTML = '<form><div data-actions><button type="submit">保存</button></div></form>';
    dom.window.document.body.append(overlay);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

    const textarea = overlay.querySelector('[data-setting="image-hosts"]');
    assert.ok(textarea);
    assert.equal(textarea.value, 'future-host.example');
    assert.equal(menuRegistrations, 0);
    assert.match(overlay.textContent, /额外图床域名/);
    assert.match(overlay.textContent, /pixhost\.to/);

    textarea.value = 'newhost.example\nhttps://cdn.example/path';
    overlay.querySelector('form').dispatchEvent(new dom.window.Event('submit', {
      bubbles: true,
      cancelable: true,
    }));
    assert.deepEqual(writes.at(-1), [HDBLOG_IMAGE_HOSTS_KEY, 'newhost.example\ncdn.example']);
  } finally {
    if (previousGetValue === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = previousGetValue;
    if (previousSetValue === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = previousSetValue;
    if (previousRegisterMenu === undefined) delete globalThis.GM_registerMenuCommand;
    else globalThis.GM_registerMenuCommand = previousRegisterMenu;
    dom.window.close();
  }
});

test('未知图床只要采用 /show/ 展示页结构即可自动识别', () => {
  assert.equal(
    isPixhostShowUrl('https://new-image-host.example/show/123/456_preview.jpg', 'https://hdblog.me/post/'),
    true
  );
  assert.equal(
    derivePixhostImageUrlFromThumbnail('https://t7.new-image-host.example/thumbs/123/456_preview.jpg'),
    'https://img7.new-image-host.example/images/123/456_preview.jpg'
  );
});

test('额外图床设置允许未来页面路径变化，无需改核心代码', () => {
  const previousGetValue = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => (
    key === HDBLOG_IMAGE_HOSTS_KEY ? 'future-host.example' : fallback
  );
  try {
    assert.equal(
      isPixhostShowUrl('https://future-host.example/view/abc123', 'https://hdblog.me/post/'),
      true
    );
  } finally {
    if (previousGetValue === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = previousGetValue;
  }
});

test('图床页面解析兼容 CDN 无扩展名的 og:image', () => {
  const dom = new JSDOM('', { url: 'https://hdblog.me/post/' });
  const html = '<html><head><meta property="og:image" content="https://cdn.example/image/abc123?size=full"></head></html>';
  assert.equal(
    parsePixhostImagePage(dom.window.document, html, 'https://future-host.example/view/abc123'),
    'https://cdn.example/image/abc123?size=full'
  );
  dom.window.close();
});

test('hdblog Preview 可直接解析未知域名的 /show/ 图片展示页', async () => {
  const dom = new JSDOM(`
    <main id="genesis-content"><article class="entry"><div class="entry-content">
      Preview:<br>
      <a id="preview-link" href="https://new-image-host.example/show/123/456_preview.jpg">
        <img id="preview" src="https://t7.new-image-host.example/thumbs/123/456_preview.jpg" width="160">
      </a>
      <div>Filed Under: FC2</div>
    </div></article></main>
  `, { url: 'https://hdblog.me/987652/fc2-4973170/' });

  const gmRequest = (details) => queueMicrotask(() => details.onload({
    status: 200,
    finalUrl: details.url,
    responseText: '<html><body><img class="image-img" src="https://cdn.new-image-host.example/full/456_preview.jpg"></body></html>',
  }));

  const count = await expandHdblogPixhostPreviewImages(
    dom.window.document,
    dom.window.location,
    gmRequest
  );
  assert.equal(count, 1);
  assert.equal(
    dom.window.document.querySelector('#preview').src,
    'https://cdn.new-image-host.example/full/456_preview.jpg'
  );
  dom.window.close();
});
