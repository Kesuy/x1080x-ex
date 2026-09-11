import { parseThreadTitle } from './core.js';
import { openHdblogSettingsPanel } from './hdblog-article.js';

export const AGAGHHH_ENHANCEMENT_ENABLED_KEY = 'x1080x-ex:agaghhh-enhancement-enabled';

const SETTINGS_PANEL_ID = 'x1080x-ex-hdblog-settings-panel';
const DOWNLOAD_BUTTON_ID = 'x1080x-ex-download';
const BATCH_BUTTON_ID = 'x1080x-ex-open-page';
const BATCH_TOOLBAR_ID = 'x1080x-ex-open-page-toolbar';
const AV_WIKI_ORIGIN = 'https://av-wiki.net';
const AV_WIKI_TIMEOUT = 20000;
const REAL_ACTRESS_BOUND_ATTR = 'data-x1080x-real-actress-bound';
const REAL_ACTRESS_BYPASS_ATTR = 'data-x1080x-real-actress-bypass';
const AGAGHHH_SETTINGS_FIELD_ATTR = 'data-x1080x-agaghhh-settings-field';
const LEGACY_HDBLOG_MENU_TITLE = '⚙️ hdblog 设置';
let restoreMenuRegistration = null;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isAgaghhhHost(locationObject = globalThis.location) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'agaghhh.cc' || hostname.endsWith('.agaghhh.cc');
}

function isHdblogHost(locationObject = globalThis.location) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'hdblog.me' || hostname.endsWith('.hdblog.me');
}

export function isAgaghhhEnhancementEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(AGAGHHH_ENHANCEMENT_ENABLED_KEY, true) !== false;
}

function firstPostContent(document) {
  const firstPost = [...document.querySelectorAll('#postlist [id^="post_"]')]
    .find((element) => /^post_\d+$/i.test(element.id))
    || document.querySelector('#postlist > div, #postlist');
  return firstPost?.querySelector('[id^="postmessage_"], .t_f') || firstPost || null;
}

export function extractThreadPerformerField(document) {
  const content = firstPostContent(document);
  if (!content) return { found: false, value: '' };

  const raw = String(content.innerText || content.textContent || '').replace(/\r/g, '');
  const lines = raw.split('\n').map((line) => line.trim());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(?:出演者|演员|演員)\s*[:：]\s*(.*)$/i);
    if (!match) continue;
    const inlineValue = normalizeText(match[1]);
    if (inlineValue) return { found: true, value: inlineValue };

    const nextLine = normalizeText(lines[index + 1] || '');
    if (nextLine && !/^[^:：]{1,12}\s*[:：]/u.test(nextLine)) {
      return { found: true, value: nextLine };
    }
    return { found: true, value: '' };
  }

  const flattened = normalizeText(raw);
  const inline = flattened.match(/(?:^|\s)(?:出演者|演员|演員)\s*[:：]\s*([^:：]{1,80}?)(?=\s+[\p{L}\p{N}_-]{1,16}\s*[:：]|$)/iu);
  if (inline) return { found: true, value: normalizeText(inline[1]) };
  return { found: false, value: '' };
}

function nodeActressText(node) {
  if (!node) return '';
  const anchors = [...node.querySelectorAll?.('a') || []]
    .map((anchor) => normalizeText(anchor.textContent))
    .filter(Boolean)
    .filter((text) => !/^(?:FANZA|ソクミル|DUGA|続きを読む)$/i.test(text));
  if (anchors.length) return [...new Set(anchors)].join(' ');
  return normalizeText(node.textContent)
    .replace(/^AV女優名\s*[:：]?\s*/i, '')
    .replace(/\s+(?:メーカー品番|FANZA品番|SOKMIL品番|DUGA品番|配信開始日)\b.*$/i, '')
    .trim();
}

function scopeForCode(document, code) {
  const upperCode = String(code || '').toUpperCase();
  const articles = [...document.querySelectorAll('article')];
  return articles.find((article) => normalizeText(article.textContent).toUpperCase().includes(upperCode))
    || document.body
    || document.documentElement;
}

