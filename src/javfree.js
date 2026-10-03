import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';
import { copyCodeWithButtonFeedback } from './clipboard.js';

const JAVFREE_ORIGIN = 'https://javfree.me';
const REQUEST_TIMEOUT = 30000;
const HDBLOG_SECTION_ID = 'x1080x-ex-hdblog-javfree-preview';
const JAVFREE_SETTINGS_PANEL_ID = 'x1080x-ex-javfree-settings-panel';
const JAVFREE_DOWNLOAD_BUTTON_ID = 'x1080x-ex-javfree-preview-download';
const JAVFREE_AGAGHHH_SEARCH_BUTTON_ID = 'x1080x-ex-javfree-agaghhh-search';
const JAVFREE_COPY_CODE_BUTTON_ID = 'x1080x-ex-javfree-copy-code';
export const JAVFREE_PREVIEW_ATTR = 'data-x1080x-javfree-preview-url';
export const PREVIEW_REFERER_ATTR = 'data-x1080x-preview-referer';

export const AGAGHHH_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY =
  'x1080x-ex:agaghhh-javfree-preview-fallback-enabled';
export const HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY =
  'x1080x-ex:hdblog-javfree-preview-fallback-enabled';
export const HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY =
  'x1080x-ex:hdblog-deleted-javfree-search-enabled';
export const JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY =
  'x1080x-ex:javfree-search-auto-redirect-enabled';
export const JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY =
  'x1080x-ex:javfree-preview-download-enabled';
export const JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY =
  'x1080x-ex:javfree-agaghhh-search-enabled';
export const JAVFREE_COPY_CODE_ENABLED_KEY =
  'x1080x-ex:javfree-copy-code-enabled';

const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
const HDBLOG_BOUNDARY_PATTERN =
  /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;

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

function parseHtml(html, baseUrl, hostDocument = globalThis.document) {
  const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
  if (typeof Parser !== 'function') return null;
  const parsed = new Parser().parseFromString(String(html || ''), 'text/html');
  const base = parsed.createElement('base');
  base.href = baseUrl;
  (parsed.head || parsed.documentElement).prepend(base);
  return parsed;
}

function requestText(url, request = globalThis.GM_xmlhttpRequest, referer = '') {
  return new Promise((resolve, reject) => {
    if (typeof request !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }
    request({
      method: 'GET',
      url,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
      onload(response) {
        if (response.status < 200 || response.status >= 400) {
          reject(new Error('请求失败（HTTP ' + (response.status || 0) + '）'));
          return;
        }
        resolve({
          html: String(response.responseText ?? response.response ?? ''),
          finalUrl: response.finalUrl || response.responseURL || url,
        });
      },
      onerror: () => reject(new Error('网络请求失败')),
      ontimeout: () => reject(new Error('网络请求超时')),
    });
  });
}

function requestImageBlob(url, referer, request = globalThis.GM_xmlhttpRequest) {
  return new Promise((resolve, reject) => {
    if (typeof request !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }
    request({
      method: 'GET',
      url,
      responseType: 'blob',
      timeout: REQUEST_TIMEOUT,
      headers: referer ? { Referer: referer } : undefined,
      onload(response) {
        if (response.status < 200 || response.status >= 300 || !response.response) {
          reject(new Error('图片请求失败（HTTP ' + (response.status || 0) + '）'));
          return;
        }
        resolve(response.response);
      },
      onerror: () => reject(new Error('图片请求失败')),
      ontimeout: () => reject(new Error('图片请求超时')),
    });
  });
}

function readEnabled(key, fallback = true) {
  if (typeof GM_getValue !== 'function') return fallback;
  return GM_getValue(key, fallback) !== false;
}

export function isAgaghhhJavfreePreviewFallbackEnabled() {
  return readEnabled(AGAGHHH_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, true);
}

export function isHdblogJavfreePreviewFallbackEnabled() {
  return readEnabled(HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, true);
}

export function isHdblogDeletedJavfreeSearchEnabled() {
  return readEnabled(HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY, true);
}

export function isJavfreeSearchAutoRedirectEnabled() {
  return readEnabled(JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY, true);
}

export function isJavfreePreviewDownloadEnabled() {
  return readEnabled(JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY, true);
}

export function isJavfreeAgaghhhSearchEnabled() {
  return readEnabled(JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY, true);
}

