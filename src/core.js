const CODE_PATTERN = /^([A-Z0-9]+-\d+)\s*/i;
const SUBTITLE_TAG_PATTERN = /^\[(?:中文)?(?:外掛|外挂)字幕\]\s*/i;

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
  const codeMatch = normalized.match(CODE_PATTERN);
  if (!codeMatch) {
    return { code: '', cleanTitle: normalized, hasExternalSubtitle: false };
  }

  const code = codeMatch[1].toUpperCase();
  let remainder = normalized.slice(codeMatch[0].length).trimStart();
  const hasExternalSubtitle = SUBTITLE_TAG_PATTERN.test(remainder);
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
  return Boolean(
    image.getAttribute('zoomfile') ||
    image.getAttribute('file') ||
    /^aimg_/i.test(image.id) ||
    /data\/attachment/i.test(src) ||
    /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(parentHref)
  );
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

  const images = content ? [...content.querySelectorAll('img')].filter(isContentImage) : [];
  const imageUrl = images.length >= 2 ? largeImageUrl(document, images[1]) : '';

  return {
    title,
    attachments,
    imageUrl,
    imageFilename: title.code ? `${sanitizeFilename(title.code)}.jpg` : 'thread-image.jpg',
  };
}

export function buildDownloadJobs(document) {
  const resources = extractThreadResources(document);
  const jobs = resources.attachments.map((attachment) => ({
    kind: 'attachment',
    url: attachment.url,
    name: buildAttachmentFilename(resources.title, attachment.sourceName),
  }));
  if (resources.imageUrl) {
    jobs.push({
      kind: 'image',
      url: resources.imageUrl,
      name: resources.imageFilename,
    });
  }
  return jobs;
}
