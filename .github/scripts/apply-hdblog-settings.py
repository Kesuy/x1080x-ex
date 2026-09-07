from pathlib import Path
import re

article_path = Path('src/hdblog-article.js')
source = article_path.read_text(encoding='utf-8')

old_constants = """export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const DEFAULT_HDBLOG_ARTICLE_WIDTH = 1280;
"""
new_constants = """export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const HDBLOG_SHOW_DOWNLOAD_AREA_KEY = 'x1080x-ex:hdblog-show-download-area';
export const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';
export const DEFAULT_HDBLOG_ARTICLE_WIDTH = 1280;
const DEFAULT_HDBLOG_BLOCKED_KEYWORDS = 'モザイク破壊';
const HDBLOG_SETTINGS_PANEL_ID = 'x1080x-ex-hdblog-settings-panel';
const DOWNLOAD_HIDDEN_ATTR = 'data-x1080x-hdblog-download-hidden';
const DOWNLOAD_WRAPPER_ATTR = 'data-x1080x-hdblog-download-wrapper';
const DOWNLOAD_SECTION_LABEL_PATTERN = /^(?:bt(?:a)?file|katfile|freedl|rapidgator)\\s*[:：]?$/i;
const PREVIEW_LABEL_PATTERN = /^preview\\s*[:：]?$/i;
"""
if old_constants not in source:
    raise SystemExit('article constants anchor not found')
source = source.replace(old_constants, new_constants, 1)

css_anchor = """body.${ARTICLE_BODY_CLASS} .nav-primary .genesis-nav-menu {
  display: flex !important;
  flex-wrap: wrap !important;
  width: 100% !important;
  max-width: none !important;
}
"""
css_extra = css_anchor + """body.${ARTICLE_BODY_CLASS} main#genesis-content,
body.${ARTICLE_BODY_CLASS} #genesis-content.content {
  background: #fff !important;
  box-sizing: border-box !important;
}
"""
if css_anchor not in source:
    raise SystemExit('nav CSS anchor not found')
source = source.replace(css_anchor, css_extra, 1)

helper_anchor = """function isAfter(reference, node) {
  return Boolean(reference?.compareDocumentPosition(node) & 4);
}
"""
helpers = r'''function lowestCommonAncestorWithin(first, second, limit) {
  if (!first || !second || !limit) return null;
  const ancestors = new Set();
  let current = first.parentNode;
  while (current) {
    ancestors.add(current);
    if (current === limit) break;
    current = current.parentNode;
  }
  current = second.parentNode;
  while (current) {
    if (ancestors.has(current)) return current;
    if (current === limit) break;
    current = current.parentNode;
  }
  return null;
}

function directChildContaining(ancestor, node) {
  let current = node;
  while (current && current.parentNode !== ancestor) current = current.parentNode;
  return current?.parentNode === ancestor ? current : null;
}

function markDownloadAreaNode(document, node) {
  if (!node) return false;
  if (node.nodeType === 1) {
    node.setAttribute(DOWNLOAD_HIDDEN_ATTR, '1');
    node.style.setProperty('display', 'none', 'important');
    return true;
  }
  if (node.nodeType === 3 && normalizeText(node.nodeValue)) {
    const wrapper = document.createElement('span');
    wrapper.setAttribute(DOWNLOAD_HIDDEN_ATTR, '1');
    wrapper.setAttribute(DOWNLOAD_WRAPPER_ATTR, '1');
    wrapper.style.setProperty('display', 'none', 'important');
    node.parentNode?.insertBefore(wrapper, node);
    wrapper.append(node);
    return true;
  }
  return false;
}

function clearHdblogDownloadAreaMarkers(document) {
  if (!document) return;
  [...document.querySelectorAll(`[${DOWNLOAD_HIDDEN_ATTR}="1"]`)].forEach((element) => {
    if (element.getAttribute(DOWNLOAD_WRAPPER_ATTR) === '1') {
      element.replaceWith(...element.childNodes);
      return;
    }
    element.style.removeProperty('display');
    element.removeAttribute(DOWNLOAD_HIDDEN_ATTR);
  });
}

export function applyHdblogDownloadAreaVisibility(document, visible = true) {
  if (!document) return 0;
  clearHdblogDownloadAreaMarkers(document);
  if (visible) return 0;

  const content = articleContentElement(document);
  if (!content) return 0;
  const nodes = textNodesUnder(content);
  const start = nodes.find((node) => DOWNLOAD_SECTION_LABEL_PATTERN.test(normalizeText(node.nodeValue)));
  if (!start) return 0;
  const preview = nodes.find((node) => (
    isAfter(start, node) && PREVIEW_LABEL_PATTERN.test(normalizeText(node.nodeValue))
  ));
  if (!preview) return 0;

  const common = lowestCommonAncestorWithin(start, preview, content);
  if (!common) return 0;
  const first = directChildContaining(common, start);
  const stop = directChildContaining(common, preview);
  if (!first || !stop || first === stop) return 0;

  let hidden = 0;
  let current = first;
  while (current && current !== stop) {
    const next = current.nextSibling;
    if (markDownloadAreaNode(document, current)) hidden += 1;
    current = next;
  }
  return hidden;
}

'''
if helper_anchor not in source:
    raise SystemExit('isAfter anchor not found')