export function parseAvWikiActressesFromDocument(document, code = '') {
  if (!document) return '';
  const scope = scopeForCode(document, code);
  if (!scope) return '';

  for (const row of scope.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll(':scope > th, :scope > td')];
    if (cells.length < 2) continue;
    if (/^AV女優名\s*[:：]?$/i.test(normalizeText(cells[0].textContent))) {
      return nodeActressText(cells[1]);
    }
  }

  for (const term of scope.querySelectorAll('dt')) {
    if (!/^AV女優名\s*[:：]?$/i.test(normalizeText(term.textContent))) continue;
    const value = term.nextElementSibling;
    const text = nodeActressText(value);
    if (text) return text;
  }

  const labels = [...scope.querySelectorAll('strong, b, span, div, p, li')]
    .filter((element) => /^AV女優名\s*[:：]?$/i.test(normalizeText(element.textContent)));
  for (const label of labels) {
    const candidates = [
      label.nextElementSibling,
      label.parentElement?.nextElementSibling,
      label.parentElement?.querySelector(':scope > *:not(strong):not(b):not(span)'),
    ];
    for (const candidate of candidates) {
      const text = nodeActressText(candidate);
      if (text) return text;
    }
  }

  const text = String(scope.innerText || scope.textContent || '').replace(/\r/g, '');
  const lines = text.split('\n').map((line) => normalizeText(line)).filter(Boolean);
  const labelIndex = lines.findIndex((line) => /^AV女優名\s*[:：]?$/i.test(line));
  if (labelIndex >= 0) return normalizeText(lines[labelIndex + 1] || '');
  const inline = lines.find((line) => /^AV女優名\s*[:：]/i.test(line));
  return inline ? normalizeText(inline.replace(/^AV女優名\s*[:：]\s*/i, '')) : '';
}

export function findAvWikiResultUrl(document, code) {
  if (!document || !code) return '';
  const targetCode = String(code).toUpperCase();
  const targetPath = `/${String(code).toLowerCase()}/`;
  const anchors = [...document.querySelectorAll('a[href]')];
  for (const anchor of anchors) {
    try {
      const url = new URL(anchor.getAttribute('href'), AV_WIKI_ORIGIN);
      if (url.origin !== AV_WIKI_ORIGIN) continue;
      if (url.pathname.toLowerCase() === targetPath) return url.href;
    } catch {
      // Ignore malformed links.
    }
  }
  for (const anchor of anchors) {
    const article = anchor.closest('article');
    const text = normalizeText(article?.textContent || anchor.textContent).toUpperCase();
    if (!text.includes(targetCode)) continue;
    try {
      const url = new URL(anchor.getAttribute('href'), AV_WIKI_ORIGIN);
      if (url.origin === AV_WIKI_ORIGIN && url.pathname !== '/') return url.href;
    } catch {
      // Ignore malformed links.
    }
  }
  return '';
}

function requestHtml(url, gmRequest = globalThis.GM_xmlhttpRequest) {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前油猴环境不支持 GM_xmlhttpRequest。'));
      return;
    }
    gmRequest({
      method: 'GET',
      url,
      responseType: 'text',
      timeout: AV_WIKI_TIMEOUT,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: `${AV_WIKI_ORIGIN}/`,
      },
      onload: (response) => {
        if (response.status < 200 || response.status >= 300) {
          reject(new Error(`av-wiki 请求失败（HTTP ${response.status || 0}）`));
          return;
        }
        resolve(String(response.responseText || response.response || ''));
      },
      onerror: () => reject(new Error('av-wiki 网络请求失败。')),
      ontimeout: () => reject(new Error(`av-wiki 请求超时（${AV_WIKI_TIMEOUT / 1000} 秒）。`)),
    });
  });
}

function parseHtml(html, document = globalThis.document) {
  const Parser = document?.defaultView?.DOMParser || globalThis.DOMParser;
  if (typeof Parser !== 'function') return null;
  return new Parser().parseFromString(String(html || ''), 'text/html');
}

export async function fetchRealActressFromAvWiki(code, gmRequest = globalThis.GM_xmlhttpRequest, document = globalThis.document) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) return '';

  const searchUrl = `${AV_WIKI_ORIGIN}/?s=${encodeURIComponent(normalizedCode)}`;
  const searchDocument = parseHtml(await requestHtml(searchUrl, gmRequest), document);
  if (!searchDocument) return '';

  const fromSearch = parseAvWikiActressesFromDocument(searchDocument, normalizedCode);
  if (fromSearch) return fromSearch;

  const detailUrl = findAvWikiResultUrl(searchDocument, normalizedCode)
    || `${AV_WIKI_ORIGIN}/${normalizedCode.toLowerCase()}/`;
  const detailDocument = parseHtml(await requestHtml(detailUrl, gmRequest), document);
  return parseAvWikiActressesFromDocument(detailDocument, normalizedCode);
}

export function appendActressToTitleText(titleText, actress) {
  const cleanTitle = normalizeText(titleText);
  const cleanActress = normalizeText(actress);
  if (!cleanActress || cleanTitle.includes(cleanActress)) return cleanTitle;
  return `${cleanTitle} ${cleanActress}`;
}

function threadTitleElement(document) {
  return document.querySelector('#thread_subject')
    || document.querySelector('h1.ts, .vwthd h1, h1');
}

function threadCode(document) {
  return parseThreadTitle(threadTitleElement(document)?.textContent || document.title).code;
}

