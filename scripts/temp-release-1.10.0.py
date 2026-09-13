from pathlib import Path
import json
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def sub_once(path, pattern, replacement, flags=0):
    text = read(path)
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: regex expected one match, got {count}: {pattern[:120]!r}')
    write(path, new)


# ---------------------------------------------------------------------------
# agaghhh.cc: add an independent cross-search switch and make it independent
# from the download button. Existing preview / official fallback / actress /
# qBittorrent switches remain in the same x1080x settings panel.
# ---------------------------------------------------------------------------
replace_once(
    'src/agaghhh-enhancement.js',
    "export const AGAGHHH_DOWNLOAD_ENABLED_KEY = 'x1080x-ex:agaghhh-download-enabled';\n",
    "export const AGAGHHH_DOWNLOAD_ENABLED_KEY = 'x1080x-ex:agaghhh-download-enabled';\n"
    "export const AGAGHHH_CROSS_SEARCH_ENABLED_KEY = 'x1080x-ex:agaghhh-cross-search-enabled';\n"
)

replace_once(
    'src/agaghhh-enhancement.js',
    "export function isAgaghhhDownloadEnabled() {\n  return readBooleanSetting(AGAGHHH_DOWNLOAD_ENABLED_KEY);\n}\n",
    "export function isAgaghhhDownloadEnabled() {\n  return readBooleanSetting(AGAGHHH_DOWNLOAD_ENABLED_KEY);\n}\n\n"
    "export function isAgaghhhCrossSearchEnabled() {\n  return readBooleanSetting(AGAGHHH_CROSS_SEARCH_ENABLED_KEY);\n}\n"
)

replace_once(
    'src/agaghhh-enhancement.js',
    '''      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">\n        <input data-setting="download" type="checkbox" style="margin-top:3px">\n        <span><strong>下载增强</strong><small style="display:block;margin-top:2px;color:#666">在帖子页显示下载按钮，并使用现有附件、图片、种子下载与自动命名逻辑。</small></span>\n      </label>\n''',
    '''      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">\n        <input data-setting="download" type="checkbox" style="margin-top:3px">\n        <span><strong>下载增强</strong><small style="display:block;margin-top:2px;color:#666">在帖子页显示下载按钮，并使用现有附件、图片、种子下载与自动命名逻辑。</small></span>\n      </label>\n      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">\n        <input data-setting="cross-search" type="checkbox" style="margin-top:3px">\n        <span><strong>跨站搜索按钮（🔍）</strong><small style="display:block;margin-top:2px;color:#666">在帖子标题旁显示搜索按钮，识别番号后直接打开 hdblog 搜索；可独立于下载增强使用。</small></span>\n      </label>\n'''
)

replace_once(
    'src/agaghhh-enhancement.js',
    "  const downloadInput = panel.querySelector('[data-setting=\"download\"]');\n  const previewInput = panel.querySelector('[data-setting=\"hdblog-preview\"]');\n",
    "  const downloadInput = panel.querySelector('[data-setting=\"download\"]');\n"
    "  const crossSearchInput = panel.querySelector('[data-setting=\"cross-search\"]');\n"
    "  const previewInput = panel.querySelector('[data-setting=\"hdblog-preview\"]');\n"
)

replace_once(
    'src/agaghhh-enhancement.js',
    "  downloadInput.checked = isAgaghhhDownloadEnabled();\n  previewInput.checked = isAgaghhhHdblogPreviewEnabled();\n",
    "  downloadInput.checked = isAgaghhhDownloadEnabled();\n"
    "  crossSearchInput.checked = isAgaghhhCrossSearchEnabled();\n"
    "  previewInput.checked = isAgaghhhHdblogPreviewEnabled();\n"
)

replace_once(
    'src/agaghhh-enhancement.js',
    "      GM_setValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, downloadInput.checked);\n      GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, previewInput.checked);\n",
    "      GM_setValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, downloadInput.checked);\n"
    "      GM_setValue(AGAGHHH_CROSS_SEARCH_ENABLED_KEY, crossSearchInput.checked);\n"
    "      GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, previewInput.checked);\n"
)