export function isJavfreeCopyCodeEnabled() {
  return readEnabled(JAVFREE_COPY_CODE_ENABLED_KEY, true);
}

export function isJavfreeHost(locationObject = globalThis.location) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'javfree.me' || hostname.endsWith('.javfree.me');
}

function isHdblogHost(locationObject = globalThis.location) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'hdblog.me' || hostname.endsWith('.hdblog.me');
}

export function extractJavfreeVideoCode(value) {
  const source = normalizeText(value).toUpperCase();
  if (!source) return '';
  const fc2 = source.match(/\bFC2[\s_-]*(PPV[\s_-]*)?(\d{5,9})\b/i);
  if (fc2) return 'FC2' + (fc2[1] ? '-PPV' : '') + '-' + fc2[2];
  const standard = source.match(
    /(?:^|[^A-Z0-9])([A-Z]{2,12})[\s_-]?(\d{2,8}[A-Z]?)(?:$|[^A-Z0-9])/i
  );
  return standard ? standard[1] + '-' + standard[2] : '';
}

function codeTokenMatches(value, code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return false;
  const normalized = normalizeText(value).toUpperCase();
  const escaped = target.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|[^A-Z0-9])' + escaped + '(?:$|[^A-Z0-9])', 'i').test(normalized);
}

export function javfreeSearchUrl(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized ? JAVFREE_ORIGIN + '/search/' + encodeURIComponent(normalized) : '';
}

function isJavfreeArticleUrl(value, baseUrl = JAVFREE_ORIGIN) {
  const href = absoluteHttpUrl(value, baseUrl);
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.origin === JAVFREE_ORIGIN && /^\/\d+\/[^/?#]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function collectJavfreeSearchResults(document) {
  if (!document) return [];
  let anchors = [...document.querySelectorAll(
    'main#main article .entry-title a[href], main.site-main article .entry-title a[href]'
  )];
  if (!anchors.length) anchors = [...document.querySelectorAll('article .entry-title a[href]')];
  const seen = new Set();
  return anchors.map((anchor) => {
    const url = absoluteHttpUrl(anchor.getAttribute('href'), document.baseURI || JAVFREE_ORIGIN);
    if (!isJavfreeArticleUrl(url) || seen.has(url)) return null;
    seen.add(url);
    return { title: normalizeText(anchor.textContent), url };
  }).filter(Boolean);
}

export function chooseJavfreeSearchResult(candidates, code = '') {
  const unique = [...new Map(
    (candidates || []).filter(Boolean).map((candidate) => [candidate.url, candidate])
  ).values()];
  if (unique.length === 1) return unique[0];

  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) return null;
  const slug = normalizedCode.toLowerCase();

  const slugMatches = unique.filter((candidate) => {
    try {
      return new URL(candidate.url).pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() === slug;
    } catch {
      return false;
    }
  });
  if (slugMatches.length === 1) return slugMatches[0];

  const titleMatches = unique.filter((candidate) => codeTokenMatches(candidate.title, normalizedCode));
  return titleMatches.length === 1 ? titleMatches[0] : null;
}

function imageUrlFromElement(document, image) {
  const candidates = [
    image?.getAttribute('data-original'),
    image?.getAttribute('data-lazy-src'),
    image?.getAttribute('data-src'),
    image?.currentSrc,
    image?.getAttribute('src'),
  ];
  for (const candidate of candidates) {
    const url = absoluteHttpUrl(candidate, document.baseURI || JAVFREE_ORIGIN);
    if (url) return url;
  }
  return '';
}

function filenameOf(value) {
  try {
    return decodeURIComponent(new URL(value).pathname.split('/').pop() || '').toUpperCase();
  } catch {
    return '';
  }
}

function imageMatchesCode(url, code) {
  const compactCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const compactFilename = filenameOf(url).replace(/[^A-Z0-9]/g, '');
  return compactCode && compactFilename.includes(compactCode);
}

