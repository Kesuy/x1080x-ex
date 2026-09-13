from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/hdblog-article.js',
    "const DOWNLOAD_BUTTON_ID = 'x1080x-ex-hdblog-image-download';\n",
    "const DOWNLOAD_BUTTON_ID = 'x1080x-ex-hdblog-image-download';\n"
    "const SEARCH_BUTTON_ID = 'x1080x-ex-hdblog-agaghhh-search';\n"
)

replace_once(
    'src/hdblog-article.js',
    """  return extractHdblogVideoCode(labelled?.[1] || text);\n}\n\nfunction absoluteHttpUrl(document, value) {\n""",
    """  return extractHdblogVideoCode(labelled?.[1] || text);\n}\n\nexport function hdblogAgaghhhSearchKeyword(code) {\n  const source = normalizeText(code);\n  const uncensored = source.match(/^[A-Z0-9][A-Z0-9.+-]{1,31}\\s+(\\d{6}[-_]\\d{2,4})$/i);\n  return uncensored?.[1] || source;\n}\n\nexport function buildAgaghhhSearchUrl(code) {\n  const keyword = hdblogAgaghhhSearchKeyword(code);\n  if (!keyword) return '';\n  return `https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=${encodeURIComponent(keyword)}&orderby=lastpost&ascdesc=desc`;\n}\n\nfunction openSearchTab(document, url) {\n  if (!url) return;\n  if (typeof GM_openInTab === 'function') {\n    GM_openInTab(url, { active: true, insert: true, setParent: true });\n    return;\n  }\n  document.defaultView?.open(url, '_blank', 'noopener');\n}\n\nfunction absoluteHttpUrl(document, value) {\n"""
)

replace_once(
    'src/hdblog-article.js',
    """  button.addEventListener('click', () => void downloadHdblogArticleImages(\n    button,\n    document,\n    locationObject,\n    gmRequest,\n    initialCandidates\n  ));\n  title.append(' ', button);\n}\n""",
    """  button.addEventListener('click', () => void downloadHdblogArticleImages(\n    button,\n    document,\n    locationObject,\n    gmRequest,\n    initialCandidates\n  ));\n\n  const searchButton = document.createElement('button');\n  searchButton.id = SEARCH_BUTTON_ID;\n  searchButton.type = 'button';\n  searchButton.textContent = '🔍';\n  searchButton.title = '按当前番号在 agaghhh.cc 搜索';\n  searchButton.setAttribute('aria-label', '在 agaghhh.cc 搜索当前番号');\n  Object.assign(searchButton.style, {\n    display: 'inline-flex',\n    alignItems: 'center',\n    verticalAlign: 'middle',\n    margin: '0 0 4px 8px',\n    padding: '5px 8px',\n    minWidth: '34px',\n    justifyContent: 'center',\n    border: '1px solid #2878c8',\n    borderRadius: '5px',\n    color: '#fff',\n    background: '#398bd4',\n    cursor: 'pointer',\n    fontSize: '13px',\n    fontWeight: '600',\n    lineHeight: '20px',\n  });\n  searchButton.addEventListener('mouseenter', () => { searchButton.style.background = '#246eaf'; });\n  searchButton.addEventListener('mouseleave', () => { searchButton.style.background = '#398bd4'; });\n  searchButton.addEventListener('click', () => {\n    const url = buildAgaghhhSearchUrl(extractHdblogArticleCode(document));\n    if (!url) {\n      document.defaultView?.alert('没有识别到影片番号。');\n      return;\n    }\n    openSearchTab(document, url);\n  });\n  title.append(' ', searchButton, ' ', button);\n}\n"""
)

replace_once(
    'src/agaghhh-enhancement.js',
    "import { installAgaghhhHdblogPreview } from './agaghhh-hdblog-preview.js';\n",
    "import { hdblogSearchCodeForThreadCode, installAgaghhhHdblogPreview } from './agaghhh-hdblog-preview.js';\n"
)

