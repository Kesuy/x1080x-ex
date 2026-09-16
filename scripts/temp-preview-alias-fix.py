from pathlib import Path

path = Path('src/agaghhh-hdblog-preview.js')
text = path.read_text(encoding='utf-8')

marker = "function bestImageUrl(document, image) {\n"
helper = r'''function pixhostAssetIdentity(value, baseUrl) {
  const href = absoluteHttpUrl(value, baseUrl);
  if (!href) return '';
  try {
    const url = new URL(href);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const isPixhostHost = /^(?:(?:t|img)\d+\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i.test(hostname);
    if (!isPixhostHost) return '';
    const match = url.pathname.match(/^\/(?:show|images|thumbs)\/(\d+)\/([^/?#]+)$/i);
    if (!match) return '';
    return `pixhost:${match[1]}/${match[2].toLowerCase()}`;
  } catch {
    return '';
  }
}

function existingPixhostAssets(content) {
  const identities = new Set();
  if (!content) return identities;
  const add = (value) => {
    const identity = pixhostAssetIdentity(value, content.ownerDocument?.baseURI);
    if (identity) identities.add(identity);
  };
  for (const anchor of content.querySelectorAll('a[href]')) add(anchor.getAttribute('href'));
  for (const image of content.querySelectorAll('img')) {
    add(image.currentSrc);
    add(image.getAttribute('src'));
    add(image.getAttribute('data-original'));
    add(image.getAttribute('data-lazy-src'));
    add(image.getAttribute('data-src'));
  }
  return identities;
}

'''
if marker not in text:
    raise SystemExit('bestImageUrl marker not found')
text = text.replace(marker, helper + marker, 1)

old = """function bestImageUrl(document, image) {\n  if (!image) return '';\n  const anchorHref = absoluteHttpUrl(image.closest('a[href]')?.getAttribute('href'), document.baseURI);\n  const candidates = [\n    anchorHref && IMAGE_EXTENSION_PATTERN.test(anchorHref) ? anchorHref : '',\n"""
new = """function bestImageUrl(document, image) {\n  if (!image) return '';\n  const anchorHref = absoluteHttpUrl(image.closest('a[href]')?.getAttribute('href'), document.baseURI);\n  const directAnchorHref = anchorHref\n    && !isPixhostShowUrl(anchorHref, document.baseURI)\n    && IMAGE_EXTENSION_PATTERN.test(anchorHref)\n    ? anchorHref\n    : '';\n  const candidates = [\n    directAnchorHref,\n"""
if old not in text:
    raise SystemExit('bestImageUrl body not found')
text = text.replace(old, new, 1)

old = """  const add = (value) => {\n    const url = absoluteHttpUrl(value, articleUrl);\n    if (!url || seen.has(url)) return;\n    seen.add(url);\n    urls.push(url);\n  };\n"""
new = """  const add = (value) => {\n    const url = absoluteHttpUrl(value, articleUrl);\n    if (!url) return;\n    const key = pixhostAssetIdentity(url, articleUrl) || url;\n    if (seen.has(key)) return;\n    seen.add(key);\n    urls.push(url);\n  };\n"""
if old not in text:
    raise SystemExit('collect add() block not found')
text = text.replace(old, new, 1)

old = """export function renderAgaghhhHdblogPreview(document, result) {\n  if (!document || !result?.imageUrls?.length || document.getElementById(CONTAINER_ID)) return null;\n  const content = firstPostContent(document);\n  if (!content) return null;\n\n  const section = document.createElement('section');\n"""
new = """export function renderAgaghhhHdblogPreview(document, result) {\n  if (!document || !result?.imageUrls?.length || document.getElementById(CONTAINER_ID)) return null;\n  const content = firstPostContent(document);\n  if (!content) return null;\n\n  const existingAssets = existingPixhostAssets(content);\n  const seenResultAssets = new Set();\n  const imageUrls = result.imageUrls.filter((value) => {\n    const url = absoluteHttpUrl(value, document.baseURI);\n    if (!url) return false;\n    const identity = pixhostAssetIdentity(url, document.baseURI);\n    const key = identity || url;\n    if (identity && existingAssets.has(identity)) return false;\n    if (seenResultAssets.has(key)) return false;\n    seenResultAssets.add(key);\n    return true;\n  });\n  if (!imageUrls.length) return null;\n\n  const section = document.createElement('section');\n"""
if old not in text:
    raise SystemExit('render header not found')
text = text.replace(old, new, 1)

old = "  result.imageUrls.forEach((url, index) => {\n"
new = "  imageUrls.forEach((url, index) => {\n"
if old not in text:
    raise SystemExit('render image loop not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')

test_path = Path('test/agaghhh-hdblog-preview.test.js')
test = test_path.read_text(encoding='utf-8')
addition = r'''

test('CEMD-826 does not inject the same Pixhost asset again when .to and .cc point to the same show path', () => {
  const filename = '713938047_cemd-826_6m-mp4.jpg';
  const dom = new JSDOM(`<!doctype html><html><head><title>CEMD-826</title></head><body>
    <h1 id="thread_subject">CEMD-826 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <a href="https://pixhost.to/show/7097/${filename}">
        <img src="https://t1.pixhost.to/thumbs/7097/${filename}" width="1200" height="900">
      </a>
    </div></div></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1024053' });

  const section = renderAgaghhhHdblogPreview(dom.window.document, {
    code: 'CEMD-826',
    articleUrl: 'https://hdblog.me/915341/cemd-826/',
    imageUrls: [`https://pixhost.cc/show/7097/${filename}`],
  });

  assert.equal(section, null);
  assert.equal(dom.window.document.querySelector('#x1080x-ex-agaghhh-hdblog-preview'), null);
  assert.equal(dom.window.document.body.textContent.includes('CEMD-826 Preview 2'), false);
});

test('Pixhost show/images/thumbs aliases share one identity while genuinely different Preview images are still injected', () => {
  const first = '713938047_cemd-826_6m-mp4.jpg';
  const second = '713938048_cemd-826_7m-mp4.jpg';
  const dom = new JSDOM(`<!doctype html><html><head><title>CEMD-826</title></head><body>
    <h1 id="thread_subject">CEMD-826 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
      <a href="https://pixhost.to/show/7097/${first}">
        <img src="https://t1.pixhost.to/thumbs/7097/${first}" width="1200" height="900">
      </a>
    </div></div></div>
  </body></html>`, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1024053' });

  const section = renderAgaghhhHdblogPreview(dom.window.document, {
    code: 'CEMD-826',
    articleUrl: 'https://hdblog.me/915341/cemd-826/',
    imageUrls: [
      `https://img1.pixhost.cc/images/7097/${first}`,
      `https://img2.pixhost.cc/images/7097/${second}`,
      `https://pixhost.to/show/7097/${second}`,
    ],
  });

  assert.ok(section);
  const images = [...section.querySelectorAll('img')];
  assert.equal(images.length, 1);
  assert.equal(images[0].getAttribute('src'), `https://img2.pixhost.cc/images/7097/${second}`);
  assert.equal(images[0].alt, 'CEMD-826 Preview 1');
});
'''
test_path.write_text(test + addition, encoding='utf-8')
