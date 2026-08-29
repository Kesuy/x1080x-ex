import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  derivePixhostImageUrlFromThumbnail,
  isPixhostShowUrl,
  parsePixhostImagePage,
  resolvePixhostShowUrl,
} from '../src/pixhost.js';
import {
  expandHdblogPreviewImages,
  expandHdblogPixhostPreviewImages,
} from '../src/hdblog-preview.js';

const FIRST_SHOW = 'https://pixhost.to/show/5307/763636406_fc2ppv-4967987-1-mp4.jpg';
const FIRST_THUMB = 'https://t1.pixhost.to/thumbs/5307/763636406_fc2ppv-4967987-1-mp4.jpg';
const FIRST_FULL = 'https://img1.pixhost.to/images/5307/763636406_fc2ppv-4967987-1-mp4.jpg';

test('识别 Pixhost show 页面并可由 thumbnail 推导 images 原图地址', () => {
  assert.equal(isPixhostShowUrl(FIRST_SHOW), true);
  assert.equal(derivePixhostImageUrlFromThumbnail(FIRST_THUMB), FIRST_FULL);
  assert.equal(isPixhostShowUrl(FIRST_FULL), false);
});

test('从 Pixhost 展示页的 image-img 解析真正原图地址', () => {
  const dom = new JSDOM('', { url: 'https://hdblog.me/post/' });
  const html = `<!doctype html><html><head>
    <meta property="og:image" content="https://pixhost.to/static/logo.png">
  </head><body>
    <img class="image-img" src="${FIRST_FULL}" alt="preview">
  </body></html>`;

  assert.equal(parsePixhostImagePage(dom.window.document, html, FIRST_SHOW), FIRST_FULL);
  dom.window.close();
});

test('Pixhost 页面请求失败时退回由缩略图推导出的原图地址', async () => {
  const dom = new JSDOM('', { url: 'https://hdblog.me/post/' });
  const gmRequest = (details) => queueMicrotask(() => details.onerror({ error: 'network' }));
  const fallbackShow = 'https://pixhost.to/show/5306/763636405_fallback.jpg';
  const fallbackThumb = 'https://t4.pixhost.to/thumbs/5306/763636405_fallback.jpg';
  const fallbackFull = 'https://img4.pixhost.to/images/5306/763636405_fallback.jpg';

  const resolved = await resolvePixhostShowUrl(
    dom.window.document,
    fallbackShow,
    fallbackThumb,
    gmRequest
  );
  assert.equal(resolved, fallbackFull);
  dom.window.close();
});

test('Preview 中任意数量 Pixhost show 链接都会解析并按视口宽度展开', async () => {
  const items = [
    ['763636406_fc2ppv-4967987-1-mp4.jpg', 'https://t1.pixhost.to', 'https://img1.pixhost.to'],
    ['763636407_fc2ppv-4967987-2-mp4.jpg', 'https://t2.pixhost.to', 'https://img2.pixhost.to'],
    ['763636408_fc2ppv-4967987-3-mp4.jpg', 'https://t3.pixhost.to', 'https://img3.pixhost.to'],
  ];
  const links = items.map(([name, thumbHost], index) => `
    <a class="preview-link" href="https://pixhost.to/show/${5307 + index}/${name}">
      <img id="image-${index}" src="${thumbHost}/thumbs/${5307 + index}/${name}" width="160">
    </a>
  `).join('');
  const dom = new JSDOM(`
    <main id="genesis-content"><article class="entry"><div class="entry-content">
      Preview:<br>${links}
      <div>Filed Under: JAV UnCensored</div>
    </div></article></main>
  `, { url: 'https://hdblog.me/983852/fc2ppv-4967987/' });

  // 同步阶段不能再把 /show/...jpg 错当图片直链塞给 img.src。
  assert.equal(expandHdblogPreviewImages(dom.window.document, dom.window.location), 0);
  assert.equal(dom.window.document.querySelector('#image-0').src, `${items[0][1]}/thumbs/5307/${items[0][0]}`);

  const requested = [];
  const gmRequest = (details) => {
    requested.push(details.url);
    const url = new URL(details.url);
    const directory = url.pathname.split('/')[2];
    const filename = url.pathname.split('/').pop();
    const item = items.find(([name]) => name === filename);
    queueMicrotask(() => details.onload({
      status: 200,
      responseText: `<html><body><img class="image-img" src="${item[2]}/images/${directory}/${filename}"></body></html>`,
    }));
  };

  const count = await expandHdblogPixhostPreviewImages(
    dom.window.document,
    dom.window.location,
    gmRequest
  );
  assert.equal(count, 3);
  assert.equal(requested.length, 3);

  items.forEach(([name, _thumbHost, fullHost], index) => {
    const image = dom.window.document.querySelector(`#image-${index}`);
    const anchor = image.closest('a');
    assert.equal(image.src, `${fullHost}/images/${5307 + index}/${name}`);
    assert.equal(image.style.getPropertyValue('display'), 'block');
    assert.equal(image.style.getPropertyValue('width'), 'auto');
    assert.equal(image.style.getPropertyValue('max-width'), '100%');
    assert.equal(image.style.getPropertyValue('height'), 'auto');
    assert.equal(image.dataset.x1080xPreviewLarge, '1');
    assert.equal(anchor.style.getPropertyValue('width'), 'calc(100vw - 24px)');
    assert.equal(anchor.style.getPropertyValue('max-width'), 'none');
    assert.equal(anchor.style.getPropertyValue('left'), '50%');
    assert.equal(anchor.style.getPropertyValue('transform'), 'translateX(-50%)');
  });

  dom.window.close();
});
