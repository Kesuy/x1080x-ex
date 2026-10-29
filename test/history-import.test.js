import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { showHistoryImportDialog } from '../src/history-import.js';

test('menu opens a visible panel without triggering the file picker or importing data', () => {
  const dom = new JSDOM('<body><button id="previous">Previous</button></body>');
  try {
    let pickerClicks = 0;
    dom.window.HTMLInputElement.prototype.click = () => { pickerClicks += 1; };
    const previous = dom.window.document.getElementById('previous');
    previous.focus();
    const host = showHistoryImportDialog(dom.window.document, () => assert.fail('no file was submitted'));
    const root = host.shadowRoot;
    assert.equal(root.querySelector('input').hidden, false);
    assert.ok(root.querySelector('[role="dialog"]'));
    assert.equal(pickerClicks, 0);
    assert.equal(showHistoryImportDialog(dom.window.document, () => {}), host);
    assert.equal(dom.window.document.querySelectorAll('#x1080x-ex-history-import').length, 1);
    root.querySelector('[data-close]').click();
    assert.equal(host.isConnected, false);
    assert.equal(dom.window.document.activeElement, previous);
  } finally { dom.window.close(); }
});

test('selection waits for explicit import and reports failures inline with retry available', async () => {
  const dom = new JSDOM('<body></body>');
  try {
    let imports = 0;
    const host = showHistoryImportDialog(dom.window.document, async () => {
      imports += 1;
      throw new Error('恢复文件格式不正确');
    });
    const root = host.shadowRoot;
    const input = root.querySelector('input');
    const button = root.querySelector('[type="submit"]');
    Object.defineProperty(input, 'files', { value: [{ size: 100 }], configurable: true });
    input.dispatchEvent(new dom.window.Event('change'));
    assert.equal(imports, 0);
    assert.equal(button.disabled, false);
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(imports, 1);
    assert.match(root.querySelector('[role="status"]').textContent, /导入失败.*格式不正确/);
    assert.equal(button.disabled, false);
    Object.defineProperty(input, 'files', { value: [{ size: 21 * 1024 * 1024 }] });
    input.dispatchEvent(new dom.window.Event('change'));
    button.click();
    assert.match(root.querySelector('[role="status"]').textContent, /超过 20 MB/);
    assert.equal(imports, 1, 'oversized files must be rejected before reading/importing');
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(host.isConnected, false);
  } finally { dom.window.close(); }
});
