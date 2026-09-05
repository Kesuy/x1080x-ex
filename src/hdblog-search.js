const STORAGE_KEY = 'x1080x-ex:hdblog-blocked-keywords';
const DEFAULT_BLOCKED_KEYWORDS = 'モザイク破壊';

function normalizeKeyword(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function parseBlockedKeywords(value) {
  const seen = new Set();
  const keywords = [];
  String(value ?? '')
    .split(/[\r\n,;，；]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const normalized = normalizeKeyword(entry);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      keywords.push(entry);
    });
  return keywords;
}

export function isBlockedTitle(title, keywords) {
  const normalizedTitle = normalizeKeyword(title);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeKeyword(keyword);
    return normalizedKeyword && normalizedTitle.includes(normalizedKeyword);
  });
}

export function isHdblogSearchUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return (host === 'hdblog.me' || host.endsWith('.hdblog.me'))
      && url.searchParams.has('s')
      && Boolean(url.searchParams.get('s')?.trim());
  } catch {
    return false;
  }
}

export function filterSearchCandidates(candidates, keywords) {
  const blocked = [];
  const remaining = [];
  for (const candidate of candidates) {
    (isBlockedTitle(candidate.title, keywords) ? blocked : remaining).push(candidate);
  }
  return { blocked, remaining };
}

export function redirectTargetForSearch(candidates) {
  return candidates.length === 1 ? candidates[0].url : '';
}

export function collectHdblogSearchResults(document) {
  const baseUrl = new URL(document.baseURI);
  return [...document.querySelectorAll('main#genesis-content article.entry')]
    .map((article) => {
      const link = article.querySelector(
        '.entry-header .entry-title a[href], h2.entry-title a[href], .entry-title a[href]'
      );
      if (!link) return null;
      try {
        const url = new URL(link.getAttribute('href'), document.baseURI);
        if (!/^https?:$/.test(url.protocol) || url.origin !== baseUrl.origin) return null;
        return {
          article,
          link,
          title: String(link.textContent ?? '').replace(/\s+/g, ' ').trim(),
          url: url.href,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function filterHdblogSearchResults(document, keywords) {
  const candidates = collectHdblogSearchResults(document);
  const { blocked, remaining } = filterSearchCandidates(candidates, keywords);
  blocked.forEach(({ article }) => article.remove());
  return { blocked, remaining };
}

function getBlockedKeywords() {
  const stored = GM_getValue(STORAGE_KEY, null);
  if (stored === null || stored === undefined) {
    return parseBlockedKeywords(DEFAULT_BLOCKED_KEYWORDS);
  }
  return parseBlockedKeywords(stored);
}

function saveBlockedKeywords(keywords) {
  GM_setValue(STORAGE_KEY, keywords.join('\n'));
}

function registerSettingsMenu() {
  if (typeof GM_registerMenuCommand !== 'function') return;
  GM_registerMenuCommand('🚫 设置 hdblog 搜索屏蔽关键词', () => {
    const current = getBlockedKeywords().join('\n');
    const input = window.prompt(
      '请输入 hdblog 搜索结果需要屏蔽的标题关键词。每行一个，也可用逗号或分号分隔；留空表示关闭关键词屏蔽：',
      current
    );
    if (input === null) return;
    const keywords = parseBlockedKeywords(input);
    saveBlockedKeywords(keywords);
    window.alert(
      keywords.length
        ? `已保存屏蔽关键词：\n${keywords.join('\n')}\n\n刷新搜索结果页后生效。`
        : '已清空屏蔽关键词。刷新搜索结果页后生效。'
    );
  });
}

export function applyHdblogSearchEnhancement(windowObject = window) {
  if (!isHdblogSearchUrl(windowObject.location.href)) {
    return { blocked: [], remaining: [], redirectTarget: '' };
  }
  const keywords = getBlockedKeywords();
  const result = filterHdblogSearchResults(windowObject.document, keywords);
  const redirectTarget = redirectTargetForSearch(result.remaining);
  if (redirectTarget && redirectTarget !== windowObject.location.href) {
    windowObject.location.assign(redirectTarget);
  }
  return { ...result, redirectTarget };
}

export function installHdblogSearchEnhancement() {
  registerSettingsMenu();
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  applyHdblogSearchEnhancement(window);
}
