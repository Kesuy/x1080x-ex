import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY,
  JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY,
  JAVFREE_COPY_CODE_ENABLED_KEY,
  JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY,
  JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY,
  buildJavfreeAgaghhhSearchUrl,
  collectJavfreeArticleImages,
  extractJavfreeVideoCode,
  fetchJavfreePreviewForCode,
  installHdblogJavfreeFallback,
  installJavfreeEnhancement,
  isDeletedHdblogArticlePage,
  javfreeUniqueSearchTarget,
  openJavfreeSettingsPanel,
} from '../src/javfree.js';
import { installAgaghhhHdblogPreview } from '../src/agaghhh-hdblog-preview.js';

function withGm(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try {
    return callback();
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue;
    else globalThis.GM_setValue = oldSet;
  }
}

function sanArticleDom(url = 'https://javfree.me/436747/san-437') {
  return new JSDOM(`<!doctype html><html><body class="single single-post">
    <main id="main" class="site-main"><article id="post-436747">
      <header class="entry-header">
        <h1 class="entry-title">[SAN-437] Sample</h1>
      </header>
      <div class="entry-content">
        <p>
          <img src="https://cf.javfree.me/HLIC/SAN-437.jpg">
          <img src="https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg">
          <img src="https://cf.javfree.me/HLIC/SAN-437-1.jpg">
          <img src="https://cf.javfree.me/HLIC/SAN-437-2.jpg">
        </p>
      </div>
    </article></main>
  </body></html>`, { url });
}

test('JavFree recognizes codes whose prefix contains digits', () => {
  assert.equal(extractJavfreeVideoCode('[T38-042] Sample'), 'T38-042');
  assert.equal(extractJavfreeVideoCode('T38-038 Sample'), 'T38-038');
  assert.equal(extractJavfreeVideoCode('[SAN-437] Sample'), 'SAN-437');
});

test('JavFree article treats first image as cover and second 1080p image as Preview', () => {
  const dom = sanArticleDom();
  const result = collectJavfreeArticleImages(dom.window.document, 'SAN-437');
  assert.equal(result.coverUrl, 'https://cf.javfree.me/HLIC/SAN-437.jpg');
  assert.equal(result.previewUrl, 'https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg');
  assert.deepEqual(result.imageUrls.slice(0, 3), [
    'https://cf.javfree.me/HLIC/SAN-437.jpg',
    'https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg',
    'https://cf.javfree.me/HLIC/SAN-437-1.jpg',
  ]);
});

test('JavFree search auto target uses only the unique main result', () => {
  const single = new JSDOM(`<!doctype html><body>
    <main id="main">
      <article><h2 class="entry-title"><a href="/436747/san-437">SAN-437</a></h2></article>
    </main>
    <aside><article><h2 class="entry-title"><a href="/1/sidebar">sidebar</a></h2></article></aside>
  </body>`, { url: 'https://javfree.me/search/SAN-437' });
  assert.equal(
    javfreeUniqueSearchTarget(single.window.document, single.window.location),
    'https://javfree.me/436747/san-437'
  );

  const multiple = new JSDOM(`<!doctype html><body><main id="main">
    <article><h2 class="entry-title"><a href="/436747/san-437">SAN-437</a></h2></article>
    <article><h2 class="entry-title"><a href="/436748/san-438">SAN-438</a></h2></article>
  </main></body>`, { url: 'https://javfree.me/search/SAN' });
  assert.equal(javfreeUniqueSearchTarget(multiple.window.document, multiple.window.location), '');
});

