import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectForumThreadLinks } from '../src/core.js';
import {
  firstBatchListPageUrl,
  nextBatchListPageUrl,
  scanBatchProgressPages,
} from '../src/batch-progress-locator.js';

function agaghhhPage(tids, nextPage = 0) {
  return `<!doctype html><html><head></head><body>
  <div id="threadlist"><table>
    ${tids.map((tid) => `<tbody id="normalthread_${tid}"><tr><th>
      <a class="xst" href="forum.php?mod=viewthread&tid=${tid}">主题 ${tid}</a>
    </th></tr></tbody>`).join('')}
  </table></div>
  ${nextPage ? `<div class="pg"><a class="nxt" href="forum.php?mod=forumdisplay&fid=75&page=${nextPage}">下一页</a></div>` : ''}
  </body></html>`;
}

function hdblogPage(posts, next = '') {
  return `<!doctype html><html><head></head><body>
  <main id="genesis-content">
    ${posts.map((id) => `<article class="entry"><header class="entry-header">
      <h2 class="entry-title"><a href="/${id}/topic-${id}/">主题 ${id}</a></h2>
    </header></article>`).join('')}
    ${next ? `<div class="archive-pagination"><div class="pagination-next"><a href="${next}">Older Posts</a></div></div>` : ''}
  </main></body></html>`;
}

function agaghhhId(url) {
  return `tid:${new URL(url).searchParams.get('tid')}`;
}

function hdblogId(url) {
  return `post:${new URL(url).pathname.match(/^\/(\d+)/)?.[1] || ''}`;
}

function forumScope(url) {
  return `https://agaghhh.cc/forum:75`;
}

function hdblogScope(url) {
  return new URL(url).pathname.replace(/\/page\/\d+\/?$/, '/');
}