export function collectJavfreeArticleImages(document, code = '') {
  const content = document?.querySelector(
    'main#main article .entry-content, main.site-main article .entry-content, article .entry-content, .entry-content'
  );
  if (!content) return { coverUrl: '', previewUrl: '', imageUrls: [] };

  const all = [...content.querySelectorAll('img')]
    .map((image) => imageUrlFromElement(document, image))
    .filter(Boolean);
  const matching = code ? all.filter((url) => imageMatchesCode(url, code)) : [];
  const imageUrls = matching.length >= 2 ? matching : all;
  if (!imageUrls.length) return { coverUrl: '', previewUrl: '', imageUrls: [] };

  const coverUrl = imageUrls[0] || '';
  const preferred = imageUrls.find((url, index) => (
    index > 0
    && /(?:^|[-_])(?:1080p|2160p|4k(?:\d{2,3}fps)?|preview|sample)(?:[-_.]|$)/i.test(filenameOf(url))
  ));
  return {
    coverUrl,
    previewUrl: preferred || imageUrls[1] || '',
    imageUrls,
  };
}

function javfreeCodeFromDocument(document, locationObject = document?.location) {
  const title = document?.querySelector(
    'main#main article h1.entry-title, article h1.entry-title, h1.entry-title'
  )?.textContent || document?.title || '';
  const fromTitle = extractJavfreeVideoCode(title);
  if (fromTitle) return fromTitle;
  try {
    const slug = new URL(locationObject?.href || document?.baseURI || JAVFREE_ORIGIN)
      .pathname.split('/').filter(Boolean).at(-1) || '';
    return extractJavfreeVideoCode(slug);
  } catch {
    return '';
  }
}

export function buildJavfreeAgaghhhSearchUrl(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return '';
  return 'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt='
    + encodeURIComponent(normalized)
    + '&orderby=lastpost&ascdesc=desc';
}

function openJavfreeAgaghhhSearch(document, code) {
  const url = buildJavfreeAgaghhhSearchUrl(code);
  if (!url) return false;
  if (typeof GM_openInTab === 'function') {
    try {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
      return true;
    } catch (error) {
      console.warn('[x1080x-ex] JavFree agaghhh search GM_openInTab failed', {
        url,
        error: error?.message || String(error),
      });
    }
  }
  return Boolean(document.defaultView?.open?.(url, '_blank'));
}

function styleJavfreeActionButton(button) {
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle',
    margin: '0 0 4px 8px',
    padding: '5px 8px',
    minWidth: '34px',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => {
    if (!button.disabled) button.style.background = '#246eaf';
  });
  button.addEventListener('mouseleave', () => {
    if (!button.disabled) button.style.background = '#398bd4';
  });
}

function installJavfreeAgaghhhSearchButton(document, locationObject) {
  if (!isJavfreeAgaghhhSearchEnabled()
    || document.getElementById(JAVFREE_AGAGHHH_SEARCH_BUTTON_ID)) {
    return null;
  }
  let url;
  try {
    url = new URL(locationObject?.href || document.baseURI);
  } catch {
    return null;
  }
  if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return null;

  const title = document.querySelector(
    'main#main article h1.entry-title, article h1.entry-title, h1.entry-title'
  );
  const code = javfreeCodeFromDocument(document, locationObject);
  if (!title || !code) return null;

  const button = document.createElement('button');
  button.id = JAVFREE_AGAGHHH_SEARCH_BUTTON_ID;
  button.type = 'button';
  button.textContent = '🔍';
  button.title = '按当前番号在 agaghhh.cc 搜索';
  button.setAttribute('aria-label', '在 agaghhh.cc 搜索当前番号');
  styleJavfreeActionButton(button);
  button.addEventListener('click', () => {
    openJavfreeAgaghhhSearch(document, javfreeCodeFromDocument(document, locationObject));
  });
  title.append(button);
  return button;
}

function installJavfreeCopyCodeButton(document, locationObject) {
  if (!isJavfreeCopyCodeEnabled()
    || document.getElementById(JAVFREE_COPY_CODE_BUTTON_ID)) {
    return null;
  }
  let url;
  try {
    url = new URL(locationObject?.href || document.baseURI);
  } catch {
    return null;
  }
  if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return null;

  const title = document.querySelector(
    'main#main article h1.entry-title, article h1.entry-title, h1.entry-title'
  );
  const code = javfreeCodeFromDocument(document, locationObject);
  if (!title || !code) return null;

  const button = document.createElement('button');
  button.id = JAVFREE_COPY_CODE_BUTTON_ID;
  button.type = 'button';
  button.textContent = '📋';
  button.title = '复制当前番号到剪切板';
  button.setAttribute('aria-label', '复制当前番号到剪切板');
  styleJavfreeActionButton(button);
  button.addEventListener('click', () => {
    void copyCodeWithButtonFeedback(
      button,
      document,
      javfreeCodeFromDocument(document, locationObject)
    );
  });
  title.append(button);
  return button;
}