test('fetches only JavFree Preview after unique search result', async () => {
  const host = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    if (options.url === 'https://javfree.me/search/SAN-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: `<!doctype html><body><main id="main">
          <article><h2 class="entry-title"><a href="https://javfree.me/436747/san-437">[SAN-437] Sample</a></h2></article>
        </main></body>`,
      });
      return;
    }
    if (options.url === 'https://javfree.me/436747/san-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: `<!doctype html><body><main id="main"><article>
          <h1 class="entry-title">[SAN-437] Sample</h1>
          <div class="entry-content"><p>
            <img src="https://cf.javfree.me/HLIC/SAN-437.jpg">
            <img src="https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg">
            <img src="https://cf.javfree.me/HLIC/SAN-437-1.jpg">
          </p></div>
        </article></main></body>`,
      });
      return;
    }
    throw new Error('unexpected request: ' + options.url);
  };

  const result = await fetchJavfreePreviewForCode('SAN-437', gmRequest, host.window.document);
  assert.equal(result.articleUrl, 'https://javfree.me/436747/san-437');
  assert.equal(result.coverUrl, 'https://cf.javfree.me/HLIC/SAN-437.jpg');
  assert.deepEqual(result.imageUrls, ['https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg']);
  assert.deepEqual(requested, [
    'https://javfree.me/search/SAN-437',
    'https://javfree.me/436747/san-437',
  ]);
});

test('agaghhh falls back from missing HDblog Preview to JavFree', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <h1 id="thread_subject">SAN-437 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <img src="https://agaghhh.cc/cover.jpg">
    </div></div></div>
  </body>`, {
    url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=437',
  });
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => fallback;
  const gmRequest = (options) => {
    if (options.url === 'https://hdblog.me/?s=SAN-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: '<main id="genesis-content"></main>',
      });
      return;
    }
    if (options.url === 'https://javfree.me/search/SAN-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: '<main id="main"><article><h2 class="entry-title"><a href="https://javfree.me/436747/san-437">SAN-437</a></h2></article></main>',
      });
      return;
    }
    if (options.url === 'https://javfree.me/436747/san-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: '<main id="main"><article><div class="entry-content"><p><img src="https://cf.javfree.me/HLIC/SAN-437.jpg"><img src="https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg"></p></div></article></main>',
      });
      return;
    }
    throw new Error('unexpected request: ' + options.url);
  };

  try {
    const section = await installAgaghhhHdblogPreview(
      dom.window.document,
      dom.window.location,
      gmRequest
    );
    assert.ok(section);
    assert.match(section.textContent, /JavFree Preview/);
    assert.equal(
      section.querySelector('img')?.getAttribute('src'),
      'https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg'
    );
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
  }
});

test('deleted HDblog article opens JavFree search once for the code in its slug', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>ERROR-404 | HDblog.me</title></head>
    <body class="error404">
      <main id="genesis-content"><article class="entry">
        <header class="entry-header"><h1 class="entry-title">ERROR-404</h1></header>
        <div class="entry-content"><p>The page you requested could not be found.</p></div>
      </article></main>
    </body></html>`, {
    url: 'https://hdblog.me/768141/pjam-034/',
  });
  const oldGet = globalThis.GM_getValue;
  const oldOpen = globalThis.GM_openInTab;
  const opened = [];
  globalThis.GM_getValue = (key, fallback) => (
    key === HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY ? true : fallback
  );
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });
  try {
    await installHdblogJavfreeFallback(dom.window.document, dom.window.location, () => {});
    await installHdblogJavfreeFallback(dom.window.document, dom.window.location, () => {});
    assert.deepEqual(opened, [{
      url: 'https://javfree.me/search/PJAM-034',
      options: { active: true, insert: true, setParent: true },
    }]);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldOpen === undefined) delete globalThis.GM_openInTab;
    else globalThis.GM_openInTab = oldOpen;
  }
});

test('HDblog code ending in 404 is not treated as a deleted article', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>SNOS-404 Sample | HDblog.me</title></head>
    <body class="single single-post">
      <main id="genesis-content"><article class="entry">
        <header class="entry-header"><h1 class="entry-title">SNOS-404 Sample</h1></header>
        <div class="entry-content">
          <p>Preview:</p>
          <p><a href="https://img.example.com/SNOS-404-preview.jpg">Preview image</a></p>
          <p>Btfile:</p>
        </div>
      </article></main>
    </body></html>`, {
    url: 'https://hdblog.me/1000328/snos-404/',
  });
  const oldGet = globalThis.GM_getValue;
  const oldOpen = globalThis.GM_openInTab;
  const opened = [];
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.GM_openInTab = (url) => opened.push(url);
  try {
    assert.equal(isDeletedHdblogArticlePage(dom.window.document, dom.window.location), false);
    await installHdblogJavfreeFallback(dom.window.document, dom.window.location, () => {});
    assert.deepEqual(opened, []);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldOpen === undefined) delete globalThis.GM_openInTab;
    else globalThis.GM_openInTab = oldOpen;
    dom.window.close();
  }
});

