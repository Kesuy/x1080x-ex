from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} not found')
    return text.replace(old, new, 1)


article_path = Path('src/hdblog-article.js')
source = article_path.read_text(encoding='utf-8')
source = replace_once(source, """export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const HDBLOG_SHOW_DOWNLOAD_AREA_KEY = 'x1080x-ex:hdblog-show-download-area';
export const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';
""", """export const HDBLOG_ARTICLE_WIDTH_KEY = 'x1080x-ex:hdblog-article-width';
export const HDBLOG_SHOW_DOWNLOAD_AREA_KEY = 'x1080x-ex:hdblog-show-download-area';
export const HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY = 'x1080x-ex:hdblog-show-image-download-button';
export const HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = 'x1080x-ex:hdblog-expand-preview-images';
export const HDBLOG_BLOCKED_KEYWORDS_KEY = 'x1080x-ex:hdblog-blocked-keywords';
""", 'article setting keys')

source = replace_once(source, """body.${ARTICLE_BODY_CLASS} article.entry,
body.${ARTICLE_BODY_CLASS} article.post {
  width: min(100%, var(--x1080x-hdblog-original-article-width)) !important;
  max-width: var(--x1080x-hdblog-original-article-width) !important;
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-content,
body.${ARTICLE_BODY_CLASS} article.post > .entry-content {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}
""", """body.${ARTICLE_BODY_CLASS} article.entry,
body.${ARTICLE_BODY_CLASS} article.post {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  box-shadow: none !important;
}
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-content,
body.${ARTICLE_BODY_CLASS} article.post > .entry-content,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-footer,
body.${ARTICLE_BODY_CLASS} article.post > .entry-footer,
body.${ARTICLE_BODY_CLASS} main#genesis-content > .entry-comments,
body.${ARTICLE_BODY_CLASS} main#genesis-content > .comment-respond,
body.${ARTICLE_BODY_CLASS} #genesis-content.content > .entry-comments,
body.${ARTICLE_BODY_CLASS} #genesis-content.content > .comment-respond {
  width: min(100%, var(--x1080x-hdblog-original-article-width)) !important;
  max-width: var(--x1080x-hdblog-original-article-width) !important;
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
""", 'article inner layout')

source = replace_once(source, """function readDownloadAreaVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, true) !== false;
}

function readBlockedKeywordsText() {
""", """function readDownloadAreaVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, true) !== false;
}

function readImageDownloadButtonVisible() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, true) !== false;
}

export function isHdblogPreviewExpansionEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, true) !== false;
}

function readBlockedKeywordsText() {
""", 'article read settings')

source = replace_once(source, """    <label style=\"display:flex;align-items:center;gap:9px;margin-bottom:16px;font-weight:600\">
      <input data-setting=\"show-downloads\" type=\"checkbox\">
      显示 Btfile / katfile / Freedl / Rapidgator 网盘下载区域
    </label>
    <label style=\"display:block;margin-bottom:18px\">
""", """    <div style=\"margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa\">
      <div style=\"font-weight:700;margin-bottom:10px\">文章页显示</div>
      <label style=\"display:flex;align-items:center;gap:9px;margin-bottom:10px\">
        <input data-setting=\"show-downloads\" type=\"checkbox\">
        显示 Btfile / katfile / Freedl / Rapidgator 网盘下载区域
      </label>
      <label style=\"display:flex;align-items:center;gap:9px;margin-bottom:10px\">
        <input data-setting=\"show-image-download\" type=\"checkbox\">
        显示标题旁的图片下载按钮（⬇）
      </label>
      <label style=\"display:flex;align-items:center;gap:9px\">
        <input data-setting=\"expand-preview\" type=\"checkbox\">
        自动展开 Preview 大图
      </label>
      <small style=\"display:block;margin-top:9px;color:#666\">关闭 Preview 大图后保留网站原始缩略图；保存设置后页面会自动刷新。</small>
    </div>
    <label style=\"display:block;margin-bottom:18px\">
""", 'settings panel checkbox block')

