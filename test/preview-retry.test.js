import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  fetchHdblogPreviewForCode,
  getHdblogPreviewLoadingSettings,
  renderAgaghhhHdblogPreview,
  HDBLOG_PREVIEW_TIMEOUT_KEY,
  HDBLOG_PREVIEW_RETRIES_KEY,
} from '../src/agaghhh-hdblog-preview.js';

const SEARCH = 'https://hdblog.me/?s=RTRY-001';
const ARTICLE = 'https://hdblog.me/1234/rtry-001/';
const IMAGE = 'https://img.example.com/rtry-001-preview.jpg';
const resultPage = `<main id="genesis-content"><article class="entry">
  <h2 class="entry-title"><a href="${ARTICLE}">RTRY-001 Sample</a></h2>
</article></main>`;
const validArticle = `<main id="genesis-content"><article class="entry"><div class="entry-content">
  <p>Preview:</p><p><a href="${IMAGE}"><img src="${IMAGE}"></a></p><p>BTFile:</p>
</div></article></main>`;

function lookup(responses, options = {}) {
  const doc = new JSDOM('<!doctype html><body></body>', { url: 'https://1080xin.com/' });
  const requests = [];
  let articleCall = 0;
  const gmRequest = (request) => {
    requests.push({ url: request.url, timeout: request.timeout });
    if (request.url === SEARCH) {
      request.onload({ status: 200, finalUrl: SEARCH, responseText: responses.search ?? resultPage });
    } else if (request.url === ARTICLE) {
      const response = responses.articles?.[articleCall++];
      if (response === 'error') request.onerror();
      else if (response === 'timeout') request.ontimeout();
      else request.onload({ status: 200, finalUrl: ARTICLE, responseText: response ?? validArticle });
    } else throw new Error(`unexpected request: ${request.url}`);
  };
  return { doc, gmRequest, requests, async run(retryCount = 2) {
    const result = await fetchHdblogPreviewForCode('RTRY-001', gmRequest, doc.window.document, false, {
      timeoutMs: 4000, retryCount, wait: async () => {},
      ...options,
    });
    doc.window.close();
    return result;
  } };
}

test('when matching HDblog article times out, retry article only and keep source priority', async () => {
  const ctx = lookup({ articles: ['timeout', validArticle] });
  const result = await ctx.run();
  assert.deepEqual(result.imageUrls, [IMAGE]);
  assert.deepEqual(ctx.requests.map((request) => request.url), [SEARCH, ARTICLE, ARTICLE]);
  assert.ok(ctx.requests.every((request) => request.timeout === 4000));
});

test('when HDblog Preview marker exists but images were missing on first load, retry', async () => {
  const ctx = lookup({
    articles: ['<article class="entry"><div class="entry-content"><p>Preview:</p><p>BTFile:</p></div></article>', validArticle],
  });
  const result = await ctx.run();
  assert.deepEqual(result.imageUrls, [IMAGE]);
  assert.deepEqual(ctx.requests.map((request) => request.url), [SEARCH, ARTICLE, ARTICLE]);
});

test('no matching HDblog result skips all retries and falls through immediately', async () => {
  const ctx = lookup({ search: '<main id="genesis-content"></main>' });
  const result = await ctx.run(5);
  assert.equal(result.articleUrl, '');
  assert.deepEqual(result.imageUrls, []);
  assert.deepEqual(ctx.requests.map((request) => request.url), [SEARCH]);
});

test('matching HDblog article without Preview section never retries', async () => {
  const ctx = lookup({ articles: ['<article><div class="entry-content"><p>BTFile:</p></div></article>'] });
  const result = await ctx.run(5);
  assert.equal(result.articleUrl, ARTICLE);
  assert.deepEqual(result.imageUrls, []);
  assert.deepEqual(ctx.requests.map((request) => request.url), [SEARCH, ARTICLE]);
});

test('retry limit zero disables retries even with confirmed matching article', async () => {
  const ctx = lookup({ articles: ['timeout', validArticle] });
  const result = await ctx.run(0);
  assert.deepEqual(result.imageUrls, []);
  assert.deepEqual(ctx.requests.map((request) => request.url), [SEARCH, ARTICLE]);
});

test('Preview timeout/retry settings validate user values and preserve defaults', () => {
  const prior = globalThis.GM_getValue;
  const store = new Map([[HDBLOG_PREVIEW_TIMEOUT_KEY, 12000], [HDBLOG_PREVIEW_RETRIES_KEY, 4]]);
  try {
    globalThis.GM_getValue = (key, fallback) => store.get(key) ?? fallback;
    assert.deepEqual(getHdblogPreviewLoadingSettings(), { timeoutMs: 12000, retryCount: 4 });
    store.set(HDBLOG_PREVIEW_TIMEOUT_KEY, 1);
    store.set(HDBLOG_PREVIEW_RETRIES_KEY, 22);
    assert.deepEqual(getHdblogPreviewLoadingSettings(), { timeoutMs: 30000, retryCount: 2 });
  } finally {
    if (prior === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = prior;
  }
});

test('modern resource Preview is inserted into first post body, not the surrounding page', () => {
  const dom = new JSDOM(`<h1>RTRY-001 Sample</h1><article id="first-post">
    <div class="post-content"><p>Original post</p></div></article>`, { url: 'https://1080xin.com/resources/ab1234' });
  const section = renderAgaghhhHdblogPreview(dom.window.document, {
    code: 'RTRY-001', articleUrl: ARTICLE, imageUrls: [IMAGE],
  });
  assert.ok(section);
  assert.equal(section.parentElement?.className, 'post-content');
  dom.window.close();
});
