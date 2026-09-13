from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/core.js',
    "function isFc2PpvTitle(rawTitle) {\n  return FC2_PPV_PATTERN.test(String(rawTitle ?? '').replace(/\\s+/g, ' ').trim());\n}\n",
    "function isFc2PpvTitle(rawTitle) {\n"
    "  return FC2_PPV_PATTERN.test(String(rawTitle ?? '').replace(/\\s+/g, ' ').trim());\n"
    "}\n"
    "\n"
    "function isBtForumThread(document, rawTitle) {\n"
    "  if (/\\[BT\\]/i.test(String(rawTitle ?? ''))) return true;\n"
    "  return [...document.querySelectorAll('a[href]')].some((link) => {\n"
    "    try {\n"
    "      const url = new URL(link.getAttribute('href'), document.baseURI);\n"
    "      return url.searchParams.get('mod') === 'forumdisplay' && url.searchParams.get('fid') === '244';\n"
    "    } catch {\n"
    "      return false;\n"
    "    }\n"
    "  });\n"
    "}\n"
)

replace_once(
    'src/core.js',
    """    magnets,
    useFc2AbImageNames: isFc2PpvTitle(rawTitle),
    imageUrl: largestImage?.url || '',
""",
    """    magnets,
    isBtThread: isBtForumThread(document, rawTitle),
    useFc2AbImageNames: isFc2PpvTitle(rawTitle),
    imageUrl: largestImage?.url || '',
"""
)

old = """  const seenImageUrls = new Set();
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
new = """  const sequenceAllImages = resources.isBtThread || resources.title.code.startsWith('FC2-');
  if (sequenceAllImages) {
    const seenImageUrls = new Set();
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
  } else {
    if (resources.imageUrl) {
      const preferredUrl = resources.imageCacheUrl || resources.imageUrl;
      jobs.push({
        kind: 'image',
        url: preferredUrl,
        name: resources.hdblogPreviews.length
          ? `${sanitizeFilename(resources.title.code || 'thread-image')} A.jpg`
          : resources.imageFilename,
      });
    }

    if (resources.hdblogPreviews.length) {
      const safeCode = sanitizeFilename(resources.title.code || 'preview');
      resources.hdblogPreviews.forEach((image, index) => {
        jobs.push({
          kind: 'image',
          url: image.url,
          name: resources.hdblogPreviews.length === 1
            ? `${safeCode} B.jpg`
            : `${safeCode} B${index + 1}.jpg`,
        });
      });
    }
  }
"""
replace_once('src/core.js', old, new)

replace_once(
    'test/core.test.js',
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
""",
    """    {
      kind: 'image',
      url: 'https://agaghhh.cc/second-thumb.jpg',
      name: 'SNOS-325.jpg',
    },
"""
)

replace_once(
    'test/core.test.js',
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
""",
    """  assert.deepEqual(jobs, [{
    kind: 'image',
    url: 'https://agaghhh.cc/image-proxy.php?id=cover',
    name: 'ABCD-123.jpg',
  }]);
"""
)

path = Path('test/agaghhh-hdblog-preview.test.js')
text = path.read_text(encoding='utf-8')
marker = "test('download jobs name all main-post and Preview images A/B/C in order'"
start = text.find(marker)
if start < 0:
    raise SystemExit('target Preview naming test not found')
old = """  const dom = new JSDOM(`<!doctype html><html><head><title>SVMGM-050 Sample</title></head><body>
    <h1 id="thread_subject">SVMGM-050 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
"""
new = """  const dom = new JSDOM(`<!doctype html><html><head><title>SVMGM-050 Sample</title></head><body>
    <a href="forum.php?mod=forumdisplay&fid=244">BT</a>
    <h1 id="thread_subject">SVMGM-050 Sample</h1>
    <div id="postlist"><div id="post_1"><div id="postmessage_1" class="t_f">
"""
pos = text.find(old, start)
if pos < 0:
    raise SystemExit('target Preview naming fixture not found after marker')
text = text[:pos] + new + text[pos + len(old):]
path.write_text(text, encoding='utf-8')
