import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  applyHdblogArticleLayout,
  clearHdblogArticleLayout,
  collectHdblogPixhostPreviewImages,
  extractHdblogArticleCode,
  extractHdblogVideoCode,
  hdblogImageFilename,
  isHdblogArticlePage,
  installHdblogArticleEnhancement,
  normalizeHdblogArticleWidth,
} from '../src/hdblog-article.js';

function articleDom({
  url = 'https://hdblog.me/986480/mond-308/',
  title = 'MOND-308 憧れの女上司と 妃ひかり',
  content = '',
} = {}) {
  return new JSDOM(`<!doctype html>
<html>
<head><title>${title}</title></head>
<body class="single single-post content-sidebar">
  <div class="site-inner">
    <div class="content-sidebar-wrap">
      <main id="genesis-content" class="content">
        <article class="entry post">
          <header class="entry-header">
            <h1 class="entry-title">${title}</h1>
            <p class="entry-meta">September 5, 2026</p>
          </header>
          <div class="entry-content">${content}</div>
        </article>
      </main>
      <aside class="sidebar sidebar-primary"></aside>
    </div>
  </div>
</body>
</html>`, { url });
}

test('recognizes normal and FC2 codes in common hdblog title formats', () => {
  assert.equal(extractHdblogVideoCode('MOND-308 憧れの女上司と'), 'MOND-308');
  assert.equal(extractHdblogVideoCode('mond308 sample'), 'MOND-308');
  assert.equal(extractHdblogVideoCode('FC2-PPV-1234567 sample'), 'FC2-PPV-1234567');
  assert.equal(extractHdblogVideoCode('FC2PPV1234567 sample'), 'FC2-PPV-1234567');
  assert.equal(extractHdblogVideoCode('FC2-1234567 sample'), 'FC2-1234567');
});

test('detects a single article page but not an hdblog search result page', () => {
  const article = articleDom();
  assert.equal(isHdblogArticlePage(article.window.document, article.window.location), true);

  const search = new JSDOM(`<!doctype html><body><main id="genesis-content">
    <article class="entry"><h2 class="entry-title"><a href="/986480/mond-308/">MOND-308</a></h2>
    <div class="entry-content">summary</div></article></main></body>`, {
    url: 'https://hdblog.me/?s=MOND-308',
  });
  assert.equal(isHdblogArticlePage(search.window.document, search.window.location), false);
});

test('extracts the article code from title and falls back to the 品番 field', () => {
  const titled = articleDom();
  assert.equal(extractHdblogArticleCode(titled.window.document), 'MOND-308');

  const labelled = articleDom({
    title: '憧れの女上司と 妃ひかり',
    content: '<p>発売日：2026/09/08<br>品番： mond308</p>',
  });
  assert.equal(extractHdblogArticleCode(labelled.window.document), 'MOND-308');
});

test('downloads only Pixhost show images inside the Preview section', () => {
  const dom = articleDom({
    content: `
      <p><a href="https://img.example.com/MOND-308-cover.jpg"><img width="800" height="540" src="https://thumb.example.com/MOND-308-cover.jpg"></a></p>
      <p>Btfile:</p>
      <p>MOND-308_6M.mp4</p>
      <p>Preview:</p>
      <p><a href="https://pixhost.to/show/123/456_mond-308.jpg"><img src="https://t1.pixhost.to/thumbs/123/456_mond-308.jpg"></a></p>
      <p><a href="https://img.example.com/not-pixhost.jpg"><img src="https://img.example.com/not-pixhost.jpg"></a></p>
      <p>Rapidgator:</p>
      <p><a href="https://pixhost.to/show/999/888_after-boundary.jpg"><img src="https://t1.pixhost.to/thumbs/999/888_after-boundary.jpg"></a></p>
    `,
  });

  const images = collectHdblogPixhostPreviewImages(dom.window.document);
  assert.equal(images.length, 1);
  assert.equal(images[0].pixhostShowUrl, 'https://pixhost.to/show/123/456_mond-308.jpg');
  assert.equal(images[0].thumbUrl, 'https://t1.pixhost.to/thumbs/123/456_mond-308.jpg');
});

