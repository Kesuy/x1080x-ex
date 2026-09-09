import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  HDBLOG_IMAGE_HOSTS_KEY,
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
