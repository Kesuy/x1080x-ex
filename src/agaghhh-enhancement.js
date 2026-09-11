import { parseThreadTitle } from './core.js';
import { installAgaghhhHdblogPreview } from './agaghhh-hdblog-preview.js';

export const AGAGHHH_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:agaghhh-batch-open-enabled';
export const AGAGHHH_DOWNLOAD_ENABLED_KEY = 'x1080x-ex:agaghhh-download-enabled';
export const AGAGHHH_REAL_ACTRESS_ENABLED_KEY = 'x1080x-ex:agaghhh-real-actress-enabled';
export const AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY = 'x1080x-ex:agaghhh-hdblog-preview-enabled';
const LEGACY_AGAGHHH_ENHANCEMENT_ENABLED_KEY = 'x1080x-ex:agaghhh-enhancement-enabled';

const SETTINGS_PANEL_ID = 'x1080x-ex-settings-panel';
const DOWNLOAD_BUTTON_ID = 'x1080x-ex-download';
const BATCH_BUTTON_ID = 'x1080x-ex-open-page';
const BATCH_TOOLBAR_ID = 'x1080x-ex-open-page-toolbar';
const AV_WIKI_ORIGIN = 'https://av-wiki.net';
const AV_WIKI_TIMEOUT = 20000;
const REAL_ACTRESS_BOUND_ATTR = 'data-x1080x-real-actress-bound';
const REAL_ACTRESS_BYPASS_ATTR = 'data-x1080x-real-actress-bypass';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isAgaghhhHost(locationObject = globalThis.location) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'agaghhh.cc' || hostname.endsWith('.agaghhh.cc');
}

function legacyDefault() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(LEGACY_AGAGHHH_ENHANCEMENT_ENABLED_KEY, true) !== false;
}

function readBooleanSetting(key) {
  if (typeof GM_getValue !== 'function') return true;
  const stored = GM_getValue(key, null);
  if (stored === null || stored === undefined) return legacyDefault();
  return stored !== false;
}

export function isAgaghhhBatchOpenEnabled() {
  return readBooleanSetting(AGAGHHH_BATCH_OPEN_ENABLED_KEY);
}

export function isAgaghhhDownloadEnabled() {
  return readBooleanSetting(AGAGHHH_DOWNLOAD_ENABLED_KEY);
}

export function isAgaghhhRealActressEnabled() {
  return readBooleanSetting(AGAGHHH_REAL_ACTRESS_ENABLED_KEY);
}

export function isAgaghhhHdblogPreviewEnabled() {
  return readBooleanSetting(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY);
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

function closeX1080xSettingsPanel(document) {
  document?.getElementById(SETTINGS_PANEL_ID)?.remove();
}

export function openX1080xSettingsPanel(document = globalThis.document) {
  if (!document?.body) return null;
  closeX1080xSettingsPanel(document);

  const overlay = document.createElement('div');
  overlay.id = SETTINGS_PANEL_ID;
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483646', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px',
    background: 'rgba(0,0,0,.42)', boxSizing: 'border-box',
  });

  const panel = document.createElement('form');
  Object.assign(panel.style, {
    width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
    padding: '22px', borderRadius: '10px', background: '#fff', color: '#222',
    boxShadow: '0 18px 60px rgba(0,0,0,.28)', boxSizing: 'border-box',
    font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  panel.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">x1080x 设置</h2>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:11px">agaghhh.cc 增强功能</div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="batch-open" type="checkbox" style="margin-top:3px">
        <span><strong>批量打开帖子功能</strong><small style="display:block;margin-top:2px;color:#666">在列表页显示“后台顺序打开本页主题”按钮。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="download" type="checkbox" style="margin-top:3px">
        <span><strong>下载增强</strong><small style="display:block;margin-top:2px;color:#666">在帖子页显示下载按钮，并使用现有附件、图片、种子下载与自动命名逻辑。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="hdblog-preview" type="checkbox" style="margin-top:3px">
        <span><strong>显示 hdblog 大预览图</strong><small style="display:block;margin-top:2px;color:#666">按帖子番号搜索 hdblog，沿用 hdblog 的“搜索结果屏蔽关键词”，并把匹配文章的 Preview 大图显示到主楼。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px">
        <input data-setting="real-actress" type="checkbox" style="margin-top:3px">
        <span><strong>查真实演员信息</strong><small style="display:block;margin-top:2px;color:#666">仅当帖子“出演者”为空且启用了下载增强时，通过 av-wiki 查询演员并追加到附件文件名。</small></span>
      </label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">取消</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">保存</button>
    </div>`;

  const batchInput = panel.querySelector('[data-setting="batch-open"]');
  const downloadInput = panel.querySelector('[data-setting="download"]');
  const previewInput = panel.querySelector('[data-setting="hdblog-preview"]');
  const actressInput = panel.querySelector('[data-setting="real-actress"]');
  batchInput.checked = isAgaghhhBatchOpenEnabled();
  downloadInput.checked = isAgaghhhDownloadEnabled();
  previewInput.checked = isAgaghhhHdblogPreviewEnabled();
  actressInput.checked = isAgaghhhRealActressEnabled();

  panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => closeX1080xSettingsPanel(document));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeX1080xSettingsPanel(document);
  });
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    if (typeof GM_setValue === 'function') {
      GM_setValue(AGAGHHH_BATCH_OPEN_ENABLED_KEY, batchInput.checked);
      GM_setValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, downloadInput.checked);
      GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, previewInput.checked);
      GM_setValue(AGAGHHH_REAL_ACTRESS_ENABLED_KEY, actressInput.checked);
    }
    closeX1080xSettingsPanel(document);
    const view = document.defaultView;
    if (view?.location?.reload) view.location.reload();
  });

  overlay.append(panel);
  document.body.append(overlay);
  return overlay;
}

export function installX1080xSettingsMenu(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!document || !isAgaghhhHost(locationObject)) return;
  if (typeof GM_registerMenuCommand !== 'function') return;
  GM_registerMenuCommand('⚙️ x1080x 设置', () => openX1080xSettingsPanel(document));
}

export function installAgaghhhEnhancement(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document || !isAgaghhhHost(locationObject)) return;

  if (!isAgaghhhBatchOpenEnabled()) {
    document.getElementById(BATCH_BUTTON_ID)?.remove();
    document.getElementById(BATCH_TOOLBAR_ID)?.remove();
  }

  if (isAgaghhhHdblogPreviewEnabled()) {
    void installAgaghhhHdblogPreview(document, locationObject, gmRequest);
  }

  if (!isAgaghhhDownloadEnabled()) {
    document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
    return;
  }

  if (isAgaghhhRealActressEnabled()) bindRealActressDownload(document, gmRequest);
}
