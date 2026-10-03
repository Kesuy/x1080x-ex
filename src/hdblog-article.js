import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';
import { copyCodeWithButtonFeedback } from './clipboard.js';
import { partitionPreviewCandidates } from './hdblog-preview-variants.js';
import {
  HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY,
  beginDownloadGuard,
  isDownloadGuardEnabled,
} from './download-guard.js';
import {
  HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY,
  HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY,
  JAVFREE_PREVIEW_ATTR,
  PREVIEW_REFERER_ATTR,
  fetchJavfreePreviewForCode,
  isHdblogDeletedJavfreeSearchEnabled,
  isHdblogJavfreePreviewFallbackEnabled,
} from './javfree.js';

export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY = 'x1080x-ex:hdblog-article-layout-enabled';
export const HDBLOG_SHOW_DOWNLOAD_AREA_KEY = 'x1080x-ex:hdblog-show-download-area';
export const HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY = 'x1080x-ex:hdblog-show-image-download-button';
export const HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY = 'x1080x-ex:hdblog-show-cross-search-button';
export const HDBLOG_SHOW_COPY_CODE_BUTTON_KEY = 'x1080x-ex:hdblog-show-copy-code-button';
export const HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = 'x1080x-ex:hdblog-expand-preview-images';
export const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';
export const HDBLOG_SEARCH_FILTER_ENABLED_KEY = 'x1080x-ex:hdblog-search-filter-enabled';
export const HDBLOG_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:hdblog-batch-open-enabled';
export const HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY = 'x1080x-ex:hdblog-batch-open-interval-min-ms';
export const HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY = 'x1080x-ex:hdblog-batch-open-interval-max-ms';
export const HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY = 'x1080x-ex:hdblog-batch-open-history-enabled';
export const HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY = 'x1080x-ex:hdblog-batch-open-history-limit';
export const HDBLOG_BATCH_OPEN_HISTORY_KEY = 'x1080x-ex:hdblog-batch-open-history';
export const HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY = 'x1080x-ex:hdblog-batch-open-history-color';
export const HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY = 'x1080x-ex:hdblog-batch-open-unopened-only';
export const DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT = 5000;
export const DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR = '#bd10e0';
export const DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS = 800;
export const DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS = 1600;
export const DEFAULT_HDBLOG_ARTICLE_WIDTH = 1280;
const DEFAULT_HDBLOG_BLOCKED_KEYWORDS = 'モザイク破壊';
const HDBLOG_SETTINGS_PANEL_ID = 'x1080x-ex-hdblog-settings-panel';
const DOWNLOAD_HIDDEN_ATTR = 'data-x1080x-hdblog-download-hidden';
const DOWNLOAD_WRAPPER_ATTR = 'data-x1080x-hdblog-download-wrapper';
const DOWNLOAD_SECTION_LABEL_PATTERN = /^(?:bt(?:a)?file|katfile|freedl|rapidgator)\s*[:：]?$/i;
const PREVIEW_LABEL_PATTERN = /^preview\s*[:：]?$/i;
const MIN_HDBLOG_ARTICLE_WIDTH = 600;
const MAX_HDBLOG_ARTICLE_WIDTH = 3000;
const LAYOUT_STYLE_ID = 'x1080x-ex-hdblog-article-layout';
const DOWNLOAD_BUTTON_ID = 'x1080x-ex-hdblog-image-download';
const SEARCH_BUTTON_ID = 'x1080x-ex-hdblog-agaghhh-search';
const COPY_BUTTON_ID = 'x1080x-ex-hdblog-copy-code';
const ARTICLE_BODY_CLASS = 'x1080x-hdblog-single';
const REQUEST_TIMEOUT = 60000;
const PREVIEW_BOUNDARY_PATTERN = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?)\b/i;
const PIXHOST_IMAGE_HOST_PATTERN = /^img\d+\.(?:pixhost\.(?:to|cc)|pixho\.st)$/i;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isHdblogHost(locationObject) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'hdblog.me' || hostname.endsWith('.hdblog.me');
}

export function normalizeHdblogArticleWidth(value, fallback = DEFAULT_HDBLOG_ARTICLE_WIDTH) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_HDBLOG_ARTICLE_WIDTH, Math.max(MIN_HDBLOG_ARTICLE_WIDTH, parsed));
}

function articleElement(document) {
  return document?.querySelector(
    'main#genesis-content article.entry, main#genesis-content article, article.entry, article.post'
  ) || null;
}

function articleTitleElement(document) {
  const article = articleElement(document);
  return article?.querySelector('.entry-header .entry-title, h1.entry-title, header h1, h1')
    || document?.querySelector('main#genesis-content h1.entry-title, h1.entry-title')
    || null;
}

function articleContentElement(document) {
  const article = articleElement(document);
  return article?.querySelector('.entry-content, .post-content, .post-entry, .entry-body')
    || document?.querySelector('main#genesis-content .entry-content, .entry-content')
    || null;
}

export function isHdblogArticlePage(document, locationObject = document?.location) {
  if (!document || !isHdblogHost(locationObject)) return false;
  let url;
  try {
    url = new URL(locationObject?.href || document.baseURI);
  } catch {
    return false;
  }
  if (url.searchParams.has('s')) return false;
  const title = articleTitleElement(document);
  const content = articleContentElement(document);
  if (!title || !content) return false;
  if (title.matches('a[href]') || title.querySelector('a[href]')) return false;
  const bodyClass = document.body?.className || '';
  return /\bsingle(?:-post)?\b/i.test(bodyClass)
    || /^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)
    || Boolean(document.querySelector('article.entry .entry-meta, article.post .entry-meta'));
}

