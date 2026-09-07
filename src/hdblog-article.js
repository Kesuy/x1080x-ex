import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';

export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const DEFAULT_HDBLOG_ARTICLE_WIDTH = 1280;
const MIN_HDBLOG_ARTICLE_WIDTH = 600;
const MAX_HDBLOG_ARTICLE_WIDTH = 3000;
const LAYOUT_STYLE_ID = 'x1080x-ex-hdblog-article-layout';
const DOWNLOAD_BUTTON_ID = 'x1080x-ex-hdblog-image-download';
const ARTICLE_BODY_CLASS = 'x1080x-hdblog-single';
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;
const DOWNLOAD_BOUNDARY_PATTERN = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|preview|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?)\b/i;
const REQUEST_TIMEOUT = 60000;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isHdblogHost(locationObject) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'hdblog.me' || hostname.endsWith('.hdblog.me');
}

export function normalizeHdblogArticleWidth(value, fallback = DEFAULT_HDBLOG_ARTICLE_WIDTH) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
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
@media (min-width: 1100px) {
  body.${ARTICLE_BODY_CLASS} .site-inner,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: min(
      calc(var(--x1080x-hdblog-article-width) + var(--x1080x-hdblog-sidebar-width) + var(--x1080x-hdblog-column-gap)),
      calc(100vw - 32px)
    ) !important;
    max-width: none !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
  body.${ARTICLE_BODY_CLASS} main#genesis-content,
  body.${ARTICLE_BODY_CLASS} #genesis-content.content {
    width: min(
      var(--x1080x-hdblog-article-width),
      calc(100vw - var(--x1080x-hdblog-sidebar-width) - var(--x1080x-hdblog-column-gap) - 32px)
    ) !important;
    max-width: var(--x1080x-hdblog-article-width) !important;
  }
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    width: var(--x1080x-hdblog-sidebar-width) !important;
    max-width: var(--x1080x-hdblog-sidebar-width) !important;
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
  if (!value || /^(?:data:|blob:|javascript:)/i.test(value)) return '';
  try {
    const url = new URL(value, document.baseURI);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function directImageHref(document, anchor) {
  const href = absoluteHttpUrl(document, anchor?.getAttribute('href'));
  if (!href || isPixhostShowUrl(href, document.baseURI)) return '';
  try {
    return IMAGE_EXTENSION_PATTERN.test(new URL(href).pathname) ? href : '';
  } catch {
    return '';
  }
}

function wordpressOriginalUrl(document, value) {
  const href = absoluteHttpUrl(document, value);
  if (!href) return '';
  try {
    const url = new URL(href);
    if (!/(?:\/wp-content\/uploads\/|\/uploads\/)/i.test(url.pathname)) return '';
    const originalPath = url.pathname.replace(
      /-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif|avif)$)/i,
      ''
    );
    if (originalPath === url.pathname) return '';
    url.pathname = originalPath;
    return url.href;
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

function preferredDirectUrl(document, image) {
  const directHref = directImageHref(document, image.closest('a[href]'));
  if (directHref) return wordpressOriginalUrl(document, directHref) || directHref;
  const candidates = [
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
  for (const candidate of candidates) {
    const url = absoluteHttpUrl(document, candidate);
    if (!url) continue;
    return wordpressOriginalUrl(document, url) || url;
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

function findDownloadBoundary(content) {
  return textNodesUnder(content).find((node) => DOWNLOAD_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))) || null;
}

function isBefore(reference, node) {
  if (!reference) return true;
  return Boolean(node.compareDocumentPosition(reference) & 4);
}

function isLikelyCoverImage(image) {
  if (image.closest('.avatar, .author-box, .sharedaddy, .share, .social, .emoji, .wp-smiley')) return false;
  const className = `${image.className || ''} ${image.parentElement?.className || ''}`;
  if (/\b(?:avatar|emoji|smilie|icon|logo)\b/i.test(className)) return false;
  const width = image.naturalWidth || image.width || Number(image.getAttribute('width')) || 0;
  const height = image.naturalHeight || image.height || Number(image.getAttribute('height')) || 0;
  if (width > 0 && height > 0 && (width < 160 || height < 160)) return false;
  return true;
}

export function collectHdblogCoverImages(document) {
  const content = articleContentElement(document);
  if (!content) return [];
  const boundary = findDownloadBoundary(content);
  const seen = new Set();
  return [...content.querySelectorAll('img')]
    .filter((image) => isBefore(boundary, image) && isLikelyCoverImage(image))
    .map((image) => {
      const anchor = image.closest('a[href]');
      const showUrl = absoluteHttpUrl(document, anchor?.getAttribute('href'));
      const pixhostShowUrl = showUrl && isPixhostShowUrl(showUrl, document.baseURI) ? showUrl : '';
      const thumbUrl = thumbnailUrl(document, image);
      const directUrl = preferredDirectUrl(document, image);
      return { image, pixhostShowUrl, thumbUrl, directUrl };
    })
    .filter((candidate) => candidate.pixhostShowUrl || candidate.directUrl)
    .filter((candidate) => {
      const key = candidate.pixhostShowUrl || candidate.directUrl;
      return !seen.has(key) && seen.add(key);
    })
    .slice(0, 12);
}

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
  if (!candidate.pixhostShowUrl) return candidate.directUrl;
  const resolved = await resolvePixhostShowUrl(
    document,
    candidate.pixhostShowUrl,
    candidate.thumbUrl,
    gmRequest
  );
  return resolved || candidate.directUrl || candidate.thumbUrl;
}

async function downloadHdblogArticleImages(button, document, locationObject, gmRequest) {
  const view = document.defaultView;
  const code = extractHdblogArticleCode(document);
  if (!code) {
    view?.alert('没有识别到影片番号，未开始下载。');
    return;
  }
  const candidates = collectHdblogCoverImages(document);
  if (!candidates.length) {
    view?.alert('文章开头没有找到可下载的缩略图。');
    return;
  }

  button.disabled = true;
  const failures = [];
  try {
    button.textContent = '解析图片…';
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
        failures.push(error?.message || '大图地址解析失败');
      }
    }
    if (!resolved.length) throw new Error('没有解析到可下载的大图地址。');

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
    view?.setTimeout(() => { button.textContent = '⬇ 下载图片'; }, 2500);
  }
  if (failures.length) view?.alert(`部分图片处理失败：\n\n${failures.join('\n')}`);
}