function bindRealActressDownload(document, gmRequest) {
  const button = document.getElementById(DOWNLOAD_BUTTON_ID);
  if (!button || button.getAttribute(REAL_ACTRESS_BOUND_ATTR) === '1') return;
  button.setAttribute(REAL_ACTRESS_BOUND_ATTR, '1');

  button.addEventListener('click', async (event) => {
    if (button.getAttribute(REAL_ACTRESS_BYPASS_ATTR) === '1') {
      button.removeAttribute(REAL_ACTRESS_BYPASS_ATTR);
      return;
    }

    const performer = extractThreadPerformerField(document);
    if (!performer.found || performer.value) return;

    const code = threadCode(document);
    if (!code) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const idleText = button.textContent;
    button.disabled = true;
    button.textContent = '查演员…';

    let actress = '';
    try {
      actress = await fetchRealActressFromAvWiki(code, gmRequest, document);
    } catch (error) {
      console.warn('[x1080x-ex] av-wiki actress lookup failed', {
        code,
        error: error?.message || String(error),
      });
    }

    button.disabled = false;
    button.textContent = idleText;
    const title = threadTitleElement(document);
    const originalTitle = title?.textContent || '';
    if (actress && title) {
      title.textContent = appendActressToTitleText(originalTitle, actress);
      console.info('[x1080x-ex] real actress resolved', { code, actress });
    }

    button.setAttribute(REAL_ACTRESS_BYPASS_ATTR, '1');
    button.click();

    if (title && actress) title.textContent = originalTitle;
  }, true);
}

function disableAgaghhhEnhancements(document) {
  document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
  document.getElementById(BATCH_BUTTON_ID)?.remove();
  document.getElementById(BATCH_TOOLBAR_ID)?.remove();
}

function injectAgaghhhSettings(document, overlay) {
  const panel = overlay?.querySelector('form');
  if (!panel) return overlay;
  const heading = panel.querySelector('h2');
  if (heading) heading.textContent = 'x1080x 设置';
  if (panel.querySelector(`[${AGAGHHH_SETTINGS_FIELD_ATTR}]`)) return overlay;

  const section = document.createElement('div');
  section.setAttribute(AGAGHHH_SETTINGS_FIELD_ATTR, '1');
  section.style.cssText = 'margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa';
  section.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px">agaghhh.cc</div>
    <label style="display:flex;align-items:center;gap:9px">
      <input data-setting="agaghhh-enabled" type="checkbox">
      启用 agaghhh.cc 增强功能
    </label>
    <small style="display:block;margin-top:9px;color:#666">包括帖子下载、列表页后台顺序打开，以及出演者为空时从 av-wiki 获取真实演员并用于附件命名。</small>`;
  const checkbox = section.querySelector('[data-setting="agaghhh-enabled"]');
  checkbox.checked = isAgaghhhEnhancementEnabled();
  panel.insertBefore(section, heading?.nextElementSibling || panel.firstElementChild);

  panel.addEventListener('submit', () => {
    if (typeof GM_setValue === 'function') {
      GM_setValue(AGAGHHH_ENHANCEMENT_ENABLED_KEY, checkbox.checked);
    }
  }, true);
  return overlay;
}

export function openX1080xSettingsPanel(document = globalThis.document) {
  const overlay = openHdblogSettingsPanel(document);
  return injectAgaghhhSettings(document, overlay);
}

function trySuppressLegacyHdblogMenu() {
  if (restoreMenuRegistration || typeof globalThis.GM_registerMenuCommand !== 'function') return;
  const original = globalThis.GM_registerMenuCommand;
  const wrapped = function wrappedRegisterMenuCommand(title, callback, ...rest) {
    if (title === LEGACY_HDBLOG_MENU_TITLE) return undefined;
    return original.call(this, title, callback, ...rest);
  };
  try {
    globalThis.GM_registerMenuCommand = wrapped;
    restoreMenuRegistration = () => {
      try { globalThis.GM_registerMenuCommand = original; } catch { /* no-op */ }
      restoreMenuRegistration = null;
    };
  } catch {
    restoreMenuRegistration = null;
  }
}

export function finishUnifiedSettingsMenuInstall() {
  restoreMenuRegistration?.();
}

export function installUnifiedSettingsMenu(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!document || (!isAgaghhhHost(locationObject) && !isHdblogHost(locationObject))) return;
  if (typeof GM_registerMenuCommand !== 'function') return;
  trySuppressLegacyHdblogMenu();
  GM_registerMenuCommand('⚙️ x1080x 设置', () => openX1080xSettingsPanel(document));
}

export function installAgaghhhEnhancement(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document || !isAgaghhhHost(locationObject)) return;
  if (!isAgaghhhEnhancementEnabled()) {
    disableAgaghhhEnhancements(document);
    return;
  }
  bindRealActressDownload(document, gmRequest);
}
