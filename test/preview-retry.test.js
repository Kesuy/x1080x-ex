import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs } from '../src/core.js';
import {
  fetchHdblogPreviewForCode,
  getHdblogPreviewLoadingSettings,
  renderAgaghhhHdblogPreview,
  HDBLOG_PREVIEW_TIMEOUT_KEY,
  HDBLOG_PREVIEW_RETRIES_KEY,
} from '../src/agaghhh-hdblog-preview.js';
import { openX1080xSettingsPanel } from '../src/agaghhh-enhancement.js';

const SEARCH = 'https://javclub.me/?s=RTRY-001';
const ARTICLE = 'https://javclub.me/1234.html';
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

test('x1080x settings display editable Preview timeout/retry controls', () => {
  const doc = new JSDOM('<!doctype html><body></body>', { url: 'https://1080xin.com/' });
  const previous = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => (
    key === HDBLOG_PREVIEW_TIMEOUT_KEY ? 15000
      : key === HDBLOG_PREVIEW_RETRIES_KEY ? 3
      : fallback
  );
  try {
    const overlay = openX1080xSettingsPanel(doc.window.document);
    const timeout = overlay.querySelector('[data-setting="hdblog-preview-timeout"]');
    const retries = overlay.querySelector('[data-setting="hdblog-preview-retries"]');
    assert.ok(timeout && retries);
    assert.equal(timeout.value, '15');
    assert.equal(retries.value, '3');
    overlay.querySelector('[data-action="reset-hdblog-preview-settings"]').click();
    assert.equal(timeout.value, '30');
    assert.equal(retries.value, '2');
    const enable = overlay.querySelector('[data-setting="hdblog-preview"]');
    enable.checked = false;
    enable.dispatchEvent(new doc.window.Event('change'));
    assert.equal(timeout.disabled, true);
    assert.equal(retries.disabled, true);
  } finally {
    if (previous === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = previous;
    doc.window.close();
  }
});

test('regression: a visible HDblog Preview alongside modern .post-text must be counted as a download', () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <header class="thread-header"><h1>FNS-267 [BT] Sample</h1></header>
    <article id="first-post"><div class="post-content">
      <div class="post-text"><div class="protected-text">
        <img class="body-image" src="https://images.example.com/fns-267-cover.webp">
      </div></div>
    </div></article>
  </body></html>`, { url: 'https://1080xin.com/resources/modern-fns-267' });
  const doc = dom.window.document;
  const section = renderAgaghhhHdblogPreview(doc, {
    code: 'FNS-267', articleUrl: ARTICLE, imageUrls: [IMAGE],
  });
  assert.ok(section);
  assert.equal(section.parentElement?.className, 'post-content');
  assert.equal(doc.querySelector('.post-text #x1080x-ex-agaghhh-hdblog-preview'), null,
    'the injected Preview lives next to .post-text in the new layout');
  const jobs = buildDownloadJobs(doc).filter((job) => job.kind === 'image');
  assert.deepEqual(jobs.map((job) => [job.url, job.name]), [
    ['https://images.example.com/fns-267-cover.webp', 'FNS-267 A.webp'],
    [IMAGE, 'FNS-267 B.jpg'],
  ]);
  dom.window.close();
});

test('modern non-BT download collects its cover and an injected Preview', () => {
  const dom = new JSDOM(`<header class="thread-header"><h1>RTRY-001 Example</h1></header>
    <article id="first-post"><div class="post-content">
      <div class="post-text"><img class="body-image" src="https://images.example.com/cover.webp"></div>
    </div></article>`, { url: 'https://1080xin.com/resources/nonbt-rtry' });
  renderAgaghhhHdblogPreview(dom.window.document, {
    code: 'RTRY-001', articleUrl: ARTICLE, imageUrls: [IMAGE],
  });
  const jobs = buildDownloadJobs(dom.window.document).filter((job) => job.kind === 'image');
  assert.deepEqual(jobs.map((job) => [job.url, job.name]), [
    ['https://images.example.com/cover.webp', 'RTRY-001 A.webp'],
    [IMAGE, 'RTRY-001 B.jpg'],
  ]);
  dom.window.close();
});