function originalHdblogArticleWidth(document, fallback) {
  const stored = Number(document?.body?.dataset?.x1080xHdblogOriginalArticleWidth || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const candidates = [
    articleElement(document),
    document?.querySelector('main#genesis-content, #genesis-content.content'),
  ].filter(Boolean);
  for (const element of candidates) {
    const measured = Number(element.getBoundingClientRect?.().width || 0);
    if (!Number.isFinite(measured) || measured <= 0) continue;
    const rounded = Math.round(measured * 100) / 100;
    if (document.body?.dataset) {
      document.body.dataset.x1080xHdblogOriginalArticleWidth = String(rounded);
    }
    return rounded;
  }
  return fallback;
}

export function applyHdblogArticleLayout(document, width = DEFAULT_HDBLOG_ARTICLE_WIDTH) {
  if (!document?.head || !document.body) return false;
  const safeWidth = normalizeHdblogArticleWidth(width);
  const originalWidth = originalHdblogArticleWidth(document, safeWidth);
  document.body.classList.add(ARTICLE_BODY_CLASS);
  let style = document.getElementById(LAYOUT_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = LAYOUT_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `
body.${ARTICLE_BODY_CLASS} {
  --x1080x-hdblog-article-width: ${safeWidth}px;
  --x1080x-hdblog-original-article-width: ${originalWidth}px;
  --x1080x-hdblog-sidebar-width: 300px;
  --x1080x-hdblog-column-gap: 32px;
}
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header {
  padding-bottom: 14px;
  margin-bottom: 18px;
  border-bottom: 1px solid rgba(0, 0, 0, .08);
}
body.${ARTICLE_BODY_CLASS} article.entry .entry-title,
body.${ARTICLE_BODY_CLASS} article.post .entry-title {
  line-height: 1.4;
}
body.${ARTICLE_BODY_CLASS} article.entry .entry-content,
body.${ARTICLE_BODY_CLASS} article.post .entry-content {
  line-height: 1.75;
}
body.${ARTICLE_BODY_CLASS} .site-header .wrap,
body.${ARTICLE_BODY_CLASS} .nav-primary .wrap,
body.${ARTICLE_BODY_CLASS} .site-inner,
body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.${ARTICLE_BODY_CLASS} article.entry,
body.${ARTICLE_BODY_CLASS} article.post {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  box-shadow: none !important;
}
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-content,
body.${ARTICLE_BODY_CLASS} article.post > .entry-content,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-footer,
body.${ARTICLE_BODY_CLASS} article.post > .entry-footer,
body.${ARTICLE_BODY_CLASS} main#genesis-content > .entry-comments,
body.${ARTICLE_BODY_CLASS} main#genesis-content > .comment-respond,
body.${ARTICLE_BODY_CLASS} #genesis-content.content > .entry-comments,
body.${ARTICLE_BODY_CLASS} #genesis-content.content > .comment-respond {
  width: min(100%, var(--x1080x-hdblog-original-article-width)) !important;
  max-width: var(--x1080x-hdblog-original-article-width) !important;
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.${ARTICLE_BODY_CLASS} .nav-primary .genesis-nav-menu {
  display: flex !important;
  flex-wrap: wrap !important;
  width: 100% !important;
  max-width: none !important;
}
body.${ARTICLE_BODY_CLASS} main#genesis-content,
body.${ARTICLE_BODY_CLASS} #genesis-content.content {
  background: #fff !important;
  box-sizing: border-box !important;
}
@media (min-width: 1100px) {
  body.${ARTICLE_BODY_CLASS} .site-header .wrap,
  body.${ARTICLE_BODY_CLASS} .nav-primary .wrap,
  body.${ARTICLE_BODY_CLASS} .site-inner,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: min(
      calc(var(--x1080x-hdblog-article-width) + var(--x1080x-hdblog-sidebar-width) + var(--x1080x-hdblog-column-gap)),
      calc(100vw - 40px)
    ) !important;
    max-width: none !important;
  }
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    display: grid !important;
    grid-template-columns: minmax(0, var(--x1080x-hdblog-article-width)) var(--x1080x-hdblog-sidebar-width) !important;
    column-gap: var(--x1080x-hdblog-column-gap) !important;
    justify-content: center !important;
    align-items: start !important;
    position: static !important;
    float: none !important;
  }
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap::before,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap::after {
    content: none !important;
    display: none !important;
  }
  body.${ARTICLE_BODY_CLASS} main#genesis-content,
  body.${ARTICLE_BODY_CLASS} #genesis-content.content {
    grid-column: 1 !important;
    grid-row: 1 !important;
    width: 100% !important;
    max-width: var(--x1080x-hdblog-article-width) !important;
    min-width: 0 !important;
    justify-self: stretch !important;
    align-self: start !important;
    float: none !important;
    position: static !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    margin: 0 !important;
  }
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    grid-column: 2 !important;
    grid-row: 1 !important;
    width: 100% !important;
    max-width: var(--x1080x-hdblog-sidebar-width) !important;
    min-width: 0 !important;
    justify-self: stretch !important;
    align-self: start !important;
    float: none !important;
    position: static !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
}
@media (max-width: 1099px) {
  body.${ARTICLE_BODY_CLASS} .site-header .wrap,
  body.${ARTICLE_BODY_CLASS} .nav-primary .wrap,
  body.${ARTICLE_BODY_CLASS} .site-inner,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: calc(100vw - 24px) !important;
    max-width: none !important;
  }
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    display: block !important;
  }
  body.${ARTICLE_BODY_CLASS} main#genesis-content,
  body.${ARTICLE_BODY_CLASS} #genesis-content.content,
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    grid-column: auto !important;
    grid-row: auto !important;
    width: 100% !important;
    max-width: none !important;
    float: none !important;
    position: static !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    margin-top: 28px !important;
  }
}
`;
  return true;
}

export function clearHdblogArticleLayout(document) {
  if (!document) return false;
  document.body?.classList.remove(ARTICLE_BODY_CLASS);
  if (document.body?.dataset) delete document.body.dataset.x1080xHdblogOriginalArticleWidth;
  document.getElementById(LAYOUT_STYLE_ID)?.remove();
  return true;
}

export function extractHdblogVideoCode(value) {
  const source = normalizeText(value);
  if (!source) return '';

  // hdblog 的无码标题常以“厂牌 + 日期型番号”开头，例如：
  // 1pondo 112625_001 / Caribbeancom 112525-001。
  // 这里保留厂牌大小写以及番号中的 _ / -，让 Preview 下载名与页面标题一致。
  const uncensored = source.match(/^([A-Z0-9][A-Z0-9.+-]{1,31})\s+(\d{6}[-_]\d{2,4})\b/i);
  if (uncensored) return `${uncensored[1]} ${uncensored[2]}`;

  const text = source.toUpperCase();
  const fc2 = text.match(/\bFC2[\s_-]*(PPV[\s_-]*)?(\d{5,9})\b/i);
  if (fc2) return `FC2${fc2[1] ? '-PPV' : ''}-${fc2[2]}`;

  const standard = text.match(/\b([A-Z]{2,12})[\s_-]?(\d{2,8}[A-Z]?)\b/i);
  if (!standard) return '';
  const prefix = standard[1];
  if (['HTTP', 'HTTPS', 'IMG', 'IMAGE', 'JPG', 'JPEG', 'PNG', 'WEBP'].includes(prefix)) return '';
  return `${prefix}-${standard[2]}`;
}

export function extractHdblogArticleCode(document) {
  const titleText = normalizeText(articleTitleElement(document)?.textContent || document?.title);
  const fromTitle = extractHdblogVideoCode(titleText);
  if (fromTitle) return fromTitle;

  const content = articleContentElement(document);
  if (!content) return '';
  const text = normalizeText(content.textContent).slice(0, 5000);
  const labelled = text.match(/(?:品番|品號|品号|番号|番號|code)\s*[:：]?\s*([A-Z0-9 _-]{4,30})/i);
  return extractHdblogVideoCode(labelled?.[1] || text);
}

export function hdblogAgaghhhSearchKeyword(code) {
  const source = normalizeText(code);
  const uncensored = source.match(/^[A-Z0-9][A-Z0-9.+-]{1,31}\s+(\d{6}[-_]\d{2,4})$/i);
  return uncensored?.[1] || source;
}

export function buildAgaghhhSearchUrl(code) {
  const keyword = hdblogAgaghhhSearchKeyword(code);
  if (!keyword) return '';
  return `https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=${encodeURIComponent(keyword)}&orderby=lastpost&ascdesc=desc`;
}

function openSearchTab(document, url) {
  if (!url) return;
  if (typeof GM_openInTab === 'function') {
    GM_openInTab(url, { active: true, insert: true, setParent: true });
    return;
  }
  document.defaultView?.open(url, '_blank', 'noopener');
}

function absoluteHttpUrl(document, value) {
  if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return '';
  try {
    const url = new URL(String(value), document.baseURI);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function largestSrcsetUrl(document, value) {
  const candidates = String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, order) => {
      const match = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      const rawUrl = match ? match[1] : part.split(/\s+/, 1)[0];
      const amount = match ? Number(match[2]) : order;
      const score = match?.[3]?.toLowerCase() === 'x' ? amount * 100000 : amount;
      const url = absoluteHttpUrl(document, rawUrl);
      return url ? { url, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.url || '';
}

function thumbnailUrl(document, image) {
  if (!image) return '';
  const values = [
    image.getAttribute('data-orig-file'),
    image.getAttribute('data-original'),
    image.getAttribute('data-lazy-src'),
    image.getAttribute('data-src'),
    largestSrcsetUrl(document, image.getAttribute('data-srcset')),
    largestSrcsetUrl(document, image.getAttribute('data-lazy-srcset')),
    largestSrcsetUrl(document, image.getAttribute('srcset')),
    image.currentSrc,
    image.getAttribute('src'),
  ];
  for (const value of values) {
    const url = absoluteHttpUrl(document, value);
    if (url) return url;
  }
  return '';
}

function isPixhostImageUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    return PIXHOST_IMAGE_HOST_PATTERN.test(url.hostname)
      && /^\/images\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function displayedPixhostImageUrl(document, image) {
  if (!image || image.dataset.x1080xPreviewLarge !== '1') return '';
  const anchorHref = absoluteHttpUrl(document, image.closest('a[href]')?.getAttribute('href'));
  const candidates = [image.currentSrc, image.getAttribute('src'), anchorHref];
  for (const value of candidates) {
    const url = absoluteHttpUrl(document, value);
    if (url && isPixhostImageUrl(url, document.baseURI)) return url;
  }
  return '';
}

function textNodesUnder(root) {
  const view = root.ownerDocument.defaultView;
  const showText = view?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = root.ownerDocument.createTreeWalker(root, showText);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest('script, style, noscript, textarea')) nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

function lowestCommonAncestorWithin(first, second, limit) {
  if (!first || !second || !limit) return null;
  const ancestors = new Set();
  let current = first.parentNode;
  while (current) {
    ancestors.add(current);
    if (current === limit) break;
    current = current.parentNode;
  }
  current = second.parentNode;
  while (current) {
    if (ancestors.has(current)) return current;
    if (current === limit) break;
    current = current.parentNode;
  }
  return null;
}

function directChildContaining(ancestor, node) {
  let current = node;
  while (current && current.parentNode !== ancestor) current = current.parentNode;
  return current?.parentNode === ancestor ? current : null;
}

function markDownloadAreaNode(document, node) {
  if (!node) return false;
  if (node.nodeType === 1) {
    node.setAttribute(DOWNLOAD_HIDDEN_ATTR, '1');
    node.style.setProperty('display', 'none', 'important');
    return true;
  }
  if (node.nodeType === 3 && normalizeText(node.nodeValue)) {
    const wrapper = document.createElement('span');
    wrapper.setAttribute(DOWNLOAD_HIDDEN_ATTR, '1');
    wrapper.setAttribute(DOWNLOAD_WRAPPER_ATTR, '1');
    wrapper.style.setProperty('display', 'none', 'important');
    node.parentNode?.insertBefore(wrapper, node);
    wrapper.append(node);
    return true;
  }
  return false;
}

function clearHdblogDownloadAreaMarkers(document) {
  if (!document) return;
  [...document.querySelectorAll(`[${DOWNLOAD_HIDDEN_ATTR}="1"]`)].forEach((element) => {
    if (element.getAttribute(DOWNLOAD_WRAPPER_ATTR) === '1') {
      element.replaceWith(...element.childNodes);
      return;
    }
    element.style.removeProperty('display');
    element.removeAttribute(DOWNLOAD_HIDDEN_ATTR);
  });
}

export function applyHdblogDownloadAreaVisibility(document, visible = true) {
  if (!document) return 0;
  clearHdblogDownloadAreaMarkers(document);
  if (visible) return 0;

  const content = articleContentElement(document);
  if (!content) return 0;
  const nodes = textNodesUnder(content);
  const start = nodes.find((node) => DOWNLOAD_SECTION_LABEL_PATTERN.test(normalizeText(node.nodeValue)));
  if (!start) return 0;
  const preview = nodes.find((node) => (
    isAfter(start, node) && PREVIEW_LABEL_PATTERN.test(normalizeText(node.nodeValue))
  ));
  if (!preview) return 0;

  const common = lowestCommonAncestorWithin(start, preview, content);
  if (!common) return 0;
  const first = directChildContaining(common, start);
  const stop = directChildContaining(common, preview);
  if (!first || !stop || first === stop) return 0;

  let hidden = 0;
  let current = first;
  while (current && current !== stop) {
    const next = current.nextSibling;
    if (markDownloadAreaNode(document, current)) hidden += 1;
    current = next;
  }
  return hidden;
}

function isAfter(reference, node) {
  return Boolean(reference?.compareDocumentPosition(node) & 4);
}

function previewRange(content) {
  const nodes = textNodesUnder(content);
  const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue)));
  if (!marker) return null;
  const boundary = nodes.find((node) => (
    isAfter(marker, node)
    && PREVIEW_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))
  )) || null;
  return { marker, boundary };
}

