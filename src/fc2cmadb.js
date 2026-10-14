export const FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY =
  'x1080x-ex:fc2cmadb-hdblog-search-enabled';

const LINK_ATTR = 'data-x1080x-fc2cmadb-hdblog-search';

export function isFc2cmadbUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return host === 'fc2cmadb.com' || host.endsWith('.fc2cmadb.com');
  } catch {
    return false;
  }
}

export function buildFc2cmadbHdblogSearchUrl(value) {
  const code = String(value ?? '').trim();
  return /^\d{5,12}$/.test(code) ? 'https://hdblog.me/?s=' + code : '';
}

export function isFc2cmadbHdblogSearchEnabled() {
  return typeof GM_getValue !== 'function'
    || GM_getValue(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, true) !== false;
}

// FC2CMADB uses a separate badge above each article cover. Keep the cover
// link unchanged and replace only the number badge with a real search link.
export function enhanceFc2cmadbArticleCodes(documentObject) {
  if (!documentObject || !isFc2cmadbHdblogSearchEnabled()) return 0;
  let changed = 0;

  for (const figure of documentObject.querySelectorAll('figure')) {
    const badge = figure.querySelector(':scope > span.absolute.top-0.left-0');
    const cover = figure.querySelector(':scope > a[href*="/articles/"]');
    if (!badge || !cover) continue;

    const code = String(badge.textContent || '').trim();
    const searchUrl = buildFc2cmadbHdblogSearchUrl(code);
    if (!searchUrl) continue;

    try {
      const articleUrl = new URL(cover.getAttribute('href'), documentObject.baseURI);
      const articleMatch = articleUrl.pathname.match(/^\/articles\/(\d+)\/?$/);
      if (!isFc2cmadbUrl(articleUrl.href) || !articleMatch || articleMatch[1] !== code) continue;
    } catch {
      continue;
    }

    const link = documentObject.createElement('a');
    link.className = badge.className;
    link.textContent = code;
    link.href = searchUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = '在 HDBLOG 搜索 FC2-PPV-' + code;
    link.setAttribute('aria-label', '在 HDBLOG 搜索番号 ' + code);
    link.setAttribute(LINK_ATTR, code);
    link.style.cursor = 'pointer';
    link.style.zIndex = '2';
    link.style.textDecoration = 'underline';
    badge.replaceWith(link);
    changed += 1;
  }

  return changed;
}

export function installFc2cmadbEnhancement(windowObject = globalThis.window) {
  if (!windowObject || !isFc2cmadbUrl(windowObject.location?.href)) return null;
  const documentObject = windowObject.document;

  if (typeof GM_registerMenuCommand === 'function') {
    const enabled = isFc2cmadbHdblogSearchEnabled();
    GM_registerMenuCommand(
      '⚙️ FC2CMADB：番号搜索 HDBLOG（' + (enabled ? '已开启，点击关闭' : '已关闭，点击开启') + '）',
      () => {
        if (typeof GM_setValue !== 'function') return;
        GM_setValue(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, !enabled);
        windowObject.alert?.('FC2CMADB 番号搜索设置已保存，刷新页面后生效。');
      }
    );
  }

  if (!documentObject?.body || !isFc2cmadbHdblogSearchEnabled()) return null;
  const apply = () => enhanceFc2cmadbArticleCodes(documentObject);
  apply();

  // Svelte pagination/filters can replace card elements without navigating.
  const observer = new windowObject.MutationObserver(apply);
  observer.observe(documentObject.body, { childList: true, subtree: true });
  return observer;
}
