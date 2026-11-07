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
    '.pagination a.next.page-numbers[href]',
    '.navigation.pagination a.next[href]',
    '.wp-pagenavi a.nextpostslink[href]',
    '.posts-navigation .nav-previous a[href]',
    '.nav-links .nav-previous a[href]',
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
      '.pg a[href], .archive-pagination a[href], .pagination a[href], .navigation a[href], .wp-pagenavi a[href]'
    )].find((anchor) => /^(?:下一页|下一頁|next(?:\s+page)?|older(?:\s+(?:posts?|entries))?|»|›|→)(?:\s*[»›→])?$/i
      .test(String(anchor.textContent || '').trim()));
  }
  if (!link) {
    // WordPress/Genesis themes may show numbered pagination without a "next"
    // class or label. Follow the smallest later page in this exact listing.
    const current = new URL(baseUrl);
    const pageScope = (value) => {
      const url = new URL(value);
      url.hash = '';
      url.pathname = url.pathname
        .replace(/\/page\/\d+\/?$/i, '/')
        .replace(/(\/forum-\d+-)\d+(\.html)$/i, (_, prefix, suffix) => prefix + '1' + suffix);
      url.searchParams.delete('page');
      url.searchParams.delete('paged');
      url.searchParams.sort();
      return url.href;
    };
    const pageNumber = (url) => Number.parseInt(
      url.searchParams.get('paged')
        || url.searchParams.get('page')
        || url.pathname.match(/\/page\/(\d+)\/?$/i)?.[1]
        || url.pathname.match(/\/forum-\d+-(\d+)\.html$/i)?.[1]
        || '1', 10
    );
    const currentNumber = pageNumber(current);
    const candidates = [...document.querySelectorAll(
      '.pg a[href], .archive-pagination a[href], .pagination a[href], .navigation a[href], .wp-pagenavi a[href], .pager a[href], a.page-numbers[href]'
    )].flatMap((anchor) => {
      try {
        const url = new URL(anchor.getAttribute('href'), baseUrl);
        const number = pageNumber(url);
        return /^https?:$/.test(url.protocol) && pageScope(url.href) === pageScope(current.href)
          && Number.isInteger(number) && number > currentNumber
          ? [{ number, url: url.href }] : [];
      } catch {
        return [];
      }
    }).sort((a, b) => a.number - b.number);
    if (candidates.length) return candidates[0].url;
  }
  if (!link) {
    // The redesigned forum uses buttons for paging instead of anchor hrefs.
    const nextButton = document.querySelector(
      '.pgt .pg button[aria-label="下一页"], .pg button[aria-label="下一页"], .pg button[aria-label="下一頁"]'
    );
    if (!nextButton || nextButton.disabled) return '';
    const url = new URL(baseUrl);
    if (!/^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname)) return '';
    const active = Number.parseInt(document.querySelector('.pgt .pg strong, .pg strong')?.textContent || '', 10);
    const current = Number.isInteger(active) && active > 0
      ? active : (Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    url.searchParams.set('page', String(current + 1));
    return url.href;
  }
  try {
    const url = new URL(link.getAttribute('href'), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

// Reuse HDblog progress pointers after the JavClub domain migration without
// changing the saved history or writing over the old domain's stored values.
export function rememberedBatchProgressUrl(map, scope, currentUrl, getScope) {
  if (!map || typeof map !== 'object' || !scope || typeof getScope !== 'function') return '';
  let current;
  try {
    current = new URL(currentUrl);
  } catch {
    return '';
  }
  const isJavclub = /^(?:javclub\.me|hdblog\.me)$/i.test(current.hostname);
  const keys = [scope];
  // Older versions stored the root category without a final slash. Probe
  // that original key as an alias; never rewrite the user's saved map.
  try {
    const unnormalized = new URL(scope);
    if (/^\/(?:category|tag)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/$/i.test(unnormalized.pathname)) {
      unnormalized.pathname = unnormalized.pathname.replace(/\/$/, '');
      keys.push(unnormalized.href);
    }
  } catch {
    // Non-URL scopes are left untouched.
  }
  if (isJavclub) {
    for (const key of [...keys]) {
      keys.push(key.replace('://javclub.me/', '://hdblog.me/'));
      keys.push(key.replace('://hdblog.me/', '://javclub.me/'));
    }
  }
  for (const key of new Set(keys)) {
    const saved = map[key];
    if (typeof saved?.url !== 'string') continue;
    try {
      const target = new URL(saved.url, currentUrl);
      if (isJavclub && /^(?:javclub\.me|hdblog\.me)$/i.test(target.hostname)) {
        target.hostname = current.hostname;
        target.protocol = current.protocol;
        target.port = current.port;
      }
      if (getScope(target.href) === scope) return target.href;
    } catch {
      // Ignore an obsolete or invalid pointer and try other domain aliases.
    }
  }
  return '';
}

// JavClub may omit next-page links in archive markup. Only category/tag
// pages get a guessed WordPress /page/N/ URL; the scanner validates each page.
export function inferWordPressArchiveNextUrl(document, pageUrl) {
  if (!document?.querySelector('main#genesis-content article.entry .entry-title a[href]')) return '';
  try {
    const url = new URL(pageUrl);
    if (!/^(?:javclub\.me|hdblog\.me)$/i.test(url.hostname)) return '';
    const basePath = url.pathname.replace(/\/page\/\d+\/?$/i, '/');
    if (!/^\/(?:category|tag)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i.test(basePath)) return '';
    const number = Number.parseInt(url.pathname.match(/\/page\/(\d+)\/?$/i)?.[1] || '1', 10);
    if (!Number.isSafeInteger(number) || number < 1) return '';
    url.pathname = basePath.replace(/\/?$/, '/') + 'page/' + (number + 1) + '/';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

// The React /boards interface may navigate with client-side pagination buttons
// without anchor hrefs (or with different aria-labels between releases).
// Its URL is still a stable ?page=N route. Infer only the next same-board page,
// and let the scanner reject duplicates, empty pages or HTTP 404/410.
export function inferModernBoardNextUrl(document, pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!/^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname)) return '';
    if (!document?.querySelector('article.thread-row:not(.is-sticky) a.resource-title[href*="/resources/"]')) {
      return '';
    }
    const current = url.searchParams.get('page') || '1';
    if (!/^[1-9]\d{0,5}$/.test(current)) return '';
    const currentPage = Number(current);
    if (!Number.isSafeInteger(currentPage)) return '';
    // An explicit disabled "next page" control is authoritative. Absence
    // of such a control is NOT evidence of the last page in a React list.
    const nextControl = document.querySelector(
      '.pg button[aria-label="下一页"], .pg button[aria-label="下一頁"],'
      + ' .pg button[aria-label="Next page" i], .pg button[title="下一页"],'
      + ' .pg button[title="Next page" i],'
      + ' .pagination button[aria-label="下一页"],'
      + ' .pagination button[aria-label="Next page" i]'
    );
    if (nextControl && (nextControl.disabled || nextControl.getAttribute('aria-disabled') === 'true')) {
      return '';
    }
    url.searchParams.set('page', String(currentPage + 1));
    return url.href;
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
  getIds,
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
  let candidate = null;
  let orderedBoundary = null;
  let arrivedViaInferredLink = false;
  const seen = new Set();
  const seenThreadSets = new Set();

  while (pageUrl && checked < maxPages) {
    if (cancelled()) return { status: 'cancelled', checked };
    const normalized = new URL(pageUrl, startUrl).href;
    if (seen.has(normalized) || getScope(normalized) !== scope) break;
    seen.add(normalized);

    let page;
    if (normalized === currentUrl) {
      page = currentDocument;
    } else {
      let html;
      try {
        html = await loadPage(normalized);
      } catch (error) {
        if (arrivedViaInferredLink && checked > 0) {
          // Preserve the previously confirmed mixed visited/unvisited page
          // if a *speculatively inferred* next page cannot be loaded. It is
          // still only an approximate location, not a proven boundary.
          if (candidate) {
            return { ...candidate, inspected: checked, approximate: true };
          }
          // A guessed /page/N/ or ?page=N may go beyond the archive end.
          if (/\bHTTP\s*(?:404|410)\b/i.test(String(error?.message || error))) {
            return { status: 'end', checked, visitedFound };
          }
        }
        throw error;
      }
      if (cancelled()) return { status: 'cancelled', checked };
      page = parseBatchListPage(html, normalized, currentDocument);
    }

    const threads = collectThreads(page);
    if (!threads.length) {
      // A modern React page may return an unhydrated HTML shell even though
      // earlier pages contained a usable mixed visited/unvisited boundary.
      // Keep that boundary rather than discarding it and reporting failure.
      return candidate
        ? { ...candidate, inspected: checked, approximate: true, unreadablePageUrl: normalized }
        : { status: 'unreadable', checked, pageUrl: normalized };
    }
    // Some servers redirect missing page numbers back to the same articles.
    const signature = threads.map((thread) => thread.url).join('\n');
    if (seenThreadSets.has(signature)) {
      return candidate
        ? { ...candidate, inspected: checked, approximate: true }
        : { status: 'end', checked, visitedFound, repeatedPage: true };
    }
    seenThreadSets.add(signature);
    const openedFlags = threads.map((thread) => {
      const ids = typeof getIds === 'function'
        ? getIds(thread)
        : [getId(thread.url)];
      return Array.isArray(ids) && ids.some((id) => id && history.has(id));
    });
    const opened = openedFlags.filter(Boolean).length;
    const unopened = threads.length - opened;
    visitedFound ||= opened > 0;
    checked += 1;
    onProgress({ checked, opened, unopened, url: normalized });

    // Do not stop at the first isolated visited thread. A true progress boundary
    // usually has a strong change in opened ratio between adjacent pages.
    const ratio = opened / threads.length;

    // Archive lists run from newest to oldest. The real progress edge is
    // usually "unopened at the top, opened at the bottom" (page 8), not
    // "opened at the top, isolated unopened at the bottom" (page 26).
    // Confirm this ordered edge against the following mostly-opened page
    // before jumping, so an isolated mixed page cannot hijack the scan.
    if (orderedBoundary) {
      if (ratio >= 0.75) {
        return { ...orderedBoundary, inspected: checked, orderedBoundary: true };
      }
      // A confirming page must be immediately adjacent; a match many pages
      // later may describe a different pocket of sporadically opened threads.
      orderedBoundary = null;
    }
    const firstOpenedIndex = openedFlags.indexOf(true);
    if (!orderedBoundary && firstOpenedIndex > 0 && ratio >= 2 / 3) {
      const olderThreads = openedFlags.slice(firstOpenedIndex);
      const olderOpened = olderThreads.filter(Boolean).length;
      if (olderOpened / olderThreads.length >= 0.8 && openedFlags.at(-1)) {
        orderedBoundary = { status: 'found', url: normalized, checked, opened, unopened };
      }
    }

    if (opened && unopened) {
      const strength = Math.min(opened, unopened) / threads.length;
      if (!candidate || strength > candidate.strength) {
        candidate = { status: 'found', url: normalized, checked, opened, unopened, strength };
      }
    }
    if (previous) {
      const delta = Math.abs(ratio - previous.ratio);
      // A strong jump toward opened older posts can still be an ordered
      // mixed boundary. Confirm it against the next page rather than letting
      // this old generic ratio shortcut choose the preceding mixed page.
      if (delta >= 0.5 && orderedBoundary?.url !== normalized) {
        const preferred = previous.opened && previous.unopened
          ? previous
          : { url: normalized, checked, opened, unopened };
        return {
          status: 'found',
          url: preferred.url,
          checked: preferred.checked,
          opened: preferred.opened,
          unopened: preferred.unopened,
          inspected: checked,
        };
      }
    }
    previous = { ratio, url: normalized, checked, opened, unopened };

    let next = nextBatchListPageUrl(page, normalized);
    const inferred = !next;
    if (!next) next = inferModernBoardNextUrl(page, normalized)
      || inferWordPressArchiveNextUrl(page, normalized);
    if (!next || next === normalized || getScope(next) !== scope || seen.has(next)) {
      return candidate
        ? { ...candidate, inspected: checked, approximate: true }
        : { status: 'end', checked, visitedFound };
    }
    pageUrl = next;
    arrivedViaInferredLink = inferred;
  }
  if (candidate) return { ...candidate, inspected: checked, approximate: true };
  return { status: checked >= maxPages ? 'limit' : 'end', checked, visitedFound };
}
