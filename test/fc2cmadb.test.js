import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY,
  buildFc2cmadbHdblogSearchUrl,
  enhanceFc2cmadbArticleCodes,
  installFc2cmadbEnhancement,
  isFc2cmadbHdblogSearchEnabled,
  isFc2cmadbUrl,
} from '../src/fc2cmadb.js';

function card(code = '4616649') {
  return '<div class="card"><figure class="relative h-48 bg-base-200 rounded-lg">'
    + '<a class="block rounded overflow-hidden" href="https://fc2cmadb.com/articles/' + code + '">'
    + '<img alt="cover" src="/cover.jpg"></a>'
    + '<span class="absolute top-0 left-0 text-sm text-white bg-gray-800 opacity-80 rounded-tl-lg px-1">'
    + code + '</span>'
    + '<span class="absolute bottom-0 left-0">無</span></figure></div>';
}

function withSettings(values, action) {
  const originalGet = globalThis.GM_getValue;
  const originalSet = globalThis.GM_setValue;
  const originalMenu = globalThis.GM_registerMenuCommand;
  const menu = [];
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  globalThis.GM_registerMenuCommand = (title, callback) => menu.push({ title, callback });
  try {
    return action(menu);
  } finally {
    globalThis.GM_getValue = originalGet;
    globalThis.GM_setValue = originalSet;
    globalThis.GM_registerMenuCommand = originalMenu;
  }
}

test('FC2CMADB URL guard and numeric HDblog search URLs', () => {
  assert.equal(isFc2cmadbUrl('https://fc2cmadb.com/actresses/9791'), true);
  assert.equal(isFc2cmadbUrl('https://www.fc2cmadb.com/articles/4616649'), true);
  assert.equal(isFc2cmadbUrl('https://fake-fc2cmadb.com/actresses/9791'), false);
  assert.equal(buildFc2cmadbHdblogSearchUrl('4616649'), 'https://hdblog.me/?s=4616649');
  assert.equal(buildFc2cmadbHdblogSearchUrl(' 3179361 '), 'https://hdblog.me/?s=3179361');
  assert.equal(buildFc2cmadbHdblogSearchUrl('FC2-PPV-4616649'), '');
  assert.equal(buildFc2cmadbHdblogSearchUrl('javascript:alert(1)'), '');
});

test('converts only matching number badges to search links and keeps cover click untouched', () => {
  const dom = new JSDOM('<!doctype html><body>' + card('4616649') + card('3179361')
    + '<figure><a href="https://other.example/articles/5555555"></a>'
    + '<span class="absolute top-0 left-0">5555555</span></figure></body>', {
    url: 'https://fc2cmadb.com/actresses/9791',
  });
  withSettings(new Map(), () => {
    assert.equal(isFc2cmadbHdblogSearchEnabled(), true);
    assert.equal(enhanceFc2cmadbArticleCodes(dom.window.document), 2);
    assert.equal(enhanceFc2cmadbArticleCodes(dom.window.document), 0);
  });
  const links = [...dom.window.document.querySelectorAll('a[data-x1080x-fc2cmadb-hdblog-search]')];
  assert.deepEqual(links.map((link) => link.href), [
    'https://hdblog.me/?s=4616649',
    'https://hdblog.me/?s=3179361',
  ]);
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.equal(dom.window.document.querySelector('figure > a[href*="/articles/4616649"]').href,
    'https://fc2cmadb.com/articles/4616649');
  assert.equal(dom.window.document.querySelectorAll('figure span.absolute.bottom-0').length, 2);
  assert.equal(dom.window.document.querySelectorAll('figure > span.absolute.top-0.left-0').length, 1);
  dom.window.close();
});

test('independent settings menu can disable badge links, including on existing installations', () => {
  const dom = new JSDOM('<!doctype html><body>' + card() + '</body>', {
    url: 'https://fc2cmadb.com/actresses/9791',
  });
  const values = new Map();
  withSettings(values, (menu) => {
    const observer = installFc2cmadbEnhancement(dom.window);
    assert.ok(observer);
    assert.equal(menu.length, 1);
    assert.equal(dom.window.document.querySelectorAll('a[data-x1080x-fc2cmadb-hdblog-search]').length, 1);
    dom.window.alert = () => {};
    menu[0].callback();
    assert.equal(values.get(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY), false);
    observer.disconnect();
  });
  const disabledDom = new JSDOM('<!doctype html><body>' + card() + '</body>', {
    url: 'https://fc2cmadb.com/actresses/9791',
  });
  withSettings(new Map([[FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, false]]), (menu) => {
    assert.equal(installFc2cmadbEnhancement(disabledDom.window), null);
    assert.equal(menu.length, 1);
    assert.equal(disabledDom.window.document.querySelectorAll('figure > span.absolute.top-0.left-0').length, 1);
  });
  dom.window.close();
  disabledDom.window.close();
});

test('new card inserted after page load also gets an HDblog search link', async () => {
  const dom = new JSDOM('<!doctype html><body>' + card() + '</body>', {
    url: 'https://fc2cmadb.com/actresses/9791',
  });
  await withSettings(new Map(), async () => {
    const observer = installFc2cmadbEnhancement(dom.window);
    dom.window.document.body.insertAdjacentHTML('beforeend', card('3179361'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    const link = dom.window.document.querySelector(
      'a[data-x1080x-fc2cmadb-hdblog-search="3179361"]'
    );
    assert.ok(link);
    assert.equal(link.href, 'https://hdblog.me/?s=3179361');
    observer.disconnect();
  });
  dom.window.close();
});

test('does not run on unrelated domains', () => {
  const dom = new JSDOM('<!doctype html><body>' + card() + '</body>', {
    url: 'https://hdblog.me/',
  });
  withSettings(new Map(), (menu) => {
    assert.equal(installFc2cmadbEnhancement(dom.window), null);
    assert.equal(menu.length, 0);
  });
  dom.window.close();
});
