import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  buildAttachmentFilename,
  buildDownloadJobs,
  extractThreadResources,
  isAllowedHost,
  parseDomainList,
  parseThreadTitle,
} from '../src/core.js';

test('清理编号后的发布参数并保留正文中的括号', () => {
  const result = parseThreadTitle(
    'SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫（完全版）の暴走教師 桜乃りの'
  );

  assert.deepEqual(result, {
    code: 'SNOS-325',
    cleanTitle: 'SNOS-325 スーパー絶倫（完全版）の暴走教師 桜乃りの',
    hasExternalSubtitle: false,
  });
});

test('中文字幕附件使用清理后的标题并追加外挂字幕标记', () => {
  const parsed = parseThreadTitle(
    'MFYD-080 [中文外掛字幕](HD1080P_60fps)(溜池ゴロー)(mfyd00080)近所に住むタダマン妻 郊外のラブホテルサービスタイムで濃厚不倫 夢実かなえ'
  );

  assert.equal(parsed.code, 'MFYD-080');
  assert.equal(parsed.hasExternalSubtitle, true);
  assert.equal(
    buildAttachmentFilename(parsed, 'mfyd00080zm.rar'),
    'MFYD-080 近所に住むタダマン妻 郊外のラブホテルサービスタイムで濃厚不倫 夢実かなえ[外挂字幕].rar'
  );
});

test('附件扩展名得到保留', () => {
  const parsed = parseThreadTitle(
    'DLDSS-504 (HD1080P)(DAHLIA)(1dldss00504)‘変態適齢期’第二章―。 春日々音『逸材』中出し解禁？。'
  );

  assert.equal(
    buildAttachmentFilename(parsed, '1dldss00504.rar'),
    'DLDSS-504 ‘変態適齢期’第二章―。 春日々音『逸材』中出し解禁？。.rar'
  );
});

test('只读取主楼附件并选择第二张正文图片的大图地址', () => {
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫の暴走教師 桜乃りの</span></h1>
    <div id="postlist">
      <div id="post_100">
        <table><tr><td class="t_f" id="postmessage_100">
          <img src="static/image/smiley.gif" class="smilie">
          <img id="aimg_1" class="zoom" src="data/attachment/forum/cover-thumb.jpg" zoomfile="data/attachment/forum/cover.jpg">
          <a href="data/attachment/forum/gallery-large.jpg"><img id="aimg_2" class="zoom" src="data/attachment/forum/gallery-thumb.jpg"></a>
          <p class="attnm"><a href="forum.php?mod=attachment&aid=abc">snos00325.rar</a></p>
        </td></tr></table>
      </div>
      <div id="post_101"><div class="t_f">
        <a href="forum.php?mod=attachment&aid=reply">reply.rar</a>
      </div></div>
    </div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806' });

  const resources = extractThreadResources(dom.window.document);

  assert.equal(resources.title.code, 'SNOS-325');
  assert.deepEqual(resources.attachments, [{
    url: 'https://agaghhh.cc/forum.php?mod=attachment&aid=abc',
    sourceName: 'snos00325.rar',
  }]);
  assert.equal(
    resources.imageUrl,
    'https://agaghhh.cc/data/attachment/forum/gallery-large.jpg'
  );
  assert.equal(resources.imageFilename, 'SNOS-325.jpg');
});

test('域名设置兼容网址、逗号和换行，并允许子域名', () => {
  const domains = parseDomainList('https://agaghhh.cc/forum.php, x1080x.example\nwww.other.test');

  assert.deepEqual(domains, ['agaghhh.cc', 'x1080x.example', 'www.other.test']);
  assert.equal(isAllowedHost('agaghhh.cc', domains), true);
  assert.equal(isAllowedHost('www.agaghhh.cc', domains), true);
  assert.equal(isAllowedHost('notagaghhh.cc', domains), false);
});

test('一次下载任务包含重命名后的附件和第二张主楼图片', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫の暴走教師 桜乃りの</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img id="aimg_1" zoomfile="/first.jpg" src="/first-thumb.jpg">
      <img id="aimg_2" file="/second.jpg" src="/second-thumb.jpg">
      <a href="forum.php?mod=attachment&aid=1">snos00325.rar</a>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053806' });

  assert.deepEqual(buildDownloadJobs(dom.window.document), [
    {
      kind: 'attachment',
      url: 'https://agaghhh.cc/forum.php?mod=attachment&aid=1',
      name: 'SNOS-325 スーパー絶倫の暴走教師 桜乃りの.rar',
    },
    {
      kind: 'image',
      url: 'https://agaghhh.cc/second.jpg',
      name: 'SNOS-325.jpg',
    },
  ]);
});
