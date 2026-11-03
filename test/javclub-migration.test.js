import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  isHdblogArticleUrl, isHdblogSearchUrl, collectHdblogSearchResults
} from '../src/hdblog-search.js';
import {
  isHdblogArticlePage, extractHdblogArticleCode,
  collectHdblogPixhostPreviewImages, installHdblogArticleEnhancement,
  openHdblogSettingsPanel
} from '../src/hdblog-article.js';
import { isDeletedHdblogArticlePage } from '../src/javfree.js';
import { isPixhostShowUrl } from '../src/pixhost.js';
import { buildHdblogSearchUrlForThreadCode } from '../src/agaghhh-enhancement.js';
import { buildFc2cmadbHdblogSearchUrl } from '../src/fc2cmadb.js';

function javclubArticle(url, title) {
  return new JSDOM(`<!doctype html><html lang="en"><head><title>${title}</title></head>
  <body class="single single-post content-sidebar">
    <div class="site-inner"><div class="content-sidebar-wrap">
      <main class="content" id="genesis-content">
        <article class="post type-post entry"><header class="entry-header">
          <h1 class="entry-title">${title}</h1>
          <p class="entry-meta"><time>November 3, 2026</time> by admin
            <span class="entry-comments-link">Leave a Comment</span></p>
        </header><div class="entry-content">
          <p><img src="https://imgsky.me/images/2026/11/03/start.jpg"></p>
          <p>品番：1start662</p>
          <p><span id="more-1013749"></span>Btafile:<br>
            <a href="https://btafile.com/example">START-662_6M.mp4</a></p>
          <p>Preview:<br><a href="https://pixhost.cc/show/6893/797893294_start-662_6m-mp4.jpg">
            <img src="https://t3.pixhost.cc/thumbs/6893/797893294_start-662_6m-mp4.jpg">
          </a></p>
        </div></article>
      </main><aside class="sidebar sidebar-primary"></aside>
    </div></div>
  </body></html>`, { url });
}

test('JavClub 文章 .html、新域名搜索和旧 HDblog 链接均识别，其他站点不误识别', () => {
  assert.equal(isHdblogArticleUrl('https://javclub.me/1013749.html'), true);
  assert.equal(isHdblogArticleUrl('https://www.javclub.me/1013622.html'), true);
  assert.equal(isHdblogArticleUrl('https://hdblog.me/1013622/fc2ppv-4999948-2/'), true);
  assert.equal(isHdblogArticleUrl('https://javclub.me/category/jav-censored/'), false);
  assert.equal(isHdblogSearchUrl('https://javclub.me/?s=START-662'), true);
  assert.equal(isHdblogSearchUrl('https://javclub.me/1013749.html'), false);
  assert.equal(isHdblogArticleUrl('https://unrelated.me/1013749.html'), false);
});

test('JavClub 新文章 DOM：识别番号、Preview、下载/复制/搜索按钮，并保留原配置键', () => {
  const dom = javclubArticle('https://javclub.me/1013749.html', 'START-662 全裸スクイーズ');
  try {
    const doc = dom.window.document;
    assert.equal(isHdblogArticlePage(doc, dom.window.location), true);
    assert.equal(extractHdblogArticleCode(doc), 'START-662');
    assert.equal(isDeletedHdblogArticlePage(doc, dom.window.location), false);
    assert.equal(isPixhostShowUrl('https://pixhost.cc/show/6893/797893294_start-662_6m-mp4.jpg'), true);
    assert.equal(collectHdblogPixhostPreviewImages(doc).length, 1);
    installHdblogArticleEnhancement(doc, dom.window.location);
    const actionIds = [...doc.querySelectorAll('#x1080x-ex-hdblog-actions button')].map((button) => button.id);
    assert.deepEqual(actionIds, [
      'x1080x-ex-hdblog-image-download',
      'x1080x-ex-hdblog-copy-code',
      'x1080x-ex-hdblog-agaghhh-search'
    ]);
    assert.equal(doc.querySelectorAll('#x1080x-ex-hdblog-actions').length, 1);
    const overlay = openHdblogSettingsPanel(doc);
    assert.match(overlay.textContent, /JavClub 设置/);
  } finally {
    dom.window.close();
  }
});

test('新站按数字 ID 的详情仍正确识别 FC2 番号和 404 页面', () => {
  const dom = javclubArticle('https://javclub.me/1013622.html', 'FC2-PPV 4999948 Sample');
  try {
    assert.equal(extractHdblogArticleCode(dom.window.document), 'FC2-PPV-4999948');
    dom.window.document.body.className = 'error404';
    dom.window.document.title = '404 page not found';
    assert.equal(isDeletedHdblogArticlePage(dom.window.document, dom.window.location), true);
  } finally {
    dom.window.close();
  }
});

test('JavClub Genesis 搜索列表仍提取正常文章，排除跨域站点', () => {
  const dom = new JSDOM(`<main id="genesis-content">
    <article class="entry"><header class="entry-header"><h2 class="entry-title">
      <a href="/1013749.html">START-662 title</a></h2></header></article>
    <article class="entry"><header class="entry-header"><h2 class="entry-title">
      <a href="https://other.example/123.html">outside</a></h2></header></article>
  </main>`, { url: 'https://javclub.me/?s=START-662' });
  try {
    const rows = collectHdblogSearchResults(dom.window.document);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'https://javclub.me/1013749.html');
  } finally {
    dom.window.close();
  }
});

test('x1080x 与 FC2CMADB 的站外搜索统一指向 JavClub', () => {
  assert.equal(buildHdblogSearchUrlForThreadCode('FC2-PPV-4999948'), 'https://javclub.me/?s=4999948');
  assert.equal(buildHdblogSearchUrlForThreadCode('START-662'), 'https://javclub.me/?s=START-662');
  assert.equal(buildFc2cmadbHdblogSearchUrl('4999948'), 'https://javclub.me/?s=4999948');
});
