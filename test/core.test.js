import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  buildAttachmentFilename,
  buildDownloadJobs,
  collectForumThreadLinks,
  extractThreadResources,
  isAllowedHost,
  parseDomainList,
  parseThreadTitle,
} from '../src/core.js';

test('版块页只按顺序收集普通主题，排除置顶并去重', () => {
  const dom = new JSDOM(`
    <div id="threadlist"><table>
      <tbody id="stickthread_100"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=100">置顶</a></th></tr></tbody>
      <tbody id="normalthread_203"><tr><th>
        <a href="forum.php?mod=viewthread&tid=203">新窗口打开</a>
        <a class="xst" href="forum.php?mod=viewthread&tid=203">主题 203</a>
      </th></tr></tbody>
      <tbody id="normalthread_202"><tr><th><a class="xst" href="thread-202-1-1.html">主题 202</a></th></tr></tbody>
      <tbody id="normalthread_duplicate"><tr><th><a class="xst" href="forum.php?mod=viewthread&tid=203">重复主题</a></th></tr></tbody>
    </table></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=forumdisplay&fid=75' });

  const threads = collectForumThreadLinks(dom.window.document);

  assert.deepEqual(threads.map(({ url }) => url), [
    'https://agaghhh.cc/forum.php?mod=viewthread&tid=203',
    'https://agaghhh.cc/thread-202-1-1.html',
  ]);
  assert.deepEqual(threads.map(({ link }) => link.textContent), ['主题 203', '主题 202']);
});

test('hdblog 只按主内容区文章顺序收集标题，排除侧栏和分页', () => {
  const dom = new JSDOM(`
    <main id="genesis-content">
      <article class="entry"><header class="entry-header"><h2 class="entry-title">
        <a href="/983859/fc2ppv-4968311/">主题 4968311</a>
      </h2></header><a href="/tag/fc2-ppv/">分类</a></article>
      <article class="entry"><header class="entry-header"><h2 class="entry-title">
        <a href="/983856/fc2ppv-4968203/">主题 4968203</a>
      </h2></header></article>
      <nav class="archive-pagination"><a href="/tag/fc2-ppv/page/2/">下一页</a></nav>
    </main>
    <aside id="genesis-sidebar-primary"><article class="entry"><h2 class="entry-title">
      <a href="/999999/sidebar-post/">侧栏主题</a>
    </h2></article></aside>
  `, { url: 'https://hdblog.me/tag/fc2-ppv/' });

  const threads = collectForumThreadLinks(dom.window.document);

  assert.deepEqual(threads.map(({ url }) => url), [
    'https://hdblog.me/983859/fc2ppv-4968311/',
    'https://hdblog.me/983856/fc2ppv-4968203/',
  ]);
});

test('清理编号后的发布参数并保留正文中的括号', () => {
  const result = parseThreadTitle(
    'SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫 (完全版) の暴走教師 桜乃りの'
  );

  assert.deepEqual(result, {
    code: 'SNOS-325',
    cleanTitle: 'SNOS-325 スーパー絶倫 (完全版) の暴走教師 桜乃りの',
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

test('番号位于前置发布参数中时提取正文标题', () => {
  const parsed = parseThreadTitle(
    '[Prestige] (HD1080P)(Prestige)(ABF-355)月刊ハメ撮り 本能剝き出し3本番 鈴村あいり'
  );

  assert.deepEqual(parsed, {
    code: 'ABF-355',
    cleanTitle: 'ABF-355 月刊ハメ撮り 本能剝き出し3本番 鈴村あいり',
    hasExternalSubtitle: false,
  });
});

test('ABF-355 页面生成完整附件名和番号图片名', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">(HD1080P)(Prestige)(ABF-355)月刊ハメ撮り 本能剝き出し3本番 鈴村あいり</span>
    <div id="postlist"><table id="post_2795639"><tbody><tr><td id="postmessage_2795639" class="t_f">
      <img src="https://www.hxmmdd.com/pics/my/2026/202606/20260626/ABF-355.jpg" width="1200" height="811">
      <a href="forum.php?mod=attachment&amp;aid=encoded">ABF-355.rar</a>
    </td></tr></tbody></table></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1048089' });

  assert.deepEqual(buildDownloadJobs(dom.window.document), [
    {
      kind: 'attachment',
      url: 'https://agaghhh.cc/forum.php?mod=attachment&aid=encoded',
      name: 'ABF-355 月刊ハメ撮り 本能剝き出し3本番 鈴村あいり.rar',
    },
    {
      kind: 'image',
      url: 'https://www.hxmmdd.com/pics/my/2026/202606/20260626/ABF-355.jpg',
      name: 'ABF-355.jpg',
    },
  ]);
});

test('只读取主楼附件并选择正文中尺寸最大的图片地址', () => {
  const dom = new JSDOM(`
    <h1 class="ts"><span id="thread_subject">SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫の暴走教師 桜乃りの</span></h1>
    <div id="postlist">
      <div id="post_100">
        <table><tr><td class="t_f" id="postmessage_100">
          <img src="static/image/smiley.gif" class="smilie">
          <img id="aimg_1" class="zoom" src="data/attachment/forum/cover-thumb.jpg" zoomfile="data/attachment/forum/cover.jpg" width="640" height="480">
          <a href="data/attachment/forum/gallery-large.jpg"><img id="aimg_2" class="zoom" src="data/attachment/forum/gallery-thumb.jpg" width="1920" height="1080"></a>
        </td></tr></table>
        <div class="pattl"><p class="attnm"><a href="forum.php?mod=attachment&aid=abc">snos00325.rar</a></p></div>
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

test('一次下载任务包含重命名后的附件和主楼最大图片', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">SNOS-325 (HD1080P_60fps)(S1)(snos00325)スーパー絶倫の暴走教師 桜乃りの</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img id="aimg_1" zoomfile="/first.jpg" src="/first-thumb.jpg" width="640" height="480">
      <img id="aimg_2" file="/second.jpg" src="/second-thumb.jpg" width="1920" height="1080">
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
      url: 'https://agaghhh.cc/second-thumb.jpg',
      name: 'SNOS-325.jpg',
    },
  ]);
});