sub_once(
    'src/agaghhh-enhancement.js',
    r"function installHdblogSearchButton\(document\) \{[\s\S]*?\n\}\n\nfunction bindRealActressDownload",
    '''function installHdblogSearchButton(document) {
  if (document.getElementById(SEARCH_BUTTON_ID)) return;
  const code = threadCode(document);
  if (!code) return;
  const downloadButton = document.getElementById(DOWNLOAD_BUTTON_ID);
  const title = threadTitleElement(document);
  const host = downloadButton?.parentElement
    || title?.closest('.vwthd, .ts')
    || title?.parentElement;
  if (!host) return;

  const button = document.createElement('button');
  button.id = SEARCH_BUTTON_ID;
  button.type = 'button';
  button.textContent = '🔍';
  button.title = '按当前番号在 hdblog 搜索';
  button.setAttribute('aria-label', '在 hdblog 搜索当前番号');
  Object.assign(button.style, {
    float: 'right', position: 'relative', zIndex: '20', margin: '0 0 6px 4px',
    padding: '7px 10px', minWidth: '38px', border: '1px solid #2878c8',
    borderRadius: '5px', color: '#fff', background: '#398bd4', cursor: 'pointer',
    fontSize: '14px', lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => { button.style.background = '#246eaf'; });
  button.addEventListener('mouseleave', () => { button.style.background = '#398bd4'; });
  button.addEventListener('click', () => {
    const url = buildHdblogSearchUrlForThreadCode(threadCode(document));
    if (!url) {
      document.defaultView?.alert('没有识别到影片番号。');
      return;
    }
    openSearchTab(document, url);
  });
  if (downloadButton) downloadButton.insertAdjacentElement('afterend', button);
  else host.prepend(button);
}

function bindRealActressDownload'''
)

sub_once(
    'src/agaghhh-enhancement.js',
    r"export function installAgaghhhEnhancement\([\s\S]*?\n\}\s*$",
    '''export function installAgaghhhEnhancement(
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

  const downloadEnabled = isAgaghhhDownloadEnabled();
  if (!downloadEnabled) document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();

  if (isAgaghhhCrossSearchEnabled()) installHdblogSearchButton(document);
  else document.getElementById(SEARCH_BUTTON_ID)?.remove();

  if (downloadEnabled && isAgaghhhRealActressEnabled()) bindRealActressDownload(document, gmRequest);
}
'''
)

# ---------------------------------------------------------------------------
# hdblog: explicit switches for layout, cross search, search filtering and
# search/list batch-open. Preview expansion remains the master switch for
# refer / image-host resolution.
# ---------------------------------------------------------------------------
replace_once(
    'src/hdblog-article.js',
    "export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';\n",
    "export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';\n"
    "export const HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY = 'x1080x-ex:hdblog-article-layout-enabled';\n"
)
replace_once(
    'src/hdblog-article.js',
    "export const HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY = 'x1080x-ex:hdblog-show-image-download-button';\n",
    "export const HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY = 'x1080x-ex:hdblog-show-image-download-button';\n"
    "export const HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY = 'x1080x-ex:hdblog-show-cross-search-button';\n"
)
replace_once(
    'src/hdblog-article.js',
    "export const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';\n",
    "export const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';\n"
    "export const HDBLOG_SEARCH_FILTER_ENABLED_KEY = 'x1080x-ex:hdblog-search-filter-enabled';\n"
    "export const HDBLOG_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:hdblog-batch-open-enabled';\n"
)

# Search button creation is separated from the image-download button.
sub_once(
    'src/hdblog-article.js',
    r"\n  const searchButton = document\.createElement\('button'\);[\s\S]*?\n  title\.append\(' ', searchButton, ' ', button\);",
    "\n  title.append(' ', button);"
)

