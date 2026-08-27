const CODE_PATTERN = /^([A-Z0-9]+-\d+)\s*/i;
const SUBTITLE_TAG_PATTERN = /^\[(?:中文)?(?:外掛|外挂)字幕\]\s*/i;
const DIRECT_FC2_PATTERN = /^FC2-(?:PPV-)?(\d+)\b\s*/i;
const FC2_PPV_PATTERN = /^FC2-PPV-\d+\b/i;
const FC2_RELEASE_TAG_PATTERN = /^(?:\[(?:BT|FC2|FC2HD)\]|\((?:BT|FC2|FC2HD)\))\s*/i;
const LEADING_GROUP_PATTERN = /^(\[([^\]]*)\]|\(([^)]*)\))\s*/u;
const MAGNET_PATTERN = /magnet:\?xt=urn:btih:[a-z0-9]+(?:&[^\s<>"']+)*/gi;

export function parseDomainList(value) {
  const domains = String(value ?? '')
    .split(/[\s,;，；]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry.includes('://') ? entry : `https://${entry}`).hostname;
      } catch {
        return '';
      }
    })
    .map((hostname) => hostname.toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
    .filter(Boolean);
  return [...new Set(domains)];
}

export function isAllowedHost(hostname, domains) {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function parseThreadTitle(rawTitle) {
  const normalized = String(rawTitle ?? '').replace(/\s+/g, ' ').trim();
  const directFc2Match = normalized.match(DIRECT_FC2_PATTERN);
  if (directFc2Match) {
    const code = `FC2-${directFc2Match[1]}`;
    let remainder = normalized.slice(directFc2Match[0].length).trimStart();
    while (FC2_RELEASE_TAG_PATTERN.test(remainder)) {
      remainder = remainder.replace(FC2_RELEASE_TAG_PATTERN, '');
    }
    return {
      code,
      cleanTitle: `${code}${remainder ? ` ${remainder.trim()}` : ''}`,
      hasExternalSubtitle: false,
    };
  }

  let groupedRemainder = normalized;
  let groupedHasExternalSubtitle = false;
  while (true) {
    const groupMatch = groupedRemainder.match(LEADING_GROUP_PATTERN);
    if (!groupMatch) break;

    const token = groupMatch[1];
    const groupText = (groupMatch[2] ?? groupMatch[3] ?? '').trim();
    groupedRemainder = groupedRemainder.slice(groupMatch[0].length).trimStart();

    if (SUBTITLE_TAG_PATTERN.test(token)) {
      groupedHasExternalSubtitle = true;
      continue;
    }

    const fc2NumberMatch = groupText.match(/^fc(\d+)$/i);
    if (fc2NumberMatch) {
      const code = `FC2-${fc2NumberMatch[1]}`;
      return {
        code,
        cleanTitle: `${code}${groupedRemainder ? ` ${groupedRemainder.trim()}` : ''}`,
        hasExternalSubtitle: groupedHasExternalSubtitle,
      };
    }

    const groupedCodeMatch = groupText.match(/^([A-Z0-9]+-\d+)$/i);
    if (groupedCodeMatch) {
      const code = groupedCodeMatch[1].toUpperCase();
      return {
        code,
        cleanTitle: `${code}${groupedRemainder ? ` ${groupedRemainder.trim()}` : ''}`,
        hasExternalSubtitle: groupedHasExternalSubtitle,
      };
    }
  }

  const codeMatch = groupedRemainder.match(CODE_PATTERN);
  if (!codeMatch) {
    return { code: '', cleanTitle: normalized, hasExternalSubtitle: false };
  }

  const code = codeMatch[1].toUpperCase();
  let remainder = groupedRemainder.slice(codeMatch[0].length).trimStart();
  const hasExternalSubtitle = groupedHasExternalSubtitle || SUBTITLE_TAG_PATTERN.test(remainder);
  remainder = remainder.replace(SUBTITLE_TAG_PATTERN, '');

  while (/^\([^)]*\)\s*/u.test(remainder)) {
    remainder = remainder.replace(/^\([^)]*\)\s*/u, '');
  }

  return {
    code,
    cleanTitle: `${code}${remainder ? ` ${remainder.trim()}` : ''}`,
    hasExternalSubtitle,
  };
}

const WINDOWS_REPLACEMENTS = new Map([
  ['<', '＜'], ['>', '＞'], [':', '：'], ['"', '＂'],
  ['/', '／'], ['\\', '＼'], ['|', '｜'], ['?', '？'], ['*', '＊'],
]);

