import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs } from '../src/core.js';
import {
  chooseHdblogSearchResult,
  fetchHdblogPreviewForCode,
  renderAgaghhhHdblogPreview,
} from '../src/agaghhh-hdblog-preview.js';
import {
  AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY,
  openX1080xSettingsPanel,
} from '../src/agaghhh-enhancement.js';

function withGmGetValue(callback) {
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => (
    key === 'x1080x-ex:hdblog-blocked-keywords' ? 'モザイク破壊' : fallback
  );
  try {
    return callback();
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
  }
}

test('uses the same hdblog blocked keywords when two search results exist', () => {
  const candidates = [
    {
      title: 'SVMGM-050 モザイク破壊版',
      url: 'https://hdblog.me/964140/svgmgm-050-mosaic/',
    },
    {
      title: 'SVMGM-050 通常版',
      url: 'https://hdblog.me/964139/svmgm-050/',
    },
  ];
  const result = chooseHdblogSearchResult(candidates, 'SVMGM-050', ['モザイク破壊']);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.remaining.length, 1);
  assert.equal(result.selected?.url, 'https://hdblog.me/964139/svmgm-050/');
});

test('fetches hdblog Preview images including refer -> Pixhost resolution', async () => {
  const browser = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    if (options.url === 'https://hdblog.me/?s=SVMGM-050') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: `<!doctype html><html><body><main id="genesis-content">
          <article class="entry"><h2 class="entry-title"><a href="https://hdblog.me/964140/svgmgm-050-mosaic/">SVMGM-050 モザイク破壊版</a></h2></article>
          <article class="entry"><h2 class="entry-title"><a href="https://hdblog.me/964139/svmgm-050/">SVMGM-050 通常版</a></h2></article>
        </main></body></html>`,
      });
      return;
    }
    if (options.url === 'https://hdblog.me/964139/svmgm-050/') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: `<!doctype html><html><body><main id="genesis-content"><article class="entry"><div class="entry-content">
          <p>Preview:</p>
          <p><a href="https://img1.example.com/full-1.jpg"><img src="https://img1.example.com/thumb-1.jpg"></a></p>
          <p><a href="https://hdblog.me/refer/demo"><img src="https://t2.pixhost.to/thumbs/100/demo.jpg"></a></p>
          <p>BTFile:</p>
          <p><img src="https://img1.example.com/not-preview.jpg"></p>
        </div></article></main></body></html>`,
      });
      return;
    }
    if (options.url === 'https://hdblog.me/refer/demo') {
      options.onload({
        status: 200,
        finalUrl: 'https://pixhost.to/show/100/demo.jpg',
        responseText: '',
      });
      return;
    }
    if (options.url === 'https://pixhost.to/show/100/demo.jpg') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: '<!doctype html><body><img class="image-img" src="https://img2.pixhost.to/images/100/demo.jpg"></body>',
      });
      return;
    }
    throw new Error(`unexpected request: ${options.url}`);
  };

  const result = await withGmGetValue(() => (
    fetchHdblogPreviewForCode('SVMGM-050', gmRequest, browser.window.document)
  ));
  assert.equal(result.articleUrl, 'https://hdblog.me/964139/svmgm-050/');
  assert.deepEqual(result.imageUrls, [
    'https://img1.example.com/full-1.jpg',
    'https://img2.pixhost.to/images/100/demo.jpg',
  ]);
  assert.deepEqual(requested, [
    'https://hdblog.me/?s=SVMGM-050',
    'https://hdblog.me/964139/svmgm-050/',
    'https://hdblog.me/refer/demo',
    'https://pixhost.to/show/100/demo.jpg',
  ]);
});

test('download jobs keep the agaghhh cover and append injected Preview images', () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>SVMGM-050 Sample</title></head><body>
    <h1 id="thread_subject">SVMGM-050 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <a href="forum.php?mod=attachment&aid=1">source.rar</a>
      <img src="https://agaghhh.cc/original.jpg" width="800" height="1200">
    </div></div></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1054823' });

  renderAgaghhhHdblogPreview(dom.window.document, {
    code: 'SVMGM-050',
    articleUrl: 'https://hdblog.me/964139/svmgm-050/',
    imageUrls: [
      'https://img.example.com/p1.jpg',
      'https://img.example.com/p2.jpg',
    ],
  });

  const jobs = buildDownloadJobs(dom.window.document);
  const attachment = jobs.find((job) => job.kind === 'attachment');
  const images = jobs.filter((job) => job.kind === 'image');
  assert.equal(attachment?.name, 'SVMGM-050 Sample.rar');
  assert.deepEqual(images.map((job) => job.name), [
    'SVMGM-050.jpg',
    'SVMGM-050 -1.jpg',
    'SVMGM-050 -2.jpg',
  ]);
  assert.deepEqual(images.map((job) => job.url), [
    'https://agaghhh.cc/original.jpg',
    'https://img.example.com/p1.jpg',
    'https://img.example.com/p2.jpg',
  ]);
});

test('injected Preview images never replace the original-cover candidate', () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>SVMGM-050 Sample</title></head><body>
    <h1 id="thread_subject">SVMGM-050 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <img src="https://agaghhh.cc/original.jpg" width="800" height="1200">
      <img src="https://img.example.com/huge-preview.jpg" width="4000" height="3000"
        data-x1080x-hdblog-preview-url="https://img.example.com/huge-preview.jpg">
    </div></div></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1054823' });

  const images = buildDownloadJobs(dom.window.document).filter((job) => job.kind === 'image');
  assert.deepEqual(images.map((job) => job.name), [
    'SVMGM-050.jpg',
    'SVMGM-050 -1.jpg',
  ]);
  assert.deepEqual(images.map((job) => job.url), [
    'https://agaghhh.cc/original.jpg',
    'https://img.example.com/huge-preview.jpg',
  ]);
});

test('x1080x settings exposes an independent hdblog preview switch', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => (
    key === AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY ? false : fallback
  );
  try {
    const overlay = openX1080xSettingsPanel(dom.window.document);
    const input = overlay.querySelector('[data-setting="hdblog-preview"]');
    assert.ok(input);
    assert.equal(input.checked, false);
    assert.match(overlay.textContent, /显示 hdblog 大预览图/);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
  }
});
