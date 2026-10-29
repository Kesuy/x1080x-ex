import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  collectModernNativeAttachments,
  requestModernNativeAttachmentDownload,
  prepareModernAttachmentDownload,
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

function freeQuote() {
  return { status: 'claimable', file_ready: true, payable_points: '0.00', price_points: '4.00', viewer_id: 'viewer', version_id: 'version' };
}

test('free native ZIP uses preview, CSRF and a single claim before returning the title-named delivery', async () => {
  const dom = mkDoc(attachment('suji00322.zip', 'zipSlot'));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) dom.window.document.querySelector('h1').textContent = 'OTHER-999 React replacement';
    return { ok: true, json: async () => url.endsWith('/preview') ? freeQuote()
      : url.endsWith('/csrf') ? { csrf_token: 'csrf' } : { receipt_id: 'receipt' } };
  };
  try {
    const file = collectModernNativeAttachments(dom.window.document)[0];
    const result = await prepareModernAttachmentDownload(dom.window.document, file, fetchImpl);
    assert.equal(result.name, 'SUJI-322.zip', 'the title is captured before asynchronous page changes');
    assert.equal(result.url, 'https://1080xin.com/api/downloads/file/receipt');
    assert.equal(calls.length, 3);
    const payload = JSON.parse(calls[2].options.body);
    assert.equal(payload.slot_id, 'zipSlot');
    assert.equal(payload.expected_payable, '0.00');
    assert.equal(calls[2].options.headers['X-CSRFToken'], 'csrf');
    await prepareModernAttachmentDownload(dom.window.document, file, fetchImpl);
    assert.equal(calls.filter(call => call.url.endsWith('/claim')).length, 1, 'delivery retries must reuse the authorized receipt');
    result.complete();
    await prepareModernAttachmentDownload(dom.window.document, file, fetchImpl);
    assert.equal(calls.filter(call => call.url.endsWith('/claim')).length, 2, 'a new completed download uses a fresh claim');
  } finally { dom.window.close(); }
});

test('paid quotes stay on native confirmation; denied or ambiguous prices never claim', async () => {
  for (const quote of [{ ...freeQuote(), payable_points: '2.00' }, { ...freeQuote(), status: 'denied' }, { ...freeQuote(), payable_points: null }]) {
    const dom = mkDoc(attachment('demo.zip', 'zipSlot'));
    let clicks = 0;
    const file = collectModernNativeAttachments(dom.window.document)[0];
    file.button.addEventListener('click', () => { clicks += 1; });
    const fetchImpl = async url => {
      assert.ok(url.endsWith('/preview'), 'no CSRF or claim request may be made');
      return { ok: true, json: async () => quote };
    };
    if (quote.payable_points === '2.00') {
      assert.deepEqual(await prepareModernAttachmentDownload(dom.window.document, file, fetchImpl), { delegated: true });
      assert.equal(clicks, 1);
    } else await assert.rejects(prepareModernAttachmentDownload(dom.window.document, file, fetchImpl));
    dom.window.close();
  }
});

test('uncertain claim responses retain the idempotency key for an explicit retry', async () => {
  const dom = mkDoc(attachment('demo.zip', 'zipSlot'));
  const payloads = [];
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/claim')) { payloads.push(JSON.parse(options.body)); throw new Error('connection interrupted'); }
    return { ok: true, json: async () => url.endsWith('/preview') ? freeQuote() : { csrf_token: 'csrf' } };
  };
  const file = collectModernNativeAttachments(dom.window.document)[0];
  await assert.rejects(prepareModernAttachmentDownload(dom.window.document, file, fetchImpl));
  await assert.rejects(prepareModernAttachmentDownload(dom.window.document, file, fetchImpl));
  assert.equal(payloads[0].idempotency_key, payloads[1].idempotency_key);
  dom.window.close();
});

test('a RAR attachment is forwarded directly to the original website button without an extra prompt', () => {
  const dom = mkDoc(attachment('demo.rar', 'rar-slot'));
  const doc = dom.window.document;
  let count = 0;
  doc.querySelector('.file-get button').addEventListener('click', () => { count += 1; });
  dom.window.confirm = () => { throw new Error('userscript must not display a confirmation'); };
  dom.window.prompt = () => { throw new Error('userscript must not display a prompt'); };
  const result = requestModernNativeAttachmentDownload(doc);
  assert.equal(result.status, 'triggered');
  assert.equal(result.total, 1);
  assert.deepEqual(result.names, ['demo.rar']);
  assert.equal(count, 1);
});

test('multiple ZIP/RAR attachments are passed to the native site controls once each without prompts', () => {
  const dom = mkDoc(attachment('a.zip', 'a') + attachment('b.rar', 'b'));
  const clicks = [];
  dom.window.document.querySelectorAll('.file-get button').forEach((button, index) => {
    button.addEventListener('click', () => clicks.push(index));
  });
  dom.window.prompt = () => { throw new Error('no selection prompt'); };
  dom.window.confirm = () => { throw new Error('no confirmation prompt'); };
  const result = requestModernNativeAttachmentDownload(dom.window.document);
  assert.equal(result.status, 'triggered');
  assert.deepEqual(clicks, [0, 1]);
});

test('no modern attachment is discovered in unrelated posts or magnet-only resources', () => {
  const dom = mkDoc('');
  assert.equal(collectModernNativeAttachments(dom.window.document).length, 0);
  assert.equal(requestModernNativeAttachmentDownload(dom.window.document, dom.window).status, 'none');
});

test('counts only successful native handoffs when a snapshotted button becomes unavailable', () => {
  const dom = mkDoc(attachment('a.zip', 'a') + attachment('b.zip', 'b'));
  const files = collectModernNativeAttachments(dom.window.document);
  files[1].button.disabled = true;
  const result = requestModernNativeAttachmentDownload(dom.window.document, files);
  assert.equal(result.total, 1);
  assert.equal(result.attempted, 2);
  assert.deepEqual(result.failedNames, ['b.zip']);
  dom.window.close();
});
