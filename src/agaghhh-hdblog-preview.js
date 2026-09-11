import { parseThreadTitle } from './core.js';
import {
  collectHdblogSearchResults,
  filterSearchCandidates,
  parseBlockedKeywords,
} from './hdblog-search.js';
import { isHdblogReferUrl } from './hdblog-refer.js';
import {
  derivePixhostImageUrlFromThumbnail,
  isPixhostShowUrl,
  parsePixhostImagePage,
} from './pixhost.js';

const HDBLOG_ORIGIN = 'https://hdblog.me';
const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';
const DEFAULT_HDBLOG_BLOCKED_KEYWORDS = 'モザイク破壊';
const REQUEST_TIMEOUT = 30000;
const CONTAINER_ID = 'x1080x-ex-agaghhh-hdblog-preview';
const PREVIEW_IMAGE_ATTR = 'data-x1080x-hdblog-preview-url';
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
const PREVIEW_BOUNDARY_PATTERN = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function absoluteHttpUrl(value, baseUrl) {
  if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return '';
  try {
    const url = new URL(String(value), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function requestText(url, gmRequest, referer = '') {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }
    gmRequest({
      method: 'GET',
      url,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
      onload(response) {
        if (response.status >= 400 || response.status === 0) {
          reject(new Error(`请求失败（HTTP ${response.status || 0}）`));
          return;
        }
        resolve({
          html: String(response.responseText ?? response.response ?? ''),
          finalUrl: response.finalUrl || response.responseURL || url,
          responseHeaders: response.responseHeaders || '',
        });
      },
      onerror: () => reject(new Error('网络请求失败')),
      ontimeout: () => reject(new Error('网络请求超时')),
    });
  });
}

function parseHtml(html, baseUrl, hostDocument = globalThis.document) {
  const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
  if (typeof Parser !== 'function') return null;
  const parsed = new Parser().parseFromString(String(html || ''), 'text/html');
  const base = parsed.createElement('base');
  base.href = baseUrl;
  (parsed.head || parsed.documentElement).prepend(base);
  return parsed;
}

function getHdblogBlockedKeywords() {
  const stored = typeof GM_getValue === 'function'
    ? GM_getValue(HDBLOG_BLOCKED_KEYWORDS_KEY, null)
    : null;
  return parseBlockedKeywords(
    stored === null || stored === undefined ? DEFAULT_HDBLOG_BLOCKED_KEYWORDS : stored
  );
}

function codeTokenMatches(title, code) {
  const normalized = normalizeText(title).toUpperCase();
  const target = String(code || '').trim().toUpperCase();
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, 'i').test(normalized);
}

export function chooseHdblogSearchResult(candidates, code, keywords = getHdblogBlockedKeywords()) {
  const { blocked, remaining } = filterSearchCandidates(candidates, keywords);
  if (!remaining.length) return { blocked, remaining, selected: null };
  if (remaining.length === 1) return { blocked, remaining, selected: remaining[0] };

  const slug = String(code || '').trim().toLowerCase();
  const exactSlug = remaining.filter((candidate) => {
    try {
      const parts = new URL(candidate.url).pathname.toLowerCase().split('/').filter(Boolean);
      return parts.at(-1) === slug;
    } catch {
      return false;
    }
  });
  if (exactSlug.length === 1) return { blocked, remaining, selected: exactSlug[0] };

  const exactTitle = remaining.filter((candidate) => codeTokenMatches(candidate.title, code));
  if (exactTitle.length === 1) return { blocked, remaining, selected: exactTitle[0] };
  return { blocked, remaining, selected: null };
}

function responseHeader(value, name) {
  const lower = String(name || '').toLowerCase();
  const line = String(value || '').split(/\r?\n/).find((entry) => {
    const separator = entry.indexOf(':');
    return separator > 0 && entry.slice(0, separator).trim().toLowerCase() === lower;
  });
  return line ? line.slice(line.indexOf(':') + 1).trim() : '';
}

