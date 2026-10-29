import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  AGAGHHH_PRIMARY_DOMAIN_KEY,
  getAgaghhhDomains,
  getAgaghhhOrigin,
  getAgaghhhPrimaryDomain,
  isAgaghhhHost,
  parseAgaghhhPrimaryDomain,
  toAgaghhhPrimaryUrl,
} from '../src/site-domains.js';
import { isAgaghhhForumSearchPage, isAgaghhhHost as isEnhancementHost } from '../src/agaghhh-enhancement.js';
import { buildAgaghhhSearchUrl } from '../src/hdblog-article.js';
import { buildJavfreeAgaghhhSearchUrl } from '../src/javfree.js';

function withSettings(values, callback) {
  const original = globalThis.GM_getValue;
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  try { return callback(); }
  finally {
    if (original === undefined) delete globalThis.GM_getValue;
    else globalThis.GM_getValue = original;
  }
}

test('1080xin.com defaults to primary and original agaghhh domain remains recognized', () => withSettings(new Map(), () => {
  assert.equal(getAgaghhhPrimaryDomain(), '1080xin.com');
  assert.deepEqual(getAgaghhhDomains(), ['1080xin.com', 'agaghhh.cc']);
  assert.equal(isAgaghhhHost({ hostname: 'www.1080xin.com' }), true);
  assert.equal(isEnhancementHost({ hostname: '1080xin.com' }), true);
  assert.equal(isAgaghhhHost({ hostname: 'agaghhh.cc' }), true);
  assert.equal(isAgaghhhHost({ hostname: 'evil1080xin.com' }), false);
  assert.equal(isAgaghhhHost({ hostname: 'hdblog.me' }), false);
  assert.equal(getAgaghhhOrigin(), 'https://1080xin.com');
}));

test('primary override is used in outgoing searches and legacy progress URLs', () => withSettings(
  new Map([[AGAGHHH_PRIMARY_DOMAIN_KEY, 'https://forum.example.net/path/']]), () => {
    assert.equal(getAgaghhhPrimaryDomain(), 'forum.example.net');
    assert.equal(isAgaghhhHost({ hostname: 'forum.example.net' }), true);
    assert.equal(isAgaghhhHost({ hostname: '1080xin.com' }), true);
    assert.match(buildAgaghhhSearchUrl('SVMGM-050'), /^https:\/\/forum\.example\.net\/search\?q=/);
    assert.match(buildJavfreeAgaghhhSearchUrl('SAN-437'), /^https:\/\/forum\.example\.net\/search\?q=/);
    assert.equal(
      toAgaghhhPrimaryUrl('https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75&page=3'),
      'https://forum.example.net/forum.php?mod=forumdisplay&fid=75&page=3'
    );
    assert.equal(toAgaghhhPrimaryUrl('https://unrelated.example.com/abc'), '');
  }
));

test('invalid primary domain falls back safely', () => withSettings(
  new Map([[AGAGHHH_PRIMARY_DOMAIN_KEY, 'invalid hostname 123']]), () => {
    assert.equal(parseAgaghhhPrimaryDomain('javascript:alert(1)'), '');
    assert.equal(parseAgaghhhPrimaryDomain('localhost'), '');
    assert.equal(getAgaghhhPrimaryDomain(), '1080xin.com');
  }
));

test('search page detection works on replacement domain', () => withSettings(new Map(), () => {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://1080xin.com/search.php?mod=forum&srchtxt=SVMGM-050',
  });
  assert.equal(isAgaghhhForumSearchPage(dom.window.location), true);
  dom.window.close();
}));
