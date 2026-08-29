import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';

const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;
const PREVIEW_BOUNDARY_PATTERN = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isHdblogHost(locationObject) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'hdblog.me' || hostname.endsWith('.hdblog.me');
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

function pixhostShowHref(document, anchor) {
  const href = absoluteHttpUrl(document, anchor?.getAttribute('href'));
  return href && isPixhostShowUrl(href, document.baseURI) ? href : '';
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

function previewThumbnailUrl(document, image) {
  const candidates = [
    image?.currentSrc,
    image?.getAttribute('src'),
    image?.getAttribute('data-original'),
    image?.getAttribute('data-lazy-src'),
    image?.getAttribute('data-src'),
  ];
  for (const candidate of candidates) {
    const url = absoluteHttpUrl(document, candidate);
    if (url) return url;
  }
  return '';
}

function bestPreviewImageUrl(document, image) {
  const anchor = image.closest('a[href]');
  if (pixhostShowHref(document, anchor)) return '';

  const rawCandidates = [
    directImageHref(document, anchor),
    image.getAttribute('data-orig-file'),
    image.getAttribute('data-original'),
    image.getAttribute('data-lazy-src'),
    image.getAttribute('data-src'),
    image.currentSrc,
    image.getAttribute('src'),
  ];

  for (const candidate of rawCandidates) {
    const direct = absoluteHttpUrl(document, candidate);
    if (!direct) continue;
    const original = wordpressOriginalUrl(document, direct);
    if (original) return original;
    if (candidate === rawCandidates[0] || candidate === image.getAttribute('data-orig-file')) {
      return direct;
    }
  }

  const srcsetCandidates = [
    image.getAttribute('data-srcset'),
    image.getAttribute('data-lazy-srcset'),
    image.getAttribute('srcset'),
  ];
  for (const value of srcsetCandidates) {
    const url = largestSrcsetUrl(document, value);
    if (url) return wordpressOriginalUrl(document, url) || url;
  }

  for (const candidate of rawCandidates) {
    const url = absoluteHttpUrl(document, candidate);
    if (url) return url;
  }
  return '';
}

function textNodesUnder(root) {
  const view = root.ownerDocument.defaultView;
  const walker = root.ownerDocument.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest('script, style, noscript, textarea')) nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

function findPreviewMarker(root) {
  return textNodesUnder(root).find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue))) || null;
}

function isAfter(reference, node) {
  return Boolean(reference.compareDocumentPosition(node) & 4);
}

function findBoundary(root, marker) {
  return textNodesUnder(root).find((node) => {
    if (!isAfter(marker, node)) return false;
    const text = normalizeText(node.nodeValue);
    return text && PREVIEW_BOUNDARY_PATTERN.test(text);
  }) || null;
}

function inPreviewRange(marker, boundary, node) {
  if (!isAfter(marker, node)) return false;
  return !boundary || !isAfter(boundary, node);
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

function styleExpandedImage(image, fullUrl) {
  if (!fullUrl) return false;
  if (image.dataset.x1080xPreviewLarge === '1' && image.src === fullUrl) return false;

  image.src = fullUrl;
  [
    'srcset', 'sizes', 'width', 'height',
    'data-original', 'data-lazy-src', 'data-src', 'data-srcset', 'data-lazy-srcset',
  ].forEach((attribute) => image.removeAttribute(attribute));
  image.loading = 'eager';
  image.decoding = 'async';
  image.dataset.x1080xPreviewLarge = '1';
  image.dataset.x1080xPreviewExpanded = '1';
  image.style.setProperty('display', 'block', 'important');
  image.style.setProperty('float', 'none', 'important');
  image.style.setProperty('clear', 'both', 'important');
  image.style.setProperty('width', '100%', 'important');
  image.style.setProperty('max-width', '100%', 'important');
  image.style.setProperty('height', 'auto', 'important');
  image.style.setProperty('max-height', 'none', 'important');
  image.style.setProperty('object-fit', 'contain', 'important');
  image.style.setProperty('margin', '14px auto', 'important');

  const anchor = image.closest('a[href]');
  if (anchor) {
    anchor.href = fullUrl;
    anchor.style.setProperty('display', 'block', 'important');
    anchor.style.setProperty('float', 'none', 'important');
    anchor.style.setProperty('width', '100%', 'important');
    anchor.style.setProperty('max-width', '100%', 'important');
  }
  return true;
}

function previewRange(document, locationObject) {
  if (!document || !isHdblogHost(locationObject)) return null;
  const content = findArticleContent(document);
  if (!content) return null;
  const marker = findPreviewMarker(content);
  if (!marker) return null;
  return { content, marker, boundary: findBoundary(content, marker) };
}

export function expandHdblogPreviewImages(document, locationObject = document?.location) {
  const range = previewRange(document, locationObject);
  if (!range) return 0;
  const { content, marker, boundary } = range;
  let expanded = 0;
  const handled = new Set();

  [...content.querySelectorAll('a[href]')]
    .filter((anchor) => inPreviewRange(marker, boundary, anchor))
    .forEach((anchor) => {
      if (pixhostShowHref(document, anchor)) return;
      const fullUrl = directImageHref(document, anchor);
      if (!fullUrl) return;
      let image = anchor.querySelector('img');
      if (!image) {
        image = document.createElement('img');
        image.alt = normalizeText(anchor.textContent) || 'Preview';
        anchor.replaceChildren(image);
      }
      if (styleExpandedImage(image, wordpressOriginalUrl(document, fullUrl) || fullUrl)) {
        handled.add(image);
        expanded += 1;
      }
    });

  [...content.querySelectorAll('img')]
    .filter((image) => inPreviewRange(marker, boundary, image) && !handled.has(image))
    .forEach((image) => {
      if (styleExpandedImage(image, bestPreviewImageUrl(document, image))) expanded += 1;
    });

  return expanded;
}

export async function expandHdblogPixhostPreviewImages(
  document,
  locationObject = document?.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  const range = previewRange(document, locationObject);
  if (!range) return 0;
  const { content, marker, boundary } = range;
  const anchors = [...content.querySelectorAll('a[href]')]
    .filter((anchor) => inPreviewRange(marker, boundary, anchor))
    .map((anchor) => ({ anchor, showUrl: pixhostShowHref(document, anchor) }))
    .filter(({ showUrl }) => showUrl);

  const results = await Promise.all(anchors.map(async ({ anchor, showUrl }) => {
    let image = anchor.querySelector('img');
    const thumbnailUrl = previewThumbnailUrl(document, image);
    const fullUrl = await resolvePixhostShowUrl(document, showUrl, thumbnailUrl, gmRequest);
    if (!fullUrl) return false;
    if (!image) {
      image = document.createElement('img');
      image.alt = normalizeText(anchor.textContent) || 'Preview';
      anchor.replaceChildren(image);
    }
    return styleExpandedImage(image, fullUrl);
  }));

  return results.filter(Boolean).length;
}

export function installHdblogPreviewImages(document = globalThis.document, locationObject = globalThis.location) {
  if (!document || !isHdblogHost(locationObject)) return;
  const run = () => {
    expandHdblogPreviewImages(document, locationObject);
    void expandHdblogPixhostPreviewImages(document, locationObject);
  };
  run();
  const view = document.defaultView;
  if (!view) return;
  view.setTimeout(run, 400);
  view.setTimeout(run, 1400);
}