function inPreviewRange(range, node) {
  if (!range || !isAfter(range.marker, node)) return false;
  return !range.boundary || !isAfter(range.boundary, node);
}

export function collectHdblogPixhostPreviewImages(document) {
  const content = articleContentElement(document);
  if (!content) return [];
  const range = previewRange(content);
  const seen = new Set();
  const candidates = [];

  if (range) {
    candidates.push(
      ...[...content.querySelectorAll('a[href]')]
        .filter((anchor) => inPreviewRange(range, anchor))
        .map((anchor) => {
          const image = anchor.querySelector('img');
          if (!image) return null;
          const href = absoluteHttpUrl(document, anchor.getAttribute('href'));
          const pixhostShowUrl = isPixhostShowUrl(href, document.baseURI) ? href : '';
          const directUrl = displayedPixhostImageUrl(document, image);
          if (!pixhostShowUrl && !directUrl) return null;
          return {
            image,
            pixhostShowUrl,
            thumbUrl: thumbnailUrl(document, image),
            directUrl,
            referer: document.baseURI,
          };
        })
        .filter(Boolean)
    );
  }

  candidates.push(
    ...[...content.querySelectorAll('img[' + JAVFREE_PREVIEW_ATTR + ']')]
      .map((image) => {
        const directUrl = absoluteHttpUrl(document, image.getAttribute(JAVFREE_PREVIEW_ATTR));
        if (!directUrl) return null;
        return {
          image,
          pixhostShowUrl: '',
          thumbUrl: directUrl,
          directUrl,
          referer: image.getAttribute(PREVIEW_REFERER_ATTR) || 'https://javfree.me/',
        };
      })
      .filter(Boolean)
  );

  return candidates
    .filter((candidate) => {
      const key = candidate.pixhostShowUrl || candidate.directUrl;
      return !seen.has(key) && seen.add(key);
    })
    .slice(0, 24);
}

