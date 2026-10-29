import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { saveDownloadBlob } from '../src/blob-download.js';

test('GM download waits for a successful save callback and accepts a Blob in modern Tampermonkey', async () => {
  const dom = new JSDOM('');
  const oldDownload = globalThis.GM_download;
  const oldInfo = globalThis.GM_info;
  let request;
  globalThis.GM_info = { scriptHandler: 'Tampermonkey', version: '5.5.0' };
  globalThis.GM_download = (options) => { request = options; };
  try {
    const blob = new dom.window.Blob(['test']);
    let finished = false;
    const save = saveDownloadBlob(blob, 'cover.webp', dom.window.document).then(result => { finished = true; return result; });
    await Promise.resolve();
    assert.equal(finished, false, 'a started request is not a saved file');
    assert.equal(request.url, blob);
    assert.equal(request.name, 'cover.webp');
    request.onload();
    assert.deepEqual(await save, { confirmed: true });
  } finally {
    globalThis.GM_download = oldDownload;
    globalThis.GM_info = oldInfo;
    dom.window.close();
  }
});

test('save errors are surfaced and the object URL is kept until the manager finishes', async () => {
  const dom = new JSDOM('');
  const oldDownload = globalThis.GM_download;
  const oldInfo = globalThis.GM_info;
  const revoked = [];
  let request;
  globalThis.GM_info = { scriptHandler: 'Tampermonkey', version: '5.3.0' };
  globalThis.GM_download = (options) => { request = options; };
  dom.window.URL.createObjectURL = () => 'blob:pending';
  dom.window.URL.revokeObjectURL = url => revoked.push(url);
  try {
    const save = saveDownloadBlob(new dom.window.Blob(['test']), 'cover.webp', dom.window.document);
    assert.equal(request.url, 'blob:pending');
    assert.deepEqual(revoked, []);
    request.onerror({ error: 'not_permitted' });
    await assert.rejects(save, /下载权限/);
    assert.deepEqual(revoked, ['blob:pending']);
    globalThis.GM_download = () => { throw new Error('manager failure'); };
    await assert.rejects(saveDownloadBlob(new dom.window.Blob(['x']), 'x.jpg', dom.window.document), /manager failure/);
  } finally {
    globalThis.GM_download = oldDownload;
    globalThis.GM_info = oldInfo;
    dom.window.close();
  }
});
