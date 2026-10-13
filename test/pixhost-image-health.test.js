import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  checkPixhostPreviewImage,
  filterPixhostUnavailableImageUrls,
  isPixhostRemovedPlaceholder,
} from '../src/preview-image-health.js';
import { installAgaghhhHdblogPreview } from '../src/agaghhh-hdblog-preview.js';

function mockImages(document, lookup) {
  class MockImage {
    naturalWidth = 0;
    naturalHeight = 0;
    complete = false;
    set src(value) {
      this.url = value;
      queueMicrotask(() => {
        const size = lookup(value);
        this.complete = true;
        if (!size) {
          this.onerror?.(new Error('image failed'));
          return;
        }
        [this.naturalWidth, this.naturalHeight] = size;
        this.onload?.();
      });
    }
  }
  Object.defineProperty(document.defaultView, 'Image', {
    value: MockImage,
    configurable: true,
  });
}

test('Pixhost Picture removed card is not a usable Preview although the image loaded', async () => {
  const dom = new JSDOM('', { url: 'https://agaghhh.cc/' });
  const removed = 'https://img2.pixhost.to/images/9100/dass-909.jpg';
  mockImages(dom.window.document, (url) => url === removed ? [258, 126] : [1200, 800]);
  assert.equal(isPixhostRemovedPlaceholder(removed, 258, 126), true);
  assert.equal(isPixhostRemovedPlaceholder(removed, 1200, 800), false);
  assert.equal(isPixhostRemovedPlaceholder('https://example.com/preview.jpg', 258, 126), false);
  assert.equal(await checkPixhostPreviewImage(removed, dom.window.document), false);
  assert.deepEqual(
    (await filterPixhostUnavailableImageUrls({
      code: 'DASS-909',
      imageUrls: [removed, 'https://img3.pixhost.to/images/9101/good.jpg'],
    }, dom.window.document)).imageUrls,
    ['https://img3.pixhost.to/images/9101/good.jpg']
  );
  dom.window.close();
});

for (const code of ['DASS-909', 'DASS-904']) {
  test(`${code}: removed Pixhost image triggers JavFree fallback rather than showing removed card`, async () => {
    const dom = new JSDOM(`<!doctype html><body>
      <h1 id="thread_subject">${code} Sample</h1>
      <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f"></div></div></div>
    </body>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1075624' });
    const pixhost = `https://img2.pixhost.to/images/9100/${code.toLowerCase()}.jpg`;
    const javfree = `https://cf.javfree.me/HLIC/${code}-1080p.jpeg`;
    mockImages(dom.window.document, (url) => url === pixhost ? [258, 126] : [1200, 800]);
    const requests = [];
    const gmRequest = (options) => {
      requests.push(options.url);
      let html = '';
      if (options.url === `https://hdblog.me/?s=${code}`) {
        html = `<main id="genesis-content"><article class="entry"><h2 class="entry-title">
          <a href="https://hdblog.me/1234/${code.toLowerCase()}/">${code}</a>
        </h2></article></main>`;
      } else if (options.url === `https://hdblog.me/1234/${code.toLowerCase()}/`) {
        html = `<main id="genesis-content"><article class="entry"><div class="entry-content">
          <p>Preview:</p><p><img src="${pixhost}"></p><p>BTFile:</p>
        </div></article></main>`;
      } else if (options.url === `https://javfree.me/search/${code}`) {
        html = `<main id="main"><article><h2 class="entry-title">
          <a href="https://javfree.me/1234/${code.toLowerCase()}">${code}</a>
        </h2></article></main>`;
      } else if (options.url === `https://javfree.me/1234/${code.toLowerCase()}`) {
        html = `<main id="main"><article><div class="entry-content">
          <img src="https://cf.javfree.me/HLIC/${code}.jpg">
          <img src="${javfree}">
        </div></article></main>`;
      } else {
        throw new Error(`Unexpected request: ${options.url}`);
      }
      options.onload({ status: 200, finalUrl: options.url, responseText: html });
    };
    const oldGet = globalThis.GM_getValue;
    globalThis.GM_getValue = (_key, fallback) => fallback;
    try {
      const section = await installAgaghhhHdblogPreview(
        dom.window.document, dom.window.location, gmRequest
      );
      assert.ok(section);
      assert.match(section.textContent, /JavFree Preview/);
      assert.deepEqual([...section.querySelectorAll('img')].map((image) => image.src), [javfree]);
      assert.ok(requests.includes(`https://javfree.me/search/${code}`));
    } finally {
      if (oldGet === undefined) delete globalThis.GM_getValue;
      else globalThis.GM_getValue = oldGet;
      dom.window.close();
    }
  });
}

test('healthy Pixhost Preview is retained and does not trigger fallback', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <h1 id="thread_subject">DASS-909 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f"></div></div></div>
  </body>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1075624' });
  const pixhost = 'https://img2.pixhost.to/images/9100/dass-909.jpg';
  mockImages(dom.window.document, () => [1280, 720]);
  const gmRequest = (options) => {
    let html;
    if (options.url === 'https://hdblog.me/?s=DASS-909') {
      html = '<main id="genesis-content"><article class="entry"><h2 class="entry-title"><a href="https://hdblog.me/1234/dass-909/">DASS-909</a></h2></article></main>';
    } else if (options.url === 'https://hdblog.me/1234/dass-909/') {
      html = `<main id="genesis-content"><article class="entry"><div class="entry-content"><p>Preview:</p><p><img src="${pixhost}"></p><p>BTFile:</p></div></article></main>`;
    } else {
      throw new Error('JavFree must not be fetched for a healthy HDblog Preview');
    }
    options.onload({ status: 200, finalUrl: options.url, responseText: html });
  };
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (_key, fallback) => fallback;
  try {
    const section = await installAgaghhhHdblogPreview(
      dom.window.document, dom.window.location, gmRequest
    );
    assert.ok(section);
    assert.match(section.textContent, /HDblog Preview/);
    assert.equal(section.querySelector('img')?.src, pixhost);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    dom.window.close();
  }
});