source = source.replace(helper_anchor, helpers + helper_anchor, 1)

start = source.find('function rawStoredWidth() {')
end = source.find('export function installHdblogArticleEnhancement(', start)
if start < 0 or end < 0:
    raise SystemExit('settings block boundaries not found')
settings_block = r'''function rawStoredWidth() {
  if (typeof GM_getValue !== 'function') return '';
  const value = GM_getValue(HDBLOG_ARTICLE_WIDTH_KEY, '');
  return value === null || value === undefined ? '' : String(value).trim();
}

function readStoredWidth() {
  const stored = rawStoredWidth();
  return stored ? normalizeHdblogArticleWidth(stored, DEFAULT_HDBLOG_ARTICLE_WIDTH) : null;
}

function readDownloadAreaVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, true) !== false;
}

function readBlockedKeywordsText() {
  if (typeof GM_getValue !== 'function') return DEFAULT_HDBLOG_BLOCKED_KEYWORDS;
  const stored = GM_getValue(HDBLOG_BLOCKED_KEYWORDS_KEY, null);
  return stored === null || stored === undefined
    ? DEFAULT_HDBLOG_BLOCKED_KEYWORDS
    : String(stored);
}

function normalizeBlockedKeywordsText(value) {
  const seen = new Set();
  return String(value ?? '')
    .split(/[\r\n,;，；]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.normalize('NFKC').toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

function closeHdblogSettingsPanel(document) {
  document?.getElementById(HDBLOG_SETTINGS_PANEL_ID)?.remove();
}

export function openHdblogSettingsPanel(document = globalThis.document) {
  if (!document?.body) return null;
  closeHdblogSettingsPanel(document);

  const overlay = document.createElement('div');
  overlay.id = HDBLOG_SETTINGS_PANEL_ID;
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483646', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '20px',
    background: 'rgba(0,0,0,.42)', boxSizing: 'border-box',
  });

  const panel = document.createElement('form');
  Object.assign(panel.style, {
    width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 40px)', overflow: 'auto',
    padding: '22px', borderRadius: '10px', background: '#fff', color: '#222',
    boxShadow: '0 18px 60px rgba(0,0,0,.28)', boxSizing: 'border-box',
    font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  panel.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">x1080x-ex · hdblog 设置</h2>
    <label style="display:block;margin-bottom:16px">
      <span style="display:block;font-weight:600;margin-bottom:6px">文章主内容区宽度（px）</span>
      <input data-setting="width" type="number" min="${MIN_HDBLOG_ARTICLE_WIDTH}" max="${MAX_HDBLOG_ARTICLE_WIDTH}" step="1"
        placeholder="留空 = 网站默认宽度"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      <small style="display:block;margin-top:5px;color:#666">只扩展白色主内容区域；原正文宽度保持不变并居中。</small>
    </label>
    <label style="display:flex;align-items:center;gap:9px;margin-bottom:16px;font-weight:600">
      <input data-setting="show-downloads" type="checkbox">
      显示 Btfile / katfile / Freedl / Rapidgator 网盘下载区域
    </label>
    <label style="display:block;margin-bottom:18px">
      <span style="display:block;font-weight:600;margin-bottom:6px">搜索结果屏蔽关键词</span>
      <textarea data-setting="keywords" rows="5" placeholder="留空 = 不屏蔽"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical"></textarea>
      <small style="display:block;margin-top:5px;color:#666">每行一个，也可用逗号或分号分隔；搜索页刷新后生效。</small>
    </label>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">取消</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">保存</button>
    </div>`;

  const widthInput = panel.querySelector('[data-setting="width"]');
  const downloadsInput = panel.querySelector('[data-setting="show-downloads"]');
  const keywordsInput = panel.querySelector('[data-setting="keywords"]');
  widthInput.value = rawStoredWidth();
  downloadsInput.checked = readDownloadAreaVisible();
  keywordsInput.value = readBlockedKeywordsText();

  panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => closeHdblogSettingsPanel(document));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeHdblogSettingsPanel(document);
  });
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const widthText = widthInput.value.trim();
    let numeric = null;
    if (widthText) {
      numeric = Number.parseInt(widthText, 10);
      if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
        document.defaultView?.alert(`请输入 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} 之间的整数，或留空使用网站默认宽度。`);
        widthInput.focus();
        return;
      }
    }

    if (typeof GM_setValue === 'function') {
      GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, widthText ? numeric : '');
      GM_setValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, downloadsInput.checked);
      GM_setValue(HDBLOG_BLOCKED_KEYWORDS_KEY, normalizeBlockedKeywordsText(keywordsInput.value));
    }

    if (isHdblogArticlePage(document, document.location)) {
      if (widthText) applyHdblogArticleLayout(document, numeric);
      else clearHdblogArticleLayout(document);
      applyHdblogDownloadAreaVisibility(document, downloadsInput.checked);
    }
    closeHdblogSettingsPanel(document);
  });

  overlay.append(panel);
  document.body.append(overlay);
  return overlay;
}

function registerHdblogSettingsMenu(document, locationObject) {
  if (!isHdblogHost(locationObject) || typeof GM_registerMenuCommand !== 'function') return;
  GM_registerMenuCommand('⚙️ hdblog 设置', () => openHdblogSettingsPanel(document));
}

'''
source = source[:start] + settings_block + source[end:]