replace_once(
    'src/hdblog-article.js',
    "function rawStoredWidth() {\n",
    '''function installAgaghhhSearchButton(document) {
  if (document.getElementById(SEARCH_BUTTON_ID)) return;
  const title = articleTitleElement(document);
  if (!title) return;
  const searchButton = document.createElement('button');
  searchButton.id = SEARCH_BUTTON_ID;
  searchButton.type = 'button';
  searchButton.textContent = '🔍';
  searchButton.title = '按当前番号在 agaghhh.cc 搜索';
  searchButton.setAttribute('aria-label', '在 agaghhh.cc 搜索当前番号');
  Object.assign(searchButton.style, {
    display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle',
    margin: '0 0 4px 8px', padding: '5px 8px', minWidth: '34px',
    justifyContent: 'center', border: '1px solid #2878c8', borderRadius: '5px',
    color: '#fff', background: '#398bd4', cursor: 'pointer', fontSize: '13px',
    fontWeight: '600', lineHeight: '20px',
  });
  searchButton.addEventListener('mouseenter', () => { searchButton.style.background = '#246eaf'; });
  searchButton.addEventListener('mouseleave', () => { searchButton.style.background = '#398bd4'; });
  searchButton.addEventListener('click', () => {
    const url = buildAgaghhhSearchUrl(extractHdblogArticleCode(document));
    if (!url) {
      document.defaultView?.alert('没有识别到影片番号。');
      return;
    }
    openSearchTab(document, url);
  });
  title.append(' ', searchButton);
}

function rawStoredWidth() {
'''
)

replace_once(
    'src/hdblog-article.js',
    "function readStoredWidth() {\n  const stored = rawStoredWidth();\n  return stored ? normalizeHdblogArticleWidth(stored, DEFAULT_HDBLOG_ARTICLE_WIDTH) : null;\n}\n",
    '''function readStoredWidth() {
  const stored = rawStoredWidth();
  return stored ? normalizeHdblogArticleWidth(stored, DEFAULT_HDBLOG_ARTICLE_WIDTH) : null;
}

export function isHdblogArticleLayoutEnabled() {
  if (typeof GM_getValue !== 'function') return Boolean(rawStoredWidth());
  const stored = GM_getValue(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, null);
  if (stored === null || stored === undefined) return Boolean(rawStoredWidth());
  return stored !== false;
}
'''
)

replace_once(
    'src/hdblog-article.js',
    "function readImageDownloadButtonVisible() {\n  if (typeof GM_getValue !== 'function') return true;\n  return GM_getValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, true) !== false;\n}\n",
    '''function readImageDownloadButtonVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, true) !== false;
}

export function isHdblogCrossSearchEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, true) !== false;
}

export function isHdblogSearchFilterEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY, true) !== false;
}

export function isHdblogBatchOpenEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, true) !== false;
}
'''
)

# Replace the hdblog settings panel body and state wiring.
sub_once(
    'src/hdblog-article.js',
    r"  panel\.innerHTML = `[\s\S]*?`;\n\n  const widthInput = panel\.querySelector\('\[data-setting=\"width\"\]'\);",
    '''  panel.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">x1080x-ex · hdblog 设置</h2>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">文章布局</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="layout-enabled" type="checkbox">
        启用文章宽度增强
      </label>
      <label data-width-row style="display:block;margin-left:24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">文章主内容区宽度（px）</span>
        <input data-setting="width" type="number" min="${MIN_HDBLOG_ARTICLE_WIDTH}" max="${MAX_HDBLOG_ARTICLE_WIDTH}" step="1"
          placeholder="${DEFAULT_HDBLOG_ARTICLE_WIDTH}"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
        <small style="display:block;margin-top:5px;color:#666">关闭开关时完全使用网站原始布局；开启后只扩展白色主内容区域。</small>
      </label>
    </div>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">文章页功能</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="show-downloads" type="checkbox">
        显示 Btfile / katfile / Freedl / Rapidgator 网盘下载区域
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="show-image-download" type="checkbox">
        显示标题旁的图片下载按钮（⬇）
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="cross-search" type="checkbox">
        显示跨站搜索按钮（🔍，搜索 agaghhh.cc）
      </label>
      <label style="display:flex;align-items:center;gap:9px">
        <input data-setting="expand-preview" type="checkbox">
        自动展开 Preview 大图（含 Pixhost / refer 解析）
      </label>
    </div>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">搜索 / 列表页功能</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="batch-open" type="checkbox">
        显示“后台顺序打开本页主题”按钮
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="search-filter" type="checkbox">
        启用搜索结果屏蔽与单结果自动跳转
      </label>
      <label data-keywords-row style="display:block;margin-left:24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">搜索结果屏蔽关键词</span>
        <textarea data-setting="keywords" rows="5" placeholder="留空 = 不屏蔽"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical"></textarea>
        <small style="display:block;margin-top:5px;color:#666">每行一个，也可用逗号或分号分隔；该规则也供 agaghhh 的 hdblog Preview 搜索复用。</small>
      </label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">取消</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">保存</button>
    </div>`;

  const layoutInput = panel.querySelector('[data-setting="layout-enabled"]');
  const widthInput = panel.querySelector('[data-setting="width"]');''',
    flags=re.S
)

