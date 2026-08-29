import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs, parseThreadTitle } from '../src/core.js';

test('MGS BT 标题清理与番号一致的发布前缀', () => {
  const fullTitle = '300MIUM-1407 [BT](MGS)(300MIUM-1407) 【美腳同期をNTR】美人同期に甘やかされる密會W不倫。普段は凜としたシゴデキ美女';
  assert.deepEqual(parseThreadTitle(fullTitle), {
    code: '300MIUM-1407',
    cleanTitle: '300MIUM-1407 【美腳同期をNTR】美人同期に甘やかされる密會W不倫。普段は凜としたシゴデキ美女',
    hasExternalSubtitle: false,
  });
});

test('MGS 发布前缀中的番号不一致时不误删', () => {
  const fullTitle = '300MIUM-1407 [BT](MGS)(OTHER-999) 正文标题';
  assert.deepEqual(parseThreadTitle(fullTitle), {
    code: '300MIUM-1407',
    cleanTitle: '300MIUM-1407 [BT](MGS)(OTHER-999) 正文标题',
    hasExternalSubtitle: false,
  });
});

test('MGS BT 页面生成清理后的 torrent 文件名', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">300MIUM-1407 [BT](MGS)(300MIUM-1407) 正文标题</span>
    <div id="postlist"><table id="post_2803354"><tbody><tr><td id="postmessage_2803354" class="t_f">
      <img src="https://example.com/cover.jpg" width="1200" height="674">
      <img src="https://example.com/preview.jpg" width="1200" height="907">
      <div>下載地址：magnet:?xt=urn:btih:46d61f800c07c6ef8b0ab9d1bb163c83c4c725ce&amp;dn=300MIUM-1407</div>
    </td></tr></tbody></table></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1054994' });

  assert.deepEqual(buildDownloadJobs(dom.window.document), [
    {
      kind: 'torrent',
      url: 'magnet:?xt=urn:btih:46d61f800c07c6ef8b0ab9d1bb163c83c4c725ce&dn=300MIUM-1407',
      name: '300MIUM-1407 正文标题.torrent',
    },
    {
      kind: 'image',
      url: 'https://example.com/preview.jpg',
      name: '300MIUM-1407.jpg',
    },
  ]);
  dom.window.close();
});
