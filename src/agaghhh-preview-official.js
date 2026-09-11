const AV_WIKI_ORIGIN = 'https://av-wiki.net';
const FANZA_IMAGE_ORIGIN = 'https://pics.dmm.co.jp';
const FANZA_REFERER = 'https://www.dmm.co.jp/';
const MGS_ORIGIN = 'https://www.mgstage.com';
const REQUEST_TIMEOUT = 30000;
const MAX_PREVIEW_IMAGES = 20;

export const AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY = 'x1080x-ex:agaghhh-official-preview-fallback-enabled';

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

function gmRequest(details, request = globalThis.GM_xmlhttpRequest) {
  return new Promise((resolve, reject) => {
    if (typeof request !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }
    request({
      timeout: REQUEST_TIMEOUT,
      ...details,
      onload: resolve,
      onerror: () => reject(new Error('网络请求失败')),
      ontimeout: () => reject(new Error('网络请求超时')),
    });
  });
}

async function requestText(url, request, options = {}) {
  const response = await gmRequest({
    method: 'GET',
    url,
    responseType: 'text',
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      ...(options.referer ? { Referer: options.referer } : {}),
      ...(options.headers || {}),
    },
    ...(options.cookie ? { cookie: options.cookie } : {}),
  }, request);
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`请求失败（HTTP ${response.status || 0}）`);
  }
  return {
    html: String(response.responseText ?? response.response ?? ''),
    finalUrl: response.finalUrl || response.responseURL || url,
  };
}

async function urlExists(url, request, referer = '') {
  try {
    const response = await gmRequest({
      method: 'HEAD',
      url,
      responseType: 'text',
      headers: referer ? { Referer: referer } : undefined,
    }, request);
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
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

function codeTokenMatches(text, code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return false;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, 'i')
    .test(normalizeText(text).toUpperCase());
}

function findAvWikiResultUrl(document, code) {
  if (!document || !code) return '';
  const exactPath = `/${String(code).toLowerCase()}/`;
  const anchors = [...document.querySelectorAll('a[href]')];
  for (const anchor of anchors) {
    const url = absoluteHttpUrl(anchor.getAttribute('href'), AV_WIKI_ORIGIN);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.origin === AV_WIKI_ORIGIN && parsed.pathname.toLowerCase() === exactPath) return parsed.href;
    } catch {
      // Ignore malformed links.
    }
  }
  for (const anchor of anchors) {
    const article = anchor.closest('article');
    if (!codeTokenMatches(article?.textContent || anchor.textContent, code)) continue;
    const url = absoluteHttpUrl(anchor.getAttribute('href'), AV_WIKI_ORIGIN);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.origin === AV_WIKI_ORIGIN && parsed.pathname !== '/') return parsed.href;
    } catch {
      // Ignore malformed links.
    }
  }
  return '';
}

function cleanProviderId(value) {
  return normalizeText(value)
    .replace(/^(?:MGS|FANZA)\s*品番\s*[:：]?\s*/i, '')
    .split(/\s+/, 1)[0]
    .replace(/[，,;；]+$/u, '')
    .trim();
}

function labeledValue(document, labelPattern) {
  if (!document) return '';
  for (const row of document.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
    if (cells.length < 2) continue;
    if (labelPattern.test(normalizeText(cells[0].textContent))) {
      return cleanProviderId(cells[1].textContent);
    }
  }
  for (const term of document.querySelectorAll('dt')) {
    if (!labelPattern.test(normalizeText(term.textContent))) continue;
    return cleanProviderId(term.nextElementSibling?.textContent || '');
  }
  const lines = String(document.body?.innerText || document.body?.textContent || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!labelPattern.test(lines[index])) continue;
    const inline = lines[index].replace(labelPattern, '').replace(/^\s*[:：]\s*/, '');
    if (inline) return cleanProviderId(inline);
    return cleanProviderId(lines[index + 1] || '');
  }
  return '';
}