test('普通帖子下载主楼中尺寸最大的图片而不是固定第二张', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">ABCD-123 (HD1080P)(abcd00123)本文タイトル</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="/image-proxy.php?id=cover" width="1920" height="1080">
      <img src="/image-proxy.php?id=preview" width="640" height="480">
      <img src="/image-proxy.php?id=banner" width="1200" height="100">
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053554' });

  const jobs = buildDownloadJobs(dom.window.document);

  assert.deepEqual(jobs, [{
    kind: 'image',
    url: 'https://agaghhh.cc/image-proxy.php?id=cover',
    name: 'ABCD-123.jpg',
  }]);
});

test('图片下载使用网页已经加载的 src 地址', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">ABCD-123 (HD1080P)(abcd00123)本文タイトル</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img id="aimg_1" src="/cached-visible.jpg" zoomfile="/uncached-original.jpg" width="1920" height="1080">
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1053554' });

  assert.deepEqual(buildDownloadJobs(dom.window.document), [{
    kind: 'image',
    url: 'https://agaghhh.cc/cached-visible.jpg',
    name: 'ABCD-123.jpg',
  }]);
});

test('FC2 标题从前置参数提取番号并生成附件文件名', () => {
  const parsed = parseThreadTitle(
    '(HD1080P)(Hello World)(fc4929786)『TV局7社內定 ”最強ビジュアル”神スレンダーJD』プライベートガチハメ撮り。殘りわずか'
  );

  assert.deepEqual(parsed, {
    code: 'FC2-4929786',
    cleanTitle: 'FC2-4929786 『TV局7社內定 ”最強ビジュアル”神スレンダーJD』プライベートガチハメ撮り。殘りわずか',
    hasExternalSubtitle: false,
  });
  assert.equal(
    buildAttachmentFilename(parsed, 'fc4929786.rar'),
    'FC2-4929786 『TV局7社內定 ”最強ビジュアル”神スレンダーJD』プライベートガチハメ撮り。殘りわずか.rar'
  );
});

