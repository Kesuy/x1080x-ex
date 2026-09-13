import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDownloadJobs, parseThreadTitle } from '../src/core.js';
import {
  fetchHdblogPreviewForCode,
  hdblogSearchCodeForThreadCode,
  renderAgaghhhHdblogPreview,
} from '../src/agaghhh-hdblog-preview.js';

test('parses 1PON and CARIB uncensored thread titles into canonical codes', () => {
  assert.deepEqual(
    parseThreadTitle('121125_001-1PON [BT](無碼) 一本道 M癡女 冨樫美緒'),
    {
      code: '1PON-121125_001',
      cleanTitle: '1PON-121125_001 一本道 M癡女 冨樫美緒',
      hasExternalSubtitle: false,
    }
  );
  assert.deepEqual(
    parseThreadTitle('092425-001-CARIB [BT](無碼) カリビアンコム 美人女將のおもてなし稽古 ~お客様には絶対ご満足いただきます！~'),
    {
      code: 'CARIB-092425-001',
      cleanTitle: 'CARIB-092425-001 カリビアンコム 美人女將のおもてなし稽古 ~お客様には絶対ご満足いただきます！~',
      hasExternalSubtitle: false,
    }
  );
});

test('uses the date-style uncensored code as the hdblog search keyword', () => {
  assert.equal(hdblogSearchCodeForThreadCode('1PON-121125_001'), '121125_001');
  assert.equal(hdblogSearchCodeForThreadCode('CARIB-092425-001'), '092425-001');
  assert.equal(hdblogSearchCodeForThreadCode('SVMGM-050'), 'SVMGM-050');
});

test('1PON torrent and all main-post plus Preview images use canonical sequential names', () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <h1 id="thread_subject">121125_001-1PON [BT](無碼) 一本道 M癡女 冨樫美緒</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <a href="forum.php?mod=attachment&amp;aid=1">source.torrent</a>
      <img src="https://agaghhh.cc/main-a.jpg" width="1200" height="900">
      <img src="https://agaghhh.cc/main-b.jpg" width="1200" height="900">
    </div></div></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=983424' });

  renderAgaghhhHdblogPreview(dom.window.document, {
    code: '1PON-121125_001',
    articleUrl: 'https://hdblog.me/900001/121125_001/',
    imageUrls: ['https://img.example.com/preview.jpg'],
  });

  const jobs = buildDownloadJobs(dom.window.document);
  assert.equal(
    jobs.find((job) => job.kind === 'attachment')?.name,
    '1PON-121125_001 一本道 M癡女 冨樫美緒.torrent'
  );
  assert.deepEqual(jobs.filter((job) => job.kind === 'image').map((job) => job.name), [
    '1PON-121125_001 A.jpg',
    '1PON-121125_001 B.jpg',
    '1PON-121125_001 C.jpg',
  ]);
});

test('a single BT image keeps the plain code.jpg name', () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <h1 id="thread_subject">092425-001-CARIB [BT](無碼) カリビアンコム 美人女將のおもてなし稽古</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <img src="https://agaghhh.cc/only.jpg" width="1200" height="900">
    </div></div></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=981752' });

  assert.deepEqual(buildDownloadJobs(dom.window.document).filter((job) => job.kind === 'image'), [
    { kind: 'image', url: 'https://agaghhh.cc/only.jpg', name: 'CARIB-092425-001.jpg' },
  ]);
});

test('canonical 1PON code searches hdblog with 121125_001 and returns Preview images', async () => {
  const browser = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    if (options.url === 'https://hdblog.me/?s=121125_001') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: `<!doctype html><main id="genesis-content">
          <article class="entry"><h2 class="entry-title"><a href="https://hdblog.me/900001/121125_001/">1pondo 121125_001 sample</a></h2></article>
        </main>`,
      });
      return;
    }
    if (options.url === 'https://hdblog.me/900001/121125_001/') {
      options.onload({
        status: 200,
        finalUrl: options.url,
        responseText: `<!doctype html><main id="genesis-content"><article class="entry"><div class="entry-content">
          <p>Preview:</p>
          <p><a href="https://img.example.com/121125_001-preview.jpg"><img src="https://img.example.com/thumb.jpg"></a></p>
          <p>BTFile:</p>
        </div></article></main>`,
      });
      return;
    }
    throw new Error(`unexpected request: ${options.url}`);
  };

  const result = await fetchHdblogPreviewForCode('1PON-121125_001', gmRequest, browser.window.document);
  assert.equal(result.code, '1PON-121125_001');
  assert.equal(result.articleUrl, 'https://hdblog.me/900001/121125_001/');
  assert.deepEqual(result.imageUrls, ['https://img.example.com/121125_001-preview.jpg']);
  assert.equal(requested[0], 'https://hdblog.me/?s=121125_001');
});