test('recognizes an already-expanded Pixhost Preview big image', () => {
  const dom = articleDom({
    content: `
      <p>Preview:</p>
      <p><a href="https://img1.pixhost.to/images/123/456_mond-308.jpg">
        <img data-x1080x-preview-large="1" src="https://img1.pixhost.to/images/123/456_mond-308.jpg">
      </a></p>
      <p>Btfile:</p>
    `,
  });

  const images = collectHdblogPixhostPreviewImages(dom.window.document);
  assert.equal(images.length, 1);
  assert.equal(images[0].pixhostShowUrl, '');
  assert.equal(images[0].directUrl, 'https://img1.pixhost.to/images/123/456_mond-308.jpg');
});

test('multiple image names use 番号-1 / 番号-2 and preserve the real image extension', () => {
  assert.equal(hdblogImageFilename('MOND-308', 0, 1, 'jpg'), 'MOND-308.jpg');
  assert.equal(hdblogImageFilename('MOND-308', 0, 2, 'jpg'), 'MOND-308-1.jpg');
  assert.equal(hdblogImageFilename('MOND-308', 1, 2, 'webp'), 'MOND-308-2.webp');
  assert.equal(hdblogImageFilename('FC2-PPV-1234567', 1, 3, 'png'), 'FC2-PPV-1234567-2.png');
});

test('custom article width is bounded, and clearing it restores the site default layout', () => {
  assert.equal(normalizeHdblogArticleWidth('', null), null);
  assert.equal(normalizeHdblogArticleWidth('   ', null), null);
  assert.equal(normalizeHdblogArticleWidth('1280'), 1280);
  assert.equal(normalizeHdblogArticleWidth('500'), 600);
  assert.equal(normalizeHdblogArticleWidth('9999'), 3000);

  const dom = articleDom();
  const article = dom.window.document.querySelector('article.entry');
  article.getBoundingClientRect = () => ({ width: 760 });
  assert.equal(applyHdblogArticleLayout(dom.window.document, 1280), true);
  assert.equal(dom.window.document.body.classList.contains('x1080x-hdblog-single'), true);
  const style = dom.window.document.querySelector('#x1080x-ex-hdblog-article-layout');
  assert.ok(style);
  assert.match(style.textContent, /--x1080x-hdblog-article-width:\s*1280px/);
  assert.match(style.textContent, /--x1080x-hdblog-original-article-width:\s*760px/);
  assert.match(style.textContent, /\.site-header \.wrap/);
  assert.match(style.textContent, /\.nav-primary \.wrap/);
  assert.match(style.textContent, /article\.entry,[\s\S]*?width:\s*min\(100%, var\(--x1080x-hdblog-original-article-width\)\) !important/);
  assert.match(style.textContent, /max-width:\s*var\(--x1080x-hdblog-original-article-width\) !important/);
  assert.match(style.textContent, /display:\s*grid !important/);
  assert.match(style.textContent, /grid-column:\s*1 !important/);
  assert.match(style.textContent, /grid-column:\s*2 !important/);
  assert.match(style.textContent, /content-sidebar-wrap::before/);
  assert.match(style.textContent, /content:\s*none !important/);

  article.getBoundingClientRect = () => ({ width: 1500 });
  applyHdblogArticleLayout(dom.window.document, 1500);
  assert.match(style.textContent, /--x1080x-hdblog-article-width:\s*1500px/);
  assert.match(style.textContent, /--x1080x-hdblog-original-article-width:\s*760px/);

  assert.equal(clearHdblogArticleLayout(dom.window.document), true);
  assert.equal(dom.window.document.body.dataset.x1080xHdblogOriginalArticleWidth, undefined);
  assert.equal(dom.window.document.body.classList.contains('x1080x-hdblog-single'), false);
  assert.equal(dom.window.document.querySelector('#x1080x-ex-hdblog-article-layout'), null);
});


test('article download button uses an icon-only idle label', () => {
  const dom = articleDom({ content: '<p>Preview:</p>' });
  installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {});
  const button = dom.window.document.querySelector('#x1080x-ex-hdblog-image-download');
  assert.ok(button);
  assert.equal(button.textContent, '⬇');
  assert.equal(button.getAttribute('aria-label'), '下载 Pixhost Preview 大图');
});