test('旧版 Discuz 的 FC2-PPV 标题提取番号并清理发布标签', () => {
  const parsed = parseThreadTitle(
    'FC2-PPV-4960963 [BT](FC2) 大久保公園カタログ 超有名嬢！立ったまま潮吹き撮影と鮮明畫像の秘貝を完全チェック～愛ちゃんの巻　第二弾～橋環奈似'
  );

  assert.deepEqual(parsed, {
    code: 'FC2-4960963',
    cleanTitle: 'FC2-4960963 大久保公園カタログ 超有名嬢！立ったまま潮吹き撮影と鮮明畫像の秘貝を完全チェック～愛ちゃんの巻 第二弾～橋環奈似',
    hasExternalSubtitle: false,
  });
});

test('FC2-PPV 页面生成指定 torrent 名和 A、B 图片名', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">FC2-PPV-4960963 [BT](FC2) 大久保公園カタログ 超有名嬢！立ったまま潮吹き撮影と鮮明畫像の秘貝を完全チェック～愛ちゃんの巻　第二弾～橋環奈似</span>
    <div id="postlist"><table id="post_2805886"><tbody><tr><td id="postmessage_2805886" class="t_f">
      <img src="https://www.hxmmdd.com/pics/off_FC2-PPV-4960963.jpg" width="1200" height="943">
      <img src="https://imgfor80.me/FC2-PPV-4960963_s.jpg" width="1200" height="907">
      <div>下载地址：magnet:?xt=urn:btih:9611c19ab368f381c1e218a1b5d8716f7dff06e5&amp;dn=FC2-PPV-4960963</div>
    </td></tr></tbody></table></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1057382' });

  assert.deepEqual(buildDownloadJobs(dom.window.document), [
    {
      kind: 'torrent',
      url: 'magnet:?xt=urn:btih:9611c19ab368f381c1e218a1b5d8716f7dff06e5&dn=FC2-PPV-4960963',
      name: 'FC2-4960963 大久保公園カタログ 超有名嬢！立ったまま潮吹き撮影と鮮明畫像の秘貝を完全チェック～愛ちゃんの巻 第二弾～橋環奈似.torrent',
    },
    { kind: 'image', url: 'https://www.hxmmdd.com/pics/off_FC2-PPV-4960963.jpg', name: 'FC2-4960963 A.jpg' },
    { kind: 'image', url: 'https://imgfor80.me/FC2-PPV-4960963_s.jpg', name: 'FC2-4960963 B.jpg' },
  ]);
});

test('FC2-PPV 三张及以上图片从第二张开始使用 B1、B2 编号', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">FC2-PPV-4960963 [BT](FC2) 示例标题</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="/a.jpg" width="1200" height="900">
      <img src="/b.jpg" width="1200" height="900">
      <img src="/c.jpg" width="1200" height="900">
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1057382' });

  assert.deepEqual(buildDownloadJobs(dom.window.document).map((job) => job.name), [
    'FC2-4960963 A.jpg',
    'FC2-4960963 B1.jpg',
    'FC2-4960963 B2.jpg',
  ]);
});

test('FC2 帖子下载主楼全部大图并按顺序编号', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">(HD1080P)(消された名作 D)(fc4917072)ハメ️羞恥と興奮でピンクのオマンコは大洪水️最後は初體験の顔射＆口內射精で恍惚の表情️ - FC2電子市場</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      <img src="/cached/fc2-a.jpg" width="1280" height="720">
      <img src="/cached/fc2-b.jpg" width="1920" height="1080">
      <img src="/cached/fc2-c.jpg" width="900" height="1200">
      <img class="smilie" src="/static/image/smiley.gif" width="30" height="30">
      <a href="forum.php?mod=attachment&aid=fc2">fc4917072.rar</a>
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1051329' });

  assert.deepEqual(buildDownloadJobs(dom.window.document), [
    {
      kind: 'attachment',
      url: 'https://agaghhh.cc/forum.php?mod=attachment&aid=fc2',
      name: 'FC2-4917072 ハメ️羞恥と興奮でピンクのオマンコは大洪水️最後は初體験の顔射＆口內射精で恍惚の表情️ - FC2電子市場.rar',
    },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-a.jpg', name: 'FC2-4917072 (1).jpg' },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-b.jpg', name: 'FC2-4917072 (2).jpg' },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-c.jpg', name: 'FC2-4917072 (3).jpg' },
  ]);
});