source = replace_once(source, """  const widthInput = panel.querySelector('[data-setting=\"width\"]');
  const downloadsInput = panel.querySelector('[data-setting=\"show-downloads\"]');
  const keywordsInput = panel.querySelector('[data-setting=\"keywords\"]');
  widthInput.value = rawStoredWidth();
  downloadsInput.checked = readDownloadAreaVisible();
  keywordsInput.value = readBlockedKeywordsText();
""", """  const widthInput = panel.querySelector('[data-setting=\"width\"]');
  const downloadsInput = panel.querySelector('[data-setting=\"show-downloads\"]');
  const imageDownloadInput = panel.querySelector('[data-setting=\"show-image-download\"]');
  const previewInput = panel.querySelector('[data-setting=\"expand-preview\"]');
  const keywordsInput = panel.querySelector('[data-setting=\"keywords\"]');
  widthInput.value = rawStoredWidth();
  downloadsInput.checked = readDownloadAreaVisible();
  imageDownloadInput.checked = readImageDownloadButtonVisible();
  previewInput.checked = isHdblogPreviewExpansionEnabled();
  keywordsInput.value = readBlockedKeywordsText();
""", 'settings panel input wiring')

source = replace_once(source, """    if (typeof GM_setValue === 'function') {
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
""", """    if (typeof GM_setValue === 'function') {
      GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, widthText ? numeric : '');
      GM_setValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, downloadsInput.checked);
      GM_setValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, imageDownloadInput.checked);
      GM_setValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, previewInput.checked);
      GM_setValue(HDBLOG_BLOCKED_KEYWORDS_KEY, normalizeBlockedKeywordsText(keywordsInput.value));
    }

    closeHdblogSettingsPanel(document);
    const view = document.defaultView;
    if (view?.location?.reload) view.location.reload();
""", 'settings save block')

source = replace_once(source, """  applyHdblogDownloadAreaVisibility(document, readDownloadAreaVisible());
  installDownloadButton(document, locationObject, gmRequest);
}
""", """  applyHdblogDownloadAreaVisibility(document, readDownloadAreaVisible());
  if (readImageDownloadButtonVisible()) installDownloadButton(document, locationObject, gmRequest);
  else document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
}
""", 'article install button block')
article_path.write_text(source, encoding='utf-8')

preview_path = Path('src/hdblog-preview.js')
preview = preview_path.read_text(encoding='utf-8')
preview = replace_once(preview,
    "import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';\n",
    "import { isPixhostShowUrl, resolvePixhostShowUrl } from './pixhost.js';\nimport { isHdblogPreviewExpansionEnabled } from './hdblog-article.js';\n",
    'preview import')
preview = replace_once(preview,
    "const PREVIEW_VIEWPORT_GUTTER_PX = 12;\nconst PREVIEW_VIEWPORT_WIDTH = `calc(100vw - ${PREVIEW_VIEWPORT_GUTTER_PX * 2}px)`;\n",
    "const PREVIEW_VIEWPORT_WIDTH = 'min(var(--x1080x-hdblog-article-width, 100%), calc(100vw - 40px))';\n",
    'preview width constants')
preview = replace_once(preview, """export function installHdblogPreviewImages(document = globalThis.document, locationObject = globalThis.location) {
  if (!document || !isHdblogHost(locationObject)) return;
  const run = () => {
""", """export function installHdblogPreviewImages(document = globalThis.document, locationObject = globalThis.location) {
  if (!document || !isHdblogHost(locationObject) || !isHdblogPreviewExpansionEnabled()) return;
  const run = () => {
    if (!isHdblogPreviewExpansionEnabled()) return;
""", 'preview install')
preview_path.write_text(preview, encoding='utf-8')

userscript_path = Path('src/userscript.js')
userscript = userscript_path.read_text(encoding='utf-8')
userscript = replace_once(userscript,
    "const STORAGE_KEY = 'x1080x-ex:domains';\n",
    "const STORAGE_KEY = 'x1080x-ex:domains';\nconst HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = 'x1080x-ex:hdblog-expand-preview-images';\n",
    'userscript storage key')
userscript = replace_once(userscript, """if (isAllowedHost(location.hostname, getConfiguredDomains())) {
  expandHdblogPreviewImages();
  if (isThreadPage()) addDownloadButton();
""", """if (isAllowedHost(location.hostname, getConfiguredDomains())) {
  const expandHdblogPreview = typeof GM_getValue !== 'function'
    || GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, true) !== false;
  if (expandHdblogPreview) expandHdblogPreviewImages();
  if (isThreadPage()) addDownloadButton();
""", 'userscript preview call')
userscript_path.write_text(userscript, encoding='utf-8')