old_install = """  if (!document) return;
  registerWidthSetting(document);
  if (!isHdblogArticlePage(document, locationObject)) return;
  const storedWidth = readStoredWidth();
  if (storedWidth === null) clearHdblogArticleLayout(document);
  else applyHdblogArticleLayout(document, storedWidth);
  installDownloadButton(document, locationObject, gmRequest);
}"""
new_install = """  if (!document) return;
  registerHdblogSettingsMenu(document, locationObject);
  if (!isHdblogArticlePage(document, locationObject)) return;
  const storedWidth = readStoredWidth();
  if (storedWidth === null) clearHdblogArticleLayout(document);
  else applyHdblogArticleLayout(document, storedWidth);
  applyHdblogDownloadAreaVisibility(document, readDownloadAreaVisible());
  installDownloadButton(document, locationObject, gmRequest);
}"""
if old_install not in source:
    raise SystemExit('article install block not found')
source = source.replace(old_install, new_install, 1)
article_path.write_text(source, encoding='utf-8')

search_path = Path('src/hdblog-search.js')
search = search_path.read_text(encoding='utf-8')
search = re.sub(
    r"\nfunction saveBlockedKeywords\(keywords\) \{.*?\n\}\n\nfunction registerSettingsMenu\(\) \{.*?\n\}\n\n(?=export function applyHdblogSearchEnhancement)",
    "\n",
    search,
    flags=re.S,
    count=1,
)
old_search_install = """export function installHdblogSearchEnhancement() {
  registerSettingsMenu();
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  applyHdblogSearchEnhancement(window);
}"""
new_search_install = """export function installHdblogSearchEnhancement() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  applyHdblogSearchEnhancement(window);
}"""
if old_search_install not in search:
    raise SystemExit('search install block not found')
