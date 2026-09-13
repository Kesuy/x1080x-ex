from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


path = Path('src/agaghhh-enhancement.js')
text = path.read_text(encoding='utf-8')

text = replace_once(
    text,
    "export const AGAGHHH_CROSS_SEARCH_ENABLED_KEY = 'x1080x-ex:agaghhh-cross-search-enabled';\nexport const AGAGHHH_REAL_ACTRESS_ENABLED_KEY",
    "export const AGAGHHH_CROSS_SEARCH_ENABLED_KEY = 'x1080x-ex:agaghhh-cross-search-enabled';\nexport const AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY = 'x1080x-ex:agaghhh-search-auto-redirect-enabled';\nexport const AGAGHHH_REAL_ACTRESS_ENABLED_KEY",
    'setting key',
)

text = replace_once(
    text,
    "export function isAgaghhhCrossSearchEnabled() {\n  return readBooleanSetting(AGAGHHH_CROSS_SEARCH_ENABLED_KEY);\n}\n\nexport function isAgaghhhRealActressEnabled()",
    "export function isAgaghhhCrossSearchEnabled() {\n  return readBooleanSetting(AGAGHHH_CROSS_SEARCH_ENABLED_KEY);\n}\n\nexport function isAgaghhhSearchAutoRedirectEnabled() {\n  return readBooleanSetting(AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY);\n}\n\nexport function isAgaghhhRealActressEnabled()",
    'setting reader',
)

marker = "function firstPostContent(document) {"
insert = r'''export function isAgaghhhForumSearchPage(locationObject = globalThis.location) {
  if (!isAgaghhhHost(locationObject)) return false;
  let url;
  try {
    url = new URL(locationObject?.href || '');
  } catch {
    return false;
  }
  if (!/\/search\.php$/i.test(url.pathname) || url.searchParams.get('mod') !== 'forum') return false;
  const hasSearch = normalizeText(url.searchParams.get('srchtxt')) || url.searchParams.has('searchid');
  if (!hasSearch) return false;
  const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
  return !Number.isFinite(page) || page <= 1;
}

function isAgaghhhThreadResultUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!isAgaghhhHost({ hostname: url.hostname })) return false;
    return (url.searchParams.get('mod') === 'viewthread' && url.searchParams.has('tid'))
      || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function collectAgaghhhSearchResultUrls(document) {
  if (!document) return [];
  const seen = new Set();
  const anchors = document.querySelectorAll(
    '#ct .slst a[href], #threadlist a.xst[href], #threadlist a[href*="mod=viewthread"][href*="tid="]'
  );
  return [...anchors]
    .map((anchor) => {
      try {
        return new URL(anchor.getAttribute('href'), document.baseURI).href;
      } catch {
        return '';
      }
    })
    .filter((url) => url && isAgaghhhThreadResultUrl(url, document.baseURI))
    .filter((url) => !seen.has(url) && seen.add(url));
}

export function findAgaghhhSingleSearchResultUrl(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!document || !isAgaghhhForumSearchPage(locationObject)) return '';
  const results = collectAgaghhhSearchResultUrls(document);
  return results.length === 1 ? results[0] : '';
}

export function installAgaghhhSearchAutoRedirect(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!isAgaghhhSearchAutoRedirectEnabled()) return '';
  const target = findAgaghhhSingleSearchResultUrl(document, locationObject);
  if (!target) return '';
  if (typeof locationObject?.assign === 'function') locationObject.assign(target);
  else if (locationObject && 'href' in locationObject) locationObject.href = target;
  return target;
}

'''
text = replace_once(text, marker, insert + marker, 'search helpers')

old_ui = '''      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="cross-search" type="checkbox" style="margin-top:3px">
        <span><strong>跨站搜索按钮（🔍）</strong><small style="display:block;margin-top:2px;color:#666">在帖子标题旁显示搜索按钮，识别番号后直接打开 hdblog 搜索；可独立于下载增强使用。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="hdblog-preview" type="checkbox" style="margin-top:3px">'''
new_ui = '''      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="cross-search" type="checkbox" style="margin-top:3px">
        <span><strong>跨站搜索按钮（🔍）</strong><small style="display:block;margin-top:2px;color:#666">在帖子标题旁显示搜索按钮，识别番号后直接打开 hdblog 搜索；可独立于下载增强使用。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="search-auto-redirect" type="checkbox" style="margin-top:3px">
        <span><strong>搜索单结果自动跳转</strong><small style="display:block;margin-top:2px;color:#666">agaghhh 论坛搜索第一页只有 1 个唯一主题时，自动进入该主题；0 个或多个结果不跳转。</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="hdblog-preview" type="checkbox" style="margin-top:3px">'''
text = replace_once(text, old_ui, new_ui, 'settings ui')

text = replace_once(
    text,
    "  const crossSearchInput = panel.querySelector('[data-setting=\"cross-search\"]');\n  const previewInput",
    "  const crossSearchInput = panel.querySelector('[data-setting=\"cross-search\"]');\n  const searchAutoRedirectInput = panel.querySelector('[data-setting=\"search-auto-redirect\"]');\n  const previewInput",
    'settings input',
)
text = replace_once(
    text,
    "  crossSearchInput.checked = isAgaghhhCrossSearchEnabled();\n  previewInput.checked",
    "  crossSearchInput.checked = isAgaghhhCrossSearchEnabled();\n  searchAutoRedirectInput.checked = isAgaghhhSearchAutoRedirectEnabled();\n  previewInput.checked",
    'settings checked',
)
text = replace_once(
    text,
    "      GM_setValue(AGAGHHH_CROSS_SEARCH_ENABLED_KEY, crossSearchInput.checked);\n      GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY",
    "      GM_setValue(AGAGHHH_CROSS_SEARCH_ENABLED_KEY, crossSearchInput.checked);\n      GM_setValue(AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY, searchAutoRedirectInput.checked);\n      GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY",
    'settings save',
)