replace_once(
    'src/agaghhh-enhancement.js',
    "const DOWNLOAD_BUTTON_ID = 'x1080x-ex-download';\n",
    "const DOWNLOAD_BUTTON_ID = 'x1080x-ex-download';\n"
    "const SEARCH_BUTTON_ID = 'x1080x-ex-agaghhh-hdblog-search';\n"
)

replace_once(
    'src/agaghhh-enhancement.js',
    """function threadCode(document) {\n  return parseThreadTitle(threadTitleElement(document)?.textContent || document.title).code;\n}\n\nfunction bindRealActressDownload(document, gmRequest) {\n""",
    """function threadCode(document) {\n  return parseThreadTitle(threadTitleElement(document)?.textContent || document.title).code;\n}\n\nexport function buildHdblogSearchUrlForThreadCode(code) {\n  const keyword = hdblogSearchCodeForThreadCode(code);\n  return keyword ? `http://hdblog.me/?s=${encodeURIComponent(keyword)}` : '';\n}\n\nfunction openSearchTab(document, url) {\n  if (!url) return;\n  if (typeof GM_openInTab === 'function') {\n    GM_openInTab(url, { active: true, insert: true, setParent: true });\n    return;\n  }\n  document.defaultView?.open(url, '_blank', 'noopener');\n}\n\nfunction installHdblogSearchButton(document) {\n  if (document.getElementById(SEARCH_BUTTON_ID)) return;\n  const downloadButton = document.getElementById(DOWNLOAD_BUTTON_ID);\n  if (!downloadButton) return;\n  const code = threadCode(document);\n  if (!code) return;\n\n  const button = document.createElement('button');\n  button.id = SEARCH_BUTTON_ID;\n  button.type = 'button';\n  button.textContent = '🔍';\n  button.title = '按当前番号在 hdblog 搜索';\n  button.setAttribute('aria-label', '在 hdblog 搜索当前番号');\n  Object.assign(button.style, {\n    float: 'right',\n    position: 'relative',\n    zIndex: '20',\n    margin: '0 0 6px 4px',\n    padding: '7px 10px',\n    minWidth: '38px',\n    border: '1px solid #2878c8',\n    borderRadius: '5px',\n    color: '#fff',\n    background: '#398bd4',\n    cursor: 'pointer',\n    fontSize: '14px',\n    lineHeight: '20px',\n  });\n  button.addEventListener('mouseenter', () => { button.style.background = '#246eaf'; });\n  button.addEventListener('mouseleave', () => { button.style.background = '#398bd4'; });\n  button.addEventListener('click', () => {\n    const url = buildHdblogSearchUrlForThreadCode(threadCode(document));\n    if (!url) {\n      document.defaultView?.alert('没有识别到影片番号。');\n      return;\n    }\n    openSearchTab(document, url);\n  });\n  downloadButton.insertAdjacentElement('afterend', button);\n}\n\nfunction bindRealActressDownload(document, gmRequest) {\n"""
)

replace_once(
    'src/agaghhh-enhancement.js',
    """  if (!isAgaghhhDownloadEnabled()) {\n    document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();\n    return;\n  }\n\n  if (isAgaghhhRealActressEnabled()) bindRealActressDownload(document, gmRequest);\n}\n""",
    """  if (!isAgaghhhDownloadEnabled()) {\n    document.getElementById(DOWNLOAD_BUTTON_ID)?.remove();\n    document.getElementById(SEARCH_BUTTON_ID)?.remove();\n    return;\n  }\n\n  installHdblogSearchButton(document);\n  if (isAgaghhhRealActressEnabled()) bindRealActressDownload(document, gmRequest);\n}\n"""
)