// 兼容本分支早期测试/调用；现在只返回 Preview 区的 Pixhost 图片，不再返回封面。
export const collectHdblogCoverImages = collectHdblogPixhostPreviewImages;

export function hdblogImageFilename(code, index, total, extension = 'jpg') {
  const safeCode = normalizeText(code).replace(/[<>:"/\\|?*]/g, '-');
  const safeExtension = String(extension || 'jpg').replace(/^\./, '').toLowerCase();
  const suffix = total > 1 ? `-${index + 1}` : '';
  return `${safeCode}${suffix}.${safeExtension || 'jpg'}`;
}

function extensionFromUrl(value) {
  try {
    const match = new URL(value).pathname.match(/\.((?:jpe?g|png|webp|gif|avif))$/i);
    return match?.[1]?.toLowerCase().replace('jpeg', 'jpg') || '';
  } catch {
    return '';
  }
}

function extensionFromBlob(blob, url) {
  const type = String(blob?.type || '').toLowerCase();
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('avif')) return 'avif';
  return extensionFromUrl(url) || 'jpg';
}

function requestImageBlob(url, referer, gmRequest = globalThis.GM_xmlhttpRequest) {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前油猴环境不支持 GM_xmlhttpRequest。'));
      return;
    }
    gmRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      timeout: REQUEST_TIMEOUT,
      headers: referer ? { Referer: referer } : undefined,
      onload: (response) => {
        if (response.status < 200 || response.status >= 300 || !response.response) {
          reject(new Error(`图片请求失败（HTTP ${response.status || 0}）`));
          return;
        }
        resolve(response.response);
      },
      onerror: () => reject(new Error('图片请求失败。')),
      ontimeout: () => reject(new Error(`图片请求超时（${REQUEST_TIMEOUT / 1000} 秒）。`)),
    });
  });
}

function saveBlob(document, blob, name) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.hidden = true;
  anchor.download = name;
  anchor.href = objectUrl;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    document.defaultView?.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

async function resolveCandidateUrl(document, candidate, gmRequest) {
  const displayed = displayedPixhostImageUrl(document, candidate.image);
  if (displayed) return displayed;
  if (!candidate.pixhostShowUrl) return candidate.directUrl;
  return resolvePixhostShowUrl(
    document,
    candidate.pixhostShowUrl,
    candidate.thumbUrl,
    gmRequest
  );
}