sub_once(
    'src/hdblog-article.js',
    r"  const downloadsInput = panel\.querySelector\('\[data-setting=\"show-downloads\"\]'\);[\s\S]*?  keywordsInput\.value = readBlockedKeywordsText\(\);\n",
    '''  const downloadsInput = panel.querySelector('[data-setting="show-downloads"]');
  const imageDownloadInput = panel.querySelector('[data-setting="show-image-download"]');
  const crossSearchInput = panel.querySelector('[data-setting="cross-search"]');
  const previewInput = panel.querySelector('[data-setting="expand-preview"]');
  const batchOpenInput = panel.querySelector('[data-setting="batch-open"]');
  const searchFilterInput = panel.querySelector('[data-setting="search-filter"]');
  const keywordsInput = panel.querySelector('[data-setting="keywords"]');

  layoutInput.checked = isHdblogArticleLayoutEnabled();
  widthInput.value = rawStoredWidth() || String(DEFAULT_HDBLOG_ARTICLE_WIDTH);
  downloadsInput.checked = readDownloadAreaVisible();
  imageDownloadInput.checked = readImageDownloadButtonVisible();
  crossSearchInput.checked = isHdblogCrossSearchEnabled();
  previewInput.checked = isHdblogPreviewExpansionEnabled();
  batchOpenInput.checked = isHdblogBatchOpenEnabled();
  searchFilterInput.checked = isHdblogSearchFilterEnabled();
  keywordsInput.value = readBlockedKeywordsText();

  const syncDependentFields = () => {
    widthInput.disabled = !layoutInput.checked;
    keywordsInput.disabled = !searchFilterInput.checked;
  };
  syncDependentFields();
  layoutInput.addEventListener('change', syncDependentFields);
  searchFilterInput.addEventListener('change', syncDependentFields);
''',
    flags=re.S
)

sub_once(
    'src/hdblog-article.js',
    r"  panel\.addEventListener\('submit', \(event\) => \{[\s\S]*?\n  \}\);\n\n  overlay\.append\(panel\);",
    '''  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const widthText = widthInput.value.trim();
    let numeric = DEFAULT_HDBLOG_ARTICLE_WIDTH;
    if (widthText) {
      numeric = Number.parseInt(widthText, 10);
      if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
        document.defaultView?.alert(`请输入 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} 之间的整数。`);
        widthInput.focus();
        return;
      }
    }

    if (typeof GM_setValue === 'function') {
      GM_setValue(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, layoutInput.checked);
      GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, numeric);
      GM_setValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, downloadsInput.checked);
      GM_setValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, imageDownloadInput.checked);
      GM_setValue(HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, crossSearchInput.checked);
      GM_setValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, previewInput.checked);
      GM_setValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, batchOpenInput.checked);
      GM_setValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY, searchFilterInput.checked);
      GM_setValue(HDBLOG_BLOCKED_KEYWORDS_KEY, normalizeBlockedKeywordsText(keywordsInput.value));
    }

    closeHdblogSettingsPanel(document);
    const view = document.defaultView;
    if (view?.location?.reload) view.location.reload();
  });

  overlay.append(panel);''',
    flags=re.S
)