export function parseAvWikiProviderIds(document) {
  return {
    fanzaId: labeledValue(document, /^FANZA\s*品番\s*[:：]?/i),
    mgsId: labeledValue(document, /^MGS\s*品番\s*[:：]?/i),
  };
}

async function fetchAvWikiProductInfo(code, request, hostDocument) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) return { code: '', detailUrl: '', fanzaId: '', mgsId: '' };
  const searchUrl = `${AV_WIKI_ORIGIN}/?s=${encodeURIComponent(normalizedCode)}`;
  const search = await requestText(searchUrl, request, { referer: `${AV_WIKI_ORIGIN}/` });
  const searchDocument = parseHtml(search.html, search.finalUrl || searchUrl, hostDocument);
  const detailUrl = findAvWikiResultUrl(searchDocument, normalizedCode)
    || `${AV_WIKI_ORIGIN}/${normalizedCode.toLowerCase()}/`;
  const detail = await requestText(detailUrl, request, { referer: searchUrl });
  const detailDocument = parseHtml(detail.html, detail.finalUrl || detailUrl, hostDocument);
  return {
    code: normalizedCode,
    detailUrl,
    ...parseAvWikiProviderIds(detailDocument),
  };
}

export function fanzaPreviewUrl(fanzaId, index, large = true) {
  const id = String(fanzaId || '').trim();
  if (!id || !Number.isInteger(index) || index < 1) return '';
  const suffix = large ? `jp-${index}.jpg` : `-${index}.jpg`;
  return `${FANZA_IMAGE_ORIGIN}/digital/video/${encodeURIComponent(id)}/${encodeURIComponent(id)}${suffix}`;
}

export async function fetchFanzaPreviewImages(
  fanzaId,
  request = globalThis.GM_xmlhttpRequest
) {
  const id = String(fanzaId || '').trim();
  if (!id) return [];
  const urls = [];
  let consecutiveMisses = 0;
  for (let index = 1; index <= MAX_PREVIEW_IMAGES; index += 1) {
    const thumbnail = fanzaPreviewUrl(id, index, false);
    const exists = await urlExists(thumbnail, request, FANZA_REFERER);
    if (exists) {
      urls.push(fanzaPreviewUrl(id, index, true));
      consecutiveMisses = 0;
      continue;
    }
    consecutiveMisses += 1;
    if (urls.length && consecutiveMisses >= 2) break;
    if (!urls.length && index >= 4) break;
  }
  return urls;
}

export function parseMgsPreviewImages(document, baseUrl) {
  if (!document) return [];
  const seen = new Set();
  return [...document.querySelectorAll('a.sample_image[href], .sample_image[href]')]
    .map((element) => absoluteHttpUrl(element.getAttribute('href'), baseUrl))
    .filter((url) => url && !seen.has(url) && seen.add(url));
}

export async function fetchMgsPreviewImages(
  mgsId,
  request = globalThis.GM_xmlhttpRequest,
  hostDocument = globalThis.document
) {
  const id = String(mgsId || '').trim();
  if (!id) return { productUrl: '', imageUrls: [] };
  const productUrl = `${MGS_ORIGIN}/product/product_detail/${encodeURIComponent(id)}/`;
  const response = await requestText(productUrl, request, {
    referer: `${MGS_ORIGIN}/`,
    cookie: 'adc=1; coc=1',
    headers: { 'Accept-Language': 'ja-JP' },
  });
  const document = parseHtml(response.html, response.finalUrl || productUrl, hostDocument);
  return {
    productUrl,
    imageUrls: parseMgsPreviewImages(document, response.finalUrl || productUrl),
  };
}

export function isOfficialPreviewFallbackEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY, true) !== false;
}

