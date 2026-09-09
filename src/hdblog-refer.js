import {
  expandHdblogPreviewImages,
  expandHdblogPixhostPreviewImages,
} from './hdblog-preview.js';

const REQUEST_TIMEOUT = 30000;
const PREVIEW_BOUNDARY_PATTERN = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
const resolutionCache = new Map();

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isHdblogHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  return host === 'hdblog.me' || host.endsWith('.hdblog.me');
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

export function isHdblogReferUrl(value, baseUrl = 'https://hdblog.me/') {
  const href = absoluteHttpUrl(value, baseUrl);
  if (!href) return false;
  try {
    const url = new URL(href);
    return isHdblogHostname(url.hostname) && /^\/refer\/[^?#]+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function responseHeadersMap(value) {
  const headers = new Map();
  String(value ?? '').split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator <= 0) return;
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  });
  return headers;
}

function htmlRedirectTarget(document, html, baseUrl) {
  if (!document || !html) return '';
  try {
    const parsed = document.implementation.createHTMLDocument('hdblog-refer');
    parsed.documentElement.innerHTML = String(html);
    const meta = parsed.querySelector('meta[http-equiv]');
    if (meta && /^refresh$/i.test(meta.getAttribute('http-equiv') || '')) {
      const content = meta.getAttribute('content') || '';
      const match = content.match(/(?:^|;)\s*url\s*=\s*["']?([^"']+)\s*$/i);
      const target = absoluteHttpUrl(match?.[1], baseUrl);
      if (target) return target;
    }
  } catch {
    // 继续尝试脚本跳转。
  }

  const scriptMatch = String(html).match(
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i
  );
  return absoluteHttpUrl(scriptMatch?.[1], baseUrl);
}

function targetFromResponse(document, response, referUrl) {
  const finalUrl = absoluteHttpUrl(
    response?.finalUrl || response?.responseURL,
    referUrl
  );
  if (finalUrl && finalUrl !== referUrl && !isHdblogReferUrl(finalUrl, referUrl)) {
    return finalUrl;
  }

  const location = responseHeadersMap(response?.responseHeaders).get('location');
  const locationUrl = absoluteHttpUrl(location, referUrl);
  if (locationUrl && !isHdblogReferUrl(locationUrl, referUrl)) return locationUrl;

  const html = String(response?.responseText ?? response?.response ?? '');
  const htmlTarget = htmlRedirectTarget(document, html, referUrl);
  return htmlTarget && !isHdblogReferUrl(htmlTarget, referUrl) ? htmlTarget : '';
}

function requestReferTarget(document, referUrl, gmRequest, referer) {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }

    gmRequest({
      method: 'GET',
      url: referUrl,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
      onload(response) {
        if (response.status >= 400 || response.status === 0) {
          reject(new Error(`hdblog refer 请求失败（HTTP ${response.status || 0}）`));
          return;
        }
        const target = targetFromResponse(document, response, referUrl);
        if (!target) {
          reject(new Error('hdblog refer 没有返回可识别的跳转地址'));
          return;
        }
        resolve(target);
      },
      onerror: () => reject(new Error('hdblog refer 请求发生网络错误')),
      ontimeout: () => reject(new Error('hdblog refer 请求超时')),
    });
  });
}

export function resolveHdblogReferUrl(
  document,
  referUrl,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  const absoluteReferUrl = absoluteHttpUrl(referUrl, document?.baseURI || 'https://hdblog.me/');
  if (!absoluteReferUrl || !isHdblogReferUrl(absoluteReferUrl, document?.baseURI)) {
    return Promise.resolve('');
  }
  if (resolutionCache.has(absoluteReferUrl)) return resolutionCache.get(absoluteReferUrl);

  const promise = requestReferTarget(
    document,
    absoluteReferUrl,
    gmRequest,
    document?.location?.href
  ).catch(() => '');
  resolutionCache.set(absoluteReferUrl, promise);
  return promise;
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

function findArticleContent(document) {
  const article = document.querySelector(
    'main#genesis-content article.entry, main#genesis-content article, article.entry, article.post, article'
  );
  if (article) {
    return article.querySelector('.entry-content, .post-content, .post-entry, .entry-body') || article;
  }
  return document.querySelector('main#genesis-content, main, #content') || document.body;
}

function previewRange(document, locationObject) {
  if (!document || !isHdblogHostname(locationObject?.hostname)) return null;
  const content = findArticleContent(document);
  if (!content) return null;
  const nodes = textNodesUnder(content);
  const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue)));
  if (!marker) return null;
  const boundary = nodes.find((node) => (
    isAfter(marker, node)
    && PREVIEW_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))
  )) || null;
  return { content, marker, boundary };
}

function inPreviewRange(range, node) {
  if (!range || !isAfter(range.marker, node)) return false;
  return !range.boundary || !isAfter(range.boundary, node);
}

export async function resolveHdblogPreviewReferLinks(
  document,
  locationObject = document?.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  const range = previewRange(document, locationObject);
  if (!range) return 0;

  const anchors = [...range.content.querySelectorAll('a[href]')]
    .filter((anchor) => inPreviewRange(range, anchor))
    .map((anchor) => ({
      anchor,
      referUrl: absoluteHttpUrl(anchor.getAttribute('href'), document.baseURI),
    }))
    .filter(({ referUrl }) => isHdblogReferUrl(referUrl, document.baseURI));

  if (!anchors.length) return 0;

  const results = await Promise.all(anchors.map(async ({ anchor, referUrl }) => {
    const target = await resolveHdblogReferUrl(document, referUrl, gmRequest);
    if (!target) return false;
    anchor.dataset.x1080xHdblogReferUrl = referUrl;
    anchor.href = target;
    return true;
  }));

  const resolved = results.filter(Boolean).length;
  if (resolved) {
    expandHdblogPreviewImages(document, locationObject);
    await expandHdblogPixhostPreviewImages(document, locationObject, gmRequest);
  }
  return resolved;
}

export function installHdblogReferResolver(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document || !isHdblogHostname(locationObject?.hostname)) return;
  const run = () => void resolveHdblogPreviewReferLinks(document, locationObject, gmRequest);
  run();
  const view = document.defaultView;
  if (!view) return;
  view.setTimeout(run, 500);
  view.setTimeout(run, 1500);
}
