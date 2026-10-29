import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  collectForumThreadLinks,
  getThreadHeadingText,
  extractThreadResources,
  buildDownloadJobs,
} from '../src/core.js';
import {
  firstBatchListPageUrl,
  nextBatchListPageUrl,
  scanBatchProgressPages,
} from '../src/batch-progress-locator.js';

const boardUrl = 'https://1080xin.com/boards/6Rj9of8m6shoqhAaXiXJje';
const resourceUrl = 'https://1080xin.com/resources/5Sf2HTs5zogM0TuHJz1LD5?page=1&order=asc';
const boardMarkup = `
  <div class="pgt"><div class="pg">
    <button aria-label="上一页" disabled></button>
    <strong>1</strong><button class="pg-n">2</button>
    <button aria-label="下一页"></button>
  </div></div>
  <article class="thread-row is-sticky">
    <a class="resource-title" href="/resources/Pinned123">置顶</a>
  </article>
  <article class="thread-row">
    <a class="resource-title" href="/resources/5Sf2HTs5zogM0TuHJz1LD5?return=%2Fboards%2F6Rj9of8m6shoqhAaXiXJje">FC2</a>
  </article>
  <article class="thread-row">
    <a class="resource-title" href="/resources/04KTRwQA2TTlDe3JY9qGYx">FC2 第二条</a>
  </article>
  <article class="thread-row">
    <a class="resource-title" href="https://evil.example/resources/a23">不可信外站</a>
  </article>`;

test('new /boards layout collects regular topics and ignores sticky/external links', () => {
  const dom = new JSDOM(boardMarkup, { url: boardUrl });
  const threads = collectForumThreadLinks(dom.window.document);
  assert.equal(threads.length, 2);
  assert.deepEqual(threads.map((thread) => thread.kind), ['modern', 'modern']);
  assert.match(threads[0].url, /5Sf2HTs5zogM0TuHJz1LD5/);
  assert.equal(threads[1].url, 'https://1080xin.com/resources/04KTRwQA2TTlDe3JY9qGYx');
});

test('button-based pagination preserves board route and filters', () => {
  const dom = new JSDOM(boardMarkup, { url: boardUrl + '?category_id=123&page=1' });
  const next = nextBatchListPageUrl(dom.window.document);
  const url = new URL(next);
  assert.equal(url.pathname, '/boards/6Rj9of8m6shoqhAaXiXJje');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('category_id'), '123');
  assert.equal(firstBatchListPageUrl(next, 'agaghhh'), boardUrl + '?category_id=123');
  dom.window.document.querySelector('[aria-label="下一页"]').disabled = true;
  assert.equal(nextBatchListPageUrl(dom.window.document), '');
});

test('new /resources layout parses category-free FC2 number and images, without bypassing native attachment', () => {
  const dom = new JSDOM(`
    <header class="thread-header"><h1>
      <span class="topic-tags"><a class="topic-category">其他</a></span>
      (HD720P)(情熱ハメしろ倶楽部)(fc4939392)ピンクのメイド
    </h1></header>
    <article id="first-post" class="post"><div class="post-content">
      <div class="post-text"><div class="protected-text discuz-body">
        <span class="body-image-frame"><img class="body-image" src="https://www.hxmmdd.com/fc4939392_1.mp4.jpg.webp"></span>
        <span class="body-image-frame"><img class="body-image" src="https://www.hxmmdd.com/fc4939392_2.mp4.jpg.webp"></span>
      </div><section class="attachments-section">
        <article class="attachment" data-slot-id="6r2BTZYW5AEsIhfSDNt4mr">
          <span class="file-name">fc4939392.zip</span>
          <div class="file-get"><button class="button secondary tool">按次數下載</button></div>
        </article>
      </section></div>
    </div></article>`, { url: resourceUrl });
  const doc = dom.window.document;
  assert.match(getThreadHeadingText(doc), /^\s*\(HD720P\)/);
  const resources = extractThreadResources(doc);
  assert.equal(resources.title.code, 'FC2-4939392');
  assert.equal(resources.images.length, 2);
  assert.equal(resources.attachments.length, 0, 'native paid download is not a direct attachment URL');
  const jobs = buildDownloadJobs(doc);
  assert.deepEqual(jobs.map((job) => job.name), ['FC2-4939392 A.webp', 'FC2-4939392 B.webp']);
  assert.deepEqual(jobs.map((job) => job.kind), ['image', 'image']);
});

test('modern progress locator scans button pages and returns mixed read/unread boundary', async () => {
  const first = new JSDOM('<!doctype html><head></head><body>' + boardMarkup + '</body>', { url: boardUrl });
  const pages = [];
  const result = await scanBatchProgressPages({
    startUrl: boardUrl,
    currentUrl: boardUrl,
    currentDocument: first.window.document,
    historyIds: ['resource:5Sf2HTs5zogM0TuHJz1LD5', 'resource:04KTRwQA2TTlDe3JY9qGYx', 'resource:ReadPage2'],
    loadPage: async (url) => {
      pages.push(url);
      return `<!doctype html><head></head><body><div class="pgt"><div class="pg">
        <strong>2</strong><button aria-label="下一页" disabled></button></div></div>
        <article class="thread-row"><a class="resource-title" href="/resources/ReadPage2">已打开</a></article>
        <article class="thread-row"><a class="resource-title" href="/resources/NewPage2">未打开</a></article>
      </body>`;
    },
    collectThreads: collectForumThreadLinks,
    getId: (url) => 'resource:' + new URL(url).pathname.split('/').at(-1),
    getScope: (url) => new URL(url).pathname,
    maxPages: 3,
  });
  assert.deepEqual(pages, [boardUrl + '?page=2']);
  assert.equal(result.status, 'found');
  assert.equal(result.url, boardUrl + '?page=2');
});