text = replace_once(
    text,
    "  if (!document || !isAgaghhhHost(locationObject)) return;\n\n  if (!isAgaghhhBatchOpenEnabled())",
    "  if (!document || !isAgaghhhHost(locationObject)) return;\n\n  if (installAgaghhhSearchAutoRedirect(document, locationObject)) return;\n\n  if (!isAgaghhhBatchOpenEnabled())",
    'installer',
)
path.write_text(text, encoding='utf-8')

# Regression tests for real Discuz-like search markup, setting default, disabled state, and page safety.
test = r'''import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY,
  collectAgaghhhSearchResultUrls,
  findAgaghhhSingleSearchResultUrl,
  installAgaghhhSearchAutoRedirect,
  isAgaghhhSearchAutoRedirectEnabled,
  openX1080xSettingsPanel,
} from '../src/agaghhh-enhancement.js';

const SEARCH_URL = 'https://agaghhh.cc/search.php?mod=forum&searchsubmit=yes&srchtxt=SVMGM-050&orderby=lastpost&ascdesc=desc';

function searchDom(items, url = SEARCH_URL) {
  return new JSDOM(`<!doctype html><html><body><div id="ct"><div class="slst"><ul>
    ${items.map(({ tid, title }) => `<li class="pbw"><h3 class="xs3"><a href="forum.php?mod=viewthread&tid=${tid}">${title}</a></h3><p>摘要</p></li>`).join('')}
  </ul></div></div></body></html>`, { url });
}

function withGm(values, callback) {
  const oldGet = globalThis.GM_getValue;
  const oldSet = globalThis.GM_setValue;
  globalThis.GM_getValue = (key, fallback) => key in values ? values[key] : fallback;
  globalThis.GM_setValue = (key, value) => { values[key] = value; };
  try {
    return callback();
  } finally {
    globalThis.GM_getValue = oldGet;
    globalThis.GM_setValue = oldSet;
  }
}

test('collects unique Discuz forum search topic URLs and auto-redirects only for one result', () => {
  const one = searchDom([{ tid: 983424, title: 'SVMGM-050 示例' }]);
  assert.deepEqual(collectAgaghhhSearchResultUrls(one.window.document), [
    'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424',
  ]);
  assert.equal(
    findAgaghhhSingleSearchResultUrl(one.window.document, one.window.location),
    'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424'
  );

  const many = searchDom([
    { tid: 983424, title: 'SVMGM-050 示例 A' },
    { tid: 983425, title: 'SVMGM-050 示例 B' },
  ]);
  assert.equal(findAgaghhhSingleSearchResultUrl(many.window.document, many.window.location), '');
});

test('search auto redirect is independently switchable and defaults to enabled', () => {
  withGm({}, () => assert.equal(isAgaghhhSearchAutoRedirectEnabled(), true));

  const dom = searchDom([{ tid: 983424, title: 'SVMGM-050 示例' }]);
  let assigned = '';
  const locationObject = {
    hostname: 'agaghhh.cc',
    href: SEARCH_URL,
    assign(url) { assigned = url; },
  };

  withGm({ [AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY]: false }, () => {
    assert.equal(installAgaghhhSearchAutoRedirect(dom.window.document, locationObject), '');
    assert.equal(assigned, '');
  });

  withGm({ [AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY]: true }, () => {
    assert.equal(
      installAgaghhhSearchAutoRedirect(dom.window.document, locationObject),
      'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424'
    );
    assert.equal(assigned, 'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424');
  });
});

test('does not auto redirect on later search pages', () => {
  const url = `${SEARCH_URL}&page=2`;
  const dom = searchDom([{ tid: 983424, title: '最后一页唯一结果' }], url);
  assert.equal(findAgaghhhSingleSearchResultUrl(dom.window.document, dom.window.location), '');
});

test('x1080x settings exposes the agaghhh single-result redirect switch', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://agaghhh.cc/' });
  withGm({}, () => {
    const panel = openX1080xSettingsPanel(dom.window.document);
    const input = panel.querySelector('[data-setting="search-auto-redirect"]');
    assert.ok(input);
    assert.equal(input.checked, true);
    assert.match(input.closest('label').textContent, /搜索单结果自动跳转/);
  });
});
'''
Path('test/agaghhh-search-redirect.test.js').write_text(test, encoding='utf-8')

readme_path = Path('README.md')
readme = readme_path.read_text(encoding='utf-8')
new_section = '''## 1.10.1：agaghhh 搜索单结果自动跳转\n\n- `agaghhh.cc` 论坛搜索第一页只剩 1 个唯一主题时，可自动进入该主题。\n- 该行为提供独立开关 **搜索单结果自动跳转**，位于 **⚙️ x1080x 设置**，默认开启。\n- 0 个、多个结果以及第 2 页之后均不会自动跳转，避免翻页时误跳。\n\n'''
if '## 1.10.1：agaghhh 搜索单结果自动跳转' not in readme:
    readme = replace_once(readme, '## 1.10.0：功能开关与设置整理\n', new_section + '## 1.10.0：功能开关与设置整理\n', 'readme release section')
readme = replace_once(
    readme,
    '- **跨站搜索按钮（🔍）**\n- **显示大预览图（hdblog）**',
    '- **跨站搜索按钮（🔍）**\n- **搜索单结果自动跳转**\n- **显示大预览图（hdblog）**',
    'readme settings bullet',
)
readme_path.write_text(readme, encoding='utf-8')