function redirectFromHtml(html, baseUrl, hostDocument) {
  const parsed = parseHtml(html, baseUrl, hostDocument);
  const meta = parsed?.querySelector('meta[http-equiv]');
  if (meta && /^refresh$/i.test(meta.getAttribute('http-equiv') || '')) {
    const content = meta.getAttribute('content') || '';
    const match = content.match(/(?:^|;)\s*url\s*=\s*["']?([^"']+)\s*$/i);
    const target = absoluteHttpUrl(match?.[1], baseUrl);
    if (target) return target;
  }
  const scriptMatch = String(html).match(
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i
  );
  return absoluteHttpUrl(scriptMatch?.[1], baseUrl);
}

async function resolveHdblogReferTarget(document, referUrl, articleUrl, gmRequest) {
  try {
    const response = await requestText(referUrl, gmRequest, articleUrl);
    const finalUrl = absoluteHttpUrl(response.finalUrl, referUrl);
    if (finalUrl && finalUrl !== referUrl && !isHdblogReferUrl(finalUrl, referUrl)) {
      return finalUrl;
    }
    const location = absoluteHttpUrl(responseHeader(response.responseHeaders, 'location'), referUrl);
    if (location && !isHdblogReferUrl(location, referUrl)) return location;
    const htmlTarget = redirectFromHtml(response.html, referUrl, document);
    return htmlTarget && !isHdblogReferUrl(htmlTarget, referUrl) ? htmlTarget : '';
  } catch {
    return '';
  }
}

function previewThumbnailUrl(document, image) {
  const candidates = [
    image?.currentSrc,
    image?.getAttribute('src'),
    image?.getAttribute('data-original'),
    image?.getAttribute('data-lazy-src'),
    image?.getAttribute('data-src'),
  ];
  for (const candidate of candidates) {
    const url = absoluteHttpUrl(candidate, document.baseURI);
    if (url) return url;
  }
  return '';
}

function wordpressOriginalUrl(value) {
  const href = absoluteHttpUrl(value, HDBLOG_ORIGIN);
  if (!href) return '';
  try {
    const url = new URL(href);
    if (!/(?:\/wp-content\/uploads\/|\/uploads\/)/i.test(url.pathname)) return '';
    url.pathname = url.pathname.replace(
      /-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif|avif)$)/i,
      ''
    );
    return url.href;
  } catch {
    return '';
  }
}

function largestSrcsetUrl(document, value) {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, order) => {
      const match = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      const rawUrl = match ? match[1] : part.split(/\s+/, 1)[0];
      const amount = match ? Number(match[2]) : order;
      const score = match?.[3]?.toLowerCase() === 'x' ? amount * 100000 : amount;
      const url = absoluteHttpUrl(rawUrl, document.baseURI);
      return url ? { url, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0]?.url || '';
}

function bestImageUrl(document, image) {
  if (!image) return '';
  const anchorHref = absoluteHttpUrl(image.closest('a[href]')?.getAttribute('href'), document.baseURI);
  const candidates = [
    anchorHref && IMAGE_EXTENSION_PATTERN.test(anchorHref) ? anchorHref : '',
    image.getAttribute('data-orig-file'),
    image.getAttribute('data-original'),
    image.getAttribute('data-lazy-src'),
    image.getAttribute('data-src'),
    image.currentSrc,
    image.getAttribute('src'),
  ];
  for (const candidate of candidates) {
    const url = absoluteHttpUrl(candidate, document.baseURI);
    if (!url) continue;
    return wordpressOriginalUrl(url) || url;
  }
  const srcset = largestSrcsetUrl(
    document,
    image.getAttribute('data-srcset') || image.getAttribute('data-lazy-srcset') || image.getAttribute('srcset')
  );
  return wordpressOriginalUrl(srcset) || srcset;
}

async function resolvePixhostTarget(document, showUrl, thumbnailUrl, articleUrl, gmRequest) {
  const fallback = derivePixhostImageUrlFromThumbnail(thumbnailUrl, document.baseURI || showUrl);
  try {
    const response = await requestText(showUrl, gmRequest, articleUrl);
    return parsePixhostImagePage(document, response.html, response.finalUrl || showUrl) || fallback;
  } catch {
    return fallback;
  }
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

function previewRange(document) {
  const article = document.querySelector(
    'main#genesis-content article.entry, main#genesis-content article, article.entry, article.post, article'
  );
  const content = article?.querySelector('.entry-content, .post-content, .post-entry, .entry-body')
    || article
    || document.querySelector('main#genesis-content, main, #content')
    || document.body;
  if (!content) return null;
  const nodes = textNodesUnder(content);
  const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue)));
  if (!marker) return null;
  const boundary = nodes.find((node) => (
    isAfter(marker, node) && PREVIEW_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))
  )) || null;
  return { content, marker, boundary };
}

function inPreviewRange(range, node) {
  if (!range || !isAfter(range.marker, node)) return false;
  return !range.boundary || !isAfter(range.boundary, node);
}

