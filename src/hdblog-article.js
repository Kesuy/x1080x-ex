import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';

export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const DEFAULT_HDBLOG_ARTICLE_WIDTH = 1280;
const MIN_HDBLOG_ARTICLE_WIDTH = 600;
const MAX_HDBLOG_ARTICLE_WIDTH = 3000;
const LAYOUT_STYLE_ID = 'x1080x-ex-hdblog-article-layout';
const DOWNLOAD_BUTTON_ID = 'x1080x-ex-hdblog-image-download';
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

export function applyHdblogArticleLayout(document, width = DEFAULT_HDBLOG_ARTICLE_WIDTH) {
  if (!document?.head || !document.body) return false;
  const safeWidth = normalizeHdblogArticleWidth(width);
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
body.${ARTICLE_BODY_CLASS} article.post,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-content,
body.${ARTICLE_BODY_CLASS} article.post > .entry-content {
  width: 100% !important;
  max-width: none !important;
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
    grid-template-columns: minmax(0, 1fr) var(--x1080x-hdblog-sidebar-width) !important;
    column-gap: var(--x1080x-hdblog-column-gap) !important;
    align-items: start !important;
  }
  body.${ARTICLE_BODY_CLASS} main#genesis-content,
  body.${ARTICLE_BODY_CLASS} #genesis-content.content {
    width: 100% !important;
    max-width: var(--x1080x-hdblog-article-width) !important;
    float: none !important;
    margin: 0 !important;
  }
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    width: 100% !important;
    max-width: var(--x1080x-hdblog-sidebar-width) !important;
    float: none !important;
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
    width: 100% !important;
    max-width: none !important;
    float: none !important;
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

export function extractHdblogVideoCode(value) {
  const text = normalizeText(value).toUpperCase();
  if (!text) return '';

  const fc2 = text.match(/\bFC2[\s_-]*(PPV[\s_-]*)?(\d{5,9})\b/i);
  if (fc2) return `FC2${fc2[1] ? '-PPV' : ''}-${fc2[2]}`;

  const standard = text.match(/\b([A-Z]{2,12})[\s_-]?(\d{2,8})\b/i);
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
  if (!range) return [];
  const seen = new Set();

  return [...content.querySelectorAll('a[href]')]
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
      };
    })
    .filter(Boolean)
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
  const code = extractHdblogArticleCode(document);
  if (!code) {
    view?.alert('没有识别到影片番号，未开始下载。');
    return;
  }

  const candidates = initialCandidates.length
    ? initialCandidates
    : collectHdblogPixhostPreviewImages(document);
  if (!candidates.length) {
    view?.alert('Preview 区没有找到 Pixhost show 图片。');
    return;
  }

  button.disabled = true;
  const failures = [];
  try {
    button.textContent = '解析 Preview…';
    const resolved = [];
    const seen = new Set();
    for (const candidate of candidates) {
      try {
        const url = await resolveCandidateUrl(document, candidate, gmRequest);
        if (url && !seen.has(url)) {
          seen.add(url);
          resolved.push(url);
        }
      } catch (error) {
        failures.push(error?.message || 'Pixhost 大图地址解析失败');
      }
    }
    if (!resolved.length) throw new Error('没有解析到可下载的 Pixhost Preview 大图。');

    for (const [index, url] of resolved.entries()) {
      button.textContent = `下载 ${index + 1}/${resolved.length}`;
      try {
        const blob = await requestImageBlob(url, locationObject?.href, gmRequest);
        const extension = extensionFromBlob(blob, url);
        saveBlob(document, blob, hdblogImageFilename(code, index, resolved.length, extension));
      } catch (error) {
        failures.push(`${index + 1}. ${error?.message || '下载失败'}`);
      }
    }
  } catch (error) {
    failures.push(error?.message || '下载失败');
  } finally {
    button.disabled = false;
    button.textContent = failures.length ? `完成（失败 ${failures.length}）` : '✓ 下载完成';
    view?.setTimeout(() => { button.textContent = '⬇'; }, 2500);
  }
  if (failures.length) view?.alert(`部分图片处理失败：\n\n${failures.join('\n')}`);
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
    margin: '0 0 4px 12px',
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

function rawStoredWidth() {
  if (typeof GM_getValue !== 'function') return '';
  const value = GM_getValue(HDBLOG_ARTICLE_WIDTH_KEY, '');
  return value === null || value === undefined ? '' : String(value).trim();
}

function readStoredWidth() {
  return normalizeHdblogArticleWidth(rawStoredWidth(), DEFAULT_HDBLOG_ARTICLE_WIDTH);
}

function registerWidthSetting(document) {
  if (typeof GM_registerMenuCommand !== 'function') return;
  GM_registerMenuCommand('📐 设置 hdblog 文章宽度', () => {
    const stored = rawStoredWidth();
    const input = document.defaultView?.prompt(
      `请输入 hdblog 文章主内容区宽度（px）；留空使用默认 ${DEFAULT_HDBLOG_ARTICLE_WIDTH}px：`,
      stored
    );
    if (input === null || input === undefined) return;

    const trimmed = input.trim();
    if (!trimmed) {
      if (typeof GM_setValue === 'function') GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, '');
      if (isHdblogArticlePage(document, document.location)) {
        applyHdblogArticleLayout(document, DEFAULT_HDBLOG_ARTICLE_WIDTH);
      }
      return;
    }

    const numeric = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
      document.defaultView?.alert(
        `请输入 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} 之间的整数，或留空使用默认值。`
      );
      return;
    }
    if (typeof GM_setValue === 'function') GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, numeric);
    if (isHdblogArticlePage(document, document.location)) applyHdblogArticleLayout(document, numeric);
  });
}

export function installHdblogArticleEnhancement(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document) return;
  registerWidthSetting(document);
  if (!isHdblogArticlePage(document, locationObject)) return;
  applyHdblogArticleLayout(document, readStoredWidth());
  installDownloadButton(document, locationObject, gmRequest);
}