async function downloadHdblogArticleImages(button, document, locationObject, gmRequest, initialCandidates = []) {
  const view = document.defaultView;
  const resetButton = (delay = 3000) => {
    view?.setTimeout(() => {
      button.textContent = '⬇';
      button.title = '下载 Pixhost Preview 大图，并自动按影片番号重命名';
    }, delay);
  };
  const showStatus = (text, detail = '') => {
    button.disabled = false;
    button.textContent = text;
    if (detail) button.title = detail;
    resetButton();
  };

  const code = extractHdblogArticleCode(document);
  if (!code) {
    showStatus('未识别番号', '没有识别到影片番号，未开始下载。');
    return;
  }

  const liveCandidates = collectHdblogPixhostPreviewImages(document);
  const candidateMap = new Map();
  [...initialCandidates, ...liveCandidates].forEach((candidate) => {
    const key = candidate?.pixhostShowUrl || candidate?.directUrl || candidate?.thumbUrl;
    if (key && !candidateMap.has(key)) candidateMap.set(key, candidate);
  });
  const candidates = [...candidateMap.values()];
  if (!candidates.length) {
    showStatus('无 Preview', 'Preview 区没有找到 Pixhost show 图片。');
    return;
  }

  const { standard, fourK } = partitionPreviewCandidates(candidates);
  const phases = standard.length
    ? [
        { candidates: standard, label: '普通 Preview', fallback: false },
        ...(fourK.length ? [{ candidates: fourK, label: '4K Preview', fallback: true }] : []),
      ]
    : [{ candidates: fourK, label: '4K Preview', fallback: false }];

  const endDownloadGuard = beginDownloadGuard(document, {
    enabled: isDownloadGuardEnabled(HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY),
  });
  button.disabled = true;
  const failures = [];
  let skipped = 0;
  let downloaded = 0;
  let usedFourKFallback = false;

  try {
    for (const [phaseIndex, phase] of phases.entries()) {
      const hasFallbackPhase = phaseIndex < phases.length - 1;
      button.textContent = phase.fallback ? '回退解析 4K Preview…' : '解析 Preview…';

      const phaseFailures = [];
      let phaseSkipped = 0;
      const resolved = [];
      const seen = new Set();

      for (const candidate of phase.candidates) {
        try {
          const url = await resolveCandidateUrl(document, candidate, gmRequest);
          if (!url) {
            if (candidate.pixhostShowUrl) phaseSkipped += 1;
            continue;
          }
          if (!seen.has(url)) {
            seen.add(url);
            resolved.push({ url, candidate });
          }
        } catch (error) {
          phaseFailures.push(error?.message || 'Pixhost 大图地址解析失败');
        }
      }

      if (!resolved.length) {
        if (hasFallbackPhase) continue;
        skipped += phaseSkipped;
        failures.push(...phaseFailures);
        break;
      }

      let phaseDownloaded = 0;
      const downloadFailures = [];
      let downloadSkipped = 0;

      for (const [index, item] of resolved.entries()) {
        const { url, candidate } = item;
        button.textContent = phase.fallback
          ? `4K 回退下载 ${index + 1}/${resolved.length}`
          : `下载 ${index + 1}/${resolved.length}`;
        try {
          const blob = await requestImageBlob(
            url,
            candidate?.referer || locationObject?.href,
            gmRequest
          );
          const extension = extensionFromBlob(blob, url);
          saveBlob(
            document,
            blob,
            hdblogImageFilename(code, downloaded + phaseDownloaded, resolved.length, extension)
          );
          phaseDownloaded += 1;
        } catch (error) {
          const message = error?.message || '下载失败';
          const unavailable = Boolean(candidate?.pixhostShowUrl)
            && /HTTP\s+(?:404|410)\b/i.test(message);
          if (unavailable) {
            downloadSkipped += 1;
            continue;
          }
          downloadFailures.push(`${index + 1}. ${message}`);
        }
      }

      if (phaseDownloaded > 0) {
        downloaded += phaseDownloaded;
        skipped += phaseSkipped + downloadSkipped;
        failures.push(...phaseFailures, ...downloadFailures);
        usedFourKFallback = phase.fallback;
        break;
      }

      if (hasFallbackPhase) continue;

      skipped += phaseSkipped + downloadSkipped;
      failures.push(...phaseFailures, ...downloadFailures);
      break;
    }

    if (!downloaded && isHdblogJavfreePreviewFallbackEnabled()) {
      try {
        button.textContent = '尝试 JavFree Preview…';
        const javfree = await fetchJavfreePreviewForCode(code, gmRequest, document);
        const javfreeUrl = javfree.imageUrls?.[0] || '';
        if (javfreeUrl) {
          const blob = await requestImageBlob(
            javfreeUrl,
            javfree.referer || javfree.articleUrl || 'https://javfree.me/',
            gmRequest
          );
          const extension = extensionFromBlob(blob, javfreeUrl);
          saveBlob(document, blob, hdblogImageFilename(code, 0, 1, extension));
          downloaded = 1;
          failures.length = 0;
          skipped = 0;
        }
      } catch (error) {
        failures.push('JavFree：' + (error?.message || 'Preview 下载失败'));
      }
    }

    if (!downloaded && !failures.length) {
      if (skipped) {
        showStatus('已跳过失效 Preview', 'Pixhost Preview 已失效，未下载占位图。');
        return;
      }
      showStatus('无可下载 Preview', 'HDblog 与 JavFree 都没有可下载的 Preview。');
      return;
    }
  } catch (error) {
    failures.push(error?.message || '下载失败');
  } finally {
    if (button.disabled) {
      button.disabled = false;
      button.textContent = failures.length
        ? `完成（失败 ${failures.length}）`
        : skipped
          ? (downloaded ? `✓ 完成（跳过 ${skipped}）` : '已跳过失效 Preview')
          : '✓ 下载完成';
      if (failures.length) button.title = failures.join('；');
      else if (usedFourKFallback) button.title = '普通 Preview 不可用，已自动回退下载 4K Preview。';
      else if (skipped) button.title = 'Pixhost Preview 已失效，未下载占位图。';
      resetButton();
    }
    endDownloadGuard();
  }
}

function installDownloadButton(document, locationObject, gmRequest) {
  if (document.getElementById(DOWNLOAD_BUTTON_ID)) return;
  const title = articleTitleElement(document);
  if (!title) return;

  // 在 Preview 大图增强改写 Pixhost show 链接前先保存原始候选，确保只下载这些 Preview。
  const initialCandidates = collectHdblogPixhostPreviewImages(document);

  const button = document.createElement('button');
  button.id = DOWNLOAD_BUTTON_ID;
  button.type = 'button';
  button.textContent = '⬇';
  button.title = '下载 Pixhost Preview 大图，并自动按影片番号重命名';
  button.setAttribute('aria-label', '下载 Pixhost Preview 大图');
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'middle',
    margin: '0 0 4px 8px',
    padding: '5px 8px',
    minWidth: '34px',
    justifyContent: 'center',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => { if (!button.disabled) button.style.background = '#246eaf'; });
  button.addEventListener('mouseleave', () => { if (!button.disabled) button.style.background = '#398bd4'; });
  button.addEventListener('click', () => void downloadHdblogArticleImages(
    button,
    document,
    locationObject,
    gmRequest,
    initialCandidates
  ));

  title.append(' ', button);
}

function installAgaghhhSearchButton(document) {
  if (document.getElementById(SEARCH_BUTTON_ID)) return;
  const title = articleTitleElement(document);
  if (!title) return;
  const searchButton = document.createElement('button');
  searchButton.id = SEARCH_BUTTON_ID;
  searchButton.type = 'button';
  searchButton.textContent = '🔍';
  searchButton.title = '按当前番号在 agaghhh.cc 搜索';
  searchButton.setAttribute('aria-label', '在 agaghhh.cc 搜索当前番号');
  Object.assign(searchButton.style, {
    display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle',
    margin: '0 0 4px 8px', padding: '5px 8px', minWidth: '34px',
    justifyContent: 'center', border: '1px solid #2878c8', borderRadius: '5px',
    color: '#fff', background: '#398bd4', cursor: 'pointer', fontSize: '13px',
    fontWeight: '600', lineHeight: '20px',
  });
  searchButton.addEventListener('mouseenter', () => { searchButton.style.background = '#246eaf'; });
  searchButton.addEventListener('mouseleave', () => { searchButton.style.background = '#398bd4'; });
  searchButton.addEventListener('click', () => {
    const url = buildAgaghhhSearchUrl(extractHdblogArticleCode(document));
    if (!url) {
      document.defaultView?.alert('没有识别到影片番号。');
      return;
    }
    openSearchTab(document, url);
  });
  title.append(searchButton);
}

