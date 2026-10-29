import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractLegacyHistoryAliases,
  historyAliasesForTitle,
  legacyThreadUrl,
  legacyTidFromHistoryValue,
  resolvedLegacyHistoryAliases,
} from '../src/history-migration.js';

test('normalizes modern and legacy FC2 title formats to the same history alias', () => {
  assert.ok(historyAliasesForTitle('(fc4939392) old title').includes('code:FC2-4939392'));
  assert.ok(historyAliasesForTitle('（FC4939392）new title').includes('code:FC2-4939392'));
  assert.ok(historyAliasesForTitle('FC2-PPV-4994798 example').includes('code:FC2-4994798'));
});

test('normalizes ordinary product codes across legacy and modern title layouts', () => {
  assert.ok(historyAliasesForTitle('[BT] FNS-267 BBQ title').includes('code:FNS-267'));
  assert.ok(historyAliasesForTitle('FNS-267 [BT] BBQ title').includes('code:FNS-267'));
});

test('creates a safe title fallback alias for titles without a known media code', () => {
  const aliases = historyAliasesForTitle('一个没有番号的标题 ABC');
  assert.ok(aliases.some((value) => value.startsWith('title:')));
});

test('extracts aliases from legacy Discuz thread title', () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="vwthd"><h1 id="thread_subject">[BT] FNS-267 Example</h1></div></body></html>');
  const aliases = extractLegacyHistoryAliases(dom.window.document.documentElement.outerHTML, dom.window.DOMParser);
  assert.ok(aliases.includes('code:FNS-267'));
});

test('extracts aliases from the redesigned resource heading while ignoring category tags', () => {
  const dom = new JSDOM('<!doctype html><html><body><header class="thread-header"><h1><span class="topic-tags"><a>HD</a></span>（fc4939392）Title</h1></header></body></html>');
  const aliases = extractLegacyHistoryAliases(dom.window.document.documentElement.outerHTML, dom.window.DOMParser);
  assert.ok(aliases.includes('code:FC2-4939392'));
});

test('legacy TID values and URLs are normalized to a fetchable old thread URL', () => {
  assert.equal(legacyTidFromHistoryValue('tid:12345'), '12345');
  assert.equal(legacyTidFromHistoryValue('url:/forum.php?mod=viewthread&tid=12345'), '12345');
  assert.equal(legacyTidFromHistoryValue('https://agaghhh.cc/thread-12345-1-1.html'), '12345');
  assert.equal(legacyThreadUrl('12345'), 'https://agaghhh.cc/forum.php?mod=viewthread&tid=12345');
  assert.equal(legacyThreadUrl('bad'), '');
});

test('generic welcome, login and membership pages cannot resolve a legacy TID', () => {
  const dom = new JSDOM('');
  for (const heading of ['歡迎訪問 · x1080x', '請使用下面地址之一訪問論壇', '會員方案與點數儲值', '登录', '404']) {
    assert.deepEqual(extractLegacyHistoryAliases(`<h1>${heading}</h1>`, dom.window.DOMParser), []);
  }
  dom.window.close();
});

test('reads resolved migration cache even when the alias index was never saved', () => {
  assert.deepEqual(resolvedLegacyHistoryAliases({ resolved: {
    123: ['resource:newID', 'code:FNS-267'], 456: ['code:FNS-267'], 789: null,
    999: ['title:請使用下面地址之一訪問論壇'],
  } }), ['resource:newID', 'code:FNS-267']);
});
