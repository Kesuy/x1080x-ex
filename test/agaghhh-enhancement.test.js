import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  appendActressToTitleText,
  extractThreadPerformerField,
  fetchRealActressFromAvWiki,
  findAvWikiResultUrl,
  parseAvWikiActressesFromDocument,
} from '../src/agaghhh-enhancement.js';

function threadDom(performer = '') {
  return new JSDOM(`<!doctype html><html><head><title>BLOR-306</title></head><body>
    <div id="postlist">
      <div id="post_123">
        <div id="postmessage_123" class="t_f">番号：BLOR-306\n出演者：${performer}\n発売日：2026-08-22</div>
      </div>
    </div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1062893' });
}

test('detects an empty 出演者 field and leaves a populated field alone', () => {
  const empty = extractThreadPerformerField(threadDom('').window.document);
  assert.deepEqual(empty, { found: true, value: '' });

  const populated = extractThreadPerformerField(threadDom('既知演员').window.document);
  assert.deepEqual(populated, { found: true, value: '既知演员' });
});

test('finds the exact av-wiki result URL for a code', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <article><h2><a href="https://av-wiki.net/blor-305/">BLOR-305 other</a></h2></article>
    <article><h2><a href="https://av-wiki.net/blor-306/">BLOR-306 target</a></h2></article>
  </body>`, { url: 'https://av-wiki.net/?s=BLOR-306' });
  assert.equal(findAvWikiResultUrl(dom.window.document, 'BLOR-306'), 'https://av-wiki.net/blor-306/');
});

test('parses AV女優名 from a structured av-wiki detail page', () => {
  const dom = new JSDOM(`<!doctype html><body><article>
    <h1>BLOR-306 sample</h1>
    <table><tbody>
      <tr><th>メーカー</th><td>ブロッコリー</td></tr>
      <tr><th>AV女優名</th><td><a href="/actress/sakurano-momo/">桜野桃</a></td></tr>
      <tr><th>メーカー品番</th><td>BLOR-306</td></tr>
    </tbody></table>
  </article></body>`);
  assert.equal(parseAvWikiActressesFromDocument(dom.window.document, 'BLOR-306'), '桜野桃');
});

test('searches av-wiki then follows the matching detail page', async () => {
  const browser = new JSDOM('<!doctype html><body></body>', { url: 'https://agaghhh.cc/' });
  const requested = [];
  const gmRequest = (options) => {
    requested.push(options.url);
    if (options.url.includes('?s=BLOR-306')) {
      options.onload({
        status: 200,
        responseText: '<!doctype html><body><article><h2><a href="https://av-wiki.net/blor-306/">BLOR-306 sample</a></h2></article></body>',
      });
      return;
    }
    options.onload({
      status: 200,
      responseText: '<!doctype html><body><article><h1>BLOR-306</h1><table><tr><th>AV女優名</th><td><a href="/actor/momo/">桜野桃</a></td></tr></table></article></body>',
    });
  };

  const actress = await fetchRealActressFromAvWiki('BLOR-306', gmRequest, browser.window.document);
  assert.equal(actress, '桜野桃');
  assert.deepEqual(requested, [
    'https://av-wiki.net/?s=BLOR-306',
    'https://av-wiki.net/blor-306/',
  ]);
});

test('appends the actress once without disturbing the existing title', () => {
  const title = 'BLOR-306 れそう 酒とチポが大好きな塾講師おねえさん 陽ビッチが絶倫巨根にバコ責めされ、アヘトロ顔でイキ墮ちる';
  const expected = `${title} 桜野桃`;
  assert.equal(appendActressToTitleText(title, '桜野桃'), expected);
  assert.equal(appendActressToTitleText(expected, '桜野桃'), expected);
});