export async function collectHdblogPreviewImageUrls(document, articleUrl, gmRequest) {
  const range = previewRange(document);
  if (!range) return [];
  const urls = [];
  const seen = new Set();
  const handledImages = new Set();
  const add = (value) => {
    const url = absoluteHttpUrl(value, articleUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const anchor of [...range.content.querySelectorAll('a[href]')].filter((node) => inPreviewRange(range, node))) {
    let target = absoluteHttpUrl(anchor.getAttribute('href'), document.baseURI);
    const image = anchor.querySelector('img');
    const thumbnail = previewThumbnailUrl(document, image);
    if (isHdblogReferUrl(target, document.baseURI)) {
      target = await resolveHdblogReferTarget(document, target, articleUrl, gmRequest);
    }
    if (target && isPixhostShowUrl(target, document.baseURI)) {
      target = await resolvePixhostTarget(document, target, thumbnail, articleUrl, gmRequest);
    }
    if (target && (IMAGE_EXTENSION_PATTERN.test(target) || /^https?:\/\/img\d+\./i.test(target))) {
      add(wordpressOriginalUrl(target) || target);
      if (image) handledImages.add(image);
      continue;
    }
    if (image) {
      const best = bestImageUrl(document, image);
      if (best) {
        add(best);
        handledImages.add(image);
      }
    }
  }

  for (const image of [...range.content.querySelectorAll('img')]
    .filter((node) => inPreviewRange(range, node) && !handledImages.has(node))) {
    add(bestImageUrl(document, image));
  }
  return urls;
}

export async function fetchHdblogPreviewForCode(
  code,
  gmRequest = globalThis.GM_xmlhttpRequest,
  hostDocument = globalThis.document
) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) return { code: '', articleUrl: '', imageUrls: [], blocked: [], remaining: [] };

  const searchUrl = `${HDBLOG_ORIGIN}/?s=${encodeURIComponent(normalizedCode)}`;
  const searchResponse = await requestText(searchUrl, gmRequest, `${HDBLOG_ORIGIN}/`);
  const searchDocument = parseHtml(searchResponse.html, searchResponse.finalUrl || searchUrl, hostDocument);
  if (!searchDocument) return { code: normalizedCode, articleUrl: '', imageUrls: [], blocked: [], remaining: [] };

  const candidates = collectHdblogSearchResults(searchDocument);
  const selection = chooseHdblogSearchResult(candidates, normalizedCode, getHdblogBlockedKeywords());
  if (!selection.selected) {
    return { code: normalizedCode, articleUrl: '', imageUrls: [], ...selection };
  }

  const articleUrl = selection.selected.url;
  const articleResponse = await requestText(articleUrl, gmRequest, searchUrl);
  const articleDocument = parseHtml(articleResponse.html, articleResponse.finalUrl || articleUrl, hostDocument);
  const imageUrls = articleDocument
    ? await collectHdblogPreviewImageUrls(articleDocument, articleUrl, gmRequest)
    : [];
  return { code: normalizedCode, articleUrl, imageUrls, ...selection };
}

function threadCode(document) {
  const rawTitle = document.querySelector('#thread_subject')?.textContent
    || document.querySelector('h1.ts, .vwthd h1, h1')?.textContent
    || document.title;
  return parseThreadTitle(rawTitle).code;
}

function firstPostContent(document) {
  const firstPost = [...document.querySelectorAll('#postlist [id^="post_"]')]
    .find((element) => /^post_\d+$/i.test(element.id))
    || document.querySelector('#postlist > div, #postlist');
  return firstPost?.querySelector('[id^="postmessage_"], .t_f') || firstPost || null;
}

function isThreadPage(locationObject) {
  try {
    const url = new URL(locationObject?.href || '');
    return url.searchParams.get('mod') === 'viewthread' && url.searchParams.has('tid');
  } catch {
    return false;
  }
}

export function renderAgaghhhHdblogPreview(document, result) {
  if (!document || !result?.imageUrls?.length || document.getElementById(CONTAINER_ID)) return null;
  const content = firstPostContent(document);
  if (!content) return null;

  const section = document.createElement('section');
  section.id = CONTAINER_ID;
  section.style.cssText = 'clear:both;margin:24px 0 8px;padding:16px 0 0;border-top:1px solid #ddd';

  const heading = document.createElement('div');
  heading.style.cssText = 'margin:0 0 12px;font-size:15px;font-weight:700;color:#444';
  const source = document.createElement('a');
  source.href = result.articleUrl;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = `HDblog Preview · ${result.code}`;
  source.style.cssText = 'color:inherit;text-decoration:none';
  heading.append(source);
  section.append(heading);

  result.imageUrls.forEach((url, index) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.cssText = 'display:block;clear:both;margin:14px 0;text-align:center';

    const image = document.createElement('img');
    image.src = url;
    image.alt = `${result.code} Preview ${index + 1}`;
    image.loading = index === 0 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.setAttribute(PREVIEW_IMAGE_ATTR, url);
    image.style.cssText = 'display:block;width:auto;height:auto;max-width:100%;margin:0 auto;object-fit:contain';
    anchor.append(image);
    section.append(anchor);
  });

  content.append(section);
  return section;
}

export async function installAgaghhhHdblogPreview(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document || !isThreadPage(locationObject) || document.getElementById(CONTAINER_ID)) return null;
  const code = threadCode(document);
  if (!code) return null;
  try {
    const result = await fetchHdblogPreviewForCode(code, gmRequest, document);
    return renderAgaghhhHdblogPreview(document, result);
  } catch (error) {
    console.warn('[x1080x-ex] hdblog preview lookup failed', {
      code,
      error: error?.message || String(error),
    });
    return null;
  }
}
