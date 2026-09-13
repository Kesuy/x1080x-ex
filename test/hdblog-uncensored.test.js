import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  extractHdblogArticleCode,
  extractHdblogVideoCode,
  hdblogImageFilename,
} from '../src/hdblog-article.js';

function articleDom({ url, title }) {
  return new JSDOM(`<!doctype html>
<html>
<head><title>${title}</title></head>
<body class="single single-post content-sidebar">
  <main id="genesis-content" class="content">
    <article class="entry post">
      <header class="entry-header"><h1 class="entry-title">${title}</h1></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article>
  </main>
</body>
</html>`, { url });
}

test('preserves hdblog uncensored studio and date-style code from titles', () => {
  assert.equal(
    extractHdblogVideoCode('1pondo 112625_001 男をメロメロにしちゃう甘い授乳プレイ'),
    '1pondo 112625_001'
  );
  assert.equal(
    extractHdblogVideoCode('Caribbeancom 112525-001 しまくり先生 私みたいにやるの！！'),
    'Caribbeancom 112525-001'
  );
});

test('extracts the requested uncensored names from real hdblog-style article titles', () => {
  const onePondo = articleDom({
    url: 'https://hdblog.me/853201/112625_001/',
    title: '1pondo 112625_001 男をメロメロにしちゃう甘い授乳プレイ',
  });
  assert.equal(extractHdblogArticleCode(onePondo.window.document), '1pondo 112625_001');

  const caribbean = articleDom({
    url: 'https://hdblog.me/853199/112525-001/',
    title: 'Caribbeancom 112525-001 しまくり先生 私みたいにやるの！！ ~イキ狂い絶頂トランス先生 2限目~',
  });
  assert.equal(extractHdblogArticleCode(caribbean.window.document), 'Caribbeancom 112525-001');
});

test('uses the preserved uncensored name for Preview download filenames', () => {
  assert.equal(hdblogImageFilename('1pondo 112625_001', 0, 1, 'jpg'), '1pondo 112625_001.jpg');
  assert.equal(hdblogImageFilename('Caribbeancom 112525-001', 0, 1, 'webp'), 'Caribbeancom 112525-001.webp');
  assert.equal(hdblogImageFilename('1pondo 112625_001', 1, 3, 'png'), '1pondo 112625_001-2.png');
});
