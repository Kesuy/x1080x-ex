import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  isHdblogReferUrl,
  resolveHdblogReferUrl,
  resolveHdblogPreviewReferLinks,
} from '../src/hdblog-refer.js';

const REFER_URL = 'https://hdblog.me/refer/DXKjeF9yCG62x3UUL8BOmWvdm5uvFmjBgmIIMvuuaV2eo+YPKo11nMLkOkuRHoSESJ3NYzYHQWXhPXsEQGwBlg==:Uk557+lDCaq62WqeVxhC3w==';
const SHOW_URL = 'https://pixhost.to/show/5553/767463434_fc2ppv-4973170-mp4.jpg';
const THUMB_URL = 'https://t1.pixhost.to/thumbs/5553/767463434_fc2ppv-4973170-mp4.jpg';
const FULL_URL = 'https://img1.pixhost.to/images/5553/767463434_fc2ppv-4973170-mp4.jpg';

test('识别 hdblog /refer/ 中转链接', () => {
  assert.equal(isHdblogReferUrl(REFER_URL), true);
  assert.equal(isHdblogReferUrl(SHOW_URL), false);
  assert.equal(isHdblogReferUrl('https://example.com/refer/token'), false);
});

test('通过 GM_xmlhttpRequest 的 finalUrl 取得 refer 实际跳转地址', async () => {
  const dom = new JSDOM('', { url: 'https://hdblog.me/987652/fc2-4973170/' });
  const requested = [];
  const probeReferUrl = `${REFER_URL}?probe=1`;
  const gmRequest = (details) => {
    requested.push(details.url);
    queueMicrotask(() => details.onload({
      status: 200,
      finalUrl: SHOW_URL,
      responseText: '<html><body>pixhost</body></html>',
      responseHeaders: 'Content-Type: text/html',
    }));
  };

  const resolved = await resolveHdblogReferUrl(dom.window.document, probeReferUrl, gmRequest);
  assert.equal(resolved, SHOW_URL);
  assert.deepEqual(requested, [probeReferUrl]);
  dom.window.close();
});

test('hdblog Preview 的 refer 链接会先还原 Pixhost show，再展开真实大图', async () => {
  const dom = new JSDOM(`
    <main id="genesis-content"><article class="entry"><div class="entry-content">
      <p>Preview:</p>
      <p><a id="preview-link" href="${REFER_URL}"><img id="preview-image" src="${THUMB_URL}" width="160"></a></p>
      <p>Filed Under: FC2</p>
    </div></article></main>
  `, { url: 'https://hdblog.me/987652/fc2-4973170/' });

  const requested = [];
  const gmRequest = (details) => {
    requested.push(details.url);
    if (details.url === REFER_URL) {
      queueMicrotask(() => details.onload({
        status: 200,
        finalUrl: SHOW_URL,
        responseText: '<html><body>redirected</body></html>',
        responseHeaders: 'Content-Type: text/html',
      }));
      return;
    }
    if (details.url === SHOW_URL) {
      queueMicrotask(() => details.onload({
        status: 200,
        finalUrl: SHOW_URL,
        responseText: `<html><body><img class="image-img" src="${FULL_URL}"></body></html>`,
        responseHeaders: 'Content-Type: text/html',
      }));
      return;
    }
    queueMicrotask(() => details.onerror({ error: 'unexpected URL' }));
  };

  const count = await resolveHdblogPreviewReferLinks(
    dom.window.document,
    dom.window.location,
    gmRequest
  );

  assert.equal(count, 1);
  assert.deepEqual(requested, [REFER_URL, SHOW_URL]);

  const image = dom.window.document.querySelector('#preview-image');
  const anchor = dom.window.document.querySelector('#preview-link');
  assert.equal(image.src, FULL_URL);
  assert.equal(anchor.href, FULL_URL);
  assert.equal(anchor.dataset.x1080xHdblogReferUrl, REFER_URL);
  assert.equal(image.dataset.x1080xPreviewLarge, '1');
  dom.window.close();
});