sub_once(
    'src/hdblog-article.js',
    r"  const storedWidth = readStoredWidth\(\);[\s\S]*?\n\}\s*$",
    '''  const storedWidth = readStoredWidth();
  if (isHdblogArticleLayoutEnabled()) {
    applyHdblogArticleLayout(document, storedWidth || DEFAULT_HDBLOG_ARTICLE_WIDTH);
  } else {
    clearHdblogArticleLayout(document);
  }
  applyHdblogDownloadAreaVisibility(document, readDownloadAreaVisible());
  if (readImageDownloadButtonVisible()) installDownloadButton(document, locationObject, gmRequest);
  else document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
  if (isHdblogCrossSearchEnabled()) installAgaghhhSearchButton(document);
  else document.getElementById(SEARCH_BUTTON_ID)?.remove();
}
''',
    flags=re.S
)

# hdblog search filtering / single-result redirect switch.
replace_once(
    'src/hdblog-search.js',
    "const STORAGE_KEY = 'x1080x-ex:hdblog-blocked-keywords';\n",
    "const STORAGE_KEY = 'x1080x-ex:hdblog-blocked-keywords';\n"
    "export const HDBLOG_SEARCH_FILTER_ENABLED_KEY = 'x1080x-ex:hdblog-search-filter-enabled';\n"
)
replace_once(
    'src/hdblog-search.js',
    "export function applyHdblogSearchEnhancement(windowObject = window) {\n  if (!isHdblogSearchUrl(windowObject.location.href)) {\n",
    '''export function isHdblogSearchEnhancementEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY, true) !== false;
}

export function applyHdblogSearchEnhancement(windowObject = window) {
  if (!isHdblogSearchEnhancementEnabled() || !isHdblogSearchUrl(windowObject.location.href)) {
'''
)
replace_once(
    'src/hdblog-search.js',
    "function getBlockedKeywords() {\n  const stored = GM_getValue(STORAGE_KEY, null);\n",
    "function getBlockedKeywords() {\n"
    "  const stored = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, null) : null;\n"
)

# agaghhh Preview search shares the hdblog filter switch.
replace_once(
    'src/agaghhh-hdblog-preview.js',
    "function getHdblogBlockedKeywords() {\n  const stored = typeof GM_getValue === 'function'\n",
    "function getHdblogBlockedKeywords() {\n"
    "  if (typeof GM_getValue === 'function' && GM_getValue('x1080x-ex:hdblog-search-filter-enabled', true) === false) return [];\n"
    "  const stored = typeof GM_getValue === 'function'\n"
)

# refer resolution is part of the Preview-expansion feature switch.
replace_once(
    'src/hdblog-refer.js',
    "import {\n  expandHdblogPreviewImages,\n  expandHdblogPixhostPreviewImages,\n} from './hdblog-preview.js';\n",
    "import {\n  expandHdblogPreviewImages,\n  expandHdblogPixhostPreviewImages,\n} from './hdblog-preview.js';\n"
    "import { isHdblogPreviewExpansionEnabled } from './hdblog-article.js';\n"
)
replace_once(
    'src/hdblog-refer.js',
    "  if (!document || !isHdblogHostname(locationObject?.hostname)) return;\n  const run = () => void resolveHdblogPreviewReferLinks(document, locationObject, gmRequest);\n",
    "  if (!document || !isHdblogHostname(locationObject?.hostname) || !isHdblogPreviewExpansionEnabled()) return;\n"
    "  const run = () => {\n"
    "    if (!isHdblogPreviewExpansionEnabled()) return;\n"
    "    void resolveHdblogPreviewReferLinks(document, locationObject, gmRequest);\n"
    "  };\n"
)

