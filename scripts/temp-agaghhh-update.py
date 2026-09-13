from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/core.js',
    "const HDBLOG_PREVIEW_URL_ATTR = 'data-x1080x-hdblog-preview-url';\n",
    "const HDBLOG_PREVIEW_URL_ATTR = 'data-x1080x-hdblog-preview-url';\n"
    "const UNCENSORED_SUFFIX_PATTERN = /^(\\d{6}[-_]\\d{3,4})-([A-Z0-9]{2,12})\\b\\s*/i;\n"
    "const UNCENSORED_CANONICAL_PATTERN = /^([A-Z0-9]{2,12})-(\\d{6}[-_]\\d{3,4})\\b\\s*/i;\n"
    "const UNCENSORED_RELEASE_TAG_PATTERN = /^(?:\\[BT\\]|\\((?:無碼|无码|UNCENSORED)\\))\\s*/iu;\n"
)

replace_once(
    'src/core.js',
    "export function parseThreadTitle(rawTitle) {\n  const normalized = String(rawTitle ?? '').replace(/\\s+/g, ' ').trim();\n  const directFc2Match = normalized.match(DIRECT_FC2_PATTERN);\n",
    "export function parseThreadTitle(rawTitle) {\n"
    "  const normalized = String(rawTitle ?? '').replace(/\\s+/g, ' ').trim();\n"
    "\n"
    "  const uncensoredSuffixMatch = normalized.match(UNCENSORED_SUFFIX_PATTERN);\n"
    "  const uncensoredCanonicalMatch = uncensoredSuffixMatch ? null : normalized.match(UNCENSORED_CANONICAL_PATTERN);\n"
    "  const uncensoredMatch = uncensoredSuffixMatch || uncensoredCanonicalMatch;\n"
    "  if (uncensoredMatch) {\n"
    "    const code = uncensoredSuffixMatch\n"
    "      ? `${uncensoredMatch[2].toUpperCase()}-${uncensoredMatch[1]}`\n"
    "      : `${uncensoredMatch[1].toUpperCase()}-${uncensoredMatch[2]}`;\n"
    "    let remainder = normalized.slice(uncensoredMatch[0].length).trimStart();\n"
    "    while (UNCENSORED_RELEASE_TAG_PATTERN.test(remainder)) {\n"
    "      remainder = remainder.replace(UNCENSORED_RELEASE_TAG_PATTERN, '');\n"
    "    }\n"
    "    return {\n"
    "      code,\n"
    "      cleanTitle: `${code}${remainder ? ` ${remainder.trim()}` : ''}`,\n"
    "      hasExternalSubtitle: false,\n"
    "    };\n"
    "  }\n"
    "\n"
    "  const directFc2Match = normalized.match(DIRECT_FC2_PATTERN);\n"
)

replace_once(
    'src/core.js',
    "function fc2ImageFilename(code, index, total, useAbNames) {\n  const safeCode = sanitizeFilename(code);\n  if (!useAbNames) return `${safeCode}${total > 1 ? ` (${index + 1})` : ''}.jpg`;\n  if (index === 0) return `${safeCode} A.jpg`;\n  if (total === 2) return `${safeCode} B.jpg`;\n  return `${safeCode} B${index}.jpg`;\n}\n",
    "function fc2ImageFilename(code, index, total, useAbNames) {\n"
    "  const safeCode = sanitizeFilename(code);\n"
    "  if (!useAbNames) return `${safeCode}${total > 1 ? ` (${index + 1})` : ''}.jpg`;\n"
    "  if (index === 0) return `${safeCode} A.jpg`;\n"
    "  if (total === 2) return `${safeCode} B.jpg`;\n"
    "  return `${safeCode} B${index}.jpg`;\n"
    "}\n"
    "\n"
    "function alphabeticImageLabel(index) {\n"
    "  let value = index + 1;\n"
    "  let label = '';\n"
    "  while (value > 0) {\n"
    "    value -= 1;\n"
    "    label = String.fromCharCode(65 + (value % 26)) + label;\n"
    "    value = Math.floor(value / 26);\n"
    "  }\n"
    "  return label;\n"
    "}\n"
    "\n"
    "function sequencedImageFilename(code, index, total) {\n"
    "  const safeCode = sanitizeFilename(code || 'thread-image');\n"
    "  return total === 1 ? `${safeCode}.jpg` : `${safeCode} ${alphabeticImageLabel(index)}.jpg`;\n"
    "}\n"
)

replace_once(
    'src/core.js',
    """  if (resources.title.code.startsWith('FC2-')) {
    resources.images.forEach((image, index) => {
      const preferredUrl = image.cacheUrl || image.url;
      jobs.push({
        kind: 'image',
        url: preferredUrl,
        name: fc2ImageFilename(
          resources.title.code,
          index,
          resources.images.length,
          resources.useFc2AbImageNames
        ),
      });
    });
  } else if (resources.imageUrl) {
    const preferredUrl = resources.imageCacheUrl || resources.imageUrl;
    jobs.push({
      kind: 'image',
      url: preferredUrl,
      name: resources.hdblogPreviews.length ? `${sanitizeFilename(resources.title.code || 'thread-image')} A.jpg` : resources.imageFilename,
    });
  }

  if (resources.hdblogPreviews.length) {
    const safeCode = sanitizeFilename(resources.title.code || 'preview');
    resources.hdblogPreviews.forEach((image, index) => {
      jobs.push({
        kind: 'image',
        url: image.url,
        name: resources.title.code.startsWith('FC2-')
          ? `${safeCode} -${index + 1}.jpg`
          : (resources.hdblogPreviews.length === 1 ? `${safeCode} B.jpg` : `${safeCode} B${index + 1}.jpg`),
      });
    });
  }
""",
    """  const seenImageUrls = new Set();
  const downloadImages = [
    ...resources.images.map((image) => ({ url: image.cacheUrl || image.url })),
    ...resources.hdblogPreviews,
  ].filter((image) => (
    image.url && !seenImageUrls.has(image.url) && seenImageUrls.add(image.url)
  ));

  downloadImages.forEach((image, index) => {
    jobs.push({
      kind: 'image',
      url: image.url,
      name: sequencedImageFilename(resources.title.code, index, downloadImages.length),
    });
  });
"""
)