search = search.replace(old_search_install, new_search_install, 1)
search_path.write_text(search, encoding='utf-8')

test_path = Path('test/hdblog-article.test.js')
test = test_path.read_text(encoding='utf-8')
if '  applyHdblogDownloadAreaVisibility,\n' not in test:
    test = test.replace(
        '  applyHdblogArticleLayout,\n',
        '  applyHdblogArticleLayout,\n  applyHdblogDownloadAreaVisibility,\n',
        1,
    )
css_assert = "  assert.match(style.textContent, /max-width:\\s*var\\(--x1080x-hdblog-original-article-width\\) !important/);\n"
if css_assert not in test:
    raise SystemExit('white background test anchor not found')
if '#genesis-content\\.content' not in test:
    test = test.replace(
        css_assert,
        css_assert + "  assert.match(style.textContent, /#genesis-content\\.content[\\s\\S]*?background:\\s*#fff !important/);\n",
        1,
    )

new_tests = r'''

test('download-area toggle hides provider links through just before Preview and restores them', () => {
  const dom = articleDom({
    content: `
      <p id="meta">商品発売日：2026/10/08</p>
      <p id="bt">Btfile:</p>
      <p id="bt-link"><a href="#bt">NAMH-075_6M.mp4</a></p>
      <p id="kat">katfile:</p>
      <p id="kat-link"><a href="#kat">NAMH-075_6M.part1.rar</a></p>
      <p id="free">Freedl:</p>
      <p id="rapid">Rapidgator:</p>
      <p id="preview">Preview:</p>
      <p id="preview-image"><a href="https://pixhost.to/show/1/2.jpg"><img src="https://t1.pixhost.to/thumbs/1/2.jpg"></a></p>
    `,
  });

  const document = dom.window.document;
  const hidden = applyHdblogDownloadAreaVisibility(document, false);
  assert.ok(hidden >= 6);
  assert.equal(document.querySelector('#meta').style.display, '');
  assert.equal(document.querySelector('#bt').style.display, 'none');
  assert.equal(document.querySelector('#rapid').style.display, 'none');
  assert.equal(document.querySelector('#preview').style.display, '');
  assert.equal(document.querySelector('#preview-image').style.display, '');

  applyHdblogDownloadAreaVisibility(document, true);
  assert.equal(document.querySelector('#bt').style.display, '');
  assert.equal(document.querySelector('#rapid').style.display, '');
  assert.equal(document.querySelector('#preview').style.display, '');
});

test('download-area toggle also works when provider links and Preview share one paragraph', () => {
  const dom = articleDom({
    content: `<p id="mixed"><span id="bt">Btafile:</span><br><a id="link" href="#x">file</a><br><span id="preview">Preview:</span><br><a id="preview-link" href="#p">preview</a></p>`,
  });
  const document = dom.window.document;
  assert.ok(applyHdblogDownloadAreaVisibility(document, false) >= 1);
  assert.equal(document.querySelector('#bt').style.display, 'none');
  assert.equal(document.querySelector('#link').style.display, 'none');
  assert.equal(document.querySelector('#preview').style.display, '');
  assert.equal(document.querySelector('#preview-link').style.display, '');
});
'''
if "download-area toggle hides provider links" not in test:
    test += new_tests
test_path.write_text(test, encoding='utf-8')