export function sanitizeFilename(value) {
  return String(value ?? '')
    .replace(/[<>:"/\\|?*]/g, (character) => WINDOWS_REPLACEMENTS.get(character))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
}

export function buildAttachmentFilename(parsedTitle, sourceName) {
  const cleanSource = String(sourceName ?? '').split(/[?#]/, 1)[0];
  const extensionMatch = cleanSource.match(/\.([a-z0-9]{1,10})$/i);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : '.rar';
  const subtitleSuffix = parsedTitle.hasExternalSubtitle ? '[外挂字幕]' : '';
  return `${sanitizeFilename(parsedTitle.cleanTitle)}${subtitleSuffix}${extension}`;
}

function absoluteUrl(document, value) {
  if (!value || /^(?:javascript:|data:|blob:)/i.test(value)) return '';
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return '';
  }
}

function attachmentSourceName(link) {
  const candidates = [
    link.getAttribute('download'),
    link.getAttribute('title'),
    link.textContent,
    link.getAttribute('href'),
  ];
  for (const candidate of candidates) {
    const match = String(candidate ?? '').trim().match(/([^/?#\s]+\.[a-z0-9]{1,10})(?:[?#]|$)/i);
    if (match) return match[1];
  }
  return 'attachment.rar';
}

function isContentImage(image) {
  if (image.closest('.attp, .attach, .pattl, .smilie, .avatar')) return false;
  const className = image.className || '';
  const src = image.getAttribute('src') || '';
  if (/\b(?:smilie|avatar|qqemoji)\b/i.test(className)) return false;
  if (/(?:static\/image\/(?:smiley|common)|uc_server\/avatar)/i.test(src)) return false;
  const parentHref = image.closest('a')?.getAttribute('href') || '';
  const width = image.naturalWidth || image.width || Number(image.getAttribute('width')) || 0;
  const height = image.naturalHeight || image.height || Number(image.getAttribute('height')) || 0;
  return Boolean(
    image.getAttribute('zoomfile') ||
    image.getAttribute('file') ||
    /^aimg_/i.test(image.id) ||
    /data\/attachment/i.test(src) ||
    /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(parentHref) ||
    (width >= 200 && height >= 200)
  );
}

function imageSize(image) {
  const width = image.naturalWidth || image.width || Number(image.getAttribute('width')) || 0;
  const height = image.naturalHeight || image.height || Number(image.getAttribute('height')) || 0;
  return { width, height, area: width * height };
}

function largeImageUrl(document, image) {
  const parentHref = image.closest('a')?.getAttribute('href');
  const candidates = [
    image.getAttribute('zoomfile'),
    image.getAttribute('file'),
    parentHref,
    image.getAttribute('data-original'),
    image.getAttribute('src'),
  ];
  for (const candidate of candidates) {
    const url = absoluteUrl(document, candidate);
    if (url) return url;
  }
  return '';
}

function cachedImageUrl(document, image) {
  return absoluteUrl(
    document,
    image.currentSrc || image.getAttribute('src') || image.getAttribute('data-original')
  );
}

function contentImages(document, content) {
  if (!content) return [];
  const seen = new Set();
  return [...content.querySelectorAll('img')]
    .filter(isContentImage)
    .map((image, order) => ({
      url: largeImageUrl(document, image),
      cacheUrl: cachedImageUrl(document, image),
      ...imageSize(image),
      order,
    }))
    .filter((image) => image.url && !seen.has(image.url) && seen.add(image.url));
}

function contentMagnets(content) {
  const matches = String(content?.textContent ?? '').match(MAGNET_PATTERN) || [];
  return [...new Set(matches.map((value) => value.replace(/[),.;，。；]+$/u, '')))];
}

function isFc2PpvTitle(rawTitle) {
  return FC2_PPV_PATTERN.test(String(rawTitle ?? '').replace(/\s+/g, ' ').trim());
}

function fc2ImageFilename(code, index, total, useAbNames) {
  const safeCode = sanitizeFilename(code);
  if (!useAbNames) return `${safeCode}${total > 1 ? ` (${index + 1})` : ''}.jpg`;
  if (index === 0) return `${safeCode} A.jpg`;
  if (total === 2) return `${safeCode} B.jpg`;
  return `${safeCode} B${index}.jpg`;
}

export function extractThreadResources(document) {
  const rawTitle = document.querySelector('#thread_subject')?.textContent
    || document.querySelector('h1.ts, .vwthd h1, h1')?.textContent
    || document.title;
  const title = parseThreadTitle(rawTitle);
  const firstPost = [...document.querySelectorAll('#postlist [id^="post_"]')]
    .find((element) => /^post_\d+$/i.test(element.id))
    || document.querySelector('#postlist > div, #postlist');
  const content = firstPost?.querySelector('[id^="postmessage_"], .t_f') || firstPost;

  const attachmentLinks = firstPost
    ? [...firstPost.querySelectorAll('a[href*="mod=attachment"], a[href*="attachment.php"]')]
    : [];
  const attachments = attachmentLinks
    .map((link) => ({
      url: absoluteUrl(document, link.getAttribute('href')),
      sourceName: attachmentSourceName(link),
    }))
    .filter((attachment) => attachment.url);

  const images = contentImages(document, content);
  const magnets = contentMagnets(content);
  const largestImage = images.reduce((largest, image) => {
    if (!largest) return image;
    return image.area > largest.area ? image : largest;
  }, null);

  return {
    title,
    attachments,
    images,
    magnets,
    useFc2AbImageNames: isFc2PpvTitle(rawTitle),
    imageUrl: largestImage?.url || '',
    imageCacheUrl: largestImage?.cacheUrl || '',
    imageFilename: title.code ? `${sanitizeFilename(title.code)}.jpg` : 'thread-image.jpg',
  };
}

export function buildDownloadJobs(document) {
  const resources = extractThreadResources(document);
  const jobs = resources.magnets.map((magnet) => ({
    kind: 'torrent',
    url: magnet,
    name: `${sanitizeFilename(resources.title.cleanTitle || resources.title.code || 'download')}.torrent`,
  }));
  jobs.push(...resources.attachments.map((attachment) => ({
    kind: 'attachment',
    url: attachment.url,
    name: buildAttachmentFilename(resources.title, attachment.sourceName),
  })));
  if (resources.title.code.startsWith('FC2-')) {
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
    return jobs;
  }

  if (resources.imageUrl) {
    const preferredUrl = resources.imageCacheUrl || resources.imageUrl;
    jobs.push({
      kind: 'image',
      url: preferredUrl,
      name: resources.imageFilename,
    });
  }
  return jobs;
}
