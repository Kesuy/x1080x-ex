// Find a browsing boundary from actually recorded topic IDs, not the last opened URL.
// Each list is scanned from its first page so a previously visited older page can be found.
export function firstBatchListPageUrl(value, kind) {
  const url = new URL(value);
  url.hash = '';
  if (kind === 'agaghhh') {
    const forumPath = url.pathname.match(/^(.*\/forum-\d+-)\d+(\.html)$/i);
    if (forumPath) {
      url.pathname = `${forumPath[1]}1${forumPath[2]}`;
    }
    url.searchParams.delete('page');
  } else {
    url.pathname = url.pathname.replace(/\/page\/\d+\/?$/i, '/');
    url.searchParams.delete('paged');
  }
  return url.href;
}

export function nextBatchListPageUrl(document, baseUrl = document?.baseURI) {
  if (!document) return '';
  const selectors = [
    '#pgt .pg a.nxt[href]',
    '.pg a.nxt[href]',
    'a.nxt[href]',
    '.archive-pagination .pagination-next a[href]',
    '.archive-pagination a.next[href]',
    '.pagination a.next[href]',
    '.archive-pagination a[rel="next"][href]',
    'a[rel="next"][href]',
  ];
  let link = null;
  for (const selector of selectors) {
    link = document.querySelector(selector);
    if (link) break;
  }
  if (!link) {
    link = [...document.querySelectorAll(
      '.pg a[href], .archive-pagination a[href], .pagination a[href]'
    )].find((anchor) => /^(?:下一页|下一頁|next|older(?: posts?)?|»|›|→)(?:\s*[»›→])?$/i
      .test(String(anchor.textContent || '').trim()));
  }
  if (!link) return '';
  try {
    const url = new URL(link.getAttribute('href'), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function parseBatchListPage(html, pageUrl, document) {
  const Parser = document?.defaultView?.DOMParser || globalThis.DOMParser;
  if (!Parser) throw new Error('浏览器不支持解析分页内容');
  const page = new Parser().parseFromString(html, 'text/html');
  if (!page.head) throw new Error('分页内容无效');
  const base = page.createElement('base');
  base.href = pageUrl;
  page.head.prepend(base);
  return page;
}

export async function scanBatchProgressPages({
  startUrl,
  currentUrl,
  currentDocument,
  historyIds,
  loadPage,
  collectThreads,
  getId,
  getScope,
  maxPages = 120,
  onProgress = () => {},
  cancelled = () => false,
}) {
  const history = new Set(historyIds);
  if (!history.size) return { status: 'no-history', checked: 0 };
  const scope = getScope(startUrl);
  if (!scope) return { status: 'invalid-scope', checked: 0 };

  let pageUrl = startUrl;
  let previous = null;
  let checked = 0;
  let visitedFound = false;
  const seen = new Set();

  while (pageUrl && checked < maxPages) {
    if (cancelled()) return { status: 'cancelled', checked };
    const normalized = new URL(pageUrl, startUrl).href;
    if (seen.has(normalized) || getScope(normalized) !== scope) break;
    seen.add(normalized);

    let page;
    if (normalized === currentUrl) {
      page = currentDocument;
    } else {
      const html = await loadPage(normalized);
      if (cancelled()) return { status: 'cancelled', checked };
      page = parseBatchListPage(html, normalized, currentDocument);
    }

    const threads = collectThreads(page);
    if (!threads.length) {
      return { status: 'unreadable', checked, pageUrl: normalized };
    }
    const opened = threads.filter((thread) => {
      const id = getId(thread.url);
      return id && history.has(id);
    }).length;
    const unopened = threads.length - opened;
    visitedFound ||= opened > 0;
    checked += 1;
    onProgress({ checked, opened, unopened, url: normalized });

    // The crossover can be inside one page or between two adjacent pages.
    if (opened && unopened) {
      return { status: 'found', url: normalized, checked, opened, unopened };
    }
    if (previous && previous.opened !== opened && (
      (previous.opened === 0 && opened === threads.length)
      || (previous.unopened === 0 && opened === 0)
    )) {
      return { status: 'found', url: normalized, checked, opened, unopened };
    }
    previous = { opened, unopened };

    const next = nextBatchListPageUrl(page, normalized);
    if (!next || next === normalized || getScope(next) !== scope || seen.has(next)) {
      return { status: 'end', checked, visitedFound };
    }
    pageUrl = next;
  }
  return { status: checked >= maxPages ? 'limit' : 'end', checked, visitedFound };
}
