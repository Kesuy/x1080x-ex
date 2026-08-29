const PIXHOST_PAGE_HOST_PATTERN = /^(?:www\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i;
const PIXHOST_THUMB_HOST_PATTERN = /^t(\d+)\.(pixhost\.(?:to|cc)|pixho\.st)$/i;
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;
const REQUEST_TIMEOUT = 30000;
const resolutionCache = new Map();

function absoluteUrl(value, baseUrl) {
  if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return '';
  try {
    const url = new URL(String(value), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function isPixhostShowUrl(value, baseUrl = 'https://pixhost.to/') {
  const href = absoluteUrl(value, baseUrl);
  if (!href) return false;
  try {
    const url = new URL(href);
    return PIXHOST_PAGE_HOST_PATTERN.test(url.hostname)
      && /^\/show\/\d+\/\d+_[^/?#]+$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function derivePixhostImageUrlFromThumbnail(value, baseUrl = 'https://pixhost.to/') {
  const href = absoluteUrl(value, baseUrl);
  if (!href) return '';
  try {
    const url = new URL(href);
    const hostMatch = url.hostname.match(PIXHOST_THUMB_HOST_PATTERN);
    if (!hostMatch || !/^\/thumbs\//i.test(url.pathname)) return '';
    url.hostname = `img${hostMatch[1]}.${hostMatch[2]}`;
    url.pathname = url.pathname.replace(/^\/thumbs\//i, '/images/');
    return url.href;
  } catch {
    return '';
  }
}

function candidateUrl(value, pageUrl) {
  const href = absoluteUrl(value, pageUrl);
  if (!href || isPixhostShowUrl(href, pageUrl)) return '';
  try {
    const url = new URL(href);
    return IMAGE_EXTENSION_PATTERN.test(url.pathname) ? href : '';
  } catch {
    return '';
  }
}

export function parsePixhostImagePage(document, html, pageUrl) {
  if (!document || !html) return '';
  const parsed = document.implementation.createHTMLDocument('pixhost');
  parsed.documentElement.innerHTML = String(html);

  const selectors = [
    ['img.image-img[src]', 'src'],
    ['img.image-img[data-src]', 'data-src'],
    ['meta[property="og:image"]', 'content'],
    ['meta[name="twitter:image"]', 'content'],
    ['link[rel="image_src"]', 'href'],
    ['main img[src]', 'src'],
  ];
  for (const [selector, attribute] of selectors) {
    const value = parsed.querySelector(selector)?.getAttribute(attribute);
    const url = candidateUrl(value, pageUrl);
    if (url) return url;
  }

  const raw = String(html).match(/<img\b(?=[^>]*\bclass=["'][^"']*\bimage-img\b[^"']*["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
  return candidateUrl(raw, pageUrl);
}

function requestPixhostPage(showUrl, gmRequest, referer) {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }
    gmRequest({
      method: 'GET',
      url: showUrl,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
      onload(response) {
        if (response.status < 200 || response.status >= 300) {
          reject(new Error(`Pixhost 页面请求失败（HTTP ${response.status || 0}）`));
          return;
        }
        resolve(String(response.responseText ?? response.response ?? ''));
      },
      onerror: () => reject(new Error('Pixhost 页面请求发生网络错误')),
      ontimeout: () => reject(new Error('Pixhost 页面请求超时')),
    });
  });
}

export function resolvePixhostShowUrl(
  document,
  showUrl,
  thumbnailUrl = '',
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  const absoluteShowUrl = absoluteUrl(showUrl, document?.baseURI || 'https://pixhost.to/');
  if (!absoluteShowUrl || !isPixhostShowUrl(absoluteShowUrl, document?.baseURI)) {
    return Promise.resolve('');
  }
  if (resolutionCache.has(absoluteShowUrl)) return resolutionCache.get(absoluteShowUrl);

  const fallback = derivePixhostImageUrlFromThumbnail(thumbnailUrl, document?.baseURI || absoluteShowUrl);
  const promise = requestPixhostPage(absoluteShowUrl, gmRequest, document?.location?.href)
    .then((html) => parsePixhostImagePage(document, html, absoluteShowUrl) || fallback)
    .catch(() => fallback);
  resolutionCache.set(absoluteShowUrl, promise);
  return promise;
}