export async function fetchJavfreePreviewForCode(
  code,
  request = globalThis.GM_xmlhttpRequest,
  hostDocument = globalThis.document
) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const empty = {
    code: normalizedCode,
    sourceName: 'JavFree',
    sourceUrl: '',
    articleUrl: '',
    referer: '',
    imageUrls: [],
  };
  if (!normalizedCode) return empty;

  const searchUrl = javfreeSearchUrl(normalizedCode);
  const search = await requestText(searchUrl, request, JAVFREE_ORIGIN + '/');
  let articleUrl = '';
  let articleHtml = '';
  let articleFinalUrl = '';

  if (isJavfreeArticleUrl(search.finalUrl, JAVFREE_ORIGIN)) {
    articleUrl = search.finalUrl;
    articleHtml = search.html;
    articleFinalUrl = search.finalUrl;
  } else {
    const searchDocument = parseHtml(search.html, search.finalUrl || searchUrl, hostDocument);
    const selected = chooseJavfreeSearchResult(
      collectJavfreeSearchResults(searchDocument),
      normalizedCode
    );
    if (!selected) return { ...empty, sourceUrl: searchUrl };
    articleUrl = selected.url;
    const article = await requestText(articleUrl, request, searchUrl);
    articleHtml = article.html;
    articleFinalUrl = article.finalUrl || articleUrl;
  }

  const articleDocument = parseHtml(articleHtml, articleFinalUrl || articleUrl, hostDocument);
  const images = collectJavfreeArticleImages(articleDocument, normalizedCode);
  return {
    code: normalizedCode,
    sourceName: 'JavFree',
    sourceUrl: articleUrl,
    articleUrl,
    referer: articleUrl,
    coverUrl: images.coverUrl,
    imageUrls: images.previewUrl ? [images.previewUrl] : [],
  };
}

export function javfreeUniqueSearchTarget(document, locationObject = document?.location) {
  if (!document || !isJavfreeHost(locationObject)) return '';
  let url;
  try {
    url = new URL(locationObject?.href || document.baseURI);
  } catch {
    return '';
  }
  if (!/^\/search(?:\/|$)/i.test(url.pathname)) return '';
  const results = collectJavfreeSearchResults(document);
  return results.length === 1 ? results[0].url : '';
}

function extensionFromBlob(blob, url) {
  const type = String(blob?.type || '').toLowerCase();
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('avif')) return 'avif';
  try {
    const match = new URL(url).pathname.match(/\.((?:jpe?g|png|webp|gif|avif))$/i);
    return match?.[1]?.toLowerCase().replace('jpeg', 'jpg') || 'jpg';
  } catch {
    return 'jpg';
  }
}

function saveBlob(document, blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.hidden = true;
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    document.defaultView?.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

async function downloadJavfreePreview(button, document, locationObject, request) {
  const code = javfreeCodeFromDocument(document, locationObject);
  const previewUrl = collectJavfreeArticleImages(document, code).previewUrl;
  if (!code || !previewUrl) return;

  button.disabled = true;
  button.textContent = '下载中…';
  try {
    const blob = await requestImageBlob(previewUrl, locationObject?.href || document.baseURI, request);
    saveBlob(document, blob, code + '.' + extensionFromBlob(blob, previewUrl));
    button.textContent = '✓';
  } catch (error) {
    button.textContent = '失败';
    button.title = error?.message || 'Preview 下载失败';
  } finally {
    document.defaultView?.setTimeout(() => {
      button.disabled = false;
      button.textContent = '⬇';
      button.title = '下载 JavFree Preview，并按番号命名';
    }, 2500);
  }
}

function installJavfreePreviewDownloadButton(document, locationObject, request) {
  if (!isJavfreePreviewDownloadEnabled() || document.getElementById(JAVFREE_DOWNLOAD_BUTTON_ID)) {
    return null;
  }
  let url;
  try {
    url = new URL(locationObject?.href || document.baseURI);
  } catch {
    return null;
  }
  if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return null;

  const title = document.querySelector('main#main article h1.entry-title, article h1.entry-title, h1.entry-title');
  const code = javfreeCodeFromDocument(document, locationObject);
  const previewUrl = collectJavfreeArticleImages(document, code).previewUrl;
  if (!title || !code || !previewUrl) return null;

  const button = document.createElement('button');
  button.id = JAVFREE_DOWNLOAD_BUTTON_ID;
  button.type = 'button';
  button.textContent = '⬇';
  button.title = '下载 JavFree Preview，并按番号命名';
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle',
    margin: '0 0 4px 8px',
    padding: '5px 8px',
    minWidth: '34px',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    lineHeight: '20px',
  });
  button.addEventListener('click', () => void downloadJavfreePreview(
    button,
    document,
    locationObject,
    request
  ));
  title.append(button);
  return button;
}