export async function fetchOfficialPreviewFallbackForCode(
  code,
  request = globalThis.GM_xmlhttpRequest,
  hostDocument = globalThis.document
) {
  const info = await fetchAvWikiProductInfo(code, request, hostDocument);
  if (!info.code) return { code: '', sourceName: '', sourceUrl: '', referer: '', imageUrls: [] };

  if (info.fanzaId) {
    try {
      const imageUrls = await fetchFanzaPreviewImages(info.fanzaId, request);
      if (imageUrls.length) {
        return {
          code: info.code,
          sourceName: 'FANZA',
          sourceUrl: info.detailUrl,
          referer: FANZA_REFERER,
          imageUrls,
        };
      }
    } catch (error) {
      console.warn('[x1080x-ex] FANZA preview fallback failed', {
        code: info.code,
        error: error?.message || String(error),
      });
    }
  }

  if (info.mgsId) {
    try {
      const mgs = await fetchMgsPreviewImages(info.mgsId, request, hostDocument);
      if (mgs.imageUrls.length) {
        return {
          code: info.code,
          sourceName: 'MGStage',
          sourceUrl: mgs.productUrl || info.detailUrl,
          referer: mgs.productUrl || `${MGS_ORIGIN}/`,
          imageUrls: mgs.imageUrls,
        };
      }
    } catch (error) {
      console.warn('[x1080x-ex] MGStage preview fallback failed', {
        code: info.code,
        error: error?.message || String(error),
      });
    }
  }

  return {
    code: info.code,
    sourceName: '',
    sourceUrl: info.detailUrl,
    referer: '',
    imageUrls: [],
  };
}

function isAgaghhhHost(locationObject) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'agaghhh.cc' || hostname.endsWith('.agaghhh.cc');
}

export function injectOfficialPreviewFallbackSetting(document = globalThis.document) {
  const overlay = document?.getElementById('x1080x-ex-settings-panel');
  const form = overlay?.querySelector('form');
  const master = form?.querySelector('[data-setting="hdblog-preview"]');
  if (!form || !master) return false;

  const masterLabel = master.closest('label');
  const strong = masterLabel?.querySelector('strong');
  const small = masterLabel?.querySelector('small');
  if (strong) strong.textContent = '显示大预览图';
  if (small) small.textContent = '优先按番号搜索 hdblog；hdblog 没有匹配大图时，可继续使用官方后备源。';

  let input = form.querySelector('[data-setting="official-preview-fallback"]');
  if (!input) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:flex-start;gap:9px;margin:-3px 0 13px 24px';
    label.innerHTML = `
      <input data-setting="official-preview-fallback" type="checkbox" style="margin-top:3px">
      <span><strong>官方后备预览图（FANZA / MGStage）</strong><small style="display:block;margin-top:2px;color:#666">仅在 hdblog 没找到 Preview 时启用，顺序为 FANZA 官方图片 CDN → MGStage 官方商品页。</small></span>`;
    masterLabel?.after(label);
    input = label.querySelector('[data-setting="official-preview-fallback"]');
  }
  input.checked = isOfficialPreviewFallbackEnabled();

  const syncDisabled = () => { input.disabled = !master.checked; };
  syncDisabled();
  if (master.dataset.x1080xOfficialFallbackBound !== '1') {
    master.dataset.x1080xOfficialFallbackBound = '1';
    master.addEventListener('change', syncDisabled);
  }
  if (form.dataset.x1080xOfficialFallbackBound !== '1') {
    form.dataset.x1080xOfficialFallbackBound = '1';
    form.addEventListener('submit', () => {
      if (typeof GM_setValue === 'function') {
        GM_setValue(AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY, input.checked);
      }
    }, true);
  }
  return true;
}

export function installOfficialPreviewFallbackSetting(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!document || !isAgaghhhHost(locationObject)) return null;
  if (injectOfficialPreviewFallbackSetting(document)) return null;
  const Observer = document.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof Observer !== 'function' || !document.body) return null;
  const observer = new Observer(() => injectOfficialPreviewFallbackSetting(document));
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
