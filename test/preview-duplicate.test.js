import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs } from '../src/core.js';

test('真实 HDblog Preview 存在时忽略论坛 Preview 与 Preview 2', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">CEMD-826 [BT] 示例标题</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="https://example.com/CEMD-826-cover.jpg" width="1200" height="900">
      <p>CEMD-826 Preview</p>
      <a href="https://pixhost.to/images/preview-1.jpg"><img src="https://t1.pixhost.to/thumbs/1/preview-1.jpg" width="1200" height="900"></a>
      <p>CEMD-826 Preview 2</p>
      <a href="https://pixhost.to/images/preview-2.jpg"><img src="https://t1.pixhost.to/thumbs/1/preview-2.jpg" width="1200" height="900"></a>
      <section id="x1080x-ex-agaghhh-hdblog-preview">
        <img src="https://img1.pixhost.to/images/real-preview.jpg"
          data-x1080x-hdblog-preview-url="https://img1.pixhost.to/images/real-preview.jpg">
      </section>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1024053' });

  assert.deepEqual(
    buildDownloadJobs(dom.window.document).filter((job) => job.kind === 'image'),
    [
      { kind: 'image', url: 'https://example.com/CEMD-826-cover.jpg', name: 'CEMD-826 A.jpg' },
      { kind: 'image', url: 'https://img1.pixhost.to/images/real-preview.jpg', name: 'CEMD-826 B.jpg' },
    ]
  );
});

test('没有 HDblog Preview 时论坛 Preview 作为 fallback，但忽略 Preview 2+', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">CEMD-826 [BT] 示例标题</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="https://example.com/CEMD-826-cover.jpg" width="1200" height="900">
      <p>CEMD-826 Preview</p>
      <a href="https://pixhost.to/images/preview-1.jpg"><img src="https://t1.pixhost.to/thumbs/1/preview-1.jpg" width="1200" height="900"></a>
      <p>CEMD-826 Preview 2</p>
      <a href="https://pixhost.to/images/preview-2.jpg"><img src="https://t1.pixhost.to/thumbs/1/preview-2.jpg" width="1200" height="900"></a>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1024053' });

  assert.deepEqual(
    buildDownloadJobs(dom.window.document).filter((job) => job.kind === 'image'),
    [
      { kind: 'image', url: 'https://example.com/CEMD-826-cover.jpg', name: 'CEMD-826 A.jpg' },
      { kind: 'image', url: 'https://t1.pixhost.to/thumbs/1/preview-1.jpg', name: 'CEMD-826 B.jpg' },
    ]
  );
});
