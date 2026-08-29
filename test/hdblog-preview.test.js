import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function installDomGlobals(window, storedDomains = null) {
  const names = [
    'window', 'document', 'location', 'URL', 'Blob', 'FileReader', 'AbortController',
    'GM_info', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand',
    'GM_xmlhttpRequest', 'GM_openInTab',
  ];
  const previous = new Map(names.map((name) => [name, globalThis[name]]));

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.URL = window.URL;
  globalThis.Blob = window.Blob;
  globalThis.FileReader = window.FileReader;
  globalThis.AbortController = window.AbortController;
  globalThis.GM_info = {
    downloadMode: 'default',
    scriptHandler: 'Tampermonkey',
    version: '5.5.0',
  };
  globalThis.GM_getValue = (_key, fallback) => storedDomains ?? fallback;
  globalThis.GM_setValue = () => {};
  globalThis.GM_registerMenuCommand = () => {};
  globalThis.GM_xmlhttpRequest = () => {};
  globalThis.GM_openInTab = () => {};

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  };
}

test('hdblog 文章页将 Preview 缩略图和图片链接直接展开为大图', async () => {
  const dom = new JSDOM(`
    <main id="genesis-content">
      <article class="entry">
        <header class="entry-header"><h1 class="entry-title">FC2PPV-4967987</h1></header>
        <div class="entry-content">
          <p><strong>Preview:</strong></p>
          <p>
            <a id="preview-one" href="/uploads/fc2-4967987-01.jpg">
              <img id="image-one" src="/uploads/fc2-4967987-01-300x169.jpg"
                   srcset="/uploads/fc2-4967987-01-300x169.jpg 300w, /uploads/fc2-4967987-01-768x432.jpg 768w"
                   width="300" height="169" loading="lazy">
            </a>
          </p>
          <p><a id="preview-two" href="https://img.example/fc2-4967987-02.webp">Preview 2</a></p>
          <p><strong>Download:</strong></p>
          <p>
            <a href="/uploads/not-preview.jpg">
              <img id="after-boundary" src="/uploads/not-preview-thumb.jpg" width="200" height="100">
            </a>
          </p>
        </div>
      </article>
    </main>
  `, { url: 'https://hdblog.me/983852/fc2ppv-4967987/' });
  const restore = installDomGlobals(dom.window);

  try {
    await import(`../src/userscript.js?hdblog-preview=${Date.now()}`);

    const first = dom.window.document.querySelector('#image-one');
    assert.equal(first.src, 'https://hdblog.me/uploads/fc2-4967987-01.jpg');
    assert.equal(first.hasAttribute('srcset'), false);
    assert.equal(first.hasAttribute('width'), false);
    assert.equal(first.hasAttribute('height'), false);
    assert.equal(first.loading, 'eager');
    assert.equal(first.dataset.x1080xPreviewExpanded, '1');
    assert.equal(first.style.getPropertyValue('width'), '100%');
    assert.equal(first.style.getPropertyPriority('width'), 'important');
    assert.equal(first.style.getPropertyValue('height'), 'auto');

    const secondAnchor = dom.window.document.querySelector('#preview-two');
    const second = secondAnchor.querySelector('img');
    assert.ok(second);
    assert.equal(second.src, 'https://img.example/fc2-4967987-02.webp');
    assert.equal(secondAnchor.href, 'https://img.example/fc2-4967987-02.webp');
    assert.equal(second.dataset.x1080xPreviewExpanded, '1');

    const afterBoundary = dom.window.document.querySelector('#after-boundary');
    assert.equal(afterBoundary.src, 'https://hdblog.me/uploads/not-preview-thumb.jpg');
    assert.equal(afterBoundary.getAttribute('width'), '200');
    assert.equal(afterBoundary.dataset.x1080xPreviewExpanded, undefined);
  } finally {
    restore();
    dom.window.close();
  }
});

test('非 hdblog 域名不修改同样的 Preview 页面结构', async () => {
  const dom = new JSDOM(`
    <main id="genesis-content"><article class="entry"><div class="entry-content">
      <p><strong>Preview:</strong></p>
      <p><a href="/full.jpg"><img id="preview" src="/thumb.jpg" width="300"></a></p>
    </div></article></main>
  `, { url: 'https://example.com/post/' });
  const restore = installDomGlobals(dom.window, 'example.com');

  try {
    await import(`../src/userscript.js?non-hdblog-preview=${Date.now()}`);
    const image = dom.window.document.querySelector('#preview');
    assert.equal(image.src, 'https://example.com/thumb.jpg');
    assert.equal(image.getAttribute('width'), '300');
    assert.equal(image.dataset.x1080xPreviewExpanded, undefined);
  } finally {
    restore();
    dom.window.close();
  }
});