replace_once(
    'src/agaghhh-hdblog-preview.js',
    "export async function fetchHdblogPreviewForCode(\n",
    "export function hdblogSearchCodeForThreadCode(code) {\n"
    "  const normalized = String(code || '').trim().toUpperCase();\n"
    "  const uncensored = normalized.match(/^[A-Z0-9]{2,12}-(\\d{6}[-_]\\d{3,4})$/i);\n"
    "  return uncensored?.[1] || normalized;\n"
    "}\n"
    "\n"
    "export async function fetchHdblogPreviewForCode(\n"
)
replace_once(
    'src/agaghhh-hdblog-preview.js',
    "  const normalizedCode = String(code || '').trim().toUpperCase();\n  if (!normalizedCode) return { code: '', articleUrl: '', imageUrls: [], blocked: [], remaining: [] };\n\n  const searchUrl = `${HDBLOG_ORIGIN}/?s=${encodeURIComponent(normalizedCode)}`;\n",
    "  const normalizedCode = String(code || '').trim().toUpperCase();\n"
    "  if (!normalizedCode) return { code: '', articleUrl: '', imageUrls: [], blocked: [], remaining: [] };\n"
    "  const searchCode = hdblogSearchCodeForThreadCode(normalizedCode);\n"
    "\n"
    "  const searchUrl = `${HDBLOG_ORIGIN}/?s=${encodeURIComponent(searchCode)}`;\n"
)
replace_once(
    'src/agaghhh-hdblog-preview.js',
    "  const selection = chooseHdblogSearchResult(candidates, normalizedCode, getHdblogBlockedKeywords());\n",
    "  const selection = chooseHdblogSearchResult(candidates, searchCode, getHdblogBlockedKeywords());\n"
)

replace_once(
    'test/core.test.js',
    """    {
      kind: 'image',
      url: 'https://agaghhh.cc/second-thumb.jpg',
      name: 'SNOS-325.jpg',
    },
""",
    """    {
      kind: 'image',
      url: 'https://agaghhh.cc/first-thumb.jpg',
      name: 'SNOS-325 A.jpg',
    },
    {
      kind: 'image',
      url: 'https://agaghhh.cc/second-thumb.jpg',
      name: 'SNOS-325 B.jpg',
    },
"""
)
replace_once(
    'test/core.test.js',
    """  assert.deepEqual(jobs, [{
    kind: 'image',
    url: 'https://agaghhh.cc/image-proxy.php?id=cover',
    name: 'ABCD-123.jpg',
  }]);
""",
    """  assert.deepEqual(jobs, [
    {
      kind: 'image',
      url: 'https://agaghhh.cc/image-proxy.php?id=cover',
      name: 'ABCD-123 A.jpg',
    },
    {
      kind: 'image',
      url: 'https://agaghhh.cc/image-proxy.php?id=preview',
      name: 'ABCD-123 B.jpg',
    },
  ]);
"""
)
replace_once(
    'test/core.test.js',
    """    'FC2-4960963 A.jpg',
    'FC2-4960963 B1.jpg',
    'FC2-4960963 B2.jpg',
""",
    """    'FC2-4960963 A.jpg',
    'FC2-4960963 B.jpg',
    'FC2-4960963 C.jpg',
"""
)
replace_once(
    'test/core.test.js',
    """    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-a.jpg', name: 'FC2-4917072 (1).jpg' },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-b.jpg', name: 'FC2-4917072 (2).jpg' },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-c.jpg', name: 'FC2-4917072 (3).jpg' },
""",
    """    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-a.jpg', name: 'FC2-4917072 A.jpg' },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-b.jpg', name: 'FC2-4917072 B.jpg' },
    { kind: 'image', url: 'https://agaghhh.cc/cached/fc2-c.jpg', name: 'FC2-4917072 C.jpg' },
"""
)
replace_once(
    'test/agaghhh-hdblog-preview.test.js',
    "test('download jobs name the agaghhh cover A and injected Preview images B1/B2', () => {",
    "test('download jobs name all main-post and Preview images A/B/C in order', () => {"
)
replace_once(
    'test/agaghhh-hdblog-preview.test.js',
    """    'SVMGM-050 A.jpg',
    'SVMGM-050 B1.jpg',
    'SVMGM-050 B2.jpg',
""",
    """    'SVMGM-050 A.jpg',
    'SVMGM-050 B.jpg',
    'SVMGM-050 C.jpg',
"""
)

Path('test/agaghhh-uncensored-bt.test.js').write_text(r'''import assert from 'node:assert/strict';
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
''', encoding='utf-8')
