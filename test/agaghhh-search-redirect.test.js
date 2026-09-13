import assert from 'node:assert/strict';
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