function closeJavfreeSettingsPanel(document) {
  document?.getElementById(JAVFREE_SETTINGS_PANEL_ID)?.remove();
}

export function openJavfreeSettingsPanel(document = globalThis.document) {
  if (!document?.body) return null;
  closeJavfreeSettingsPanel(document);

  const overlay = document.createElement('div');
  overlay.id = JAVFREE_SETTINGS_PANEL_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'rgba(0,0,0,.42)',
    boxSizing: 'border-box',
  });

  const form = document.createElement('form');
  Object.assign(form.style, {
    width: 'min(480px, 100%)',
    padding: '22px',
    borderRadius: '10px',
    background: '#fff',
    color: '#222',
    boxShadow: '0 18px 60px rgba(0,0,0,.28)',
    boxSizing: 'border-box',
    font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  form.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">JavFree 设置</h2>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
      <input data-setting="search-auto-redirect" type="checkbox" style="margin-top:3px">
      <span><strong>搜索单结果自动跳转</strong><small style="display:block;margin-top:2px;color:#666">搜索页只有 1 个唯一文章结果时自动进入详情页。</small></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
      <input data-setting="agaghhh-search" type="checkbox" style="margin-top:3px">
      <span><strong>agaghhh.cc 搜索按钮（🔍）</strong><small style="display:block;margin-top:2px;color:#666">详情页识别当前番号，并在 agaghhh.cc 论坛中搜索。</small></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
      <input data-setting="copy-code" type="checkbox" style="margin-top:3px">
      <span><strong>复制番号按钮（📋）</strong><small style="display:block;margin-top:2px;color:#666">详情页标题旁显示复制按钮，行为与 HDblog 一致。</small></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:9px">
      <input data-setting="preview-download" type="checkbox" style="margin-top:3px">
      <span><strong>Preview 下载按钮</strong><small style="display:block;margin-top:2px;color:#666">详情页标题旁显示下载按钮，只下载封面后的 Preview，并按番号命名。</small></span>
    </label>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
      <button type="button" data-action="cancel" style="padding:7px 14px">取消</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">保存</button>
    </div>`;

  const redirectInput = form.querySelector('[data-setting="search-auto-redirect"]');
  const agaghhhSearchInput = form.querySelector('[data-setting="agaghhh-search"]');
  const copyCodeInput = form.querySelector('[data-setting="copy-code"]');
  const downloadInput = form.querySelector('[data-setting="preview-download"]');
  redirectInput.checked = isJavfreeSearchAutoRedirectEnabled();
  agaghhhSearchInput.checked = isJavfreeAgaghhhSearchEnabled();
  copyCodeInput.checked = isJavfreeCopyCodeEnabled();
  downloadInput.checked = isJavfreePreviewDownloadEnabled();

  form.querySelector('[data-action="cancel"]')?.addEventListener(
    'click',
    () => closeJavfreeSettingsPanel(document)
  );
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeJavfreeSettingsPanel(document);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (typeof GM_setValue === 'function') {
      GM_setValue(JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY, redirectInput.checked);
      GM_setValue(JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY, agaghhhSearchInput.checked);
      GM_setValue(JAVFREE_COPY_CODE_ENABLED_KEY, copyCodeInput.checked);
      GM_setValue(JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY, downloadInput.checked);
    }
    closeJavfreeSettingsPanel(document);
    document.defaultView?.location?.reload?.();
  });

  overlay.append(form);
  document.body.append(overlay);
  return overlay;
}

function registerJavfreeSettingsMenu(document, locationObject) {
  if (!isJavfreeHost(locationObject) || typeof GM_registerMenuCommand !== 'function') return;
  const view = document?.defaultView;
  if (view && view.top !== view) return;
  GM_registerMenuCommand('⚙️ JavFree 设置', () => openJavfreeSettingsPanel(document));
}

export function installJavfreeEnhancement(
  document = globalThis.document,
  locationObject = globalThis.location,
  request = globalThis.GM_xmlhttpRequest
) {
  if (!document || !isJavfreeHost(locationObject)) return null;
  registerJavfreeSettingsMenu(document, locationObject);

  if (isJavfreeSearchAutoRedirectEnabled()) {
    const target = javfreeUniqueSearchTarget(document, locationObject);
    if (target && typeof locationObject?.replace === 'function') {
      locationObject.replace(target);
      return { redirectTarget: target, button: null };
    }
  }

  const downloadButton = installJavfreePreviewDownloadButton(document, locationObject, request);
  const copyButton = installJavfreeCopyCodeButton(document, locationObject);
  const searchButton = installJavfreeAgaghhhSearchButton(document, locationObject);
  return {
    redirectTarget: '',
    searchButton,
    copyButton,
    button: downloadButton,
  };
}

function hdblogCodeFromLocation(document, locationObject) {
  // HDblog 404 页面会把标题/主标题改成 ERROR-404，因此优先从原始 URL slug
  // 提取番号；正常文章的 slug 本身也就是番号，这比错误页标题更可靠。
  try {
    const slug = new URL(locationObject?.href || document?.baseURI || '')
      .pathname.split('/').filter(Boolean).at(-1) || '';
    const slugCode = extractJavfreeVideoCode(slug);
    if (slugCode && !/^ERROR-?404$/i.test(slugCode)) return slugCode;
  } catch {
    // 再回退到页面标题。
  }

  const titleCode = extractJavfreeVideoCode(
    document?.querySelector('h1.entry-title, #genesis-content h1, h1')?.textContent || ''
  );
  return /^ERROR-?404$/i.test(titleCode) ? '' : titleCode;
}

export function isDeletedHdblogArticlePage(document, locationObject = document?.location) {
  if (!document || !isHdblogHost(locationObject)) return false;
  let url;
  try {
    url = new URL(locationObject?.href || document.baseURI);
  } catch {
    return false;
  }
  if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return false;

  const bodyClass = String(document.body?.className || '');
  const signalText = normalizeText([
    document.title,
    document.querySelector('h1, .entry-title, .page-title')?.textContent,
  ].filter(Boolean).join(' '));
  const has404Signal =
    /(?:^|\s)(?:error404|error-404|not-found)(?:\s|$)/i.test(bodyClass)
    || /(?:\berror[-\s]?404\b|\b404\b|page\s+not\s+found|not\s+found)/i.test(signalText);
  if (has404Signal) return true;

  // 某些主题/缓存会保留 article.entry / .entry-content 外壳，
  // 所以不能仅凭“存在正文容器”判断文章仍有效。
  return !document.querySelector(
    'main#genesis-content article.entry h1.entry-title, article.entry h1.entry-title'
  );
}

function openJavfreeSearchTab(document, code) {
  const url = javfreeSearchUrl(code);
  if (!url) return false;
  const key = 'x1080x-ex:hdblog-javfree-opened:' + (document?.location?.pathname || code);
  try {
    if (document.defaultView?.sessionStorage?.getItem(key) === '1') return false;
    document.defaultView?.sessionStorage?.setItem(key, '1');
  } catch {
    // sessionStorage 不可用时仍允许本次打开。
  }

  if (typeof GM_openInTab === 'function') {
    try {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
      return true;
    } catch (error) {
      console.warn('[x1080x-ex] GM_openInTab failed, fallback to window.open', {
        url,
        error: error?.message || String(error),
      });
    }
  }
  const opened = document.defaultView?.open?.(url, '_blank');
  return Boolean(opened);
}

function textNodesUnder(root) {
  const view = root?.ownerDocument?.defaultView;
  const showText = view?.NodeFilter?.SHOW_TEXT ?? 4;
  const walker = root?.ownerDocument?.createTreeWalker?.(root, showText);
  if (!walker) return [];
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

function hdblogPreviewRange(document) {
  const content = document?.querySelector(
    'main#genesis-content article.entry .entry-content, article.entry .entry-content, .entry-content'
  );
  if (!content) return null;
  const nodes = textNodesUnder(content);
  const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue)));
  if (!marker) return null;
  const boundary = nodes.find((node) => (
    isAfter(marker, node) && HDBLOG_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))
  )) || null;
  return { content, marker, boundary };
}

function inHdblogPreviewRange(range, node) {
  if (!range || !isAfter(range.marker, node)) return false;
  return !range.boundary || !isAfter(range.boundary, node);
}

async function hasUsableHdblogPreview(document, request) {
  const range = hdblogPreviewRange(document);
  if (!range) return false;

  if ([...range.content.querySelectorAll(
    'img[data-x1080x-preview-large="1"], img[data-x1080x-preview-expanded="1"]'
  )].some((image) => inHdblogPreviewRange(range, image))) {
    return true;
  }

  const anchors = [...range.content.querySelectorAll('a[href]')]
    .filter((anchor) => inHdblogPreviewRange(range, anchor));

  for (const anchor of anchors) {
    const href = absoluteHttpUrl(anchor.getAttribute('href'), document.baseURI);
    if (!href) continue;
    if (isPixhostShowUrl(href, document.baseURI)) {
      const thumb = imageUrlFromElement(document, anchor.querySelector('img'));
      try {
        if (await resolvePixhostShowUrl(document, href, thumb, request)) return true;
      } catch {
        // 继续尝试其他候选。
      }
      continue;
    }
    if (IMAGE_EXTENSION_PATTERN.test(href)) return true;
  }

  return [...range.content.querySelectorAll('img')]
    .filter((image) => inHdblogPreviewRange(range, image))
    .some((image) => {
      const anchor = image.closest('a[href]');
      if (anchor && isPixhostShowUrl(anchor.getAttribute('href'), document.baseURI)) return false;
      return Boolean(imageUrlFromElement(document, image));
    });
}

export function renderHdblogJavfreePreview(document, result) {
  if (!document || !result?.imageUrls?.length || document.getElementById(HDBLOG_SECTION_ID)) {
    return null;
  }
  const content = document.querySelector(
    'main#genesis-content article.entry .entry-content, article.entry .entry-content, .entry-content'
  );
  if (!content) return null;

  const url = absoluteHttpUrl(result.imageUrls[0], result.articleUrl || JAVFREE_ORIGIN);
  if (!url) return null;

  const section = document.createElement('section');
  section.id = HDBLOG_SECTION_ID;
  section.style.cssText =
    'clear:both;margin:24px 0 8px;padding:16px 0 0;border-top:1px solid #ddd';

  const heading = document.createElement('div');
  heading.style.cssText = 'margin:0 0 12px;font-size:15px;font-weight:700;color:#444';
  const source = document.createElement('a');
  source.href = result.articleUrl || result.sourceUrl || JAVFREE_ORIGIN;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = 'JavFree Preview · ' + (result.code || '');
  source.style.cssText = 'color:inherit;text-decoration:none';
  heading.append(source);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.cssText = 'display:block;clear:both;margin:14px 0;text-align:center';

  const image = document.createElement('img');
  image.src = url;
  image.alt = ((result.code || '') + ' Preview').trim();
  image.loading = 'eager';
  image.decoding = 'async';
  image.setAttribute(JAVFREE_PREVIEW_ATTR, url);
  image.setAttribute(
    PREVIEW_REFERER_ATTR,
    result.referer || result.articleUrl || JAVFREE_ORIGIN
  );
  image.style.cssText =
    'display:block;width:auto;height:auto;max-width:100%;margin:0 auto;object-fit:contain';

  anchor.append(image);
  section.append(heading, anchor);
  content.append(section);
  return section;
}

export async function installHdblogJavfreeFallback(
  document = globalThis.document,
  locationObject = globalThis.location,
  request = globalThis.GM_xmlhttpRequest
) {
  if (!document || !isHdblogHost(locationObject)) return null;
  const code = hdblogCodeFromLocation(document, locationObject);
  if (!code) return null;

  if (isDeletedHdblogArticlePage(document, locationObject)) {
    if (isHdblogDeletedJavfreeSearchEnabled()) openJavfreeSearchTab(document, code);
    return null;
  }

  if (!isHdblogJavfreePreviewFallbackEnabled()) return null;
  if (!document.querySelector(
    'main#genesis-content article.entry .entry-content, article.entry .entry-content'
  )) {
    return null;
  }

  try {
    if (await hasUsableHdblogPreview(document, request)) return null;
    return renderHdblogJavfreePreview(
      document,
      await fetchJavfreePreviewForCode(code, request, document)
    );
  } catch (error) {
    console.warn('[x1080x-ex] JavFree preview fallback failed on hdblog', {
      code,
      error: error?.message || String(error),
    });
    return null;
  }
}