function installCopyCodeButton(document) {
  if (document.getElementById(COPY_BUTTON_ID)) return;
  const code = extractHdblogArticleCode(document);
  if (!code) return;
  const title = articleTitleElement(document);
  if (!title) return;
  const downloadButton = document.getElementById(DOWNLOAD_BUTTON_ID);
  const searchButton = document.getElementById(SEARCH_BUTTON_ID);

  const button = document.createElement('button');
  button.id = COPY_BUTTON_ID;
  button.type = 'button';
  button.textContent = '📋';
  button.title = '复制当前番号到剪切板';
  button.setAttribute('aria-label', '复制当前番号到剪切板');
  Object.assign(button.style, {
    display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle',
    margin: '0 0 4px 8px', padding: '5px 8px', minWidth: '34px',
    justifyContent: 'center', border: '1px solid #2878c8', borderRadius: '5px',
    color: '#fff', background: '#398bd4', cursor: 'pointer', fontSize: '13px',
    fontWeight: '600', lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => {
    if (!button.disabled) button.style.background = '#246eaf';
  });
  button.addEventListener('mouseleave', () => {
    if (!button.disabled) button.style.background = '#398bd4';
  });
  button.addEventListener('click', () => {
    void copyCodeWithButtonFeedback(button, document, extractHdblogArticleCode(document));
  });

  if (downloadButton) downloadButton.insertAdjacentElement('afterend', button);
  else if (searchButton) searchButton.insertAdjacentElement('beforebegin', button);
  else title.append(button);
}

function rawStoredWidth() {
  if (typeof GM_getValue !== 'function') return '';
  const value = GM_getValue(HDBLOG_ARTICLE_WIDTH_KEY, '');
  return value === null || value === undefined ? '' : String(value).trim();
}

function readStoredWidth() {
  const stored = rawStoredWidth();
  return stored ? normalizeHdblogArticleWidth(stored, DEFAULT_HDBLOG_ARTICLE_WIDTH) : null;
}

export function isHdblogArticleLayoutEnabled() {
  if (typeof GM_getValue !== 'function') return Boolean(rawStoredWidth());
  const stored = GM_getValue(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, null);
  if (stored === null || stored === undefined) return Boolean(rawStoredWidth());
  return stored !== false;
}

function readDownloadAreaVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, true) !== false;
}

function readImageDownloadButtonVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, true) !== false;
}

export function isHdblogCrossSearchEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, true) !== false;
}

export function isHdblogCopyCodeEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_COPY_CODE_BUTTON_KEY, true) !== false;
}

export function isHdblogSearchFilterEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY, true) !== false;
}

export function isHdblogBatchOpenEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, true) !== false;
}

function readBatchOpenIntervalMs(key, fallback) {
  if (typeof GM_getValue !== 'function') return fallback;
  const numeric = Number(GM_getValue(key, fallback));
  return Number.isFinite(numeric) && numeric >= 100 && numeric <= 600000
    ? Math.round(numeric)
    : fallback;
}

export function getHdblogBatchOpenInterval() {
  const delayMin = readBatchOpenIntervalMs(
    HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY,
    DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS
  );
  const delayMax = readBatchOpenIntervalMs(
    HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY,
    DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS
  );
  if (delayMax < delayMin) {
    return {
      delayMin: DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS,
      delayMax: DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS,
    };
  }
  return { delayMin, delayMax };
}

export function isHdblogBatchOpenHistoryEnabled() {
  if (typeof GM_getValue !== 'function') return false;
  return GM_getValue(HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY, false) === true;
}

export function isHdblogBatchOpenUnopenedOnlyEnabled() {
  if (typeof GM_getValue !== 'function') return false;
  return GM_getValue(HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY, false) === true;
}

export function getHdblogBatchOpenHistoryLimit() {
  if (typeof GM_getValue !== 'function') return DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT;
  const numeric = Number(GM_getValue(
    HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY,
    DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT
  ));
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 50000
    ? numeric
    : DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT;
}

export function getHdblogBatchOpenHistoryColor() {
  if (typeof GM_getValue !== 'function') return DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR;
  const value = String(GM_getValue(
    HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY,
    DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR
  ) || '').trim();
  return /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR;
}

export function isHdblogPreviewExpansionEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, true) !== false;
}

function readBlockedKeywordsText() {
  if (typeof GM_getValue !== 'function') return DEFAULT_HDBLOG_BLOCKED_KEYWORDS;
  const stored = GM_getValue(HDBLOG_BLOCKED_KEYWORDS_KEY, null);
  return stored === null || stored === undefined
    ? DEFAULT_HDBLOG_BLOCKED_KEYWORDS
    : String(stored);
}

