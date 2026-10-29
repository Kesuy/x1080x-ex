import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  collectModernNativeAttachments,
  requestModernNativeAttachmentDownload,
} from '../src/modern-attachments.js';

const mkDoc = (attachments) => new JSDOM(`<!doctype html><html><body>
  <header class="thread-header"><h1>SUJI-322 (HD1080P)</h1></header>
  <article class="post" id="first-post"><div class="post-content">
    <div class="post-text"><div class="protected-text discuz-body">body</div></div>
    <section class="attachments-section"><div class="attachment-list">
      ${attachments}
    </div></section>
  </div></article>
</body></html>`, { url: 'https://1080xin.com/resources/1Dw4hDQzhfzZdV9ZZWeQWU?page=1&order=asc' });

function attachment(name, slot) {
  return `<article class="attachment" data-slot-id="${slot}" id="slot-${slot}">
    <span class="file-icon">${name.split('.').at(-1).toUpperCase()}</span>
    <div class="file-main"><h3><span class="file-name" title="${name}">${name}</span></h3></div>
    <div class="file-get"><button type="button" class="button secondary tool">按次數下載</button></div>
  </article>`;
}

test('collects the original x1080x ZIP attachment with no invented download URL', () => {
  const dom = mkDoc(attachment('suji00322.zip', '4bLI6T1ydu8yKs7WDHAxjf'));
  const files = collectModernNativeAttachments(dom.window.document);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'suji00322.zip');
  assert.equal(files[0].button.closest('.attachment').getAttribute('data-slot-id'), '4bLI6T1ydu8yKs7WDHAxjf');
});

test('a RAR attachment is forwarded to the original website button after user confirmation', () => {
  const dom = mkDoc(attachment('demo.rar', 'rar-slot'));
  const doc = dom.window.document;
  let count = 0;
  doc.querySelector('.file-get button').addEventListener('click', () => { count += 1; });
  let promptText = '';
  dom.window.confirm = (message) => { promptText = message; return true; };
  const result = requestModernNativeAttachmentDownload(doc, dom.window);
  assert.equal(result.status, 'triggered');
  assert.equal(result.name, 'demo.rar');
  assert.equal(count, 1);
  assert.match(promptText, /demo\.rar/);
  assert.match(promptText, /下载次数/);
});

test('rejecting the confirmation consumes no download clicks', () => {
  const dom = mkDoc(attachment('demo.rar', 'rar-slot'));
  let count = 0;
  dom.window.document.querySelector('.file-get button').addEventListener('click', () => { count += 1; });
  dom.window.confirm = () => false;
  assert.equal(requestModernNativeAttachmentDownload(dom.window.document, dom.window).status, 'cancelled');
  assert.equal(count, 0);
});

test('multiple ZIP/RAR attachments require explicit single selection, never bulk-click the charged buttons', () => {
  const dom = mkDoc(attachment('a.zip', 'a') + attachment('b.rar', 'b'));
  const clicks = [];
  dom.window.document.querySelectorAll('.file-get button').forEach((button, index) => {
    button.addEventListener('click', () => clicks.push(index));
  });
  dom.window.prompt = () => '2';
  dom.window.confirm = () => true;
  const result = requestModernNativeAttachmentDownload(dom.window.document, dom.window);
  assert.equal(result.name, 'b.rar');
  assert.deepEqual(clicks, [1]);
});

test('no modern attachment is discovered in unrelated posts or magnet-only resources', () => {
  const dom = mkDoc('');
  assert.equal(collectModernNativeAttachments(dom.window.document).length, 0);
  assert.equal(requestModernNativeAttachmentDownload(dom.window.document, dom.window).status, 'none');
});
