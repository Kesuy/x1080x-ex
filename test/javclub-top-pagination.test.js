import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  JAVCLUB_TOP_PAGINATION_ENABLED_KEY,
  JAVCLUB_TOP_PAGINATION_ID,
  installJavclubTopPagination,
  isJavclubTopPaginationEnabled,
} from '../src/javclub-top-pagination.js';

function listing(url = 'https://javclub.me/category/av-censored/page/7') {
  return new JSDOM(`<!doctype html><html><body class="archive paged category">
  <main id="genesis-content" class="content">
    <div class="archive-description"><h1 class="archive-title">AV Censored</h1></div>
    <article class="entry" id="article-1"><h2>RKI-773</h2></article>
    <article class="entry" id="article-2"><h2>JUR-950</h2></article>
    <div class="archive-pagination pagination" role="navigation" aria-label="Pagination">
      <ul>
        <li class="pagination-previous"><a href="/category/av-censored/page/6">« Previous Page</a></li>
        <li><a href="/category/av-censored">1</a></li>
        <li class="active"><a aria-current="page" href="/category/av-censored/page/7">7</a></li>
        <li class="pagination-next"><a href="/category/av-censored/page/8">Next Page »</a></li>
      </ul>
    </div>
  </main></body></html>`, { url });
}

test('JavClub copies original bottom pagination immediately after the archive heading', () => {
  const dom = listing();
  const doc = dom.window.document;
  const bottom = doc.querySelector('main > .archive-pagination');
  assert.equal(isJavclubTopPaginationEnabled(), true);
  assert.equal(installJavclubTopPagination(doc, dom.window.location), true);
  const top = doc.getElementById(JAVCLUB_TOP_PAGINATION_ID);
  assert.ok(top);
  assert.equal(doc.querySelector('.archive-description').nextElementSibling, top);
  assert.equal(top.nextElementSibling.id, 'article-1');
  assert.equal(top.classList.contains('archive-pagination'), true);
  assert.equal(top.querySelector('a[aria-current="page"]').getAttribute('href'),
    '/category/av-censored/page/7');
  assert.deepEqual(
    [...top.querySelectorAll('a')].map(a => a.getAttribute('href')),
    [...bottom.querySelectorAll('a')].map(a => a.getAttribute('href'))
  );
  assert.equal(bottom, doc.querySelector('main > .archive-pagination:last-child'),
    'original pagination must remain at the bottom');
  assert.equal(installJavclubTopPagination(doc, dom.window.location), false);
  assert.equal(doc.querySelectorAll('#' + JAVCLUB_TOP_PAGINATION_ID).length, 1);
  dom.window.close();
});

test('pagination switch is independent and disabling it does not remove the native pagination', () => {
  const dom = listing();
  const doc = dom.window.document;
  const oldGet = globalThis.GM_getValue;
  let enabled = true;
  globalThis.GM_getValue = (key, fallback) => (
    key === JAVCLUB_TOP_PAGINATION_ENABLED_KEY ? enabled : fallback
  );
  try {
    assert.equal(installJavclubTopPagination(doc, dom.window.location), true);
    enabled = false;
    assert.equal(isJavclubTopPaginationEnabled(), false);
    assert.equal(installJavclubTopPagination(doc, dom.window.location), false);
    assert.equal(doc.getElementById(JAVCLUB_TOP_PAGINATION_ID), null);
    assert.equal(doc.querySelectorAll('main > .archive-pagination').length, 1);
    enabled = true;
    assert.equal(installJavclubTopPagination(doc, dom.window.location), true);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    dom.window.close();
  }
});

test('other sites, individual posts and lists without bottom pagination are unchanged', () => {
  const alien = listing('https://example.org/category/av-censored/page/7');
  assert.equal(installJavclubTopPagination(alien.window.document, alien.window.location), false);
  assert.equal(alien.window.document.getElementById(JAVCLUB_TOP_PAGINATION_ID), null);
  alien.window.close();

  const detail = new JSDOM('<body class="single-post"><main id="genesis-content">' +
    '<article class="entry"><h1>Article</h1></article></main></body>',
  { url: 'https://javclub.me/1013622.html' });
  assert.equal(installJavclubTopPagination(detail.window.document, detail.window.location), false);
  detail.window.close();

  const singlePage = listing('https://javclub.me/tag/sample');
  singlePage.window.document.querySelector('.archive-pagination').remove();
  assert.equal(installJavclubTopPagination(singlePage.window.document, singlePage.window.location), false);
  singlePage.window.close();
});

test('JavClub homepage and legacy domain use the same native pagination', () => {
  for (const url of ['https://javclub.me/', 'https://hdblog.me/category/av-censored/page/7']) {
    const dom = listing(url);
    assert.equal(installJavclubTopPagination(dom.window.document, dom.window.location), true);
    dom.window.close();
  }
});