function normalizeBlockedKeywordsText(value) {
  const seen = new Set();
  return String(value ?? '')
    .split(/[\r\n,;，；]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.normalize('NFKC').toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

function closeHdblogSettingsPanel(document) {
  document?.getElementById(HDBLOG_SETTINGS_PANEL_ID)?.remove();
}

export function openHdblogSettingsPanel(document = globalThis.document) {
  if (!document?.body) return null;
  closeHdblogSettingsPanel(document);

  const overlay = document.createElement('div');
  overlay.id = HDBLOG_SETTINGS_PANEL_ID;
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483646', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px',
    background: 'rgba(0,0,0,.42)', boxSizing: 'border-box',
  });

  const panel = document.createElement('form');
  Object.assign(panel.style, {
    width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
    padding: '22px', borderRadius: '10px', background: '#fff', color: '#222',
    boxShadow: '0 18px 60px rgba(0,0,0,.28)', boxSizing: 'border-box',
    font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  panel.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">x1080x-ex · hdblog 设置</h2>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">文章布局</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="layout-enabled" type="checkbox">
        启用文章宽度增强
      </label>
      <label data-width-row style="display:block;margin-left:24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">文章主内容区宽度（px）</span>
        <input data-setting="width" type="number" min="${MIN_HDBLOG_ARTICLE_WIDTH}" max="${MAX_HDBLOG_ARTICLE_WIDTH}" step="1"
          placeholder="${DEFAULT_HDBLOG_ARTICLE_WIDTH}"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
        <small style="display:block;margin-top:5px;color:#666">关闭开关时完全使用网站原始布局；开启后只扩展白色主内容区域。</small>
      </label>
    </div>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">文章页功能</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="show-downloads" type="checkbox">
        显示 Btfile / katfile / Freedl / Rapidgator 网盘下载区域
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <input data-setting="show-image-download" type="checkbox">
        显示标题旁的图片下载按钮（⬇）
      </label>
      <label data-download-guard-row style="display:flex;align-items:flex-start;gap:9px;margin:0 0 10px 24px">
        <input data-setting="download-guard" type="checkbox" style="margin-top:3px">
        <span>下载时标记标签页并在关闭时提醒<small style="display:block;margin-top:2px;color:#666">仅下载进行中生效，完成后自动恢复标签标题并解除关闭提示。</small></span>
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="cross-search" type="checkbox">
        显示跨站搜索按钮（🔍，搜索 agaghhh.cc）
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="copy-code" type="checkbox">
        显示复制番号按钮（📋）
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <input data-setting="expand-preview" type="checkbox">
        自动展开 Preview 大图（含 Pixhost / refer 解析）
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin:0 0 10px 24px">
        <input data-setting="javfree-preview-fallback" type="checkbox" style="margin-top:3px">
        <span>JavFree Preview 后备源<small style="display:block;margin-top:2px;color:#666">当前文章没有可用 Preview 或 Pixhost 已失效时，按番号从 javfree.me 补充第 2 张 Preview。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px">
        <input data-setting="deleted-javfree-search" type="checkbox" style="margin-top:3px">
        <span>已删除文章自动搜索 JavFree<small style="display:block;margin-top:2px;color:#666">访问 HDblog 已删除的历史文章时，自动新开标签搜索同番号的 javfree.me。</small></span>
      </label>
    </div>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">搜索 / 列表页功能</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <input data-setting="batch-open" type="checkbox">
        显示“后台顺序打开本页主题”按钮
      </label>
      <div data-batch-open-interval-row style="margin:0 0 10px 24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">主题打开间隔（秒）</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input data-setting="batch-open-interval-min" type="number" min="0.1" max="600" step="0.1" aria-label="最小间隔"
            style="width:88px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <span>—</span>
          <input data-setting="batch-open-interval-max" type="number" min="0.1" max="600" step="0.1" aria-label="最大间隔"
            style="width:88px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <button type="button" data-action="reset-batch-open-interval" style="padding:6px 10px;appearance:none;background:#fff !important;color:#333 !important;border:1px solid #bbb !important;border-radius:6px;cursor:pointer;font:inherit;line-height:1.4">恢复默认</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666">每个主题在该范围内随机等待；默认 0.8–1.6 秒。定期长停顿规则保持不变。</small>
      </div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:8px">
        <input data-setting="batch-open-history" type="checkbox" style="margin-top:3px">
        <span><strong>保存批量打开记录</strong><small style="display:block;margin-top:2px;color:#666">记录脚本批量打开过的文章并持久标记；手动访问过的链接也使用相同颜色显示。</small></span>
      </label>
      <div data-batch-open-history-row style="margin:0 0 13px 24px">
        <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
          <input data-setting="batch-open-unopened-only" type="checkbox" style="margin-top:3px">
          <span><strong>只打开未打开的主题</strong><small style="display:block;margin-top:2px;color:#666">批量打开时跳过已经保存在“批量打开记录”中的文章。</small></span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:600">最多保存</span>
          <input data-setting="batch-open-history-limit" type="number" min="1" max="50000" step="1" aria-label="批量打开记录保存条数"
            style="width:100px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <span>条</span>
        </label>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
          <span style="font-weight:600">访问标记颜色</span>
          <input data-setting="batch-open-history-color" type="color" aria-label="访问标记颜色"
            style="width:44px;height:32px;padding:2px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer">
          <button type="button" data-action="reset-batch-open-history-color"
            style="padding:6px 10px;appearance:none;background:#fff !important;color:#333 !important;border:1px solid #bbb !important;border-radius:6px;cursor:pointer;font:inherit;line-height:1.4">还原默认紫色</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666">默认 5000 条，默认颜色 #bd10e0；超过上限自动删除最旧记录。</small>
      </div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="search-filter" type="checkbox">
        启用搜索结果屏蔽与单结果自动跳转
      </label>
      <label data-keywords-row style="display:block;margin-left:24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">搜索结果屏蔽关键词</span>
        <textarea data-setting="keywords" rows="5" placeholder="留空 = 不屏蔽"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical"></textarea>
        <small style="display:block;margin-top:5px;color:#666">每行一个，也可用逗号或分号分隔；该规则也供 agaghhh 的 hdblog Preview 搜索复用。</small>
      </label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">取消</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">保存</button>
    </div>`;

  const layoutInput = panel.querySelector('[data-setting="layout-enabled"]');
  const widthInput = panel.querySelector('[data-setting="width"]');
  const downloadsInput = panel.querySelector('[data-setting="show-downloads"]');
  const imageDownloadInput = panel.querySelector('[data-setting="show-image-download"]');
  const downloadGuardInput = panel.querySelector('[data-setting="download-guard"]');
  const crossSearchInput = panel.querySelector('[data-setting="cross-search"]');
  const copyCodeInput = panel.querySelector('[data-setting="copy-code"]');
  const previewInput = panel.querySelector('[data-setting="expand-preview"]');
  const javfreePreviewInput = panel.querySelector('[data-setting="javfree-preview-fallback"]');
  const deletedJavfreeSearchInput = panel.querySelector('[data-setting="deleted-javfree-search"]');
  const batchOpenInput = panel.querySelector('[data-setting="batch-open"]');
  const batchIntervalMinInput = panel.querySelector('[data-setting="batch-open-interval-min"]');
  const batchIntervalMaxInput = panel.querySelector('[data-setting="batch-open-interval-max"]');
  const batchIntervalResetButton = panel.querySelector('[data-action="reset-batch-open-interval"]');
  const batchHistoryInput = panel.querySelector('[data-setting="batch-open-history"]');
  const batchUnopenedOnlyInput = panel.querySelector('[data-setting="batch-open-unopened-only"]');
  const batchHistoryLimitInput = panel.querySelector('[data-setting="batch-open-history-limit"]');
  const batchHistoryColorInput = panel.querySelector('[data-setting="batch-open-history-color"]');
  const batchHistoryColorResetButton = panel.querySelector('[data-action="reset-batch-open-history-color"]');
  const searchFilterInput = panel.querySelector('[data-setting="search-filter"]');
  const keywordsInput = panel.querySelector('[data-setting="keywords"]');

  layoutInput.checked = isHdblogArticleLayoutEnabled();
  widthInput.value = rawStoredWidth() || String(DEFAULT_HDBLOG_ARTICLE_WIDTH);
  downloadsInput.checked = readDownloadAreaVisible();
  imageDownloadInput.checked = readImageDownloadButtonVisible();
  downloadGuardInput.checked = isDownloadGuardEnabled(HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY);
  crossSearchInput.checked = isHdblogCrossSearchEnabled();
  copyCodeInput.checked = isHdblogCopyCodeEnabled();
  previewInput.checked = isHdblogPreviewExpansionEnabled();
  javfreePreviewInput.checked = isHdblogJavfreePreviewFallbackEnabled();
  deletedJavfreeSearchInput.checked = isHdblogDeletedJavfreeSearchEnabled();
  batchOpenInput.checked = isHdblogBatchOpenEnabled();
  const batchInterval = getHdblogBatchOpenInterval();
  batchIntervalMinInput.value = String(batchInterval.delayMin / 1000);
  batchIntervalMaxInput.value = String(batchInterval.delayMax / 1000);
  batchHistoryInput.checked = isHdblogBatchOpenHistoryEnabled();
  batchUnopenedOnlyInput.checked = isHdblogBatchOpenUnopenedOnlyEnabled();
  batchHistoryLimitInput.value = String(getHdblogBatchOpenHistoryLimit());
  batchHistoryColorInput.value = getHdblogBatchOpenHistoryColor();
  searchFilterInput.checked = isHdblogSearchFilterEnabled();
  keywordsInput.value = readBlockedKeywordsText();

  const syncDependentFields = () => {
    widthInput.disabled = !layoutInput.checked;
    downloadGuardInput.disabled = !imageDownloadInput.checked;
    keywordsInput.disabled = !searchFilterInput.checked;
    javfreePreviewInput.disabled = !previewInput.checked;
    const batchIntervalDisabled = !batchOpenInput.checked;
    batchIntervalMinInput.disabled = batchIntervalDisabled;
    batchIntervalMaxInput.disabled = batchIntervalDisabled;
    batchIntervalResetButton.disabled = batchIntervalDisabled;
    batchHistoryInput.disabled = batchIntervalDisabled;
    batchUnopenedOnlyInput.disabled = batchIntervalDisabled || !batchHistoryInput.checked;
    batchHistoryLimitInput.disabled = batchIntervalDisabled || !batchHistoryInput.checked;
  };
  syncDependentFields();
  layoutInput.addEventListener('change', syncDependentFields);
  imageDownloadInput.addEventListener('change', syncDependentFields);
  searchFilterInput.addEventListener('change', syncDependentFields);
  previewInput.addEventListener('change', syncDependentFields);
  batchOpenInput.addEventListener('change', syncDependentFields);
  batchHistoryInput.addEventListener('change', syncDependentFields);
  batchIntervalResetButton.addEventListener('click', () => {
    batchIntervalMinInput.value = String(DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS / 1000);
    batchIntervalMaxInput.value = String(DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS / 1000);
    batchIntervalResetButton.blur();
  });
  batchHistoryColorResetButton.addEventListener('click', () => {
    batchHistoryColorInput.value = DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR;
    batchHistoryColorResetButton.blur();
  });

  panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => closeHdblogSettingsPanel(document));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeHdblogSettingsPanel(document);
  });
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const widthText = widthInput.value.trim();
    let numeric = DEFAULT_HDBLOG_ARTICLE_WIDTH;
    if (widthText) {
      numeric = Number.parseInt(widthText, 10);
      if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
        document.defaultView?.alert(`请输入 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} 之间的整数。`);
        widthInput.focus();
        return;
      }
    }

    const batchIntervalMinSeconds = Number(batchIntervalMinInput.value);
    const batchIntervalMaxSeconds = Number(batchIntervalMaxInput.value);
    if (
      !Number.isFinite(batchIntervalMinSeconds)
      || !Number.isFinite(batchIntervalMaxSeconds)
      || batchIntervalMinSeconds < 0.1
      || batchIntervalMaxSeconds > 600
      || batchIntervalMaxSeconds < batchIntervalMinSeconds
    ) {
      document.defaultView?.alert('批量打开主题间隔请输入 0.1–600 秒，且最大间隔不能小于最小间隔。');
      batchIntervalMinInput.focus();
      return;
    }
    const batchHistoryLimit = Number(batchHistoryLimitInput.value);
    if (!Number.isInteger(batchHistoryLimit) || batchHistoryLimit < 1 || batchHistoryLimit > 50000) {
      document.defaultView?.alert('批量打开记录保存条数请输入 1–50000 的整数。');
      batchHistoryLimitInput.focus();
      return;
    }
    const batchIntervalMinMs = Math.round(batchIntervalMinSeconds * 1000);
    const batchIntervalMaxMs = Math.round(batchIntervalMaxSeconds * 1000);

    if (typeof GM_setValue === 'function') {
      GM_setValue(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, layoutInput.checked);
      GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, numeric);
      GM_setValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, downloadsInput.checked);
      GM_setValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, imageDownloadInput.checked);
      GM_setValue(HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY, downloadGuardInput.checked);
      GM_setValue(HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, crossSearchInput.checked);
      GM_setValue(HDBLOG_SHOW_COPY_CODE_BUTTON_KEY, copyCodeInput.checked);
      GM_setValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, previewInput.checked);
      GM_setValue(HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, javfreePreviewInput.checked);
      GM_setValue(HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY, deletedJavfreeSearchInput.checked);
      GM_setValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, batchOpenInput.checked);
      GM_setValue(HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY, batchIntervalMinMs);
      GM_setValue(HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY, batchIntervalMaxMs);
      GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY, batchHistoryInput.checked);
      GM_setValue(HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY, batchUnopenedOnlyInput.checked);
      GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY, batchHistoryLimit);
      GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY, batchHistoryColorInput.value);
      if (typeof GM_getValue === 'function') {
        const existingHistory = GM_getValue(HDBLOG_BATCH_OPEN_HISTORY_KEY, []);
        if (Array.isArray(existingHistory) && existingHistory.length > batchHistoryLimit) {
          GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_KEY, existingHistory.slice(-batchHistoryLimit));
        }
      }
      GM_setValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY, searchFilterInput.checked);
      GM_setValue(HDBLOG_BLOCKED_KEYWORDS_KEY, normalizeBlockedKeywordsText(keywordsInput.value));
    }

    closeHdblogSettingsPanel(document);
    const view = document.defaultView;
    if (view?.location?.reload) view.location.reload();
  });

  overlay.append(panel);
  document.body.append(overlay);
  return overlay;
}

function registerHdblogSettingsMenu(document, locationObject) {
  if (!isHdblogHost(locationObject) || typeof GM_registerMenuCommand !== 'function') return;
  const view = document?.defaultView;
  if (view && view.top !== view) return;
  GM_registerMenuCommand('⚙️ hdblog 设置', () => openHdblogSettingsPanel(document));
}

export function installHdblogArticleEnhancement(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document) return;
  registerHdblogSettingsMenu(document, locationObject);
  if (!isHdblogArticlePage(document, locationObject)) return;
  const storedWidth = readStoredWidth();
  if (isHdblogArticleLayoutEnabled()) {
    applyHdblogArticleLayout(document, storedWidth || DEFAULT_HDBLOG_ARTICLE_WIDTH);
  } else {
    clearHdblogArticleLayout(document);
  }
  applyHdblogDownloadAreaVisibility(document, readDownloadAreaVisible());
  if (readImageDownloadButtonVisible()) installDownloadButton(document, locationObject, gmRequest);
  else document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
  if (isHdblogCrossSearchEnabled()) installAgaghhhSearchButton(document);
  else document.getElementById(SEARCH_BUTTON_ID)?.remove();
  if (isHdblogCopyCodeEnabled()) installCopyCodeButton(document);
  else document.getElementById(COPY_BUTTON_ID)?.remove();
}
