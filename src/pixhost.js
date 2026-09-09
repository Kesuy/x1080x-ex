import { isHdblogImagePageHost } from './hdblog-image-hosts.js';

const PIXHOST_PAGE_HOST_PATTERN = /^(?:www\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i;
const PIXHOST_THUMB_HOST_PATTERN = /^t(\d+)\.(.+)$/i;
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;
const CANONICAL_SHOW_PATH_PATTERN = /^\/show\/\d+\/[^/?#]+$/i;
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

function isDirectImageDeliveryUrl(url) {
  return /^img\d+\./i.test(url.hostname)
    || /^\/(?:images?|thumbs?|full|raw)\//i.test(url.pathname);
}

export function isPixhostShowUrl(value, baseUrl = 'https://pixhost.to/') {
  const href = absoluteUrl(value, baseUrl);
  if (!href) return false;
  try {
    const url = new URL(href);
    if (isDirectImageDeliveryUrl(url)) return false;

    // Pixhost 及同类图床常把文件名（含 .jpg）放在 /show/ 展示页 URL 中。
    // 因此这里按路径结构识别，而不是再把图床域名写死。
    if (CANONICAL_SHOW_PATH_PATTERN.test(url.pathname)) return true;

    // 对用户在「hdblog 图床设置」里补充的主域名，允许页面路径以后变化。
    return (PIXHOST_PAGE_HOST_PATTERN.test(url.hostname) || isHdblogImagePageHost(url.hostname))
      && !/^\/(?:images?|thumbs?)\//i.test(url.pathname)
      && !IMAGE_EXTENSION_PATTERN.test(url.pathname);
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

    // 不再限制 pixhost.to / pixhost.cc。只要图床继续采用
    // tN.<domain>/thumbs -> imgN.<domain>/images 结构，就能自动跟随新域名。
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
  return href;
}

export function parsePixhostImagePage(document, html, pageUrl) {
  if (!document || !html) return '';
  const parsed = document.implementation.createHTMLDocument('image-host');
  parsed.documentElement.innerHTML = String(html);

  // 先匹配常见“主图”结构，再退回 Open Graph / Twitter 元数据。
  // img 元素本身就是图片资源，因此不要求 URL 必须以扩展名结尾，兼容 CDN 无后缀地址。
  const selectors = [
    ['img.image-img[src]', 'src'],
    ['img.image-img[data-src]', 'data-src'],
    ['img.image-img[data-original]', 'data-original'],
    ['img#image[src]', 'src'],
    ['img#image[data-src]', 'data-src'],
    ['figure img[src]', 'src'],
    ['a#image[href]', 'href'],
    ['a.image[href]', 'href'],
    ['meta[property="og:image"]', 'content'],
    ['meta[name="twitter:image"]', 'content'],
    ['link[rel="image_src"]', 'href'],
    ['main img[src]', 'src'],
    ['main img[data-src]', 'data-src'],
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
          reject(new Error(`图床页面请求失败（HTTP ${response.status || 0}）`));
          return;
        }
        resolve({
          html: String(response.responseText ?? response.response ?? ''),
          finalUrl: response.finalUrl || response.responseURL || showUrl,
        });
      },
      onerror: () => reject(new Error('图床页面请求发生网络错误')),
      ontimeout: () => reject(new Error('图床页面请求超时')),
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
    .then(({ html, finalUrl }) => parsePixhostImagePage(document, html, finalUrl || absoluteShowUrl) || fallback)
    .catch(() => fallback);
  resolutionCache.set(absoluteShowUrl, promise);
  return promise;
}