# Generic batch-open button now respects the host-specific switch before it is rendered.
replace_once(
    'src/userscript.js',
    "const HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = 'x1080x-ex:hdblog-expand-preview-images';\n",
    "const HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = 'x1080x-ex:hdblog-expand-preview-images';\n"
    "const AGAGHHH_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:agaghhh-batch-open-enabled';\n"
    "const HDBLOG_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:hdblog-batch-open-enabled';\n"
)
replace_once(
    'src/userscript.js',
    "function isThreadPage() {\n",
    '''function currentHost() {
  return String(location.hostname || '').toLowerCase().replace(/\.$/, '');
}

function isBatchOpenEnabledForCurrentHost() {
  if (typeof GM_getValue !== 'function') return true;
  const host = currentHost();
  if (host === 'agaghhh.cc' || host.endsWith('.agaghhh.cc')) {
    return GM_getValue(AGAGHHH_BATCH_OPEN_ENABLED_KEY, true) !== false;
  }
  if (host === 'hdblog.me' || host.endsWith('.hdblog.me')) {
    return GM_getValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, true) !== false;
  }
  return true;
}

function isThreadPage() {
'''
)
replace_once(
    'src/userscript.js',
    "  if (isBatchOpenPage()) addBatchOpenButton();\n",
    "  if (isBatchOpenPage() && isBatchOpenEnabledForCurrentHost()) addBatchOpenButton();\n"
)

# ---------------------------------------------------------------------------
# README: current install link, switch inventory, current image naming and
# formal release guidance.
# ---------------------------------------------------------------------------
version = json.loads(read('package.json'))['version']
readme = f'''# x1080x-ex

面向 `agaghhh.cc` / `hdblog.me` 的 Tampermonkey 增强脚本：一键下载帖子资源、自动整理文件名，并补充 Preview 大图、跨站搜索、批量打开主题等功能。

## {version}：功能开关与设置整理

- `agaghhh.cc` 与 `hdblog.me` 的主要增强功能都可以在各自设置中独立开关。
- 新增 **跨站搜索按钮** 独立开关：agaghhh → hdblog、hdblog → agaghhh。
- hdblog 新增 **搜索结果过滤 / 单结果自动跳转**、**搜索/列表批量打开**、**文章宽度增强** 显式开关。
- hdblog 的 Preview 大图开关同时管理 Pixhost / refer 解析，关闭后不再主动解析或放大 Preview。
- qBittorrent 元数据回退与 FANZA / MGStage 官方 Preview 后备继续保留独立开关。

## 主要功能

- **一键下载**：下载 agaghhh 主楼附件、图片、Preview 大图和磁力链对应的 `.torrent`，不处理回复楼层附件。
- **自动命名**：下载增强内部自动识别番号、清理发布参数、处理 Windows 非法字符，并支持 FC2、1PON、CARIB 等现有规则。
- **Preview 大图**：agaghhh 按番号优先搜索 hdblog；无匹配时可选 FANZA → MGStage 官方后备源。
- **跨站搜索**：两站标题旁显示 `🔍`，按识别出的番号直接搜索另一站；无码日期型番号会自动使用日期型关键字。
- **真实演员查询**：主楼“出演者”为空时，可通过 `av-wiki.net` 查询演员并追加到下载文件名。
- **批量打开主题**：agaghhh 与 hdblog 的列表/搜索页均可独立控制是否显示后台顺序打开按钮。
- **qBittorrent 种子回退**：公共 torrent 缓存均失败时，可选用 qBittorrent 5.2+ 获取 metadata 并导出 `.torrent`，不会正式加入下载列表。

### BT 图片命名

BT 帖会下载主贴全部有效图片，再接上 hdblog Preview，并按总图片数统一编号：

```text
只有 1 张：SVMGM-050.jpg
2 张：     SVMGM-050 A.jpg / SVMGM-050 B.jpg
3 张：     SVMGM-050 A.jpg / SVMGM-050 B.jpg / SVMGM-050 C.jpg
```

超过 26 张会继续使用 `AA`、`AB`……。RAR/附件仍使用清理后的帖子标题命名。

## 设置

### agaghhh.cc：⚙️ x1080x 设置

可独立控制：

- **批量打开帖子功能**
- **下载增强**
- **跨站搜索按钮（🔍）**
- **显示大预览图（hdblog）**
- **官方后备预览图（FANZA / MGStage）**
- **查真实演员信息**
- **qBittorrent 元数据回退**，并配置 WebUI 地址、用户名、密码、metadata 等待时间和登录测试

跨站搜索与下载增强相互独立：即使关闭下载按钮，也可以保留 `🔍` 搜索按钮。

### hdblog.me：⚙️ hdblog 设置

可独立控制：

- **文章宽度增强** + 文章主内容区宽度
- **显示网盘下载区域**
- **图片下载按钮（⬇）**
- **跨站搜索按钮（🔍，搜索 agaghhh）**
- **自动展开 Preview 大图**（同时管理 Pixhost / refer 解析）
- **搜索 / 列表页批量打开主题**
- **搜索结果屏蔽与单结果自动跳转** + 屏蔽关键词
- **额外图床域名**（Preview 图床兼容配置）

两套设置互不混用；hdblog 的搜索屏蔽规则仍会被 agaghhh 的 hdblog Preview 搜索复用。

### qBittorrent 种子回退

启用后需要填写：

1. **WebUI 地址**，例如 `http://127.0.0.1:8080`
2. **用户名**
3. **密码**
4. **等待元数据时间**，默认 60 秒，可设置 10～300 秒

建议先点 **测试 qBittorrent 登录**。当前 metadata 接口要求 qBittorrent **5.2.0+ / WebAPI 2.11.9+**。

```text
公共缓存
  ↓ 全部失败
qBittorrent 登录
  ↓
已有相同任务 → torrents/export
  ↓ 不存在
POST torrents/fetchMetadata → DHT / Tracker / Peer 获取 metadata
  ↓
torrents/saveMetadata → 导出 .torrent
```

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击：**[安装 x1080x-ex](https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js)**
3. 打开支持的网站并刷新页面。

正式版本也会发布到 [GitHub Releases](https://github.com/Kesuy/x1080x-ex/releases)，Release 附带可直接安装的 `x1080x-ex.user.js`。

首次批量下载时，浏览器可能会询问多文件下载权限，请选择允许。

## 域名设置

脚本元数据使用 `@match *://*/*` 以兼容网站换域名，但业务代码只在允许列表内运行，默认域名为 `agaghhh.cc` 和 `hdblog.me`。

Tampermonkey 菜单提供：

- **⚙️ 设置匹配域名**
- **➕ 添加当前域名**
- **↩️ 重置默认域名**

## 隐私与安全

- 不收集、不上传用户数据，也不会把 qBittorrent 登录信息发送给第三方服务。
- qBittorrent WebUI 地址、用户名和密码保存在 userscript 管理器的脚本专属本地存储中。
- 仅在相应功能开启时访问 hdblog、agaghhh、av-wiki、FANZA、MGStage 或你配置的 qBittorrent WebUI。
- 外部查询失败不会阻断其它独立功能。

## 本地开发

```bash
npm install
npm run check
```

构建产物位于 `dist/x1080x-ex.user.js`。

项目以 [MIT License](LICENSE) 发布。
'''
write('README.md', readme)

