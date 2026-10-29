import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  ensureModernResourceActionGroup,
  placeModernResourceActionButton,
} from '../src/modern-header-actions.js';

function headerDom() {
  return new JSDOM(`<!doctype html><html><body>
    <header class="thread-header">
      <div class="thread-header-nums"><span class="thread-header-actions"><div class="thread-actions">
        <button class="button secondary dock-side small">收藏</button>
        <button class="button dock-main small">回复主题</button>
      </div></span></div>
      <h1><span class="topic-tags">BT</span>FNS-267 [BT] 示例标题</h1>
    </header>
  </body></html>`, { url: 'https://1080xin.com/resources/ResourceID' });
}

test('modern resource actions are grouped in stable download/search/copy order immediately before favorite', () => {
  const dom = headerDom();
  const doc = dom.window.document;
  const favorite = doc.querySelector('.dock-side');
  const download = doc.createElement('button');
  download.id = 'x1080x-ex-download';
  const search = doc.createElement('button');
  search.id = 'x1080x-ex-agaghhh-hdblog-search';
  const copy = doc.createElement('button');
  copy.id = 'x1080x-ex-agaghhh-copy-code';

  placeModernResourceActionButton(doc, copy);
  placeModernResourceActionButton(doc, search);
  placeModernResourceActionButton(doc, download);

  const group = doc.getElementById('x1080x-ex-resource-actions');
  assert.ok(group);
  assert.equal(group.parentElement, doc.querySelector('.thread-actions'));
  assert.equal(group.nextElementSibling, favorite);
  assert.deepEqual([...group.children].map((button) => button.id), [
    'x1080x-ex-download',
    'x1080x-ex-agaghhh-hdblog-search',
    'x1080x-ex-agaghhh-copy-code',
  ]);
  assert.equal(download.style.float, 'none');
  assert.equal(copy.style.margin, '0');
  dom.window.close();
});

test('modern action group is recreated before favorite after React replaces the header action area', () => {
  const dom = headerDom();
  const doc = dom.window.document;
  const oldDownload = doc.createElement('button');
  oldDownload.id = 'x1080x-ex-download';
  placeModernResourceActionButton(doc, oldDownload);
  doc.querySelector('.thread-actions').outerHTML = `<div class="thread-actions">
    <button class="button secondary dock-side small">收藏</button>
    <button class="button dock-main small">回复主题</button>
  </div>`;

  const newDownload = doc.createElement('button');
  newDownload.id = 'x1080x-ex-download';
  placeModernResourceActionButton(doc, newDownload);
  const group = ensureModernResourceActionGroup(doc);
  assert.equal(group.parentElement, doc.querySelector('.thread-actions'));
  assert.equal(group.nextElementSibling, doc.querySelector('.dock-side'));
  assert.equal(group.firstElementChild, newDownload);
  dom.window.close();
});