test('deleted HDblog ignores ERROR-404 title and always searches the original URL code', async () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>ERROR-404</title></head>
    <body><main id="genesis-content"><article class="entry">
      <h1 class="entry-title">ERROR-404</h1>
      <div class="entry-content"><p>404 Not Found</p></div>
    </article></main></body></html>`, {
    url: 'https://hdblog.me/768141/pjam-034/',
  });
  const oldGet = globalThis.GM_getValue;
  const oldOpen = globalThis.GM_openInTab;
  const opened = [];
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.GM_openInTab = (url) => opened.push(url);
  try {
    await installHdblogJavfreeFallback(dom.window.document, dom.window.location, () => {});
    assert.deepEqual(opened, ['https://javfree.me/search/PJAM-034']);
    assert.equal(opened.some((url) => /ERROR-404/i.test(url)), false);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldOpen === undefined) delete globalThis.GM_openInTab;
    else globalThis.GM_openInTab = oldOpen;
  }
});

test('HDblog without usable Preview injects JavFree second image as fallback', async () => {
  const dom = new JSDOM(`<!doctype html><body class="single single-post">
    <main id="genesis-content"><article class="entry">
      <header><h1 class="entry-title">SAN-437 Sample</h1></header>
      <div class="entry-content"><p>Info only</p></div>
    </article></main>
  </body>`, { url: 'https://hdblog.me/999999/san-437/' });
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (_key, fallback) => fallback;
  const gmRequest = (options) => {
    if (options.url === 'https://javfree.me/search/SAN-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: '<main id="main"><article><h2 class="entry-title"><a href="https://javfree.me/436747/san-437">SAN-437</a></h2></article></main>',
      });
      return;
    }
    if (options.url === 'https://javfree.me/436747/san-437') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: '<main id="main"><article><div class="entry-content"><p><img src="https://cf.javfree.me/HLIC/SAN-437.jpg"><img src="https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg"></p></div></article></main>',
      });
      return;
    }
    throw new Error('unexpected request: ' + options.url);
  };

  try {
    const section = await installHdblogJavfreeFallback(
      dom.window.document,
      dom.window.location,
      gmRequest
    );
    assert.ok(section);
    assert.equal(
      section.querySelector('img')?.getAttribute('src'),
      'https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg'
    );
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
  }
});

test('JavFree settings expose independent redirect, search, copy and Preview-download switches', () => {
  const dom = sanArticleDom();
  const values = new Map();
  withGm(values, () => {
    const panel = openJavfreeSettingsPanel(dom.window.document);
    const redirect = panel.querySelector('[data-setting="search-auto-redirect"]');
    const agaghhhSearch = panel.querySelector('[data-setting="agaghhh-search"]');
    const copyCode = panel.querySelector('[data-setting="copy-code"]');
    const download = panel.querySelector('[data-setting="preview-download"]');
    assert.equal(redirect.checked, true);
    assert.equal(agaghhhSearch.checked, true);
    assert.equal(copyCode.checked, true);
    assert.equal(download.checked, true);
  });
});

test('JavFree switches can independently disable redirect, search, copy and download buttons', () => {
  const search = new JSDOM(`<!doctype html><body><main id="main">
    <article><h2 class="entry-title"><a href="/436747/san-437">SAN-437</a></h2></article>
  </main></body>`, { url: 'https://javfree.me/search/SAN-437' });
  withGm(new Map([[JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY, false]]), () => {
    const result = installJavfreeEnhancement(search.window.document, search.window.location, () => {});
    assert.equal(result.redirectTarget, '');
  });

  const noSearch = sanArticleDom();
  withGm(new Map([[JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY, false]]), () => {
    const result = installJavfreeEnhancement(
      noSearch.window.document,
      noSearch.window.location,
      () => {}
    );
    assert.equal(result.searchButton, null);
    assert.equal(
      noSearch.window.document.getElementById('x1080x-ex-javfree-agaghhh-search'),
      null
    );
  });

  const noCopy = sanArticleDom();
  withGm(new Map([[JAVFREE_COPY_CODE_ENABLED_KEY, false]]), () => {
    const result = installJavfreeEnhancement(
      noCopy.window.document,
      noCopy.window.location,
      () => {}
    );
    assert.equal(result.copyButton, null);
    assert.equal(
      noCopy.window.document.getElementById('x1080x-ex-javfree-copy-code'),
      null
    );
  });

  const article = sanArticleDom();
  withGm(new Map([[JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY, false]]), () => {
    const result = installJavfreeEnhancement(article.window.document, article.window.location, () => {});
    assert.equal(result.button, null);
    assert.equal(article.window.document.getElementById('x1080x-ex-javfree-preview-download'), null);
  });
});

test('JavFree detail search button recognizes code and opens agaghhh forum search', () => {
  assert.equal(
    buildJavfreeAgaghhhSearchUrl('SAN-437'),
    'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SAN-437&orderby=lastpost&ascdesc=desc'
  );

  const dom = sanArticleDom();
  const oldGet = globalThis.GM_getValue;
  const oldOpen = globalThis.GM_openInTab;
  const opened = [];
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });
  try {
    const result = installJavfreeEnhancement(dom.window.document, dom.window.location, () => {});
    assert.ok(result.searchButton);
    assert.equal(result.searchButton.textContent, '🔍');
    result.searchButton.click();
    assert.deepEqual(opened, [{
      url: 'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SAN-437&orderby=lastpost&ascdesc=desc',
      options: { active: true, insert: true, setParent: true },
    }]);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldOpen === undefined) delete globalThis.GM_openInTab;
    else globalThis.GM_openInTab = oldOpen;
    dom.window.close();
  }
});

test('JavFree copy-code button copies the recognized code like HDblog', async () => {
  const dom = sanArticleDom();
  const oldGet = globalThis.GM_getValue;
  const oldClipboard = globalThis.GM_setClipboard;
  const copied = [];
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.GM_setClipboard = (value, type) => copied.push({ value, type });
  try {
    const result = installJavfreeEnhancement(dom.window.document, dom.window.location, () => {});
    assert.ok(result.copyButton);
    assert.equal(result.copyButton.textContent, '📋');
    result.copyButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(copied, [{ value: 'SAN-437', type: 'text' }]);
    assert.equal(result.copyButton.textContent, '✓');
    assert.equal(result.copyButton.title, '已复制：SAN-437');
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldClipboard === undefined) delete globalThis.GM_setClipboard;
    else globalThis.GM_setClipboard = oldClipboard;
    dom.window.close();
  }
});

test('JavFree action buttons use one consistent 8px margin without spacer text nodes', () => {
  const dom = sanArticleDom();
  const oldGet = globalThis.GM_getValue;
  globalThis.GM_getValue = (_key, fallback) => fallback;
  try {
    const result = installJavfreeEnhancement(dom.window.document, dom.window.location, () => {});
    assert.ok(result.button);
    assert.ok(result.copyButton);
    assert.ok(result.searchButton);

    const title = dom.window.document.querySelector('h1.entry-title');
    const buttons = [...title.querySelectorAll('button')];
    assert.deepEqual(buttons.map((button) => button.id), [
      'x1080x-ex-javfree-preview-download',
      'x1080x-ex-javfree-copy-code',
      'x1080x-ex-javfree-agaghhh-search',
    ]);
    assert.deepEqual(buttons.map((button) => button.style.margin), [
      '0px 0px 4px 8px',
      '0px 0px 4px 8px',
      '0px 0px 4px 8px',
    ]);
    assert.equal(result.button.nextSibling, result.copyButton);
    assert.equal(result.copyButton.nextSibling, result.searchButton);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    dom.window.close();
  }
});

test('JavFree Preview download saves the second image as code.jpg', async () => {
  const dom = sanArticleDom();
  const oldGet = globalThis.GM_getValue;
  const oldUrl = globalThis.URL;
  globalThis.GM_getValue = (_key, fallback) => fallback;
  globalThis.URL = dom.window.URL;
  const saved = [];
  const revoked = [];
  dom.window.URL.createObjectURL = () => 'blob:javfree-preview';
  dom.window.URL.revokeObjectURL = (url) => revoked.push(url);
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) saved.push({ name: this.download, href: this.href });
  };
  const gmRequest = (options) => {
    assert.equal(options.url, 'https://cf.javfree.me/HLIC/SAN-437-1080p.jpeg');
    assert.equal(options.responseType, 'blob');
    queueMicrotask(() => options.onload({
      status: 200,
      response: new dom.window.Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
    }));
  };

  try {
    const result = installJavfreeEnhancement(dom.window.document, dom.window.location, gmRequest);
    assert.ok(result.button);
    result.button.click();
    for (let index = 0; index < 6 && saved.length < 1; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.deepEqual(saved, [{ name: 'SAN-437.jpg', href: 'blob:javfree-preview' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(revoked, ['blob:javfree-preview']);
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldUrl === undefined) delete globalThis.URL;
    else globalThis.URL = oldUrl;
  }
});