test('agaghhh 从第一页跨页扫描到第三页混合记录，不依赖最后打开的主题', async () => {
  const page1 = 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75';
  const page2 = `${page1}&page=2`;
  const page3 = `${page1}&page=3`;
  const pages = new Map([
    [page1, agaghhhPage([601, 600], 2)],
    [page2, agaghhhPage([599, 598], 3)],
    [page3, agaghhhPage([597, 596, 595])],
  ]);
  const dom = new JSDOM(pages.get(page1), { url: page1 });
  const fetched = [];
  const progress = [];
  try {
    const result = await scanBatchProgressPages({
      startUrl: page1,
      currentUrl: page1,
      currentDocument: dom.window.document,
      historyIds: ['tid:595', 'tid:597', 'tid:400'],
      loadPage: async (url) => {
        fetched.push(url);
        return pages.get(url);
      },
      collectThreads: collectForumThreadLinks,
      getId: agaghhhId,
      getScope: forumScope,
      onProgress: (item) => progress.push(item),
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, page3);
    assert.equal(result.checked, 3);
    assert.deepEqual(fetched, [page2, page3]);
    assert.deepEqual(progress.map((p) => p.opened), [0, 0, 2]);
  } finally {
    dom.window.close();
  }
});

test('零星打开的较新主题不会盖过后面真正的分界页', async () => {
  const page1 = 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75';
  const urls = [page1, `${page1}&page=2`, `${page1}&page=3`, `${page1}&page=4`];
  const pages = new Map([
    [urls[0], agaghhhPage([900, 899, 898, 897, 896], 2)],
    [urls[1], agaghhhPage([895, 894, 893, 892, 891], 3)],
    [urls[2], agaghhhPage([890, 889, 888, 887, 886], 4)],
    [urls[3], agaghhhPage([885, 884, 883, 882, 881])],
  ]);
  const dom = new JSDOM(pages.get(page1), { url: page1 });
  try {
    const result = await scanBatchProgressPages({
      startUrl: page1,
      currentUrl: page1,
      currentDocument: dom.window.document,
      historyIds: ['tid:900', 'tid:890', 'tid:889', 'tid:888', 'tid:887', 'tid:886', 'tid:885', 'tid:884'],
      loadPage: async (url) => pages.get(url),
      collectThreads: collectForumThreadLinks,
      getId: agaghhhId,
      getScope: forumScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, urls[2]);
    assert.equal(result.checked, 3);
  } finally {
    dom.window.close();
  }
});

test('hdblog 整页已打开到下一页未打开的边界定位下一页', async () => {
  const page1 = 'https://hdblog.me/tag/example/';
  const page2 = 'https://hdblog.me/tag/example/page/2/';
  const pages = new Map([
    [page1, hdblogPage([985, 984], page2)],
    [page2, hdblogPage([983, 982])],
  ]);
  const dom = new JSDOM(pages.get(page1), { url: page1 });
  try {
    const result = await scanBatchProgressPages({
      startUrl: page1,
      currentUrl: page1,
      currentDocument: dom.window.document,
      historyIds: ['post:985', 'post:984'],
      loadPage: async (url) => pages.get(url),
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, page2);
    assert.equal(result.checked, 2);
  } finally {
    dom.window.close();
  }
});

test('由新版历史记录决定边界，历史为空时不扫描', async () => {
  const dom = new JSDOM(agaghhhPage([100], 2), {
    url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75',
  });
  try {
    const result = await scanBatchProgressPages({
      startUrl: dom.window.location.href,
      currentUrl: dom.window.location.href,
      currentDocument: dom.window.document,
      historyIds: [],
      loadPage: async () => { throw Error('must not fetch'); },
      collectThreads: collectForumThreadLinks,
      getId: agaghhhId,
      getScope: forumScope,
    });
    assert.equal(result.status, 'no-history');
  } finally {
    dom.window.close();
  }
});

test('站点返回登录页等无效内容时不错误跳转', async () => {
  const page1 = 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75';
  const dom = new JSDOM(agaghhhPage([301], 2), { url: page1 });
  try {
    const result = await scanBatchProgressPages({
      startUrl: page1,
      currentUrl: page1,
      currentDocument: dom.window.document,
      historyIds: ['tid:300'],
      loadPage: async () => '<html><body>请先登录</body></html>',
      collectThreads: collectForumThreadLinks,
      getId: agaghhhId,
      getScope: forumScope,
    });
    assert.equal(result.status, 'unreadable');
    assert.equal(result.checked, 1);
  } finally {
    dom.window.close();
  }
});

test('分页起点兼容 Discuz SEO 与 WordPress 标签 /page/N', () => {
  assert.equal(
    firstBatchListPageUrl('https://agaghhh.cc/forum-263-12.html', 'agaghhh'),
    'https://agaghhh.cc/forum-263-1.html'
  );
  assert.equal(
    firstBatchListPageUrl('https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75&page=8', 'agaghhh'),
    'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75'
  );
  assert.equal(
    firstBatchListPageUrl('https://hdblog.me/tag/fc2/page/8/', 'hdblog'),
    'https://hdblog.me/tag/fc2/'
  );
});

test('从已解析分页读取下一页时使用正确的 base URL', async () => {
  const page1 = 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75';
  const dom = new JSDOM(agaghhhPage([500], 2), { url: page1 });
  try {
    assert.equal(
      nextBatchListPageUrl(dom.window.document),
      `${page1}&page=2`
    );
  } finally {
    dom.window.close();
  }
});
test('JavClub 数字分页：没有下一页按钮时仍继续查到已有历史的第三页', async () => {
  const base = 'https://javclub.me/category/jav-censored/';
  const urls = [base, base + 'page/2/', base + 'page/3/'];
  const page = (posts, n, hasNext) => '<!doctype html><html><head></head><body>' +
    '<main id="genesis-content">' +
    posts.map((id) => '<article class="entry"><header class="entry-header"><h2 class="entry-title">' +
      '<a href="/' + id + '.html">主题 ' + id + '</a></h2></header></article>').join('') +
    '</main><nav class="navigation pagination"><div class="nav-links">' +
    '<span class="page-numbers current" aria-current="page">' + n + '</span>' +
    (hasNext ? '<a class="page-numbers" href="' + urls[n] + '">' + (n + 1) + '</a>' : '') +
    '</div></nav></body></html>';
  const pages = new Map([
    [urls[0], page([3002, 3001], 1, true)],
    [urls[1], page([3000, 2999], 2, true)],
    [urls[2], page([2998, 2997], 3, false)],
  ]);
  const dom = new JSDOM(pages.get(base), { url: base });
  const fetched = [];
  try {
    const result = await scanBatchProgressPages({
      startUrl: base,
      currentUrl: base,
      currentDocument: dom.window.document,
      historyIds: ['post:2998', 'post:2997'],
      loadPage: async (url) => { fetched.push(url); return pages.get(url); },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, urls[2]);
    assert.deepEqual(fetched, [urls[1], urls[2]]);
  } finally {
    dom.window.close();
  }
});

test('JavClub 支持多种主题的下一页文字，但不凭空猜测分页 URL', () => {
  const base = 'https://javclub.me/category/jav-uncensored/';
  for (const label of ['Next Page »', 'Older Entries →', '下一頁', '› Next']) {
    const dom = new JSDOM('<nav class="navigation pagination"><div class="nav-links">' +
      '<a href="/category/jav-uncensored/page/2/">' + label + '</a></div></nav>', { url: base });
    try {
      assert.equal(nextBatchListPageUrl(dom.window.document), base + 'page/2/', label);
    } finally {
      dom.window.close();
    }
  }

  const dom = new JSDOM('<nav class="navigation pagination"><span class="current">1</span>' +
    '<a href="/category/jav-uncensored/page/3/">3</a></nav>', { url: base });
  try {
    assert.equal(nextBatchListPageUrl(dom.window.document), '',
      '缺少连续分页时不合成一个未证实的 URL');
  } finally {
    dom.window.close();
  }
});