function installDownloadButton(document, locationObject, gmRequest) {
  if (document.getElementById(DOWNLOAD_BUTTON_ID)) return;
  const title = articleTitleElement(document);
  if (!title) return;
  const button = document.createElement('button');
  button.id = DOWNLOAD_BUTTON_ID;
  button.type = 'button';
  button.textContent = '⬇ 下载图片';
  button.title = '下载文章开头的封面/缩略图，并自动按影片番号重命名';
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'middle',
    margin: '0 0 4px 12px',
    padding: '5px 10px',
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
    gmRequest
  ));
  title.append(' ', button);
}

function readStoredWidth() {
  if (typeof GM_getValue !== 'function') return DEFAULT_HDBLOG_ARTICLE_WIDTH;
  return normalizeHdblogArticleWidth(GM_getValue(HDBLOG_ARTICLE_WIDTH_KEY, DEFAULT_HDBLOG_ARTICLE_WIDTH));
}

function registerWidthSetting(document) {
  if (typeof GM_registerMenuCommand !== 'function') return;
  GM_registerMenuCommand('📐 设置 hdblog 文章宽度', () => {
    const current = readStoredWidth();
    const input = document.defaultView?.prompt(
      `请输入 hdblog 文章主内容区宽度（px，${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH}）：`,
      String(current)
    );
    if (input === null || input === undefined) return;
    const numeric = Number.parseInt(input.trim(), 10);
    if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
      document.defaultView?.alert(`请输入 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} 之间的整数。`);
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
