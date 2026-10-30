import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { preparePreviewForNativeSave } from '../src/preview-native-save.js';

function fixture() {
  const dom = new JSDOM('<a href="https://img1.pixhost.cc/images/full.jpg"><img src="https://img1.pixhost.cc/images/full.jpg" data-x1080x-hdblog-preview-url="https://img1.pixhost.cc/images/full.jpg" data-x1080x-preview-referer="https://hdblog.me/846827/pred-820/"></a>');
  const image = dom.window.document.querySelector('img');
  const saved = [];
  const revoked = [];
  dom.window.URL.createObjectURL = blob => { saved.push(blob); return 'blob:validated-preview'; };
  dom.window.URL.revokeObjectURL = url => revoked.push(url);
  return { dom, image, saved, revoked };
}

test('native save uses validated image bytes, preserves source for batch download and releases on unload', async () => {
  const { dom, image, saved, revoked } = fixture();
  const source = image.src;
  const ok = await preparePreviewForNativeSave(image, options => {
    assert.equal(options.url, source);
    assert.equal(options.headers.Referer, 'https://hdblog.me/846827/pred-820/');
    options.onload({ status: 200, response: new Blob([new Uint8Array([255,216,255,224,1])], { type: 'application/octet-stream' }) });
  });
  assert.equal(ok, true);
  assert.equal(image.src, 'blob:validated-preview');
  assert.equal(image.closest('a').href, image.src);
  assert.equal(saved[0].type, 'image/jpeg');
  assert.equal(image.getAttribute('data-x1080x-hdblog-preview-url'), source);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(revoked.length, 0);
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide'));
  assert.deepEqual(revoked, ['blob:validated-preview']);
  assert.equal(image.src, source);
  dom.window.close();
});

for (const [name, status, body, type] of [
  ['HTML even with image MIME', 200, '<html>challenge</html>', 'image/jpeg'],
  ['HTTP failure', 403, 'Forbidden', 'text/html'],
]) test(`native save rejects ${name}`, async () => {
  const { dom, image, saved } = fixture();
  const source = image.src;
  assert.equal(await preparePreviewForNativeSave(image, options => options.onload({ status, response: new Blob([body], { type }) })), false);
  assert.equal(image.src, source);
  assert.equal(saved.length, 0);
  dom.window.close();
});

test('unavailable GM request and network errors retain the original preview', async () => {
  const { dom, image } = fixture();
  const source = image.src;
  assert.equal(await preparePreviewForNativeSave(image, null), false);
  assert.equal(await preparePreviewForNativeSave(image, options => options.onerror()), false);
  assert.equal(image.src, source);
  dom.window.close();
});
