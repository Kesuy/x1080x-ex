import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectForumThreadLinks } from '../src/core.js';
import {
  firstBatchListPageUrl,
  nextBatchListPageUrl,
  inferWordPressArchiveNextUrl,
  scanBatchProgressPages,
  rememberedBatchProgressUrl,
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


test('JavClub 纯数字分页没有下一页按钮时仍能追踪下一页', async () => {
  const root = 'https://javclub.me/category/jav-censored/';
  const second = root + 'page/2/';
  const firstHtml = hdblogPage([1013749, 1013748]).replace('</main>',
    '<nav class="pagination"><span class="current">1</span>'
    + '<a class="page-numbers" href="/category/jav-censored/page/2/">2</a>'
    + '<a class="page-numbers" href="/category/jav-censored/page/3/">3</a>'
    + '</nav></main>');
  const secondHtml = hdblogPage([1013747, 1013746, 1013745]);
  const dom = new JSDOM(firstHtml, { url: root });
  try {
    assert.equal(nextBatchListPageUrl(dom.window.document), second);
    const result = await scanBatchProgressPages({
      startUrl: root,
      currentUrl: root,
      currentDocument: dom.window.document,
      historyIds: ['post:1013747', 'post:1013746'],
      loadPage: async (url) => {
        assert.equal(url, second);
        return secondHtml;
      },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, second);
    assert.equal(result.opened, 2);
  } finally {
    dom.window.close();
  }
});

test('JavClub 不会把其他分类的数字分页当成下一页', () => {
  const root = 'https://javclub.me/category/jav-censored/';
  const dom = new JSDOM('<nav class="pagination">'
    + '<a class="page-numbers" href="/category/jav-uncensored/page/2/">2</a>'
    + '</nav>', { url: root });
  try {
    assert.equal(nextBatchListPageUrl(dom.window.document), '');
  } finally {
    dom.window.close();
  }
});

test('旧 hdblog.me 进度图在 javclub.me 仍可用于同一栏目', () => {
  const current = 'https://javclub.me/tag/fc2-ppv/';
  const legacy = 'https://hdblog.me/tag/fc2-ppv/';
  const map = {
    [legacy]: { url: 'https://hdblog.me/tag/fc2-ppv/page/36/', updatedAt: 123 },
  };
  const scope = (url) => {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\/page\/\d+\/?$/, '/');
    return parsed.href;
  };
  assert.equal(
    rememberedBatchProgressUrl(map, current, current, scope),
    'https://javclub.me/tag/fc2-ppv/page/36/'
  );
  assert.equal(
    rememberedBatchProgressUrl(map, 'https://javclub.me/category/other/', current, scope),
    ''
  );
  assert.equal(
    rememberedBatchProgressUrl({
      [legacy]: { url: 'https://hdblog.me/category/other/page/6/' },
    }, current, current, scope),
    ''
  );
});


test('JavClub 页面完全没有分页控件时仍按 /page/N/ 逐页匹配保存的记录', async () => {
  const root = 'https://javclub.me/category/av-censored/';
  const second = root + 'page/2/';
  const third = root + 'page/3/';
  const pages = new Map([
    [root, hdblogPage([1101, 1100])],
    [second, hdblogPage([1099, 1098])],
    [third, hdblogPage([1097, 1096, 1095])],
  ]);
  const dom = new JSDOM(pages.get(root), { url: root });
  try {
    assert.equal(nextBatchListPageUrl(dom.window.document), '', '没有可识别的链接');
    assert.equal(inferWordPressArchiveNextUrl(dom.window.document, root), second);
    const fetched = [];
    const result = await scanBatchProgressPages({
      startUrl: root,
      currentUrl: root,
      currentDocument: dom.window.document,
      historyIds: ['post:1097', 'post:1096'],
      loadPage: async (url) => {
        fetched.push(url);
        const html = pages.get(url);
        if (!html) throw new Error('HTTP 404');
        return html;
      },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, third);
    assert.deepEqual(fetched, [second, third]);
    assert.equal(result.checked, 3);
  } finally {
    dom.window.close();
  }
});

test('JavClub 从当前 /page/4/ 继续查，直接在后续分页找到已浏览记录', async () => {
  const current = 'https://javclub.me/category/av-censored/page/4/';
  const next = 'https://javclub.me/category/av-censored/page/5/';
  const dom = new JSDOM(hdblogPage([141, 142]), { url: current });
  try {
    assert.equal(inferWordPressArchiveNextUrl(dom.window.document, current), next);
    const fetched = [];
    const result = await scanBatchProgressPages({
      startUrl: current,
      currentUrl: current,
      currentDocument: dom.window.document,
      historyIds: ['post:139', 'post:138'],
      loadPage: async (url) => {
        fetched.push(url);
        return hdblogPage([139, 138]);
      },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, next);
    assert.deepEqual(fetched, [next]);
    assert.equal(result.checked, 2);
  } finally {
    dom.window.close();
  }
});

test('JavClub 推算分页遇到不存在的末页 404 时停止而不是继续请求或报网络异常', async () => {
  const root = 'https://javclub.me/category/av-censored/';
  const dom = new JSDOM(hdblogPage([501]), { url: root });
  try {
    let calls = 0;
    const result = await scanBatchProgressPages({
      startUrl: root,
      currentUrl: root,
      currentDocument: dom.window.document,
      historyIds: ['post:800'],
      loadPage: async () => { calls += 1; throw new Error('HTTP 404'); },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'end');
    assert.equal(result.checked, 1);
    assert.equal(calls, 1);
  } finally {
    dom.window.close();
  }
});

test('JavClub 假分页反复返回相同文章时结束，避免无限扫描', async () => {
  const root = 'https://javclub.me/category/av-censored/';
  const html = hdblogPage([901, 900]);
  const dom = new JSDOM(html, { url: root });
  try {
    let calls = 0;
    const result = await scanBatchProgressPages({
      startUrl: root,
      currentUrl: root,
      currentDocument: dom.window.document,
      historyIds: ['post:899'],
      loadPage: async () => { calls += 1; return html; },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'end');
    assert.equal(result.checked, 1);
    assert.equal(result.repeatedPage, true);
    assert.equal(calls, 1);
  } finally {
    dom.window.close();
  }
});

test('JavClub 优先定位第 8 页的新旧交界，不跳到第 26 页的零星未读', async () => {
  const root = 'https://javclub.me/category/av-censored/';
  const pageUrl = (page) => page === 1 ? root : root + 'page/' + page + '/';
  const pages = new Map();
  const historyIds = [];

  // The captured page 8 begins with two unread posts and ends with ten
  // opened posts. Pages 9/10 are fully opened. In contrast, page 26 has
  // ten opened posts at the top followed by two isolated unread posts.
  for (let page = 1; page <= 27; page += 1) {
    const ids = Array.from({ length: 12 }, (_, index) => 2000000 - page * 100 - index);
    const openedIndexes = page === 1 || page === 27
      ? []
      : page >= 2 && page <= 7
        ? Array.from({ length: page }, (_, index) => index)
        : page === 8
          ? Array.from({ length: 10 }, (_, index) => index + 2)
          : page === 26
            ? Array.from({ length: 10 }, (_, index) => index)
            : Array.from({ length: 12 }, (_, index) => index);
    for (const index of openedIndexes) historyIds.push(`post:${ids[index]}`);
    pages.set(pageUrl(page), hdblogPage(ids, page < 27 ? pageUrl(page + 1) : ''));
  }

  const dom = new JSDOM(pages.get(root), { url: root });
  const loaded = [];
  try {
    const result = await scanBatchProgressPages({
      startUrl: root,
      currentUrl: root,
      currentDocument: dom.window.document,
      historyIds,
      loadPage: async (url) => {
        loaded.push(url);
        return pages.get(url);
      },
      collectThreads: collectForumThreadLinks,
      getId: hdblogId,
      getScope: hdblogScope,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.url, pageUrl(8));
    assert.equal(result.checked, 8);
    assert.equal(result.inspected, 9, '第 9 页全已读，确认第 8 页的交界');
    assert.equal(result.orderedBoundary, true);
    assert.equal(loaded.includes(pageUrl(26)), false, '不能继续扫描并误定位第 26 页');
  } finally {
    dom.window.close();
  }
});

test('JavClub 分页推算只允许真实文章归档、不能跨域或构造无关地址', () => {
  const root = 'https://javclub.me/category/av-censored/';
  const dom = new JSDOM(hdblogPage([1]), { url: root });
  try {
    assert.equal(inferWordPressArchiveNextUrl(dom.window.document, 'https://example.com/category/av-censored/'), '');
    assert.equal(inferWordPressArchiveNextUrl(dom.window.document, 'https://javclub.me/1013749.html'), '');
    assert.equal(inferWordPressArchiveNextUrl(dom.window.document, root), root + 'page/2/');
    assert.equal(inferWordPressArchiveNextUrl(dom.window.document, root + 'page/42/'), root + 'page/43/');
    const empty = new JSDOM('<main id="genesis-content"></main>', { url: root });
    try { assert.equal(inferWordPressArchiveNextUrl(empty.window.document, root), ''); }
    finally { empty.window.close(); }
  } finally { dom.window.close(); }
});


test('JavClub 兼容无尾斜杠的旧版进度索引', () => {
  const scope = 'https://javclub.me/category/av-censored/';
  const olderKey = 'https://javclub.me/category/av-censored';
  const result = rememberedBatchProgressUrl({
    [olderKey]: {
      url: 'https://javclub.me/category/av-censored/page/36/',
      updatedAt: 100,
    },
  }, scope, scope, (value) => {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/page\/\d+\/?$/i, '/');
    url.pathname = url.pathname.replace(/\/?$/, '/');
    return url.href;
  });
  assert.equal(result, 'https://javclub.me/category/av-censored/page/36/');
});