test_path = Path('test/hdblog-article.test.js')
test = test_path.read_text(encoding='utf-8')
test = replace_once(test, """  installHdblogArticleEnhancement,
  normalizeHdblogArticleWidth,
} from '../src/hdblog-article.js';
""", """  installHdblogArticleEnhancement,
  normalizeHdblogArticleWidth,
  openHdblogSettingsPanel,
} from '../src/hdblog-article.js';
""", 'article test import')
test = replace_once(test, """  assert.match(style.textContent, /article\\.entry,[\\s\\S]*?width:\\s*min\\(100%, var\\(--x1080x-hdblog-original-article-width\\)\\) !important/);
  assert.match(style.textContent, /max-width:\\s*var\\(--x1080x-hdblog-original-article-width\\) !important/);
""", """  assert.match(style.textContent, /article\\.entry,[\\s\\S]*?width:\\s*100% !important/);
  assert.match(style.textContent, /article\\.entry > \\.entry-header,[\\s\\S]*?width:\\s*min\\(100%, var\\(--x1080x-hdblog-original-article-width\\)\\) !important/);
  assert.match(style.textContent, /max-width:\\s*var\\(--x1080x-hdblog-original-article-width\\) !important/);
  assert.match(style.textContent, /box-shadow:\\s*none !important/);
""", 'article layout test assertions')
test = replace_once(test, "test('article download button uses an icon-only idle label', () => {\n", r'''test('hdblog settings panel includes download-button and Preview expansion switches', () => {
  const dom = articleDom();
  const panel = openHdblogSettingsPanel(dom.window.document);
  assert.ok(panel);
  assert.ok(panel.querySelector('[data-setting="show-downloads"]'));
  assert.ok(panel.querySelector('[data-setting="show-image-download"]'));
  assert.ok(panel.querySelector('[data-setting="expand-preview"]'));
  assert.ok(panel.querySelector('[data-setting="keywords"]'));
  panel.remove();
});

test('article download button uses an icon-only idle label', () => {
''', 'article settings test anchor')
test_path.write_text(test, encoding='utf-8')

preview_real_test_path = Path('test/hdblog-preview-real-dom.test.js')
preview_real_test = preview_real_test_path.read_text(encoding='utf-8')
preview_real_test = preview_real_test.replace("'calc(100vw - 24px)'", "'min(var(--x1080x-hdblog-article-width, 100%), calc(100vw - 40px))'")
preview_real_test_path.write_text(preview_real_test, encoding='utf-8')

user_preview_test_path = Path('test/hdblog-preview.test.js')
user_preview_test = user_preview_test_path.read_text(encoding='utf-8')
user_preview_test = replace_once(user_preview_test, "test('非 hdblog 域名不修改同样的 Preview 页面结构', async () => {\n", r'''test('hdblog Preview 大图设置关闭时保留原始缩略图', async () => {
  const dom = new JSDOM(`
    <main id="genesis-content"><article class="entry"><div class="entry-content">
      <p><strong>Preview:</strong></p>
      <p><a href="/full.jpg"><img id="preview-disabled" src="/thumb.jpg" width="300"></a></p>
    </div></article></main>
  `, { url: 'https://hdblog.me/example/' });
  const restore = installDomGlobals(dom.window);
  globalThis.GM_getValue = (key, fallback) => (
    key === 'x1080x-ex:hdblog-expand-preview-images' ? false : fallback
  );

  try {
    await import(`../src/userscript.js?hdblog-preview-disabled=${Date.now()}`);
    const image = dom.window.document.querySelector('#preview-disabled');
    assert.equal(image.src, 'https://hdblog.me/thumb.jpg');
    assert.equal(image.getAttribute('width'), '300');
    assert.equal(image.dataset.x1080xPreviewExpanded, undefined);
  } finally {
    restore();
    dom.window.close();
  }
});

test('非 hdblog 域名不修改同样的 Preview 页面结构', async () => {
''', 'preview disabled test anchor')
user_preview_test_path.write_text(user_preview_test, encoding='utf-8')