Path('test/cross-search-buttons.test.js').write_text(r'''import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  buildAgaghhhSearchUrl,
  hdblogAgaghhhSearchKeyword,
  installHdblogArticleEnhancement,
} from '../src/hdblog-article.js';
import {
  AGAGHHH_DOWNLOAD_ENABLED_KEY,
  AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY,
  AGAGHHH_REAL_ACTRESS_ENABLED_KEY,
  buildHdblogSearchUrlForThreadCode,
  installAgaghhhEnhancement,
} from '../src/agaghhh-enhancement.js';

function withGlobals(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldOpen = globalThis.GM_openInTab;
  const opened = [];
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_openInTab = (url, options) => opened.push({ url, options });
  try {
    callback(opened);
  } finally {
    if (oldGet === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = oldGet;
    if (oldOpen === undefined) delete globalThis.GM_openInTab;
    else globalThis.GM_openInTab = oldOpen;
  }
}

test('hdblog builds agaghhh search URLs and strips uncensored studio names', () => {
  assert.equal(hdblogAgaghhhSearchKeyword('SVMGM-050'), 'SVMGM-050');
  assert.equal(hdblogAgaghhhSearchKeyword('1pondo 121125_001'), '121125_001');
  assert.equal(
    buildAgaghhhSearchUrl('SVMGM-050'),
    'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SVMGM-050&orderby=lastpost&ascdesc=desc'
  );
  assert.equal(
    buildAgaghhhSearchUrl('1pondo 121125_001'),
    'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=121125_001&orderby=lastpost&ascdesc=desc'
  );
});

test('hdblog article shows a search icon beside download and opens agaghhh search', () => {
  const dom = new JSDOM(`<!doctype html><html><body class="single single-post">
    <main id="genesis-content"><article class="entry">
      <header class="entry-header"><h1 class="entry-title">SVMGM-050 Sample</h1><p class="entry-meta">date</p></header>
      <div class="entry-content"><p>Preview:</p></div>
    </article></main>
  </body></html>`, { url: 'https://hdblog.me/964139/svmgm-050/' });

  withGlobals(new Map(), (opened) => {
    installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {});
    const download = dom.window.document.querySelector('#x1080x-ex-hdblog-image-download');
    const search = dom.window.document.querySelector('#x1080x-ex-hdblog-agaghhh-search');
    assert.ok(download);
    assert.ok(search);
    assert.equal(search.textContent, '🔍');
    assert.equal(search.getAttribute('aria-label'), '在 agaghhh.cc 搜索当前番号');
    search.click();
    assert.equal(opened[0]?.url, 'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SVMGM-050&orderby=lastpost&ascdesc=desc');
  });
});

test('agaghhh builds hdblog URLs with normal and uncensored thread codes', () => {
  assert.equal(buildHdblogSearchUrlForThreadCode('SVMGM-050'), 'http://hdblog.me/?s=SVMGM-050');
  assert.equal(buildHdblogSearchUrlForThreadCode('1PON-121125_001'), 'http://hdblog.me/?s=121125_001');
  assert.equal(buildHdblogSearchUrlForThreadCode('CARIB-092425-001'), 'http://hdblog.me/?s=092425-001');
});

test('agaghhh thread shows a search icon beside download and opens hdblog search', () => {
  const dom = new JSDOM(`<!doctype html><html><head><title>121125_001-1PON</title></head><body>
    <div class="vwthd"><span id="thread_subject">121125_001-1PON [BT](無碼) 一本道 M癡女 冨樫美緒</span>
      <button id="x1080x-ex-download">⬇</button>
    </div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424' });

  const values = new Map([
    [AGAGHHH_DOWNLOAD_ENABLED_KEY, true],
    [AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, false],
    [AGAGHHH_REAL_ACTRESS_ENABLED_KEY, false],
  ]);
  withGlobals(values, (opened) => {
    installAgaghhhEnhancement(dom.window.document, dom.window.location, () => {});
    const search = dom.window.document.querySelector('#x1080x-ex-agaghhh-hdblog-search');
    assert.ok(search);
    assert.equal(search.textContent, '🔍');
    assert.equal(search.getAttribute('aria-label'), '在 hdblog 搜索当前番号');
    search.click();
    assert.equal(opened[0]?.url, 'http://hdblog.me/?s=121125_001');
  });
});
''', encoding='utf-8')
