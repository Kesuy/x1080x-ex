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
  inferModernBoardNextUrl,
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


const reportedBoard = 'https://1080xin.com/boards/7RHPO2w4jFUYiDhDsxz0wE';

function unlinkedBoardPage(ids) {
  return '<!doctype html><html><head></head><body><div class="thread-list">'
    + ids.map((id) => '<article class="thread-row"><a class="resource-title" href="/resources/'
      + id + '">主题 ' + id + '</a></article>').join('')
    + '</div></body></html>';
}

test('reported x1080x board infers ?page=2 without a recognized next button', async () => {
  const page2 = reportedBoard + '?page=2';
  const first = new JSDOM(unlinkedBoardPage(['FRESH1', 'FRESH2']), { url: reportedBoard });
  const fetched = [];
  try {
    assert.equal(nextBatchListPageUrl(first.window.document), '');
    assert.equal(inferModernBoardNextUrl(first.window.document, reportedBoard), page2);
    const result = await scanBatchProgressPages({
      startUrl: reportedBoard,
      currentUrl: reportedBoard,
      currentDocument: first.window.document,
      historyIds: ['resource:VISITED2'],
      loadPage: async (url) => {
        fetched.push(url);
        assert.equal(url, page2);
        return unlinkedBoardPage(['VISITED2', 'UNREAD2']);
      },
      collectThreads: collectForumThreadLinks,
      getId: (url) => 'resource:' + new URL(url).pathname.split('/').at(-1),
      getScope: (url) => new URL(url).pathname,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, page2);
    assert.deepEqual(fetched, [page2]);
  } finally {
    first.window.close();
  }
});

test('reported x1080x ?page=2 continues to ?page=3 while preserving category filters', () => {
  const page2 = reportedBoard + '?category_id=FC2&page=2';
  const dom = new JSDOM(unlinkedBoardPage(['P2']), { url: page2 });
  try {
    assert.equal(inferModernBoardNextUrl(dom.window.document, page2),
      reportedBoard + '?category_id=FC2&page=3');
    assert.equal(firstBatchListPageUrl(page2, 'agaghhh'),
      reportedBoard + '?category_id=FC2');
  } finally {
    dom.window.close();
  }
});

test('modern board explicit disabled next button prevents speculative further pages', () => {
  const dom = new JSDOM('<div class="pg"><button aria-label="下一页" disabled>下一页</button></div>'
    + unlinkedBoardPage(['READ']), { url: reportedBoard });
  try {
    assert.equal(inferModernBoardNextUrl(dom.window.document, reportedBoard), '');
    dom.window.document.querySelector('button').disabled = false;
    assert.equal(inferModernBoardNextUrl(dom.window.document, reportedBoard),
      reportedBoard + '?page=2');
  } finally {
    dom.window.close();
  }
});

test('modern board speculative page 404 stops normally and cannot loop forever', async () => {
  const dom = new JSDOM(unlinkedBoardPage(['X1', 'X2']), { url: reportedBoard });
  let calls = 0;
  try {
    const result = await scanBatchProgressPages({
      startUrl: reportedBoard,
      currentUrl: reportedBoard,
      currentDocument: dom.window.document,
      historyIds: ['resource:OLDER'],
      loadPage: async () => { calls += 1; throw new Error('HTTP 404'); },
      collectThreads: collectForumThreadLinks,
      getId: (url) => 'resource:' + new URL(url).pathname.split('/').at(-1),
      getScope: (url) => new URL(url).pathname,
    });
    assert.equal(result.status, 'end');
    assert.equal(result.checked, 1);
    assert.equal(calls, 1);
  } finally {
    dom.window.close();
  }
});

test('modern board speculative page repeating previous topics ends without false progress', async () => {
  const html = unlinkedBoardPage(['AAA', 'BBB']);
  const dom = new JSDOM(html, { url: reportedBoard });
  try {
    const result = await scanBatchProgressPages({
      startUrl: reportedBoard,
      currentUrl: reportedBoard,
      currentDocument: dom.window.document,
      historyIds: ['resource:NEVER'],
      loadPage: async () => html,
      collectThreads: collectForumThreadLinks,
      getId: (url) => 'resource:' + new URL(url).pathname.split('/').at(-1),
      getScope: (url) => new URL(url).pathname,
    });
    assert.equal(result.status, 'end');
    assert.equal(result.repeatedPage, true);
    assert.equal(result.checked, 1);
  } finally {
    dom.window.close();
  }
});

test('modern board inference rejects unrelated routes and empty or invalid pagination data', () => {
  const doc = new JSDOM(unlinkedBoardPage(['ID']), { url: reportedBoard });
  const empty = new JSDOM('<article class="thread-row"></article>', { url: reportedBoard });
  try {
    assert.equal(inferModernBoardNextUrl(doc.window.document, reportedBoard + '?page=0'), '');
    assert.equal(inferModernBoardNextUrl(doc.window.document, reportedBoard + '?page=abc'), '');
    assert.equal(inferModernBoardNextUrl(doc.window.document, 'https://1080xin.com/resources/id?page=1'), '');
    assert.equal(inferModernBoardNextUrl(empty.window.document, reportedBoard), '');
  } finally {
    doc.window.close();
    empty.window.close();
  }
});