# ---------------------------------------------------------------------------
# Regression tests for the new switch inventory and independence.
# ---------------------------------------------------------------------------
write('test/settings-switches.test.js', r'''import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_CROSS_SEARCH_ENABLED_KEY,
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  installAgaghhhEnhancement,
  openX1080xSettingsPanel,
} from '../src/agaghhh-enhancement.js';
import {
  HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY,
  HDBLOG_BATCH_OPEN_ENABLED_KEY,
  HDBLOG_SEARCH_FILTER_ENABLED_KEY,
  HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY,
  installHdblogArticleEnhancement,
  openHdblogSettingsPanel,
} from '../src/hdblog-article.js';
import { applyHdblogSearchEnhancement } from '../src/hdblog-search.js';

function withGm(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  try { return callback(); }
  finally {
    if (oldGet === undefined) delete globalThis.GM_getValue; else globalThis.GM_getValue = oldGet;
    if (oldSet === undefined) delete globalThis.GM_setValue; else globalThis.GM_setValue = oldSet;
  }
}

function hdblogArticleDom() {
  return new JSDOM(`<!doctype html><html><body class="single single-post">
    <main id="genesis-content"><article class="entry">
      <header class="entry-header"><h1 class="entry-title">SVMGM-050 Sample</h1><p class="entry-meta">date</p></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article></main>
  </body></html>`, { url: 'https://hdblog.me/964139/svmgm-050/' });
}

test('x1080x settings exposes every independent agaghhh feature switch', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  withGm(new Map(), () => {
    const panel = openX1080xSettingsPanel(dom.window.document);
    for (const key of ['batch-open', 'download', 'cross-search', 'hdblog-preview', 'real-actress']) {
      assert.ok(panel.querySelector(`[data-setting="${key}"]`), key);
    }
  });
});

test('agaghhh cross-search remains available when download enhancement is off', () => {
  const dom = new JSDOM(`<!doctype html><body><div class="vwthd">
    <span id="thread_subject">SVMGM-050 Sample</span><button id="x1080x-ex-download">⬇</button>
  </div></body>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1' });
  const values = new Map([
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, false],
    [AGAGHHH_CROSS_SEARCH_ENABLED_KEY, true],
    [AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);
  withGm(values, () => installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {}));
  assert.equal(dom.window.document.getElementById('x1080x-ex-download'), null);
  assert.ok(dom.window.document.getElementById('x1080x-ex-agaghhh-hdblog-search'));
});

test('hdblog settings exposes layout, cross-search, preview, batch-open and search-filter switches', () => {
  const dom = hdblogArticleDom();
  withGm(new Map(), () => {
    const panel = openHdblogSettingsPanel(dom.window.document);
    for (const key of ['layout-enabled', 'show-downloads', 'show-image-download', 'cross-search', 'expand-preview', 'batch-open', 'search-filter']) {
      assert.ok(panel.querySelector(`[data-setting="${key}"]`), key);
    }
  });
});

test('hdblog cross-search and image-download buttons can be controlled independently', () => {
  const dom = hdblogArticleDom();
  const values = new Map([
    [HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, false],
    [HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, true],
    ['x1080x-ex:hdblog-show-image-download-button', false],
  ]);
  withGm(values, () => installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {}));
  assert.equal(dom.window.document.getElementById('x1080x-ex-hdblog-image-download'), null);
  assert.ok(dom.window.document.getElementById('x1080x-ex-hdblog-agaghhh-search'));
});

test('disabling hdblog search filtering leaves search results untouched', () => {
  const dom = new JSDOM(`<!doctype html><body><main id="genesis-content">
    <article class="entry"><h2 class="entry-title"><a href="/1/a/">モザイク破壊 A</a></h2></article>
    <article class="entry"><h2 class="entry-title"><a href="/2/b/">SVMGM-050 B</a></h2></article>
  </main></body>`, { url: 'https://hdblog.me/?s=SVMGM-050' });
  const values = new Map([[HDBLOG_SEARCH_FILTER_ENABLED_KEY, false]]);
  withGm(values, () => {
    const result = applyHdblogSearchEnhancement(dom.window);
    assert.equal(result.redirectTarget, '');
  });
  assert.equal(dom.window.document.querySelectorAll('article.entry').length, 2);
});

test('new hdblog switches default to enabled except layout which preserves legacy blank-width behavior', () => {
  const dom = hdblogArticleDom();
  const values = new Map();
  withGm(values, () => {
    const panel = openHdblogSettingsPanel(dom.window.document);
    assert.equal(panel.querySelector('[data-setting="layout-enabled"]').checked, false);
    assert.equal(panel.querySelector('[data-setting="cross-search"]').checked, true);
    assert.equal(panel.querySelector('[data-setting="batch-open"]').checked, true);
    assert.equal(panel.querySelector('[data-setting="search-filter"]').checked, true);
  });
  assert.equal(HDBLOG_BATCH_OPEN_ENABLED_KEY, 'x1080x-ex:hdblog-batch-open-enabled');
});
''')

# Make sure the temporary build plumbing is not part of the release commit.
Path('scripts/temp-release-1.10.0.py').unlink(missing_ok=True)
Path('.github/workflows/temp-release-1.10.0.yml').unlink(missing_ok=True)
