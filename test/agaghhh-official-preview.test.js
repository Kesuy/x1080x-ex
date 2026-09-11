import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY,
  fanzaPreviewUrl,
  fetchOfficialPreviewFallbackForCode,
  injectOfficialPreviewFallbackSetting,
  parseAvWikiProviderIds,
  parseMgsPreviewImages,
} from '../src/agaghhh-preview-official.js';

function browser(url = 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1') {
  return new JSDOM('<!doctype html><body></body>', { url });
}

test('parses FANZA and MGS ids from av-wiki detail metadata', () => {
  const dom = new JSDOM(`<!doctype html><body><table>
    <tr><th>メーカー品番</th><td>SVMGM-050</td></tr>
    <tr><th>MGS品番</th><td>299SVMGM-050</td></tr>
    <tr><th>FANZA品番</th><td>h_1240svmgm00050</td></tr>
  </table></body>`);
  assert.deepEqual(parseAvWikiProviderIds(dom.window.document), {
    fanzaId: 'h_1240svmgm00050',
    mgsId: '299SVMGM-050',
  });
});

test('builds FANZA official large Preview URLs', () => {
  assert.equal(
    fanzaPreviewUrl('h_1240svmgm00050', 2, true),
    'https://pics.dmm.co.jp/digital/video/h_1240svmgm00050/h_1240svmgm00050jp-2.jpg'
  );
});

test('official fallback prefers FANZA when its Preview images exist', async () => {
  const dom = browser();
  const requested = [];
  const gmRequest = (options) => {
    requested.push({ method: options.method, url: options.url });
    if (options.url.includes('av-wiki.net/?s=SVMGM-050')) {
      options.onload({
        status: 200,
        responseText: '<article><a href="https://av-wiki.net/svmgm-050/">SVMGM-050</a></article>',
      });
      return;
    }
    if (options.url === 'https://av-wiki.net/svmgm-050/') {
      options.onload({
        status: 200,
        responseText: '<table><tr><th>FANZA品番</th><td>h_1240svmgm00050</td></tr><tr><th>MGS品番</th><td>299SVMGM-050</td></tr></table>',
      });
      return;
    }
    if (options.method === 'HEAD' && /h_1240svmgm00050-[12]\.jpg$/.test(options.url)) {
      options.onload({ status: 200 });
      return;
    }
    if (options.method === 'HEAD') {
      options.onload({ status: 404 });
      return;
    }
    options.onload({ status: 404, responseText: '' });
  };

  const result = await fetchOfficialPreviewFallbackForCode('SVMGM-050', gmRequest, dom.window.document);
  assert.equal(result.sourceName, 'FANZA');
  assert.equal(result.referer, 'https://www.dmm.co.jp/');
  assert.deepEqual(result.imageUrls, [
    'https://pics.dmm.co.jp/digital/video/h_1240svmgm00050/h_1240svmgm00050jp-1.jpg',
    'https://pics.dmm.co.jp/digital/video/h_1240svmgm00050/h_1240svmgm00050jp-2.jpg',
  ]);
  assert.equal(requested.some((entry) => entry.url.includes('mgstage.com')), false);
});

test('official fallback uses MGStage when FANZA images are unavailable', async () => {
  const dom = browser();
  const gmRequest = (options) => {
    if (options.url.includes('av-wiki.net/?s=ABCD-123')) {
      options.onload({
        status: 200,
        responseText: '<article><a href="https://av-wiki.net/abcd-123/">ABCD-123</a></article>',
      });
      return;
    }
    if (options.url === 'https://av-wiki.net/abcd-123/') {
      options.onload({
        status: 200,
        responseText: '<table><tr><th>FANZA品番</th><td>1abcd00123</td></tr><tr><th>MGS品番</th><td>777ABCD-123</td></tr></table>',
      });
      return;
    }
    if (options.method === 'HEAD') {
      options.onload({ status: 404 });
      return;
    }
    if (options.url.includes('/product/product_detail/777ABCD-123/')) {
      options.onload({
        status: 200,
        responseText: '<a class="sample_image" href="https://image.mgstage.com/sample/1.jpg">1</a><a class="sample_image" href="/sample/2.jpg">2</a>',
      });
      return;
    }
    options.onload({ status: 404, responseText: '' });
  };

  const result = await fetchOfficialPreviewFallbackForCode('ABCD-123', gmRequest, dom.window.document);
  assert.equal(result.sourceName, 'MGStage');
  assert.match(result.referer, /mgstage\.com\/product\/product_detail\/777ABCD-123/);
  assert.deepEqual(result.imageUrls, [
    'https://image.mgstage.com/sample/1.jpg',
    'https://www.mgstage.com/sample/2.jpg',
  ]);
});

test('parses MGStage .sample_image links without duplicates', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <a class="sample_image" href="/sample/1.jpg"></a>
    <a class="sample_image" href="/sample/1.jpg"></a>
    <a class="sample_image" href="https://image.mgstage.com/sample/2.jpg"></a>
  </body>`, { url: 'https://www.mgstage.com/product/product_detail/test/' });
  assert.deepEqual(parseMgsPreviewImages(dom.window.document, dom.window.location.href), [
    'https://www.mgstage.com/sample/1.jpg',
    'https://image.mgstage.com/sample/2.jpg',
  ]);
});

test('injects official fallback into x1080x settings and saves it independently', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="x1080x-ex-settings-panel"><form>
      <label><input data-setting="hdblog-preview" type="checkbox" checked><span><strong>显示 hdblog 大预览图</strong><small>old</small></span></label>
      <button type="submit">保存</button>
    </form></div>
  </body>`, { url: 'https://agaghhh.cc/' });
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  const writes = [];
  globalThis.GM_getValue = (key, fallback) => key === AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY ? false : fallback;
  globalThis.GM_setValue = (key, value) => writes.push([key, value]);
  try {
    assert.equal(injectOfficialPreviewFallbackSetting(dom.window.document), true);
    const input = dom.window.document.querySelector('[data-setting="official-preview-fallback"]');
    assert.ok(input);
    assert.equal(input.checked, false);
    assert.equal(dom.window.document.querySelector('[data-setting="hdblog-preview"]')?.closest('label')?.querySelector('strong')?.textContent, '显示大预览图');
    input.checked = true;
    dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(writes, [[AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY, true]]);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = oldSet;
  }
});
