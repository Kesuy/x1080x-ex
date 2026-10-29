// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.10.28
// @description  一键下载主楼资源，并增强 hdblog 文章宽度、封面下载、Preview 大图、搜索过滤及主题批量后台打开
// @author       Kesuy
// @homepageURL  https://github.com/Kesuy/x1080x-ex
// @supportURL   https://github.com/Kesuy/x1080x-ex/issues
// @updateURL    https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @downloadURL  https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @match        *://*/*
// @connect      *
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @run-at       document-idle
// @noframes
// ==/UserScript==
(() => {
  // src/core.js
  var CODE_PATTERN = /^([A-Z0-9]+-\d+[A-Z]?)\b\s*/i;
  var SUBTITLE_TAG_PATTERN = /^\[(?:中文)?(?:外掛|外挂)字幕\]\s*/i;
  var DIRECT_FC2_PATTERN = /^FC2-(?:PPV-)?(\d+)\b\s*/i;
  var FC2_PPV_PATTERN = /^FC2-PPV-\d+\b/i;
  var FC2_RELEASE_TAG_PATTERN = /^(?:\[(?:BT|FC2|FC2HD)\]|\((?:BT|FC2|FC2HD)\))\s*/i;
  var LEADING_GROUP_PATTERN = /^(\[([^\]]*)\]|\(([^)]*)\))\s*/u;
  var MGS_RELEASE_PREFIX_PATTERN = /^\[BT\]\s*\(MGS\)\s*\(([^)]+)\)\s*/i;
  var MAGNET_PATTERN = /magnet:\?xt=urn:btih:[a-z0-9]+(?:&[^\s<>"']+)*/gi;
  var HDBLOG_PREVIEW_URL_ATTR = "data-x1080x-hdblog-preview-url";
  var UNCENSORED_SUFFIX_PATTERN = /^(\d{6}[-_]\d{3,4})-([A-Z0-9]{2,12})\b\s*/i;
  var UNCENSORED_CANONICAL_PATTERN = /^([A-Z0-9]{2,12})-(\d{6}[-_]\d{3,4})\b\s*/i;
  var UNCENSORED_RELEASE_TAG_PATTERN = /^(?:\[BT\]|\((?:無碼|无码|UNCENSORED)\))\s*/iu;
  function parseDomainList(value) {
    const domains = String(value ?? "").split(/[\s,;，；]+/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      try {
        return new URL(entry.includes("://") ? entry : `https://${entry}`).hostname;
      } catch {
        return "";
      }
    }).map((hostname) => hostname.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "")).filter(Boolean);
    return [...new Set(domains)];
  }
  function isAllowedHost(hostname, domains) {
    const host = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }
  function isThreadUrl(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl);
      return url.searchParams.get("mod") === "viewthread" && url.searchParams.has("tid") || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function collectForumThreadLinks(document2) {
    const seen = /* @__PURE__ */ new Set();
    const candidates = [
      ...[...document2.querySelectorAll('#threadlist tbody[id^="normalthread_"]')].map((row) => ({
        kind: "discuz",
        link: row.querySelector("a.xst[href]") || row.querySelector('a[href*="mod=viewthread"][href*="tid="]')
      })),
      ...[...document2.querySelectorAll("main#genesis-content article.entry")].map((article) => ({
        kind: "wordpress",
        link: article.querySelector(".entry-header .entry-title a[href], h2.entry-title a[href]")
      })),
      ...[...document2.querySelectorAll("article.thread-row:not(.is-sticky)")].map((article) => ({
        kind: "modern",
        link: article.querySelector('a.resource-title[href*="/resources/"]')
      }))
    ];
    return candidates.filter((candidate) => candidate.link).map(({ kind, link }) => {
      try {
        return {
          kind,
          link,
          url: new URL(link.getAttribute("href"), document2.baseURI).href
        };
      } catch {
        return null;
      }
    }).filter(Boolean).filter((thread) => {
      if (thread.kind === "discuz") return isThreadUrl(thread.url, document2.baseURI);
      const url = new URL(thread.url);
      if (thread.kind === "modern") {
        return url.origin === new URL(document2.baseURI).origin && /^\/resources\/[a-z0-9]+\/?$/i.test(url.pathname);
      }
      return /^https?:$/.test(url.protocol) && url.origin === new URL(document2.baseURI).origin;
    }).filter((thread) => !seen.has(thread.url) && seen.add(thread.url));
  }
  function getThreadHeadingText(document2) {
    const heading = document2?.querySelector("#thread_subject") || document2?.querySelector(".thread-header h1") || document2?.querySelector("h1.ts, .vwthd h1, h1");
    if (!heading) return document2?.title || "";
    if (!heading.matches(".thread-header h1")) return heading.textContent || "";
    const copy = heading.cloneNode(true);
    copy.querySelector(".topic-tags")?.remove();
    return copy.textContent || "";
  }
  function parseThreadTitle(rawTitle) {
    const normalized = String(rawTitle ?? "").replace(/\s+/g, " ").trim();
    const uncensoredSuffixMatch = normalized.match(UNCENSORED_SUFFIX_PATTERN);
    const uncensoredCanonicalMatch = uncensoredSuffixMatch ? null : normalized.match(UNCENSORED_CANONICAL_PATTERN);
    const uncensoredMatch = uncensoredSuffixMatch || uncensoredCanonicalMatch;
    if (uncensoredMatch) {
      const code2 = uncensoredSuffixMatch ? `${uncensoredMatch[2].toUpperCase()}-${uncensoredMatch[1]}` : `${uncensoredMatch[1].toUpperCase()}-${uncensoredMatch[2]}`;
      let remainder2 = normalized.slice(uncensoredMatch[0].length).trimStart();
      while (UNCENSORED_RELEASE_TAG_PATTERN.test(remainder2)) {
        remainder2 = remainder2.replace(UNCENSORED_RELEASE_TAG_PATTERN, "");
      }
      return {
        code: code2,
        cleanTitle: `${code2}${remainder2 ? ` ${remainder2.trim()}` : ""}`,
        hasExternalSubtitle: false
      };
    }
    const directFc2Match = normalized.match(DIRECT_FC2_PATTERN);
    if (directFc2Match) {
      const code2 = `FC2-${directFc2Match[1]}`;
      let remainder2 = normalized.slice(directFc2Match[0].length).trimStart();
      while (FC2_RELEASE_TAG_PATTERN.test(remainder2)) {
        remainder2 = remainder2.replace(FC2_RELEASE_TAG_PATTERN, "");
      }
      return {
        code: code2,
        cleanTitle: `${code2}${remainder2 ? ` ${remainder2.trim()}` : ""}`,
        hasExternalSubtitle: false
      };
    }
    let groupedRemainder = normalized;
    let groupedHasExternalSubtitle = false;
    while (true) {
      const groupMatch = groupedRemainder.match(LEADING_GROUP_PATTERN);
      if (!groupMatch) break;
      const token = groupMatch[1];
      const groupText = (groupMatch[2] ?? groupMatch[3] ?? "").trim();
      groupedRemainder = groupedRemainder.slice(groupMatch[0].length).trimStart();
      if (SUBTITLE_TAG_PATTERN.test(token)) {
        groupedHasExternalSubtitle = true;
        continue;
      }
      const fc2NumberMatch = groupText.match(/^fc(\d+)$/i);
      if (fc2NumberMatch) {
        const code2 = `FC2-${fc2NumberMatch[1]}`;
        return {
          code: code2,
          cleanTitle: `${code2}${groupedRemainder ? ` ${groupedRemainder.trim()}` : ""}`,
          hasExternalSubtitle: groupedHasExternalSubtitle
        };
      }
      const groupedCodeMatch = groupText.match(/^([A-Z0-9]+-\d+[A-Z]?)$/i);
      if (groupedCodeMatch) {
        const code2 = groupedCodeMatch[1].toUpperCase();
        return {
          code: code2,
          cleanTitle: `${code2}${groupedRemainder ? ` ${groupedRemainder.trim()}` : ""}`,
          hasExternalSubtitle: groupedHasExternalSubtitle
        };
      }
    }
    const codeMatch = groupedRemainder.match(CODE_PATTERN);
    if (!codeMatch) {
      return { code: "", cleanTitle: normalized, hasExternalSubtitle: false };
    }
    const code = codeMatch[1].toUpperCase();
    let remainder = groupedRemainder.slice(codeMatch[0].length).trimStart();
    const hasExternalSubtitle = groupedHasExternalSubtitle || SUBTITLE_TAG_PATTERN.test(remainder);
    remainder = remainder.replace(SUBTITLE_TAG_PATTERN, "");
    const mgsReleasePrefix = remainder.match(MGS_RELEASE_PREFIX_PATTERN);
    if (mgsReleasePrefix && mgsReleasePrefix[1].trim().toUpperCase() === code) {
      remainder = remainder.slice(mgsReleasePrefix[0].length);
    }
    while (/^\([^)]*\)\s*/u.test(remainder)) {
      remainder = remainder.replace(/^\([^)]*\)\s*/u, "");
    }
    return {
      code,
      cleanTitle: `${code}${remainder ? ` ${remainder.trim()}` : ""}`,
      hasExternalSubtitle
    };
  }
  var WINDOWS_REPLACEMENTS = /* @__PURE__ */ new Map([
    ["<", "\uFF1C"],
    [">", "\uFF1E"],
    [":", "\uFF1A"],
    ['"', "\uFF02"],
    ["/", "\uFF0F"],
    ["\\", "\uFF3C"],
    ["|", "\uFF5C"],
    ["?", "\uFF1F"],
    ["*", "\uFF0A"]
  ]);
  function sanitizeFilename(value) {
    return String(value ?? "").replace(/[<>:"/\\|?*]/g, (character) => WINDOWS_REPLACEMENTS.get(character)).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  }
  function buildAttachmentFilename(parsedTitle, sourceName) {
    const cleanSource = String(sourceName ?? "").split(/[?#]/, 1)[0];
    const extensionMatch = cleanSource.match(/\.([a-z0-9]{1,10})$/i);
    const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : ".rar";
    const subtitleSuffix = parsedTitle.hasExternalSubtitle ? "[\u5916\u6302\u5B57\u5E55]" : "";
    return `${sanitizeFilename(parsedTitle.cleanTitle)}${subtitleSuffix}${extension}`;
  }
  function absoluteUrl(document2, value) {
    if (!value || /^(?:javascript:|data:|blob:)/i.test(value)) return "";
    try {
      return new URL(value, document2.baseURI).href;
    } catch {
      return "";
    }
  }
  function attachmentSourceName(link) {
    const candidates = [
      link.getAttribute("download"),
      link.getAttribute("title"),
      link.textContent,
      link.getAttribute("href")
    ];
    for (const candidate of candidates) {
      const match = String(candidate ?? "").trim().match(/([^/?#\s]+\.[a-z0-9]{1,10})(?:[?#]|$)/i);
      if (match) return match[1];
    }
    return "attachment.rar";
  }
  function isContentImage(image) {
    if (image.hasAttribute(HDBLOG_PREVIEW_URL_ATTR)) return false;
    if (image.closest(".attp, .attach, .pattl, .smilie, .avatar")) return false;
    if (image.matches(".post-text img.body-image")) return true;
    const className = image.className || "";
    const src = image.getAttribute("src") || "";
    if (/\b(?:smilie|avatar|qqemoji)\b/i.test(className)) return false;
    if (/(?:static\/image\/(?:smiley|common)|uc_server\/avatar)/i.test(src)) return false;
    const parentHref = image.closest("a")?.getAttribute("href") || "";
    const width = image.naturalWidth || image.width || Number(image.getAttribute("width")) || 0;
    const height = image.naturalHeight || image.height || Number(image.getAttribute("height")) || 0;
    return Boolean(
      image.getAttribute("zoomfile") || image.getAttribute("file") || /^aimg_/i.test(image.id) || /data\/attachment/i.test(src) || /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(parentHref) || width >= 200 && height >= 200
    );
  }
  function imageSize(image) {
    const width = image.naturalWidth || image.width || Number(image.getAttribute("width")) || 0;
    const height = image.naturalHeight || image.height || Number(image.getAttribute("height")) || 0;
    return { width, height, area: width * height };
  }
  function largeImageUrl(document2, image) {
    const parentHref = image.closest("a")?.getAttribute("href");
    const candidates = [
      image.getAttribute("zoomfile"),
      image.getAttribute("file"),
      parentHref,
      image.getAttribute("data-original"),
      image.getAttribute("src")
    ];
    for (const candidate of candidates) {
      const url = absoluteUrl(document2, candidate);
      if (url) return url;
    }
    return "";
  }
  function cachedImageUrl(document2, image) {
    return absoluteUrl(
      document2,
      image.currentSrc || image.getAttribute("src") || image.getAttribute("data-original")
    );
  }
  function isPixhostThumbnailUrl(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl);
      return /^t\d+\./i.test(url.hostname) && /^\/thumbs\//i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function pixhostShowUrlForImage(document2, image) {
    const href = absoluteUrl(document2, image?.closest("a[href]")?.getAttribute("href"));
    if (!href) return "";
    try {
      const url = new URL(href);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      if (!/^(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i.test(hostname)) return "";
      return /^\/show\/\d+\/[^/?#]+$/i.test(url.pathname) ? url.href : "";
    } catch {
      return "";
    }
  }
  function contentImages(document2, content) {
    if (!content) return [];
    const seen = /* @__PURE__ */ new Set();
    return [...content.querySelectorAll("img")].filter(isContentImage).map((image, order) => {
      const cacheUrl = cachedImageUrl(document2, image);
      const pixhostShowUrl = pixhostShowUrlForImage(document2, image);
      const pixhostThumbUrl = isPixhostThumbnailUrl(cacheUrl, document2.baseURI) ? cacheUrl : "";
      return {
        url: largeImageUrl(document2, image),
        cacheUrl,
        ...pixhostShowUrl ? { pixhostShowUrl } : {},
        ...pixhostThumbUrl ? { pixhostThumbUrl } : {},
        ...imageSize(image),
        order
      };
    }).filter((image) => image.url && !seen.has(image.url) && seen.add(image.url));
  }
  function isPixhostAssetUrl(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      return /^(?:img\d+\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i.test(hostname) || /^t\d+\./i.test(hostname) && /(?:pixhost|pixho)/i.test(hostname);
    } catch {
      return false;
    }
  }
  function hdblogPreviewImages(document2, content) {
    if (!content) return [];
    const seen = /* @__PURE__ */ new Set();
    return [...content.querySelectorAll(`img[${HDBLOG_PREVIEW_URL_ATTR}]`)].map((image) => absoluteUrl(document2, image.getAttribute(HDBLOG_PREVIEW_URL_ATTR))).filter((url) => url && !seen.has(url) && seen.add(url)).map((url) => ({
      url,
      hdblogPreview: true,
      pixhostPreview: isPixhostAssetUrl(url, document2.baseURI)
    }));
  }
  function contentMagnets(content) {
    const matches = String(content?.textContent ?? "").match(MAGNET_PATTERN) || [];
    return [...new Set(matches.map((value) => value.replace(/[),.;，。；]+$/u, "")))];
  }
  function isFc2PpvTitle(rawTitle) {
    return FC2_PPV_PATTERN.test(String(rawTitle ?? "").replace(/\s+/g, " ").trim());
  }
  function isBtForumThread(document2, rawTitle) {
    if (/\[BT\]/i.test(String(rawTitle ?? ""))) return true;
    return [...document2.querySelectorAll("a[href]")].some((link) => {
      try {
        const url = new URL(link.getAttribute("href"), document2.baseURI);
        return url.searchParams.get("mod") === "forumdisplay" && url.searchParams.get("fid") === "244";
      } catch {
        return false;
      }
    });
  }
  function alphabeticImageLabel(index) {
    let value = index + 1;
    let label = "";
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + value % 26) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }
  function sequencedImageFilename(code, index, total) {
    const safeCode = sanitizeFilename(code || "thread-image");
    return total === 1 ? `${safeCode}.jpg` : `${safeCode} ${alphabeticImageLabel(index)}.jpg`;
  }
  function extractThreadResources(document2) {
    const rawTitle = getThreadHeadingText(document2);
    const title = parseThreadTitle(rawTitle);
    const firstPost = [...document2.querySelectorAll('#postlist [id^="post_"]')].find((element) => /^post_\d+$/i.test(element.id)) || document2.querySelector("#postlist > div, #postlist") || document2.querySelector("#first-post");
    const content = firstPost?.querySelector('[id^="postmessage_"], .t_f, .post-text') || firstPost;
    const attachmentLinks = firstPost ? [...firstPost.querySelectorAll('a[href*="mod=attachment"], a[href*="attachment.php"]')] : [];
    const attachments = attachmentLinks.map((link) => ({
      url: absoluteUrl(document2, link.getAttribute("href")),
      sourceName: attachmentSourceName(link)
    })).filter((attachment) => attachment.url);
    const images = contentImages(document2, content);
    const hdblogPreviews = hdblogPreviewImages(document2, content);
    const magnets = contentMagnets(content);
    const largestImage = images.reduce((largest, image) => {
      if (!largest) return image;
      return image.area > largest.area ? image : largest;
    }, null);
    return {
      title,
      attachments,
      images,
      hdblogPreviews,
      magnets,
      isBtThread: isBtForumThread(document2, rawTitle),
      useFc2AbImageNames: isFc2PpvTitle(rawTitle),
      imageUrl: largestImage?.url || "",
      imageCacheUrl: largestImage?.cacheUrl || "",
      imageFilename: title.code ? `${sanitizeFilename(title.code)}.jpg` : "thread-image.jpg"
    };
  }
  function buildTorrentFilename(value) {
    const raw = String(value ?? "").replace(/\s+/g, " ").trim();
    const normalized = raw.replace(
      /^([A-Z0-9]+-\d+[A-Z]?)\s+\[BT\]\s*(?:\([^)]*\)\s*)*/i,
      "$1 "
    );
    return `${sanitizeFilename(normalized)}.torrent`;
  }
  function buildDownloadJobs(document2) {
    const resources = extractThreadResources(document2);
    const jobs = resources.magnets.map((magnet) => ({
      kind: "torrent",
      url: magnet,
      name: buildTorrentFilename(resources.title.cleanTitle || resources.title.code || "download")
    }));
    jobs.push(...resources.attachments.map((attachment) => ({
      kind: "attachment",
      url: attachment.url,
      name: buildAttachmentFilename(resources.title, attachment.sourceName)
    })));
    const sequenceAllImages = resources.isBtThread || resources.title.code.startsWith("FC2-");
    if (sequenceAllImages) {
      const seenImageUrls = /* @__PURE__ */ new Set();
      const downloadImages = [
        ...resources.images.map((image) => ({
          url: image.cacheUrl || image.url,
          ...image.url && image.url !== (image.cacheUrl || image.url) ? { fallbackUrls: [image.url] } : {},
          ...image.pixhostShowUrl ? { pixhostShowUrl: image.pixhostShowUrl } : {},
          ...image.pixhostThumbUrl ? { pixhostThumbUrl: image.pixhostThumbUrl } : {}
        })),
        ...resources.hdblogPreviews
      ].filter((image) => image.url && !seenImageUrls.has(image.url) && seenImageUrls.add(image.url));
      downloadImages.forEach((image, index) => {
        jobs.push({
          kind: "image",
          url: image.url,
          name: /\.webp(?:[?#]|$)/i.test(image.url) && document2.querySelector("#first-post") ? sequencedImageFilename(resources.title.code, index, downloadImages.length).replace(/\.jpg$/, ".webp") : sequencedImageFilename(resources.title.code, index, downloadImages.length),
          ...image.pixhostShowUrl ? { pixhostShowUrl: image.pixhostShowUrl } : {},
          ...image.pixhostThumbUrl ? { pixhostThumbUrl: image.pixhostThumbUrl } : {},
          ...image.hdblogPreview ? { hdblogPreview: true } : {},
          ...image.pixhostPreview ? { pixhostPreview: true } : {}
        });
      });
    } else {
      if (resources.imageUrl) {
        const preferredUrl = resources.imageCacheUrl || resources.imageUrl;
        jobs.push({
          kind: "image",
          url: preferredUrl,
          ...resources.imageUrl && resources.imageUrl !== preferredUrl ? { fallbackUrls: [resources.imageUrl] } : {},
          name: /\.webp(?:[?#]|$)/i.test(preferredUrl) && document2.querySelector("#first-post") ? resources.hdblogPreviews.length ? `${sanitizeFilename(resources.title.code || "thread-image")} A.webp` : resources.imageFilename.replace(/\.jpg$/, ".webp") : resources.hdblogPreviews.length ? `${sanitizeFilename(resources.title.code || "thread-image")} A.jpg` : resources.imageFilename
        });
      }
      if (resources.hdblogPreviews.length) {
        const safeCode = sanitizeFilename(resources.title.code || "preview");
        resources.hdblogPreviews.forEach((image, index) => {
          jobs.push({
            kind: "image",
            url: image.url,
            name: resources.hdblogPreviews.length === 1 ? `${safeCode} B.jpg` : `${safeCode} B${index + 1}.jpg`,
            ...image.hdblogPreview ? { hdblogPreview: true } : {},
            ...image.pixhostPreview ? { pixhostPreview: true } : {}
          });
        });
      }
    }
    for (const job of jobs) {
      if (job.kind !== "image") continue;
      const sourceImage = resources.images.find((image) => (image.cacheUrl || image.url) === job.url && image.pixhostShowUrl);
      if (!sourceImage) {
        const pixhostThumbSource = resources.images.find((image) => (image.cacheUrl || image.url) === job.url && image.pixhostThumbUrl);
        if (pixhostThumbSource) job.pixhostThumbUrl = pixhostThumbSource.pixhostThumbUrl;
        continue;
      }
      job.pixhostShowUrl = sourceImage.pixhostShowUrl;
      job.pixhostThumbUrl = sourceImage.pixhostThumbUrl || job.url;
    }
    return jobs;
  }

  // src/settings-layout.js
  var STYLE = `
.sx-title { margin:0; padding:20px 24px 16px; font-size:20px; line-height:1.35; font-weight:700; border-bottom:1px solid #e5e7eb; flex:none; }
.sx-workspace { display:flex; min-height:0; flex:1; overflow:hidden; }
.sx-nav { display:flex; flex-direction:column; width:176px; min-width:176px; gap:4px; padding:16px 10px; overflow-y:auto; background:#f8fafc; border-right:1px solid #e5e7eb; box-sizing:border-box; }
.sx-nav button { appearance:none; display:block; border:0; border-radius:7px; padding:11px 12px; width:100%; background:transparent; color:#334155; text-align:left; font:600 13px/1.4 system-ui,sans-serif; cursor:pointer; }
.sx-nav button[aria-selected="true"] { background:#e8f1ff; color:#155bb5; box-shadow:inset 3px 0 #2563eb; }
.sx-nav button:hover:not([aria-selected="true"]) { background:#eef2f7; }
.sx-content { min-width:0; flex:1; padding:18px 24px 24px; overflow-y:auto; box-sizing:border-box; }
.sx-group[hidden] { display:none !important; }
.sx-group-title { font-size:17px; font-weight:700; line-height:1.45; margin:0 0 5px; }
.sx-group-desc { color:#64748b; font-size:12px; margin:0 0 18px; }
.sx-group-body > label, .sx-group-body > div { margin-bottom:16px !important; }
.sx-group-body > label:not([data-search-filter-keywords-row]):not([data-keywords-row]) { padding:9px 10px; border:1px solid #eef0f3; border-radius:7px; background:#fff; }
.sx-group-body label, .sx-group-body div { box-sizing:border-box; }
.sx-group-body input[type="number"], .sx-group-body input[type="text"], .sx-group-body input[type="url"], .sx-group-body input[type="password"], .sx-group-body textarea { max-width:100%; }
.sx-group-body input:disabled, .sx-group-body textarea:disabled { opacity:.55; cursor:not-allowed; }
.sx-group-body small { line-height:1.55; }
.sx-group-body > [data-batch-open-interval-row], .sx-group-body > [data-batch-open-history-row], .sx-group-body > [data-keywords-row], .sx-group-body > [data-search-filter-keywords-row] { margin-left:0 !important; padding:13px 14px; border-radius:8px; border:1px solid #e6eaf0; background:#f8fafc; }
.sx-group-body > [data-download-guard-row] { margin-left:0 !important; }
.sx-footer { padding:13px 24px; border-top:1px solid #e5e7eb; background:#fff; margin:0 !important; flex:none; }
.sx-footer button { border:1px solid #cbd5e1; border-radius:6px; background:#fff; color:#334155; cursor:pointer; }
.sx-footer button[type="submit"] { background:#2563eb; border-color:#2563eb; color:#fff; }
.sx-footer button:hover { filter:brightness(.96); }
@media (max-width:650px) {
  .sx-title { padding:15px 17px; }
  .sx-workspace { flex-direction:column; }
  .sx-nav { width:100%; min-width:0; flex:none; flex-direction:row; overflow-x:auto; overflow-y:hidden; padding:10px; border-right:0; border-bottom:1px solid #e5e7eb; }
  .sx-nav button { width:auto; flex:none; white-space:nowrap; padding:9px 13px; }
  .sx-nav button[aria-selected="true"] { box-shadow:inset 0 -3px #2563eb; }
  .sx-content { padding:16px; }
  .sx-footer { padding:11px 16px; }
}
`;
  function createSection(document2, key, title, description) {
    const section = document2.createElement("section");
    section.className = "sx-group";
    section.dataset.settingsSection = key;
    const heading = document2.createElement("h3");
    heading.className = "sx-group-title";
    heading.textContent = title;
    section.append(heading);
    const summary = document2.createElement("p");
    summary.className = "sx-group-desc";
    summary.textContent = description;
    section.append(summary);
    const body = document2.createElement("div");
    body.className = "sx-group-body";
    section.append(body);
    return { section, body };
  }
  function appendSection(form, spec) {
    const document2 = form.ownerDocument;
    const nav = form.querySelector("[data-settings-nav]");
    const content = form.querySelector("[data-settings-content]");
    if (!nav || !content) return null;
    const { section, body } = createSection(document2, spec.key, spec.title, spec.description);
    const button = document2.createElement("button");
    button.type = "button";
    button.dataset.settingsTab = spec.key;
    button.textContent = spec.title;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.id = "sx-tab-" + spec.key;
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-labelledby", button.id);
    nav.append(button);
    content.append(section);
    button.addEventListener("click", () => activateSettingsSection(form, spec.key));
    return { section, body, button };
  }
  function activateSettingsSection(form, key) {
    const group = [...form.querySelectorAll("[data-settings-section]")].find((item) => item.dataset.settingsSection === key);
    if (!group) return false;
    for (const panel of form.querySelectorAll("[data-settings-section]")) {
      panel.hidden = panel !== group;
    }
    for (const tab of form.querySelectorAll("[data-settings-tab]")) {
      const selected = tab.dataset.settingsTab === key;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    const content = form.querySelector("[data-settings-content]");
    if (content) content.scrollTop = 0;
    return true;
  }
  function organizeSettingsPanel(form, sections) {
    if (!form || form.querySelector("[data-settings-workspace]")) return false;
    const document2 = form.ownerDocument;
    const heading = form.querySelector(":scope > h2");
    const footer = form.querySelector(":scope > div:last-child");
    if (!heading || !footer || !footer.querySelector('[data-action="cancel"]')) return false;
    const sourceRoots = [...form.children].filter((node) => node !== heading && node !== footer && node.tagName === "DIV");
    const findRow = (setting) => {
      let node = form.querySelector('[data-setting="' + setting + '"]');
      if (!node) return null;
      while (node.parentElement && !sourceRoots.includes(node.parentElement) && node.parentElement !== form) {
        node = node.parentElement;
      }
      return node;
    };
    const groups = sections.map((spec) => ({
      ...spec,
      rows: spec.settings.map(findRow).filter(Boolean)
    }));
    const found = groups.reduce((sum, group) => sum + group.rows.length, 0);
    if (!found) return false;
    const originalRows = sourceRoots.flatMap(
      (root) => [...root.children].filter((node) => node.querySelector?.("[data-setting]") || node.hasAttribute?.("data-setting"))
    );
    const assignedRows = new Set(groups.flatMap((group) => group.rows));
    const missing = originalRows.filter((row) => !assignedRows.has(row));
    if (missing.length) {
      groups.push({ key: "more", title: "\u5176\u4ED6\u9009\u9879", description: "\u7AD9\u70B9\u7684\u5176\u4ED6\u914D\u7F6E\u9879", rows: missing });
    }
    const css = document2.createElement("style");
    css.textContent = STYLE;
    const workspace = document2.createElement("div");
    workspace.className = "sx-workspace";
    workspace.dataset.settingsWorkspace = "1";
    const nav = document2.createElement("nav");
    nav.className = "sx-nav";
    nav.dataset.settingsNav = "1";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "\u8BBE\u7F6E\u5206\u7C7B");
    const content = document2.createElement("div");
    content.className = "sx-content";
    content.dataset.settingsContent = "1";
    workspace.append(nav, content);
    nav.addEventListener("keydown", (event) => {
      const tabs = [...nav.querySelectorAll("[data-settings-tab]")];
      const active = tabs.indexOf(nav.getRootNode()?.activeElement || document2.activeElement);
      const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
      if (active < 0 || !keys.includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (active + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
    form.style.width = "min(850px, 100%)";
    form.style.maxHeight = "calc(100vh - 32px)";
    form.style.height = "min(690px, calc(100vh - 32px))";
    form.style.overflow = "hidden";
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.padding = "0";
    form.style.background = "#fff";
    heading.className = "sx-title";
    footer.className = "sx-footer";
    form.replaceChildren(css, heading, workspace, footer);
    for (const spec of groups) {
      const created = appendSection(form, spec);
      for (const row of spec.rows) {
        if (row.parentNode !== created.body) created.body.append(row);
      }
    }
    activateSettingsSection(form, groups[0].key);
    form.addEventListener("focusin", (event) => {
      const group = event.target?.closest?.("[data-settings-section]");
      if (group && group.hidden) activateSettingsSection(form, group.dataset.settingsSection);
    });
    form.addEventListener("invalid", (event) => {
      const group = event.target?.closest?.("[data-settings-section]");
      if (group && group.hidden) activateSettingsSection(form, group.dataset.settingsSection);
    }, true);
    return true;
  }
  function addSettingsExtraSection(form, spec, element) {
    if (!form?.querySelector("[data-settings-workspace]")) return false;
    const existing = form.querySelector('[data-settings-section="' + spec.key + '"]');
    const group = existing ? { body: existing.querySelector(".sx-group-body") } : appendSection(form, spec);
    group.body.append(element);
    return true;
  }

  // src/hdblog-image-hosts.js
  var HDBLOG_IMAGE_HOSTS_KEY = "x1080x-ex:hdblog-image-hosts";
  var DEFAULT_HDBLOG_IMAGE_HOSTS = Object.freeze([
    "pixhost.to",
    "pixhost.cc",
    "pixho.st",
    // 旧版本代码曾兼容该域名，保留以免历史文章失效。
    "pixhost.org"
  ]);
  var HDBLOG_SETTINGS_PANEL_ID = "x1080x-ex-hdblog-settings-panel";
  var IMAGE_HOSTS_FIELD_ATTR = "data-x1080x-hdblog-image-hosts-field";
  var IMAGE_HOSTS_BOUND_ATTR = "data-x1080x-hdblog-image-hosts-bound";
  function normalizeHostname(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    try {
      const url = new URL(text.includes("://") ? text : `https://${text}`);
      return url.hostname.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    } catch {
      return "";
    }
  }
  function parseHdblogImageHosts(value) {
    const seen = /* @__PURE__ */ new Set();
    return String(value ?? "").split(/[\s,;，；]+/).map(normalizeHostname).filter(Boolean).filter((hostname) => !seen.has(hostname) && seen.add(hostname));
  }
  function getCustomHdblogImageHosts() {
    if (typeof GM_getValue !== "function") return [];
    const stored = GM_getValue(HDBLOG_IMAGE_HOSTS_KEY, "");
    return parseHdblogImageHosts(stored);
  }
  function getHdblogImageHosts() {
    return [.../* @__PURE__ */ new Set([...DEFAULT_HDBLOG_IMAGE_HOSTS, ...getCustomHdblogImageHosts()])];
  }
  function isHdblogImagePageHost(hostname) {
    const host = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
    if (!host) return false;
    return getHdblogImageHosts().some((domain) => host === domain || host === `www.${domain}`);
  }
  function isHdblogHost(locationObject) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "hdblog.me" || hostname.endsWith(".hdblog.me");
  }
  function enhanceHdblogSettingsPanel(document2) {
    const overlay = document2?.getElementById(HDBLOG_SETTINGS_PANEL_ID);
    const panel = overlay?.querySelector("form");
    if (!panel || panel.querySelector(`[${IMAGE_HOSTS_FIELD_ATTR}]`)) return false;
    const label = document2.createElement("label");
    label.setAttribute(IMAGE_HOSTS_FIELD_ATTR, "1");
    label.style.cssText = "display:block;margin-bottom:18px";
    const title = document2.createElement("span");
    title.textContent = "\u989D\u5916\u56FE\u5E8A\u57DF\u540D";
    title.style.cssText = "display:block;font-weight:600;margin-bottom:6px";
    const textarea = document2.createElement("textarea");
    textarea.setAttribute("data-setting", "image-hosts");
    textarea.rows = 4;
    textarea.placeholder = "\u901A\u5E38\u65E0\u9700\u586B\u5199\uFF1B\u56FE\u5E8A\u66F4\u6362\u57DF\u540D\u65F6\u6BCF\u884C\u6DFB\u52A0\u4E00\u4E2A";
    textarea.value = getCustomHdblogImageHosts().join("\n");
    textarea.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical";
    const help = document2.createElement("small");
    help.style.cssText = "display:block;margin-top:5px;color:#666";
    help.textContent = `\u5185\u7F6E\u517C\u5BB9\uFF1A${DEFAULT_HDBLOG_IMAGE_HOSTS.join("\u3001")}\u3002\u53EF\u586B\u4E3B\u57DF\u540D\u6216\u5B8C\u6574 URL\uFF1B\u811A\u672C\u4E5F\u4F1A\u81EA\u52A8\u8BC6\u522B\u5E38\u89C1 /show/ \u56FE\u7247\u5C55\u793A\u9875\u3002`;
    label.append(title, textarea, help);
    if (!addSettingsExtraSection(panel, {
      key: "image-hosts",
      title: "\u56FE\u5E8A\u8BBE\u7F6E",
      description: "\u6269\u5C55 Preview \u56FE\u7247\u7684\u6765\u6E90\u57DF\u540D"
    }, label)) {
      panel.insertBefore(label, panel.lastElementChild || null);
    }
    if (panel.getAttribute(IMAGE_HOSTS_BOUND_ATTR) !== "1") {
      panel.setAttribute(IMAGE_HOSTS_BOUND_ATTR, "1");
      panel.addEventListener("submit", () => {
        const input = panel.querySelector('[data-setting="image-hosts"]');
        if (!input || typeof GM_setValue !== "function") return;
        const hosts = parseHdblogImageHosts(input.value);
        GM_setValue(HDBLOG_IMAGE_HOSTS_KEY, hosts.join("\n"));
      }, true);
    }
    return true;
  }
  function installHdblogImageHostSettings(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2?.body || !isHdblogHost(locationObject)) return;
    enhanceHdblogSettingsPanel(document2);
    const MutationObserverCtor = document2.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (typeof MutationObserverCtor !== "function") return;
    const observer = new MutationObserverCtor(() => enhanceHdblogSettingsPanel(document2));
    observer.observe(document2.body, { childList: true, subtree: true });
  }

  // src/pixhost.js
  var PIXHOST_PAGE_HOST_PATTERN = /^(?:www\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i;
  var PIXHOST_THUMB_HOST_PATTERN = /^t(\d+)\.(.+)$/i;
  var IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;
  var CANONICAL_SHOW_PATH_PATTERN = /^\/show\/\d+\/[^/?#]+$/i;
  var PIXHOST_UNAVAILABLE_TEXT_PATTERN = /(?:\bpicture\s+removed\b|\b(?:this\s+)?image\s+(?:is\s+)?no\s+longer\s+available\b|\bimage\s+(?:has\s+been\s+)?removed\b|\b(?:image|file)\s+not\s+found\b|\b410\s+gone\b)/i;
  var REQUEST_TIMEOUT = 3e4;
  var resolutionCache = /* @__PURE__ */ new Map();
  function absoluteUrl2(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function isDirectImageDeliveryUrl(url) {
    return /^img\d+\./i.test(url.hostname) || /^\/(?:images?|thumbs?|full|raw)\//i.test(url.pathname);
  }
  function isPixhostShowUrl(value, baseUrl = "https://pixhost.to/") {
    const href = absoluteUrl2(value, baseUrl);
    if (!href) return false;
    try {
      const url = new URL(href);
      if (isDirectImageDeliveryUrl(url)) return false;
      if (CANONICAL_SHOW_PATH_PATTERN.test(url.pathname)) return true;
      return (PIXHOST_PAGE_HOST_PATTERN.test(url.hostname) || isHdblogImagePageHost(url.hostname)) && !/^\/(?:images?|thumbs?)\//i.test(url.pathname) && !IMAGE_EXTENSION_PATTERN.test(url.pathname);
    } catch {
      return false;
    }
  }
  function derivePixhostImageUrlFromThumbnail(value, baseUrl = "https://pixhost.to/") {
    const href = absoluteUrl2(value, baseUrl);
    if (!href) return "";
    try {
      const url = new URL(href);
      const hostMatch = url.hostname.match(PIXHOST_THUMB_HOST_PATTERN);
      if (!hostMatch || !/^\/thumbs\//i.test(url.pathname)) return "";
      url.hostname = `img${hostMatch[1]}.${hostMatch[2]}`;
      url.pathname = url.pathname.replace(/^\/thumbs\//i, "/images/");
      return url.href;
    } catch {
      return "";
    }
  }
  function candidateUrl(value, pageUrl) {
    const href = absoluteUrl2(value, pageUrl);
    if (!href || isPixhostShowUrl(href, pageUrl)) return "";
    return href;
  }
  function parseImageHostDocument(document2, html) {
    if (!document2 || !html) return null;
    const parsed = document2.implementation.createHTMLDocument("image-host");
    parsed.documentElement.innerHTML = String(html);
    return parsed;
  }
  function isUnavailableImageHostDocument(parsed) {
    if (!parsed) return false;
    const imageLabels = [...parsed.querySelectorAll("img[alt], img[title]")].flatMap((image) => [image.getAttribute("alt"), image.getAttribute("title")]);
    const text = [parsed.title, parsed.body?.textContent, ...imageLabels].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return PIXHOST_UNAVAILABLE_TEXT_PATTERN.test(text);
  }
  function isPixhostUnavailablePage(document2, html) {
    return isUnavailableImageHostDocument(parseImageHostDocument(document2, html));
  }
  function parsePixhostImagePage(document2, html, pageUrl) {
    const parsed = parseImageHostDocument(document2, html);
    if (!parsed || isUnavailableImageHostDocument(parsed)) return "";
    const selectors = [
      ["img.image-img[src]", "src"],
      ["img.image-img[data-src]", "data-src"],
      ["img.image-img[data-original]", "data-original"],
      ["img#image[src]", "src"],
      ["img#image[data-src]", "data-src"],
      ["figure img[src]", "src"],
      ["a#image[href]", "href"],
      ["a.image[href]", "href"],
      ['meta[property="og:image"]', "content"],
      ['meta[name="twitter:image"]', "content"],
      ['link[rel="image_src"]', "href"],
      ["main img[src]", "src"],
      ["main img[data-src]", "data-src"]
    ];
    for (const [selector, attribute] of selectors) {
      const value = parsed.querySelector(selector)?.getAttribute(attribute);
      const url = candidateUrl(value, pageUrl);
      if (url) return url;
    }
    const raw = String(html).match(/<img\b(?=[^>]*\bclass=["'][^"']*\bimage-img\b[^"']*["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
    return candidateUrl(raw, pageUrl);
  }
  function requestPixhostPage(showUrl, gmRequest2, referer) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest2({
        method: "GET",
        url: showUrl,
        responseType: "text",
        timeout: REQUEST_TIMEOUT,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          ...referer ? { Referer: referer } : {}
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            const error = new Error(`\u56FE\u5E8A\u9875\u9762\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`);
            error.status = response.status || 0;
            reject(error);
            return;
          }
          resolve({
            html: String(response.responseText ?? response.response ?? ""),
            finalUrl: response.finalUrl || response.responseURL || showUrl
          });
        },
        onerror: () => reject(new Error("\u56FE\u5E8A\u9875\u9762\u8BF7\u6C42\u53D1\u751F\u7F51\u7EDC\u9519\u8BEF")),
        ontimeout: () => reject(new Error("\u56FE\u5E8A\u9875\u9762\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  function resolvePixhostShowUrl(document2, showUrl, thumbnailUrl2 = "", gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const absoluteShowUrl = absoluteUrl2(showUrl, document2?.baseURI || "https://pixhost.to/");
    if (!absoluteShowUrl || !isPixhostShowUrl(absoluteShowUrl, document2?.baseURI)) {
      return Promise.resolve("");
    }
    if (resolutionCache.has(absoluteShowUrl)) return resolutionCache.get(absoluteShowUrl);
    const fallback = derivePixhostImageUrlFromThumbnail(thumbnailUrl2, document2?.baseURI || absoluteShowUrl);
    const promise = requestPixhostPage(absoluteShowUrl, gmRequest2, document2?.location?.href).then(({ html, finalUrl }) => {
      if (isPixhostUnavailablePage(document2, html)) return "";
      return parsePixhostImagePage(document2, html, finalUrl || absoluteShowUrl) || fallback;
    }).catch((error) => error?.status === 404 || error?.status === 410 ? "" : fallback);
    resolutionCache.set(absoluteShowUrl, promise);
    return promise;
  }

  // src/site-domains.js
  var AGAGHHH_PRIMARY_DOMAIN_KEY = "x1080x-ex:agaghhh-primary-domain";
  var DEFAULT_AGAGHHH_PRIMARY_DOMAIN = "1080xin.com";
  var LEGACY_AGAGHHH_DOMAIN = "agaghhh.cc";
  function parseAgaghhhPrimaryDomain(value) {
    const domains = parseDomainList(value);
    if (domains.length !== 1) return "";
    const host = domains[0];
    if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) return "";
    return host;
  }
  function getAgaghhhPrimaryDomain() {
    const stored = typeof GM_getValue === "function" ? GM_getValue(AGAGHHH_PRIMARY_DOMAIN_KEY, DEFAULT_AGAGHHH_PRIMARY_DOMAIN) : DEFAULT_AGAGHHH_PRIMARY_DOMAIN;
    return parseAgaghhhPrimaryDomain(stored) || DEFAULT_AGAGHHH_PRIMARY_DOMAIN;
  }
  function getAgaghhhDomains() {
    return [.../* @__PURE__ */ new Set([
      getAgaghhhPrimaryDomain(),
      DEFAULT_AGAGHHH_PRIMARY_DOMAIN,
      LEGACY_AGAGHHH_DOMAIN
    ])];
  }
  function isAgaghhhHost(locationObject = globalThis.location) {
    const host = typeof locationObject === "string" ? locationObject : locationObject?.hostname;
    return isAllowedHost(host, getAgaghhhDomains());
  }
  function getAgaghhhOrigin() {
    return `https://${getAgaghhhPrimaryDomain()}`;
  }

  // src/batch-progress-locator.js
  function firstBatchListPageUrl(value, kind) {
    const url = new URL(value);
    url.hash = "";
    if (kind === "agaghhh") {
      const forumPath = url.pathname.match(/^(.*\/forum-\d+-)\d+(\.html)$/i);
      if (forumPath) {
        url.pathname = `${forumPath[1]}1${forumPath[2]}`;
      }
      url.searchParams.delete("page");
    } else {
      url.pathname = url.pathname.replace(/\/page\/\d+\/?$/i, "/");
      url.searchParams.delete("paged");
    }
    return url.href;
  }
  function nextBatchListPageUrl(document2, baseUrl = document2?.baseURI) {
    if (!document2) return "";
    const selectors = [
      "#pgt .pg a.nxt[href]",
      ".pg a.nxt[href]",
      "a.nxt[href]",
      ".archive-pagination .pagination-next a[href]",
      ".archive-pagination a.next[href]",
      ".pagination a.next[href]",
      '.archive-pagination a[rel="next"][href]',
      'a[rel="next"][href]'
    ];
    let link = null;
    for (const selector of selectors) {
      link = document2.querySelector(selector);
      if (link) break;
    }
    if (!link) {
      link = [...document2.querySelectorAll(
        ".pg a[href], .archive-pagination a[href], .pagination a[href]"
      )].find((anchor) => /^(?:下一页|下一頁|next|older(?: posts?)?|»|›|→)(?:\s*[»›→])?$/i.test(String(anchor.textContent || "").trim()));
    }
    if (!link) {
      const nextButton = document2.querySelector(
        '.pgt .pg button[aria-label="\u4E0B\u4E00\u9875"], .pg button[aria-label="\u4E0B\u4E00\u9875"], .pg button[aria-label="\u4E0B\u4E00\u9801"]'
      );
      if (!nextButton || nextButton.disabled) return "";
      const url = new URL(baseUrl);
      if (!/^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname)) return "";
      const active = Number.parseInt(document2.querySelector(".pgt .pg strong, .pg strong")?.textContent || "", 10);
      const current = Number.isInteger(active) && active > 0 ? active : Number.parseInt(url.searchParams.get("page") || "1", 10) || 1;
      url.searchParams.set("page", String(current + 1));
      return url.href;
    }
    try {
      const url = new URL(link.getAttribute("href"), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function parseBatchListPage(html, pageUrl, document2) {
    const Parser = document2?.defaultView?.DOMParser || globalThis.DOMParser;
    if (!Parser) throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u89E3\u6790\u5206\u9875\u5185\u5BB9");
    const page = new Parser().parseFromString(html, "text/html");
    if (!page.head) throw new Error("\u5206\u9875\u5185\u5BB9\u65E0\u6548");
    const base = page.createElement("base");
    base.href = pageUrl;
    page.head.prepend(base);
    return page;
  }
  async function scanBatchProgressPages({
    startUrl,
    currentUrl,
    currentDocument,
    historyIds,
    loadPage,
    collectThreads,
    getId,
    getIds,
    getScope,
    maxPages = 120,
    onProgress = () => {
    },
    cancelled = () => false
  }) {
    const history = new Set(historyIds);
    if (!history.size) return { status: "no-history", checked: 0 };
    const scope = getScope(startUrl);
    if (!scope) return { status: "invalid-scope", checked: 0 };
    let pageUrl = startUrl;
    let previous = null;
    let checked = 0;
    let visitedFound = false;
    let candidate = null;
    const seen = /* @__PURE__ */ new Set();
    while (pageUrl && checked < maxPages) {
      if (cancelled()) return { status: "cancelled", checked };
      const normalized = new URL(pageUrl, startUrl).href;
      if (seen.has(normalized) || getScope(normalized) !== scope) break;
      seen.add(normalized);
      let page;
      if (normalized === currentUrl) {
        page = currentDocument;
      } else {
        const html = await loadPage(normalized);
        if (cancelled()) return { status: "cancelled", checked };
        page = parseBatchListPage(html, normalized, currentDocument);
      }
      const threads = collectThreads(page);
      if (!threads.length) {
        return { status: "unreadable", checked, pageUrl: normalized };
      }
      const opened = threads.filter((thread) => {
        const ids = typeof getIds === "function" ? getIds(thread) : [getId(thread.url)];
        return Array.isArray(ids) && ids.some((id) => id && history.has(id));
      }).length;
      const unopened = threads.length - opened;
      visitedFound ||= opened > 0;
      checked += 1;
      onProgress({ checked, opened, unopened, url: normalized });
      const ratio = opened / threads.length;
      if (opened && unopened) {
        const strength = Math.min(opened, unopened) / threads.length;
        if (!candidate || strength > candidate.strength) {
          candidate = { status: "found", url: normalized, checked, opened, unopened, strength };
        }
      }
      if (previous) {
        const delta = Math.abs(ratio - previous.ratio);
        if (delta >= 0.5) {
          const preferred = previous.opened && previous.unopened ? previous : { url: normalized, checked, opened, unopened };
          return {
            status: "found",
            url: preferred.url,
            checked: preferred.checked,
            opened: preferred.opened,
            unopened: preferred.unopened,
            inspected: checked
          };
        }
      }
      previous = { ratio, url: normalized, checked, opened, unopened };
      const next = nextBatchListPageUrl(page, normalized);
      if (!next || next === normalized || getScope(next) !== scope || seen.has(next)) {
        return candidate ? { ...candidate, inspected: checked, approximate: true } : { status: "end", checked, visitedFound };
      }
      pageUrl = next;
    }
    if (candidate) return { ...candidate, inspected: checked, approximate: true };
    return { status: checked >= maxPages ? "limit" : "end", checked, visitedFound };
  }

  // src/torrent.js
  var TORRENT_SOURCES = Object.freeze([
    (hash) => `https://itorrents.net/torrent/${hash}.torrent`,
    (hash) => `https://torrage.info/torrent.php?h=${hash}`,
    (hash) => `https://itorrents.org/torrent/${hash}.torrent`,
    (hash) => `https://btcache.me/torrent/${hash}`
  ]);
  var CACHE_REQUEST_TIMEOUT_MS = 8e3;
  var BTIH_PATTERN = /urn:btih:([a-f\d]{40}|[a-z2-7]{32})/i;
  var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var QB_CONFIG = Object.freeze({
    defaultUrl: "http://127.0.0.1:8080",
    defaultUsername: "admin",
    requestTimeoutMs: 1e4,
    metadataTimeoutMs: 6e4,
    pollIntervalMs: 2e3,
    enabledStorageKey: "x1080x-ex:qb-enabled",
    urlStorageKey: "x1080x-ex:qb-url",
    usernameStorageKey: "x1080x-ex:qb-username",
    passwordStorageKey: "x1080x-ex:qb-password",
    metadataTimeoutStorageKey: "x1080x-ex:qb-metadata-timeout-ms"
  });
  var qbSessionFingerprint = "";
  var qbLoginPromise = null;
  function decodeSafely(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function normalizeBtih(rawHash) {
    const hash = String(rawHash ?? "").trim().toUpperCase();
    if (/^[A-F\d]{40}$/.test(hash)) return hash;
    if (!/^[A-Z2-7]{32}$/.test(hash)) return "";
    let bits = "";
    for (const character of hash) {
      bits += BASE32.indexOf(character).toString(2).padStart(5, "0");
    }
    let hex = "";
    for (let index = 0; index < bits.length; index += 8) {
      hex += Number.parseInt(bits.slice(index, index + 8), 2).toString(16).padStart(2, "0");
    }
    return hex.toUpperCase();
  }
  function extractBtih(value) {
    const match = decodeSafely(String(value ?? "")).match(BTIH_PATTERN);
    return match ? normalizeBtih(match[1]) : "";
  }
  function normalizeQbUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) throw new Error("\u8BF7\u8F93\u5165 qBittorrent WebUI \u5730\u5740");
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("qBittorrent WebUI \u5730\u5740\u683C\u5F0F\u65E0\u6548");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("qBittorrent WebUI \u5730\u5740\u4EC5\u652F\u6301 http \u6216 https");
    }
    if (url.username || url.password) {
      throw new Error("\u8BF7\u4E0D\u8981\u628A\u7528\u6237\u540D\u6216\u5BC6\u7801\u5199\u5165 WebUI \u5730\u5740");
    }
    if (!url.hostname) throw new Error("qBittorrent WebUI \u5730\u5740\u7F3A\u5C11\u4E3B\u673A\u540D");
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  }
  function readStoredValue(getValue, key, fallback) {
    if (typeof getValue !== "function") return fallback;
    return getValue(key, fallback);
  }
  function getQbSettings(getValue = globalThis.GM_getValue) {
    const rawTimeout = Number(readStoredValue(
      getValue,
      QB_CONFIG.metadataTimeoutStorageKey,
      QB_CONFIG.metadataTimeoutMs
    ));
    return {
      enabled: readStoredValue(getValue, QB_CONFIG.enabledStorageKey, false) === true,
      url: String(readStoredValue(getValue, QB_CONFIG.urlStorageKey, QB_CONFIG.defaultUrl) || QB_CONFIG.defaultUrl),
      username: String(readStoredValue(getValue, QB_CONFIG.usernameStorageKey, QB_CONFIG.defaultUsername) || QB_CONFIG.defaultUsername),
      password: String(readStoredValue(getValue, QB_CONFIG.passwordStorageKey, "") || ""),
      metadataTimeoutMs: Number.isFinite(rawTimeout) ? Math.min(3e5, Math.max(1e4, Math.round(rawTimeout))) : QB_CONFIG.metadataTimeoutMs
    };
  }
  function normalizeQbSettings(settings) {
    const timeout = Number(settings?.metadataTimeoutMs ?? QB_CONFIG.metadataTimeoutMs);
    if (!Number.isFinite(timeout) || timeout < 1e4 || timeout > 3e5) {
      throw new Error("\u5143\u6570\u636E\u7B49\u5F85\u65F6\u95F4\u9700\u5728 10\uFF5E300 \u79D2\u4E4B\u95F4");
    }
    const username = String(settings?.username || "").trim();
    if (!username) throw new Error("\u8BF7\u8F93\u5165 qBittorrent WebUI \u7528\u6237\u540D");
    return {
      enabled: Boolean(settings?.enabled),
      url: normalizeQbUrl(settings?.url ?? QB_CONFIG.defaultUrl),
      username,
      password: String(settings?.password || ""),
      metadataTimeoutMs: Math.round(timeout)
    };
  }
  function saveQbSettings(settings, setValue = globalThis.GM_setValue) {
    if (typeof setValue !== "function") {
      throw new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301\u4FDD\u5B58 qBittorrent \u8BBE\u7F6E");
    }
    const normalized = normalizeQbSettings(settings);
    setValue(QB_CONFIG.enabledStorageKey, normalized.enabled);
    setValue(QB_CONFIG.urlStorageKey, normalized.url);
    setValue(QB_CONFIG.usernameStorageKey, normalized.username);
    setValue(QB_CONFIG.passwordStorageKey, normalized.password);
    setValue(QB_CONFIG.metadataTimeoutStorageKey, normalized.metadataTimeoutMs);
    qbSessionFingerprint = "";
    return normalized;
  }
  function qbEndpoint(path, settings) {
    const base = normalizeQbUrl(settings.url);
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }
  function qbRequestHeaders(settings, headers = {}) {
    const base = normalizeQbUrl(settings.url);
    const url = new URL(base);
    return {
      Origin: url.origin,
      Referer: `${base}/`,
      ...headers
    };
  }
  function qbErrorMessage(response, path) {
    const body = String(response?.responseText || "").trim();
    if (path === "/api/v2/auth/login" && (response?.status === 401 || response?.status === 403)) {
      return "qBittorrent \u767B\u5F55\u5931\u8D25\uFF1B\u8BF7\u68C0\u67E5 WebUI \u7528\u6237\u540D\u548C\u5BC6\u7801";
    }
    if (response?.status === 401 || response?.status === 403) {
      return "qBittorrent \u4F1A\u8BDD\u65E0\u6548\u6216\u8BBF\u95EE\u88AB\u62D2\u7EDD";
    }
    if (response?.status === 404 && path.includes("/torrents/")) {
      return "qBittorrent \u672A\u63D0\u4F9B\u5143\u6570\u636E API\uFF1B\u8BF7\u4F7F\u7528 qBittorrent 5.2.0+ / WebAPI 2.11.9+";
    }
    return `qBittorrent \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response?.status ?? "\u672A\u77E5"}\uFF09${body ? `\uFF1A${body}` : ""}`;
  }
  function requestQbRaw(path, {
    method = "GET",
    responseType = "text",
    timeout = QB_CONFIG.requestTimeoutMs,
    allowedStatuses = [200],
    settings,
    headers = {},
    data
  } = {}, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      let url;
      try {
        url = qbEndpoint(path, settings);
      } catch (error) {
        reject(error);
        return;
      }
      gmRequest2({
        method,
        url,
        headers: qbRequestHeaders(settings, headers),
        data,
        responseType,
        timeout,
        anonymous: false,
        onload(response) {
          if (!allowedStatuses.includes(response.status)) {
            const error = new Error(qbErrorMessage(response, path));
            error.status = response.status;
            reject(error);
            return;
          }
          resolve(response);
        },
        onerror: () => reject(new Error("\u65E0\u6CD5\u8FDE\u63A5 qBittorrent\uFF0C\u8BF7\u68C0\u67E5 WebUI \u5730\u5740\u3001\u670D\u52A1\u72B6\u6001\u548C userscript \u8DE8\u57DF\u6743\u9650")),
        ontimeout: () => reject(new Error("\u8FDE\u63A5 qBittorrent \u8D85\u65F6"))
      });
    });
  }
  function qbSettingsFingerprint(settings) {
    return `${normalizeQbUrl(settings.url)}
${settings.username}
${settings.password}`;
  }
  async function loginQb(settings, gmRequest2 = globalThis.GM_xmlhttpRequest, force = false) {
    const normalized = normalizeQbSettings(settings);
    const fingerprint = qbSettingsFingerprint(normalized);
    if (!force && qbSessionFingerprint === fingerprint) return true;
    if (!force && qbLoginPromise) return qbLoginPromise;
    const task = (async () => {
      const response = await requestQbRaw("/api/v2/auth/login", {
        method: "POST",
        responseType: "text",
        settings: normalized,
        allowedStatuses: [200, 204],
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        data: new URLSearchParams({
          username: normalized.username,
          password: normalized.password
        }).toString()
      }, gmRequest2);
      const text = String(response.responseText || response.response || "").trim().toLowerCase();
      if (text === "fails.") throw new Error("qBittorrent \u767B\u5F55\u5931\u8D25\uFF1B\u8BF7\u68C0\u67E5 WebUI \u7528\u6237\u540D\u548C\u5BC6\u7801");
      qbSessionFingerprint = fingerprint;
      return true;
    })();
    qbLoginPromise = task;
    try {
      return await task;
    } finally {
      if (qbLoginPromise === task) qbLoginPromise = null;
    }
  }
  async function requestQb(path, options = {}, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const settings = normalizeQbSettings(options.settings || getQbSettings());
    await loginQb(settings, gmRequest2);
    try {
      return await requestQbRaw(path, { ...options, settings }, gmRequest2);
    } catch (error) {
      if (error?.status !== 401 && error?.status !== 403) throw error;
      qbSessionFingerprint = "";
      await loginQb(settings, gmRequest2, true);
      return requestQbRaw(path, { ...options, settings }, gmRequest2);
    }
  }
  async function testQbConnection(settings = getQbSettings(), gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const normalized = normalizeQbSettings(settings);
    await loginQb(normalized, gmRequest2, true);
    const response = await requestQb("/api/v2/app/version", {
      settings: normalized,
      responseType: "text"
    }, gmRequest2);
    const version = String(response.responseText || response.response || "").trim();
    if (!version) throw new Error("qBittorrent \u5DF2\u54CD\u5E94\uFF0C\u4F46\u672A\u8FD4\u56DE\u7248\u672C\u53F7");
    return { version };
  }
  function parseBencode(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const decoder = new TextDecoder();
    let offset = 0;
    function parseBytes() {
      const lengthStart = offset;
      while (offset < bytes.length && bytes[offset] >= 48 && bytes[offset] <= 57) offset += 1;
      if (offset === lengthStart || bytes[offset] !== 58) throw new Error("\u65E0\u6548\u7684 bencode \u5B57\u7B26\u4E32");
      const length = Number.parseInt(decoder.decode(bytes.subarray(lengthStart, offset)), 10);
      offset += 1;
      const end = offset + length;
      if (!Number.isSafeInteger(length) || length < 0 || end > bytes.length) {
        throw new Error("bencode \u5B57\u7B26\u4E32\u957F\u5EA6\u8D8A\u754C");
      }
      const value = bytes.subarray(offset, end);
      offset = end;
      return value;
    }
    function parseValue(depth = 0) {
      if (depth > 100 || offset >= bytes.length) throw new Error("\u65E0\u6548\u7684 bencode \u6570\u636E");
      const token = bytes[offset];
      if (token >= 48 && token <= 57) return parseBytes();
      if (token === 105) {
        offset += 1;
        const start = offset;
        while (offset < bytes.length && bytes[offset] !== 101) offset += 1;
        if (offset >= bytes.length) throw new Error("\u672A\u7ED3\u675F\u7684 bencode \u6574\u6570");
        const value = Number.parseInt(decoder.decode(bytes.subarray(start, offset)), 10);
        offset += 1;
        if (!Number.isSafeInteger(value)) throw new Error("\u65E0\u6548\u7684 bencode \u6574\u6570");
        return value;
      }
      if (token === 108) {
        offset += 1;
        const list = [];
        while (offset < bytes.length && bytes[offset] !== 101) list.push(parseValue(depth + 1));
        if (offset >= bytes.length) throw new Error("\u672A\u7ED3\u675F\u7684 bencode \u5217\u8868");
        offset += 1;
        return list;
      }
      if (token === 100) {
        offset += 1;
        const dictionary = /* @__PURE__ */ Object.create(null);
        while (offset < bytes.length && bytes[offset] !== 101) {
          const key = decoder.decode(parseBytes());
          dictionary[key] = parseValue(depth + 1);
        }
        if (offset >= bytes.length) throw new Error("\u672A\u7ED3\u675F\u7684 bencode \u5B57\u5178");
        offset += 1;
        return dictionary;
      }
      throw new Error("\u672A\u77E5\u7684 bencode \u7C7B\u578B");
    }
    const result = parseValue();
    if (offset !== bytes.length) throw new Error("bencode \u6570\u636E\u5C3E\u90E8\u5B58\u5728\u591A\u4F59\u5185\u5BB9");
    return result;
  }
  function parseTorrentName(input) {
    const root = parseBencode(input);
    const rawName = root?.info?.["name.utf-8"] || root?.info?.name;
    if (!(rawName instanceof Uint8Array)) throw new Error("torrent \u4E2D\u7F3A\u5C11 info.name");
    const name = new TextDecoder("utf-8").decode(rawName).replace(/\0/g, "").trim();
    if (!name) throw new Error("torrent \u540D\u79F0\u4E3A\u7A7A");
    return name;
  }
  function extractInfoBytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const decoder = new TextDecoder();
    let offset = 0;
    function skipBytes() {
      const start = offset;
      while (offset < bytes.length && bytes[offset] >= 48 && bytes[offset] <= 57) offset += 1;
      if (offset === start || bytes[offset] !== 58) throw new Error("\u65E0\u6548\u7684 bencode \u5B57\u7B26\u4E32");
      const length = Number.parseInt(decoder.decode(bytes.subarray(start, offset)), 10);
      offset += 1 + length;
      if (!Number.isSafeInteger(length) || length < 0 || offset > bytes.length) {
        throw new Error("bencode \u5B57\u7B26\u4E32\u957F\u5EA6\u8D8A\u754C");
      }
    }
    function skipValue(depth = 0) {
      if (depth > 100 || offset >= bytes.length) throw new Error("\u65E0\u6548\u7684 bencode \u6570\u636E");
      const token = bytes[offset];
      if (token >= 48 && token <= 57) {
        skipBytes();
      } else if (token === 105) {
        offset = bytes.indexOf(101, offset + 1);
        if (offset < 0) throw new Error("\u672A\u7ED3\u675F\u7684 bencode \u6574\u6570");
        offset += 1;
      } else if (token === 108 || token === 100) {
        offset += 1;
        while (offset < bytes.length && bytes[offset] !== 101) {
          if (token === 100) skipBytes();
          skipValue(depth + 1);
        }
        if (offset >= bytes.length) throw new Error("\u672A\u7ED3\u675F\u7684 bencode \u5BB9\u5668");
        offset += 1;
      } else {
        throw new Error("\u672A\u77E5\u7684 bencode \u7C7B\u578B");
      }
    }
    if (bytes[offset] !== 100) throw new Error("torrent \u6839\u8282\u70B9\u4E0D\u662F\u5B57\u5178");
    offset += 1;
    while (offset < bytes.length && bytes[offset] !== 101) {
      const keyStart = offset;
      skipBytes();
      const colon = bytes.indexOf(58, keyStart);
      const key = decoder.decode(bytes.subarray(colon + 1, offset));
      const valueStart = offset;
      skipValue(1);
      if (key === "info") return bytes.subarray(valueStart, offset);
    }
    throw new Error("torrent \u4E2D\u7F3A\u5C11 info \u5B57\u5178");
  }
  function sha1Hex(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 128;
    const view = new DataView(padded.buffer);
    const bitLength = bytes.length * 8;
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 4294967296));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    let h0 = 1732584193;
    let h1 = 4023233417;
    let h2 = 2562383102;
    let h3 = 271733878;
    let h4 = 3285377520;
    const words = new Uint32Array(80);
    const rotateLeft = (value, bits) => value << bits | value >>> 32 - bits;
    for (let chunk = 0; chunk < paddedLength; chunk += 64) {
      for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(chunk + index * 4);
      for (let index = 16; index < 80; index += 1) {
        words[index] = rotateLeft(
          words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
          1
        ) >>> 0;
      }
      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      for (let index = 0; index < 80; index += 1) {
        let f;
        let k;
        if (index < 20) {
          f = b & c | ~b & d;
          k = 1518500249;
        } else if (index < 40) {
          f = b ^ c ^ d;
          k = 1859775393;
        } else if (index < 60) {
          f = b & c | b & d | c & d;
          k = 2400959708;
        } else {
          f = b ^ c ^ d;
          k = 3395469782;
        }
        const temporary = rotateLeft(a, 5) + f + e + k + words[index] >>> 0;
        e = d;
        d = c;
        c = rotateLeft(b, 30) >>> 0;
        b = a;
        a = temporary;
      }
      h0 = h0 + a >>> 0;
      h1 = h1 + b >>> 0;
      h2 = h2 + c >>> 0;
      h3 = h3 + d >>> 0;
      h4 = h4 + e >>> 0;
    }
    return [h0, h1, h2, h3, h4].map((value) => value.toString(16).padStart(8, "0")).join("").toUpperCase();
  }
  function verifyTorrentHash(input, expectedHash) {
    const actualHash = sha1Hex(extractInfoBytes(input));
    if (actualHash !== String(expectedHash).toUpperCase()) {
      throw new Error(`torrent infohash \u4E0D\u5339\u914D\uFF08\u671F\u671B ${expectedHash}\uFF0C\u5B9E\u9645 ${actualHash}\uFF09`);
    }
    return true;
  }
  function requestTorrentUrl(url, gmRequest2) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest2({
        method: "GET",
        url,
        responseType: "arraybuffer",
        timeout: CACHE_REQUEST_TIMEOUT_MS,
        anonymous: true,
        onload(response) {
          if (response.status < 200 || response.status >= 300 || !response.response) {
            reject(new Error(`\u4E0B\u8F7D torrent \u5931\u8D25\uFF08HTTP ${response.status}\uFF09`));
            return;
          }
          resolve(new Uint8Array(response.response));
        },
        onerror: () => reject(new Error("\u4E0B\u8F7D torrent \u65F6\u53D1\u751F\u7F51\u7EDC\u9519\u8BEF")),
        ontimeout: () => reject(new Error("\u4E0B\u8F7D torrent \u8D85\u65F6"))
      });
    });
  }
  async function requestTorrentFromCaches(hash, gmRequest2) {
    const errors = [];
    for (const buildUrl of TORRENT_SOURCES) {
      const url = buildUrl(hash);
      try {
        const bytes = await requestTorrentUrl(url, gmRequest2);
        const torrentName = parseTorrentName(bytes);
        verifyTorrentHash(bytes, hash);
        return { bytes, hash, torrentName, sourceUrl: url };
      } catch (error2) {
        errors.push(`${new URL(url).hostname}: ${error2?.message || error2}`);
      }
    }
    const error = new Error(`\u6240\u6709 torrent \u7F13\u5B58\u6E90\u5747\u4E0D\u53EF\u7528\uFF1A${errors.join("\uFF1B")}`);
    error.cacheErrors = errors;
    throw error;
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function tryExportQbTorrent(hash, settings, gmRequest2 = globalThis.GM_xmlhttpRequest, timeout = QB_CONFIG.requestTimeoutMs) {
    const response = await requestQb(`/api/v2/torrents/export?hash=${encodeURIComponent(hash)}`, {
      settings,
      responseType: "arraybuffer",
      timeout,
      allowedStatuses: [200, 404, 409]
    }, gmRequest2);
    if (response.status !== 200 || !response.response) return null;
    const bytes = new Uint8Array(response.response);
    const torrentName = parseTorrentName(bytes);
    verifyTorrentHash(bytes, hash);
    return { bytes, torrentName };
  }
  async function requestTorrentViaQbittorrent(hash, magnet, settings, gmRequest2) {
    if (!settings.enabled) throw new Error("qBittorrent \u56DE\u9000\u672A\u542F\u7528");
    const normalized = normalizeQbSettings(settings);
    const source = magnet && extractBtih(magnet) === hash.toUpperCase() ? magnet : `magnet:?xt=urn:btih:${hash}`;
    const query = `source=${encodeURIComponent(source)}`;
    const deadline = Date.now() + normalized.metadataTimeoutMs;
    const fetchPath = "/api/v2/torrents/fetchMetadata";
    const savePath = `/api/v2/torrents/saveMetadata?${query}`;
    const sourceUrl = qbEndpoint(fetchPath, normalized);
    const existing = await tryExportQbTorrent(
      hash,
      normalized,
      gmRequest2,
      Math.min(QB_CONFIG.requestTimeoutMs, normalized.metadataTimeoutMs)
    );
    if (existing) return { ...existing, hash, sourceUrl };
    while (Date.now() < deadline) {
      const remaining = Math.max(1e3, deadline - Date.now());
      const response = await requestQb(fetchPath, {
        method: "POST",
        settings: normalized,
        responseType: "text",
        timeout: Math.min(QB_CONFIG.requestTimeoutMs, remaining),
        allowedStatuses: [200, 202],
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        data: new URLSearchParams({ source }).toString()
      }, gmRequest2);
      if (response.status === 200) {
        const exported = await tryExportQbTorrent(
          hash,
          normalized,
          gmRequest2,
          Math.min(QB_CONFIG.requestTimeoutMs, remaining)
        );
        if (exported) return { ...exported, hash, sourceUrl };
        const saved = await requestQb(savePath, {
          settings: normalized,
          responseType: "arraybuffer",
          timeout: Math.min(QB_CONFIG.requestTimeoutMs, remaining),
          allowedStatuses: [200, 409]
        }, gmRequest2);
        if (saved.status === 200 && saved.response) {
          const bytes = new Uint8Array(saved.response);
          const torrentName = parseTorrentName(bytes);
          verifyTorrentHash(bytes, hash);
          return { bytes, hash, torrentName, sourceUrl };
        }
      }
      const delay = Math.min(QB_CONFIG.pollIntervalMs, Math.max(0, deadline - Date.now()));
      if (delay > 0) await sleep(delay);
    }
    throw new Error(
      `qBittorrent \u5728 ${Math.round(normalized.metadataTimeoutMs / 1e3)} \u79D2\u5185\u672A\u83B7\u53D6\u5230\u53EF\u5BFC\u51FA\u7684\u5143\u6570\u636E\uFF08\u53EF\u80FD\u6CA1\u6709\u53EF\u7528\u7684 DHT/Peer\uFF09`
    );
  }
  async function requestTorrentBytes(magnet, gmRequest2 = globalThis.GM_xmlhttpRequest, qbSettings = getQbSettings()) {
    const hash = extractBtih(magnet);
    if (!hash) throw new Error("\u78C1\u529B\u94FE\u4E2D\u6CA1\u6709\u6709\u6548\u7684 BTIH");
    let cacheError;
    try {
      return await requestTorrentFromCaches(hash, gmRequest2);
    } catch (error) {
      cacheError = error;
    }
    const settings = normalizeQbSettings(qbSettings);
    if (!settings.enabled) throw cacheError;
    try {
      return await requestTorrentViaQbittorrent(hash, magnet, settings, gmRequest2);
    } catch (qbError) {
      throw new Error(`${cacheError.message}\uFF1BqBittorrent\uFF1A${qbError?.message || qbError}`);
    }
  }

  // src/modern-attachments.js
  var pendingClaims = /* @__PURE__ */ new WeakMap();
  function collectModernNativeAttachments(document2) {
    if (!document2?.querySelector("#first-post")) return [];
    return [...document2.querySelectorAll("#first-post .attachments-section .attachment")].map((element) => {
      const button = element.querySelector(".file-get button:not([disabled])");
      const name = element.querySelector(".file-name")?.getAttribute("title") || element.querySelector(".file-name")?.textContent?.trim() || "";
      if (!button) return null;
      return { name: String(name).trim() || "\u672A\u547D\u540D\u9644\u4EF6", button, slotId: element.getAttribute("data-slot-id") || "" };
    }).filter(Boolean);
  }
  async function prepareModernAttachmentDownload(document2, file, fetchImpl = document2.defaultView.fetch.bind(document2.defaultView)) {
    if (!/^[a-z0-9]+$/i.test(file.slotId || "")) throw new Error("\u7AD9\u5185\u9644\u4EF6\u7F3A\u5C11\u6709\u6548\u7F16\u53F7\uFF0C\u8BF7\u5237\u65B0\u9875\u9762");
    const view = document2.defaultView;
    const origin = view.location.origin;
    const name = buildAttachmentFilename(parseThreadTitle(getThreadHeadingText(document2)), file.name);
    const request = async (url, options = {}) => {
      const controller = new view.AbortController();
      const timer = view.setTimeout(() => controller.abort(), 3e4);
      try {
        const response = await fetchImpl(new URL(url, origin).href, {
          ...options,
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`\u7AD9\u5185\u9644\u4EF6\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u6216\u4F7F\u7528\u7F51\u7AD9\u6309\u94AE\u67E5\u770B\u539F\u56E0`);
        return await response.json();
      } finally {
        view.clearTimeout(timer);
      }
    };
    const quote = await request(`/api/slots/${file.slotId}/preview`);
    if (quote.status === "denied" || quote.file_ready !== true) throw new Error("\u5F53\u524D\u8D26\u53F7\u65E0\u4E0B\u8F7D\u8D44\u683C\u6216\u9644\u4EF6\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u67E5\u770B\u7F51\u7AD9\u63D0\u793A");
    if (quote.payable_points === null || quote.payable_points === void 0 || !/^\d+(?:\.\d+)?$/.test(String(quote.payable_points))) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u9644\u4EF6\u4EF7\u683C\uFF0C\u672A\u7533\u8BF7\u4E0B\u8F7D");
    if (Number(quote.payable_points) > 0) {
      const result = requestModernNativeAttachmentDownload(document2, [file]);
      if (!result.total) throw new Error("\u65E0\u6CD5\u6253\u5F00\u7F51\u7AD9\u7684\u9644\u4EF6\u8D2D\u4E70\u786E\u8BA4");
      return { delegated: true };
    }
    if (!quote.viewer_id || !quote.version_id || quote.price_points === void 0) throw new Error("\u7F51\u7AD9\u4E0B\u8F7D\u62A5\u4EF7\u4FE1\u606F\u4E0D\u5B8C\u6574\uFF0C\u672A\u7533\u8BF7\u4E0B\u8F7D");
    let claims = pendingClaims.get(document2);
    if (!claims) {
      claims = /* @__PURE__ */ new Map();
      pendingClaims.set(document2, claims);
    }
    const quoteKey = JSON.stringify([quote.viewer_id, quote.version_id, quote.price_points, quote.payable_points]);
    let attempt = claims.get(file.slotId);
    if (!attempt || attempt.quoteKey !== quoteKey) {
      attempt = { quoteKey, payload: {
        expected_user_id: quote.viewer_id,
        slot_id: file.slotId,
        expected_version: quote.version_id,
        expected_price: quote.price_points,
        expected_payable: quote.payable_points,
        idempotency_key: view.crypto.randomUUID()
      } };
      claims.set(file.slotId, attempt);
    }
    if (!attempt.receiptId) {
      const csrf = await request("/api/auth/csrf");
      if (!csrf.csrf_token) throw new Error("\u65E0\u6CD5\u53D6\u5F97\u7F51\u7AD9\u7684\u4E0B\u8F7D\u6821\u9A8C\u4FE1\u606F\uFF0C\u8BF7\u5237\u65B0\u9875\u9762");
      const claim = await request("/api/downloads/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf.csrf_token },
        body: JSON.stringify(attempt.payload)
      });
      if (claim.requires_new_claim) {
        claims.delete(file.slotId);
        throw new Error("\u7F51\u7AD9\u4E0B\u8F7D\u51ED\u8BC1\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u518D\u6B21\u70B9\u51FB\u4E0B\u8F7D");
      }
      if (!/^[a-z0-9-]{1,128}$/i.test(claim.receipt_id || "")) throw new Error("\u7F51\u7AD9\u672A\u8FD4\u56DE\u6709\u6548\u4E0B\u8F7D\u51ED\u8BC1\uFF0C\u672A\u91CD\u590D\u7533\u8BF7");
      attempt.receiptId = claim.receipt_id;
      view.dispatchEvent(new view.Event("memberchanged"));
    }
    return {
      url: new URL(`/api/downloads/file/${attempt.receiptId}`, origin).href,
      name,
      complete: () => claims.delete(file.slotId)
    };
  }
  function requestModernNativeAttachmentDownload(document2, files = collectModernNativeAttachments(document2)) {
    if (!files.length) return { status: "none", total: 0 };
    const triggered = [];
    const failedNames = [];
    for (const file of files) {
      try {
        if (!file.button.isConnected || file.button.disabled) throw new Error("\u9644\u4EF6\u6309\u94AE\u5DF2\u4E0D\u53EF\u7528");
        file.button.click();
        triggered.push(file.name);
      } catch (error) {
        failedNames.push(file.name);
        console.warn("[x1080x-ex] native attachment click failed", {
          name: file.name,
          error: String(error?.message || error)
        });
      }
    }
    return {
      status: triggered.length ? "triggered" : "failed",
      total: triggered.length,
      attempted: files.length,
      failedNames,
      names: triggered
    };
  }

  // src/download-guard.js
  var AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY = "x1080x-ex:agaghhh-download-guard-enabled";
  var HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY = "x1080x-ex:hdblog-download-guard-enabled";
  var activeStates = /* @__PURE__ */ new WeakMap();
  function isDownloadGuardEnabled(key) {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(key, true) !== false;
  }
  function beginDownloadGuard(document2 = globalThis.document, { enabled = true, label = "\u2B07 \u4E0B\u8F7D\u4E2D" } = {}) {
    const view = document2?.defaultView || globalThis.window;
    if (!enabled || !document2 || !view?.addEventListener || !view?.removeEventListener) {
      return () => {
      };
    }
    let state = activeStates.get(document2);
    if (!state) {
      state = {
        count: 0,
        originalTitle: "",
        beforeUnload(event) {
          event.preventDefault();
          event.returnValue = "";
          return "";
        }
      };
      activeStates.set(document2, state);
    }
    state.count += 1;
    if (state.count === 1) {
      state.originalTitle = document2.title || "";
      document2.title = state.originalTitle ? `${label} \xB7 ${state.originalTitle}` : label;
      view.addEventListener("beforeunload", state.beforeUnload);
    }
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      state.count = Math.max(0, state.count - 1);
      if (state.count !== 0) return;
      view.removeEventListener("beforeunload", state.beforeUnload);
      document2.title = state.originalTitle;
      activeStates.delete(document2);
    };
  }

  // src/preview-gesture.js
  function makePreviewGestureFriendly(image) {
    if (!image) return image;
    image.draggable = false;
    image.setAttribute("draggable", "false");
    image.style.setProperty("-webkit-user-drag", "none", "important");
    const anchor = image.closest?.("a[href]");
    if (anchor) {
      anchor.draggable = false;
      anchor.setAttribute("draggable", "false");
      anchor.style.setProperty("-webkit-user-drag", "none", "important");
    }
    return image;
  }

  // src/history-migration.js
  var GENERIC_HISTORY_TITLES = /^(?:404|notfound|pagenotfound|请先登录|請先登入|登录|登錄|歡迎訪問(?:x1080x)?|欢迎访问(?:x1080x)?|請使用下面地址之一訪問論壇|会员方案与点数储值|會員方案與點數儲值)$/i;
  function isUsableHistoryAlias(value) {
    if (typeof value !== "string" || !/^(?:resource|code|title|number):.+/i.test(value)) return false;
    return !value.startsWith("title:") || !GENERIC_HISTORY_TITLES.test(value.slice(6));
  }
  function historyAliasesForTitle(value) {
    const title = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!title) return [];
    const aliases = [];
    const fc2 = title.match(/\b(?:FC2\s*[- ]?\s*PPV\s*[- ]?\s*|FC2\s*[- ]?\s*|FC)(\d+)\b/i);
    if (fc2) aliases.push(`code:FC2-${fc2[1]}`);
    const codeMatches = [...title.matchAll(/\b([A-Z0-9]{2,12}-\d+[A-Z]?)\b/gi)];
    const code = codeMatches.find((match) => /[A-Z]/i.test(match[1].split("-")[0]));
    if (code) {
      const normalizedCode = code[1].toUpperCase();
      if (!aliases.includes(`code:${normalizedCode}`)) aliases.push(`code:${normalizedCode}`);
    }
    if (!aliases.length) {
      const numeric = title.match(/\b(\d{6,})\b/);
      if (numeric) aliases.push(`number:${numeric[1]}`);
    }
    const normalizedTitle = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (normalizedTitle.length >= 6) aliases.push(`title:${normalizedTitle}`);
    return [...new Set(aliases)];
  }
  function legacyTidFromHistoryValue(value) {
    if (value && typeof value === "object") return legacyTidFromHistoryValue(value.tid || value.url || value.id || "");
    const raw = String(value ?? "").trim();
    if (/^\d+$/.test(raw)) return raw;
    const pathTid = raw.match(/(?:^|\/)(?:thread|viewthread)[-_](\d+)(?:[-_.]|$)/i);
    if (pathTid) return pathTid[1];
    const match = raw.match(/^(?:tid:|.*[?&]tid=)(\d+)(?:$|[&#])/i);
    if (match) return match[1];
    const direct = raw.match(/^tid:(\d+)$/i);
    return direct?.[1] || "";
  }
  function compatibleHistoryKeys(value) {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        value = [value];
      }
    }
    const entries = Array.isArray(value) ? value : Array.isArray(value?.entries) ? value.entries : [];
    const keys = [];
    for (const entry of entries) {
      const tid = legacyTidFromHistoryValue(entry);
      if (tid) keys.push(`tid:${tid}`);
      if (entry && typeof entry === "object") {
        keys.push(...historyAliasesForTitle(entry.title || ""));
        if (/^[a-z0-9]+$/i.test(entry.resource_id || "")) keys.push(`resource:${entry.resource_id}`);
      }
      const raw = typeof entry === "string" ? entry : entry?.url || "";
      if (isUsableHistoryAlias(raw)) keys.push(raw);
      const resource = raw.match(/\/resources\/([a-z0-9]+)(?:[/?#]|$)/i)?.[1];
      if (resource) keys.push(`resource:${resource}`);
    }
    return [...new Set(keys)];
  }
  function legacyThreadUrl(tid, origin = "https://agaghhh.cc") {
    const id = String(tid ?? "");
    return /^\d+$/.test(id) ? `${origin}/forum.php?mod=viewthread&tid=${id}` : "";
  }
  function extractLegacyHistoryAliases(html, Parser = globalThis.DOMParser) {
    if (typeof Parser !== "function") return [];
    const document2 = new Parser().parseFromString(String(html ?? ""), "text/html");
    const heading = document2.querySelector(
      "#thread_subject, .vwthd h1, h1.ts, .thread-header h1"
    );
    if (!heading) return [];
    const title = getThreadHeadingText(document2) || heading.textContent || "";
    if (/^(?:404|not found|page not found|请先登录|請先登入|登录|登錄|歡迎訪問|欢迎访问|會員方案與點數儲值|会员方案与点数储值)(?:\s*[·|—-]\s*x1080x)?$/i.test(title.trim())) return [];
    return historyAliasesForTitle(title);
  }
  function resolvedLegacyHistoryAliases(state) {
    if (!state?.resolved || typeof state.resolved !== "object") return [];
    return [...new Set(Object.values(state.resolved).flatMap((values) => Array.isArray(values) ? values : []).filter(isUsableHistoryAlias))];
  }

  // src/history-recovery.js
  var HISTORY_RECOVERY_FORMAT = "x1080x-history-recovery-v1";
  var OLD_FORUM_HOSTS = ["agaghhh.cc", "1080xin.com", "1080xin.vip", "x1080x.com"];
  function forumTid(value) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !OLD_FORUM_HOSTS.includes(url.hostname.toLowerCase().replace(/^www\./, ""))) return "";
      if (!(/^\/(?:forum|viewthread)\.php$/i.test(url.pathname) && url.searchParams.get("mod") === "viewthread") && !/^\/(?:thread|viewthread)[-_]\d+/i.test(url.pathname)) return "";
      return legacyTidFromHistoryValue(url.href);
    } catch {
      return "";
    }
  }
  function recoveredTitleAliases(value) {
    const title = String(value || "").replace(/\s+/g, " ").trim().replace(/\s*[-|–—]\s*(?:(?:x1080x|agaghhh|1080xin)(?:\.(?:com|cc|vip))?\s*[-|–—]?\s*)?(?:Powered by Discuz!?)?\s*$/i, "").trim();
    const normalized = title.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    if (/^(?:justamoment|attentionrequiredcloudflare|请稍候|請稍候|稍等片刻|安全验证|安全驗證|正在进行安全验证|正在進行安全驗證|正在加载|正在載入|x1080x(?:com)?|agaghhh(?:cc)?|1080xin(?:com)?)$/.test(normalized)) return [];
    return historyAliasesForTitle(title).filter(isUsableHistoryAlias);
  }
  function buildHistoryRecovery(rows, legacyValue) {
    if (!Array.isArray(rows)) throw new Error("\u5386\u53F2\u8BB0\u5F55\u5FC5\u987B\u662F\u6570\u7EC4");
    const allowed = legacyValue === void 0 ? null : new Set(compatibleHistoryKeys(legacyValue).filter((key) => key.startsWith("tid:")).map((key) => key.slice(4)));
    const entries = /* @__PURE__ */ new Map();
    const ambiguous = /* @__PURE__ */ new Set();
    let ignored = 0;
    for (const row of rows) {
      const tid = forumTid(row?.url);
      const aliases = recoveredTitleAliases(row?.title);
      if (!tid || allowed && !allowed.has(tid) || !aliases.length || row.tid !== void 0 && String(row.tid) !== tid) {
        ignored += 1;
        continue;
      }
      const existing = entries.get(tid);
      const strong = (values) => values.find((value) => value.startsWith("code:FC2-")) || values.find((value) => /^(?:code|number):/.test(value));
      if (existing && strong(existing.aliases) && strong(aliases) && strong(existing.aliases) !== strong(aliases)) {
        ambiguous.add(tid);
      }
      if (!existing || !strong(existing.aliases) && strong(aliases)) entries.set(tid, {
        tid,
        url: row.url,
        title: String(row.title).trim(),
        aliases
      });
    }
    const recoveredEntries = [...entries.values()].filter((entry) => !ambiguous.has(entry.tid)).map(({ tid, url, title }) => ({ tid, url, title }));
    return {
      format: HISTORY_RECOVERY_FORMAT,
      entries: recoveredEntries,
      stats: {
        rows: rows.length,
        ignored,
        ambiguous: ambiguous.size,
        ...allowed ? { legacyCount: allowed.size, remaining: allowed.size - recoveredEntries.length } : {}
      }
    };
  }
  function planHistoryRecovery(payload, legacyValue, previousState = {}, recoveredState = {}) {
    if (payload?.format !== HISTORY_RECOVERY_FORMAT || !Array.isArray(payload.entries)) throw new Error("\u8BF7\u9009\u62E9\u65E7\u8BBA\u575B\u5386\u53F2\u6062\u590D\u5DE5\u5177\u751F\u6210\u7684 JSON \u6587\u4EF6");
    const validated = buildHistoryRecovery(payload.entries, legacyValue);
    const resolved = previousState.resolved && typeof previousState.resolved === "object" && !Array.isArray(previousState.resolved) ? { ...previousState.resolved } : {};
    if (recoveredState?.resolved && typeof recoveredState.resolved === "object") {
      for (const [tid, values] of Object.entries(recoveredState.resolved)) {
        if (!/^\d+$/.test(tid) || !Array.isArray(values)) continue;
        const existing = Array.isArray(resolved[tid]) ? resolved[tid].filter(isUsableHistoryAlias) : [];
        resolved[tid] = [.../* @__PURE__ */ new Set([...existing, ...values.filter(isUsableHistoryAlias)])];
      }
    }
    let changed = 0;
    const aliases = [];
    const recovered = {};
    for (const entry of validated.entries) {
      const existing = Array.isArray(resolved[entry.tid]) ? resolved[entry.tid].filter(isUsableHistoryAlias) : [];
      const added = recoveredTitleAliases(entry.title);
      if (added.some((value) => !existing.includes(value))) changed += 1;
      resolved[entry.tid] = [.../* @__PURE__ */ new Set([...existing, ...added])];
      recovered[entry.tid] = resolved[entry.tid];
      aliases.push(...added);
    }
    return {
      changed,
      matched: validated.entries.length,
      ignored: payload.entries.length - validated.entries.length,
      aliases: [...new Set(aliases)],
      recovered,
      state: { ...previousState, resolverVersion: 2, resolved }
    };
  }

  // src/image-fallbacks.js
  function alternateImageUrls(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || !/(?:^|\.)hxmmdd\.com$/i.test(url.hostname)) return [];
      let alternatePath = "";
      if (url.pathname.includes("/images/pics/")) {
        alternatePath = url.pathname.replace("/images/pics/", "/images-v2/pics/");
      } else if (url.pathname.includes("/images-v2/pics/")) {
        alternatePath = url.pathname.replace("/images-v2/pics/", "/images/pics/");
      }
      if (!alternatePath || alternatePath === url.pathname) return [];
      url.pathname = alternatePath;
      return [url.href];
    } catch {
      return [];
    }
  }

  // src/blob-download.js
  async function saveDownloadBlob(blob, name, document2 = globalThis.document, { browserDownload = false } = {}) {
    const view = document2.defaultView;
    if (!browserDownload && typeof GM_download === "function") {
      const info = typeof GM_info === "object" ? GM_info : {};
      const version = String(info.version || "").split(".").map(Number);
      const supportsBlob = info.scriptHandler === "Tampermonkey" && (version[0] > 5 || version[0] === 5 && (version[1] > 4 || version[1] === 4 && version[2] >= 6226));
      const objectUrl2 = supportsBlob ? null : view.URL.createObjectURL(blob);
      let timer;
      try {
        await new Promise((resolve, reject) => {
          let handle;
          timer = view.setTimeout(() => {
            handle?.abort?.();
            reject(new Error("\u4FDD\u5B58\u6587\u4EF6\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u4E0B\u8F7D\u5217\u8868"));
          }, 6e4);
          const finish = (callback) => (value) => {
            view.clearTimeout(timer);
            callback(value);
          };
          handle = GM_download({
            url: objectUrl2 || blob,
            name,
            saveAs: false,
            onload: finish(resolve),
            onerror: finish((error) => {
              const reasons = {
                not_enabled: "\u8BF7\u5728 Tampermonkey \u8BBE\u7F6E\u4E2D\u542F\u7528\u4E0B\u8F7D\u529F\u80FD",
                not_whitelisted: "\u8BF7\u5728 Tampermonkey \u8BBE\u7F6E\u4E2D\u5141\u8BB8\u6B64\u6587\u4EF6\u6269\u5C55\u540D",
                not_permitted: "\u8BF7\u6388\u4E88 Tampermonkey \u4E0B\u8F7D\u6743\u9650",
                not_supported: "\u5F53\u524D\u811A\u672C\u7BA1\u7406\u5668\u4E0D\u652F\u6301\u6B64\u4E0B\u8F7D\u65B9\u5F0F"
              };
              reject(new Error(reasons[error?.error] || "\u6587\u4EF6\u4FDD\u5B58\u5931\u8D25\u6216\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u4E0B\u8F7D\u5217\u8868"));
            }),
            ontimeout: finish(() => reject(new Error("\u4FDD\u5B58\u6587\u4EF6\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u4E0B\u8F7D\u5217\u8868")))
          });
        });
        return { confirmed: true };
      } finally {
        view.clearTimeout(timer);
        if (objectUrl2) view.URL.revokeObjectURL(objectUrl2);
      }
    }
    const objectUrl = view.URL.createObjectURL(blob);
    const anchor = document2.createElement("a");
    anchor.hidden = true;
    anchor.download = name;
    anchor.href = objectUrl;
    document2.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      view.setTimeout(() => view.URL.revokeObjectURL(objectUrl), 1e4);
    }
    return { confirmed: false };
  }

  // src/modern-header-actions.js
  var MODERN_RESOURCE_ACTIONS_ID = "x1080x-ex-resource-actions";
  var ACTION_ORDER = [
    "x1080x-ex-download",
    "x1080x-ex-agaghhh-hdblog-search",
    "x1080x-ex-agaghhh-copy-code"
  ];
  function favoriteButton(actions) {
    return actions?.querySelector(
      ".button.dock-side, button.dock-side, button[aria-pressed], .dock-side"
    ) || null;
  }
  function renderModernDownloadButton(button, state = "idle", count = "") {
    const key = `${state}:${count}`;
    if (button.dataset.downloadRender === key && button.querySelector("svg")) return;
    button.dataset.downloadRender = key;
    button.dataset.downloadState = state;
    const svg = button.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", width: count ? "13" : "19", height: count ? "13" : "19", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", "data-icon": state })) svg.setAttribute(name, value);
    const path = button.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", state === "done" ? "m5 12 4 4L19 6" : state === "error" ? "M12 4 2 21h20L12 4m0 6v5m0 3v.1" : "M12 3v12m0 0-4-4m4 4 4-4M5 16v5h14v-5");
    svg.append(path);
    const children = [svg];
    if (count) {
      const badge = button.ownerDocument.createElement("span");
      badge.setAttribute("data-download-count", "");
      badge.textContent = count;
      Object.assign(badge.style, { fontSize: "10px", lineHeight: "12px", fontWeight: "600" });
      children.push(badge);
    }
    button.replaceChildren(...children);
    button.style.background = state === "error" ? "#a96b26" : state === "done" ? "#257b61" : "#398bd4";
  }
  function ensureModernDownloadStatus(document2) {
    const header = document2?.querySelector(".thread-header");
    if (!header) return null;
    const row = header.querySelector(".thread-header-nums") || header;
    const actions = row.querySelector(".thread-header-actions");
    let status = document2.getElementById("x1080x-ex-download-status");
    if (!status) {
      status = document2.createElement("span");
      status.id = "x1080x-ex-download-status";
      status.setAttribute("role", "status");
      Object.assign(status.style, {
        flex: "1 1 0px",
        width: "0",
        minWidth: "0",
        contain: "inline-size",
        fontSize: "12px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        alignSelf: "center"
      });
    }
    if (actions) {
      if (status.parentElement !== row || status.nextElementSibling !== actions) row.insertBefore(status, actions);
    } else if (status.parentElement !== row) row.prepend(status);
    return status;
  }
  function ensureModernResourceActionGroup(document2) {
    if (!document2?.querySelector(".thread-header h1")) return null;
    const actions = document2.querySelector(".thread-header .thread-actions");
    if (!actions) return null;
    let group = document2.getElementById(MODERN_RESOURCE_ACTIONS_ID);
    if (!group || group.parentElement !== actions) {
      group = document2.createElement("div");
      group.id = MODERN_RESOURCE_ACTIONS_ID;
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "\u8D44\u6E90\u5FEB\u6377\u64CD\u4F5C");
      Object.assign(group.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "8px",
        flex: "0 0 auto",
        minWidth: "0",
        whiteSpace: "nowrap",
        verticalAlign: "middle"
      });
    }
    const favorite = favoriteButton(actions);
    if (favorite) {
      if (group.parentElement !== actions || group.nextElementSibling !== favorite) {
        actions.insertBefore(group, favorite);
      }
    } else if (group.parentElement !== actions) {
      actions.prepend(group);
    }
    return group;
  }
  function placeModernResourceActionButton(document2, button) {
    if (!button) return false;
    const group = ensureModernResourceActionGroup(document2);
    if (!group) return false;
    Object.assign(button.style, {
      float: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: button.id === "x1080x-ex-download" ? "44px" : "max-content",
      minWidth: button.id === "x1080x-ex-download" ? "44px" : "38px",
      maxWidth: button.id === "x1080x-ex-download" ? "44px" : "",
      boxSizing: "border-box",
      margin: "0",
      flex: "0 0 auto",
      verticalAlign: "middle"
    });
    const rank = ACTION_ORDER.indexOf(button.id);
    const next = [...group.children].find((candidate) => {
      const candidateRank = ACTION_ORDER.indexOf(candidate.id);
      return rank >= 0 && candidateRank > rank;
    }) || null;
    if (button.parentElement !== group || button.nextElementSibling !== next) {
      group.insertBefore(button, next);
    }
    return true;
  }

  // src/userscript.js
  var STORAGE_KEY = "x1080x-ex:domains";
  var HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = "x1080x-ex:hdblog-expand-preview-images";
  var AGAGHHH_BATCH_OPEN_ENABLED_KEY = "x1080x-ex:agaghhh-batch-open-enabled";
  var AGAGHHH_DOWNLOAD_ENABLED_KEY = "x1080x-ex:agaghhh-download-enabled";
  var HDBLOG_BATCH_OPEN_ENABLED_KEY = "x1080x-ex:hdblog-batch-open-enabled";
  var AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY = "x1080x-ex:agaghhh-batch-open-interval-min-ms";
  var AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY = "x1080x-ex:agaghhh-batch-open-interval-max-ms";
  var AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY = "x1080x-ex:agaghhh-batch-open-history-enabled";
  var AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY = "x1080x-ex:agaghhh-batch-open-history-limit";
  var AGAGHHH_BATCH_OPEN_HISTORY_KEY = "x1080x-ex:agaghhh-batch-open-history";
  var MODERN_RESOURCE_HISTORY_KEY = "x1080x-ex:1080xin-resource-history";
  var AGAGHHH_HISTORY_ALIASES_KEY = "x1080x-ex:agaghhh-history-title-aliases";
  var AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY = "x1080x-ex:agaghhh-legacy-history-migration-v1";
  var AGAGHHH_HISTORY_RECOVERY_BACKUP_KEY = "x1080x-ex:agaghhh-history-recovery-backup-v1";
  var AGAGHHH_HISTORY_RECOVERED_KEY = "x1080x-ex:agaghhh-history-recovered-titles-v1";
  var LEGACY_HISTORY_AUTO_MIGRATION_LIMIT = 100;
  var LEGACY_HISTORY_MANUAL_MIGRATION_LIMIT = 5e3;
  var legacyHistoryMigrationInProgress = false;
  var legacyHistoryMigrationStartedThisPage = false;
  var AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY = "x1080x-ex:agaghhh-batch-open-history-color";
  var AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY = "x1080x-ex:agaghhh-batch-open-unopened-only";
  var AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY = "x1080x-ex:agaghhh-batch-progress-locator-enabled";
  var AGAGHHH_BATCH_PROGRESS_MAP_KEY = "x1080x-ex:agaghhh-batch-progress-map";
  var HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY = "x1080x-ex:hdblog-batch-open-history-enabled";
  var HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY = "x1080x-ex:hdblog-batch-open-history-limit";
  var HDBLOG_BATCH_OPEN_HISTORY_KEY = "x1080x-ex:hdblog-batch-open-history";
  var HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY = "x1080x-ex:hdblog-batch-open-history-color";
  var HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY = "x1080x-ex:hdblog-batch-open-unopened-only";
  var HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY = "x1080x-ex:hdblog-batch-progress-locator-enabled";
  var HDBLOG_BATCH_PROGRESS_MAP_KEY = "x1080x-ex:hdblog-batch-progress-map";
  var DEFAULT_BATCH_OPEN_HISTORY_LIMIT = 5e3;
  var DEFAULT_BATCH_OPEN_HISTORY_COLOR = "#bd10e0";
  var BATCH_OPEN_HISTORY_ATTR = "data-x1080x-batch-opened";
  var BATCH_OPEN_HISTORY_STYLE_ID = "x1080x-ex-batch-open-history-style";
  var HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY = "x1080x-ex:hdblog-batch-open-interval-min-ms";
  var HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY = "x1080x-ex:hdblog-batch-open-interval-max-ms";
  var DEFAULT_DOMAINS = "1080xin.com\nagaghhh.cc\nhdblog.me\nfc2cmadb.com";
  var BUTTON_ID = "x1080x-ex-download";
  var BATCH_BUTTON_ID = "x1080x-ex-open-page";
  var BATCH_PROGRESS_BUTTON_ID = "x1080x-ex-batch-progress-locator";
  var BATCH_TOOLBAR_ID = "x1080x-ex-open-page-toolbar";
  var REQUEST_TIMEOUT2 = 6e4;
  var PIXHOST_PLACEHOLDER_MAX_BYTES = 32 * 1024;
  var PREVIEW_IMAGE_URL_ATTR = "data-x1080x-hdblog-preview-url";
  var PREVIEW_REFERER_ATTR = "data-x1080x-preview-referer";
  var DEFAULT_OPEN_TIMING = Object.freeze({
    initialMin: 300,
    initialMax: 800,
    delayMin: 1800,
    delayMax: 3500,
    pauseEvery: 8,
    pauseMin: 6e3,
    pauseMax: 1e4
  });
  var HDBLOG_OPEN_TIMING = Object.freeze({
    initialMin: 150,
    initialMax: 400,
    delayMin: 800,
    delayMax: 1600,
    pauseEvery: 10,
    pauseMin: 3e3,
    pauseMax: 5e3
  });
  var batchOpenState = null;
  var batchProgressScanState = null;
  function getConfiguredDomains() {
    const stored = typeof GM_getValue === "function" ? GM_getValue(STORAGE_KEY, null) : null;
    const domains = stored === null || stored === void 0 ? parseDomainList(DEFAULT_DOMAINS) : parseDomainList(stored);
    const isLegacyDefault = domains.length === 1 && domains[0] === LEGACY_AGAGHHH_DOMAIN || domains.length === 2 && domains.includes(LEGACY_AGAGHHH_DOMAIN) && domains.includes("hdblog.me");
    return [.../* @__PURE__ */ new Set([
      ...isLegacyDefault ? parseDomainList(DEFAULT_DOMAINS) : domains,
      ...getAgaghhhDomains()
    ])];
  }
  function saveDomains(domains) {
    GM_setValue(STORAGE_KEY, domains.join("\n"));
  }
  function registerSettingsMenu() {
    if (window.top !== window.self) return;
    GM_registerMenuCommand("\u{1F310} \u8BBE\u7F6E x1080x \u7AD9\u70B9\u57DF\u540D", () => {
      const input = window.prompt(
        "\u8BF7\u8F93\u5165 x1080x \u7AD9\u70B9\u5F53\u524D\u4F7F\u7528\u7684\u57DF\u540D\uFF08\u5982 1080xin.com\uFF09\u3002\u8DE8\u7AD9\u641C\u7D22\u53CA\u6D4F\u89C8\u8FDB\u5EA6\u94FE\u63A5\u5C06\u4F7F\u7528\u8BE5\u5730\u5740\uFF0C\u65E7\u57DF\u540D\u4ECD\u53EF\u8BC6\u522B\uFF1A",
        getAgaghhhPrimaryDomain()
      );
      if (input === null) return;
      const domain = parseAgaghhhPrimaryDomain(input);
      if (!domain) {
        window.alert("\u8BF7\u8F93\u5165\u6709\u6548\u7684\u7AD9\u70B9\u57DF\u540D\uFF0C\u4F8B\u5982 1080xin.com");
        return;
      }
      GM_setValue(AGAGHHH_PRIMARY_DOMAIN_KEY, domain);
      window.alert(`x1080x \u7AD9\u70B9\u57DF\u540D\u5DF2\u4FDD\u5B58\uFF1A${domain}
\u5237\u65B0\u9875\u9762\u540E\u751F\u6548\u3002\u539F\u6709\u6D4F\u89C8\u8BB0\u5F55\u5C06\u7EE7\u7EED\u4FDD\u7559\u3002`);
    });
    GM_registerMenuCommand("\u2699\uFE0F \u8BBE\u7F6E\u5339\u914D\u57DF\u540D", () => {
      const current = getConfiguredDomains().join("\n");
      const input = window.prompt(
        "\u8BF7\u8F93\u5165\u5141\u8BB8\u811A\u672C\u8FD0\u884C\u7684\u57DF\u540D\uFF0C\u53EF\u7528\u9017\u53F7\u3001\u7A7A\u683C\u6216\u6362\u884C\u5206\u9694\u3002\u4E5F\u53EF\u4EE5\u7C98\u8D34\u5B8C\u6574\u7F51\u5740\uFF1A",
        current
      );
      if (input === null) return;
      const domains = parseDomainList(input);
      if (!domains.length) {
        window.alert("\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2A\u6709\u6548\u57DF\u540D\u3002");
        return;
      }
      saveDomains(domains);
      window.alert(`\u5DF2\u4FDD\u5B58\uFF1A
${domains.join("\n")}

\u5237\u65B0\u9875\u9762\u540E\u751F\u6548\u3002`);
    });
    GM_registerMenuCommand("\u2795 \u6DFB\u52A0\u5F53\u524D\u57DF\u540D", () => {
      const domains = getConfiguredDomains();
      if (!isAllowedHost(location.hostname, domains)) {
        domains.push(location.hostname.toLowerCase());
        saveDomains(domains);
      }
      window.alert(`\u5DF2\u6DFB\u52A0 ${location.hostname}\uFF0C\u5237\u65B0\u9875\u9762\u540E\u751F\u6548\u3002`);
    });
    GM_registerMenuCommand("\u21A9\uFE0F \u91CD\u7F6E\u9ED8\u8BA4\u57DF\u540D", () => {
      saveDomains(parseDomainList(DEFAULT_DOMAINS));
      GM_setValue(AGAGHHH_PRIMARY_DOMAIN_KEY, DEFAULT_AGAGHHH_PRIMARY_DOMAIN);
      window.alert(`\u5DF2\u6062\u590D\u9ED8\u8BA4\u57DF\u540D\uFF1A${DEFAULT_DOMAINS}`);
    });
    GM_registerMenuCommand("\u21AA\uFE0F \u8FC1\u79FB\u65E7\u7248 x1080x \u6D4F\u89C8\u8BB0\u5F55\u5230\u65B0\u7248", () => {
      const legacy = typeof GM_getValue === "function" ? GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, []) : [];
      const total = compatibleHistoryKeys(legacy).filter((value) => value.startsWith("tid:")).length;
      if (!total) {
        const aliases = compatibleHistoryKeys(legacy).filter(isUsableHistoryAlias);
        if (aliases.length) {
          saveHistoryAliases(aliases);
          if (isBatchOpenPage()) applyBatchOpenHistory(document);
          window.alert(`\u5DF2\u8F7D\u5165 ${aliases.length} \u9879\u65E7\u7248\u6807\u9898/\u8D44\u6E90\u4FE1\u606F\uFF0C\u65E0\u9700\u901A\u8FC7\u6570\u5B57 TID \u67E5\u8BE2\u3002`);
        } else window.alert("\u6CA1\u6709\u5728\u5F53\u524D\u8FD9\u4EFD\u811A\u672C\u4E2D\u627E\u5230\u65E7\u7248\u8BB0\u5F55\u3002\u8BF7\u5728\u539F\u6765\u7684\u6CB9\u7334\u811A\u672C\u4E2D\u68C0\u67E5\u6216\u5BFC\u51FA\u5B58\u50A8\u6570\u636E\u3002");
        return;
      }
      if (!window.confirm(`\u53D1\u73B0\u7EA6 ${total} \u6761\u65E7\u7248\u8BB0\u5F55\u3002\u811A\u672C\u5C06\u9010\u6761\u8BFB\u53D6\u65E7\u5E16\u6807\u9898\uFF0C\u6309\u756A\u53F7/\u6807\u9898\u5339\u914D\u65B0\u7248\u8D44\u6E90\uFF1B\u8FD9\u53EF\u80FD\u9700\u8981\u51E0\u5206\u949F\uFF0C\u4E0D\u4F1A\u5220\u9664\u65E7\u8BB0\u5F55\u3002\u662F\u5426\u5F00\u59CB\u5B8C\u6574\u8FC1\u79FB\uFF1F`)) return;
      void migrateLegacyHistory({ limit: LEGACY_HISTORY_MANUAL_MIGRATION_LIMIT, force: true }).then((result) => {
        if (isBatchOpenPage()) applyBatchOpenHistory(document);
        window.alert(`\u65E7\u7248\u5386\u53F2\u68C0\u67E5\u7ED3\u675F\u3002
\u672C\u6B21\u68C0\u67E5\uFF1A${result.checked} \u6761
\u65B0\u589E\u5339\u914D\uFF1A${result.matched} \u6761
\u5269\u4F59\u672A\u89E3\u6790\uFF1A${result.unresolved} \u6761
\u65E7\u8BB0\u5F55\u672A\u5220\u9664\u3002${result.unresolved ? "\n\u672A\u89E3\u6790\u8BB0\u5F55\u53EA\u6709\u65E7 TID\uFF0C\u9700\u8981\u53EF\u8BBF\u95EE\u7684\u65E7\u5E16\u6216\u7AD9\u70B9\u65B0\u65E7 ID \u6620\u5C04\u624D\u80FD\u6062\u590D\u3002" : ""}`);
      }).catch((error) => window.alert(`\u8FC1\u79FB\u5931\u8D25\uFF1A${error?.message || error}`));
    });
    GM_registerMenuCommand("\u{1F9FE} \u68C0\u67E5\u65E7\u7248\u6D4F\u89C8\u8BB0\u5F55", () => {
      const legacy = compatibleHistoryKeys(typeof GM_getValue === "function" ? GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, []) : []);
      const modern = compatibleHistoryKeys(typeof GM_getValue === "function" ? GM_getValue(MODERN_RESOURCE_HISTORY_KEY, []) : []);
      const aliases = typeof GM_getValue === "function" ? GM_getValue(AGAGHHH_HISTORY_ALIASES_KEY, []) : [];
      const state = typeof GM_getValue === "function" ? GM_getValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, {}) : {};
      const recovered = typeof GM_getValue === "function" ? GM_getValue(AGAGHHH_HISTORY_RECOVERED_KEY, {}) : {};
      const tids = legacy.filter((value) => value.startsWith("tid:"));
      const matched = tids.filter((value) => resolvedLegacyHistoryAliases({ resolved: {
        cached: state?.resolved?.[value.slice(4)],
        recovered: recovered?.resolved?.[value.slice(4)]
      } }).length > 0).length;
      window.alert(`\u65E7\u7248\u6570\u5B57 TID\uFF1A${tids.length} \u6761
\u5DF2\u53D6\u5F97\u5BF9\u5E94\u4FE1\u606F\uFF1A${matched} \u6761
\u4ECD\u7F3A\u5BF9\u5E94\u4FE1\u606F\uFF1A${tids.length - matched} \u6761
\u65E7\u8BB0\u5F55\u4E2D\u7684\u6807\u9898/\u8D44\u6E90\u4FE1\u606F\uFF1A${legacy.filter(isUsableHistoryAlias).length} \u9879
\u5171\u4EAB\u6807\u9898/\u756A\u53F7\u7D22\u5F15\uFF1A${Array.isArray(aliases) ? aliases.length : 0} \u9879
\u65B0\u7248\u8D44\u6E90\u8BB0\u5F55\uFF1A${modern.filter((value) => value.startsWith("resource:")).length} \u6761

\u65E7 TID \u6570\u91CF\u5927\u4E8E 0 \u8868\u793A\u6570\u636E\u5DF2\u8BFB\u5230\uFF1B\u4ECD\u7F3A\u5BF9\u5E94\u4FE1\u606F\u7684\u8BB0\u5F55\u65E0\u6CD5\u4EC5\u51ED\u7F16\u53F7\u5224\u65AD\u65B0\u7248\u5E16\u5B50\u662F\u5426\u6D4F\u89C8\u8FC7\u3002\u82E5\u65E7 TID \u4E3A 0\uFF0C\u8BF7\u5728\u539F\u6765\u90A3\u4EFD\u6CB9\u7334\u811A\u672C\u4E2D\u68C0\u67E5\u6216\u5BFC\u51FA\u5B58\u50A8\u6570\u636E\u3002`);
    });
    GM_registerMenuCommand("\u{1F4E5} \u5BFC\u5165\u65E7\u8BBA\u575B\u5386\u53F2\u6062\u590D\u6587\u4EF6", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.hidden = true;
      input.addEventListener("cancel", () => input.remove(), { once: true });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error("\u6062\u590D\u6587\u4EF6\u8D85\u8FC7 20 MB\uFF0C\u8BF7\u53EA\u5BFC\u51FA\u65E7\u8BBA\u575B\u76F8\u5173\u8BB0\u5F55");
          const payload = JSON.parse(await file.text());
          const legacy = GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, []);
          const state = GM_getValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, {});
          const recovered = GM_getValue(AGAGHHH_HISTORY_RECOVERED_KEY, {});
          const plan = planHistoryRecovery(payload, legacy, state, recovered);
          if (!plan.matched) {
            window.alert("\u6062\u590D\u6587\u4EF6\u4E2D\u6CA1\u6709\u5339\u914D\u5F53\u524D\u65E7 TID \u7684\u6709\u6548\u5E16\u5B50\u6807\u9898\uFF0C\u539F\u8BB0\u5F55\u672A\u4FEE\u6539\u3002");
            return;
          }
          GM_setValue(AGAGHHH_HISTORY_RECOVERY_BACKUP_KEY, {
            migration: state,
            recovered,
            aliases: GM_getValue(AGAGHHH_HISTORY_ALIASES_KEY, []),
            recoveredAt: Date.now()
          });
          GM_setValue(AGAGHHH_HISTORY_RECOVERED_KEY, { resolved: { ...recovered?.resolved, ...plan.recovered } });
          GM_setValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, plan.state);
          saveHistoryAliases(plan.aliases);
          if (isBatchOpenPage() && isBatchOpenHistoryEnabled()) {
            applyBatchOpenHistory(document);
            const button = document.getElementById(BATCH_BUTTON_ID);
            if (button && !batchOpenState) setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
            refreshBatchProgressLocatorButton();
          }
          window.alert(`\u5DF2\u5339\u914D ${plan.matched} \u6761\u65E7 TID\uFF0C\u672C\u6B21\u8865\u5145 ${plan.changed} \u6761\u5BF9\u5E94\u4FE1\u606F\u3002
\u5FFD\u7565\u4E0D\u5339\u914D\u8BB0\u5F55\uFF1A${plan.ignored} \u6761\u3002
\u539F\u59CB\u65E7 TID \u5DF2\u4FDD\u7559\uFF0C\u5BFC\u5165\u524D\u7684\u6620\u5C04\u548C\u7D22\u5F15\u5DF2\u53E6\u884C\u5907\u4EFD\u3002`);
        } catch (error) {
          window.alert(`\u5386\u53F2\u6062\u590D\u6587\u4EF6\u5BFC\u5165\u5931\u8D25\uFF1A${error?.message || error}`);
        }
      }, { once: true });
      document.body.append(input);
      input.click();
    });
  }
  function currentHost() {
    return String(location.hostname || "").toLowerCase().replace(/\.$/, "");
  }
  function isBatchOpenEnabledForCurrentHost() {
    if (typeof GM_getValue !== "function") return true;
    const host = currentHost();
    if (isAgaghhhHost(host)) {
      return GM_getValue(AGAGHHH_BATCH_OPEN_ENABLED_KEY, true) !== false;
    }
    if (host === "hdblog.me" || host.endsWith(".hdblog.me")) {
      return GM_getValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, true) !== false;
    }
    return true;
  }
  function batchOpenHistoryConfig() {
    const host = currentHost();
    if (isAgaghhhHost(host)) {
      const modern = host !== LEGACY_AGAGHHH_DOMAIN && !/^\/(?:forum|search)\.php$/i.test(location.pathname);
      return {
        enabledKey: AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY,
        limitKey: AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY,
        historyKey: modern ? MODERN_RESOURCE_HISTORY_KEY : AGAGHHH_BATCH_OPEN_HISTORY_KEY,
        modern,
        colorKey: AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY,
        unopenedOnlyKey: AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY,
        progressLocatorEnabledKey: AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY,
        progressMapKey: AGAGHHH_BATCH_PROGRESS_MAP_KEY,
        kind: "agaghhh"
      };
    }
    if (host === "hdblog.me" || host.endsWith(".hdblog.me")) {
      return {
        enabledKey: HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY,
        limitKey: HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY,
        historyKey: HDBLOG_BATCH_OPEN_HISTORY_KEY,
        colorKey: HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY,
        unopenedOnlyKey: HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY,
        progressLocatorEnabledKey: HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY,
        progressMapKey: HDBLOG_BATCH_PROGRESS_MAP_KEY,
        kind: "hdblog"
      };
    }
    return null;
  }
  function isBatchOpenHistoryEnabled() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function") return false;
    return GM_getValue(config.enabledKey, false) === true;
  }
  function isBatchOpenUnopenedOnlyEnabled() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function" || !isBatchOpenHistoryEnabled()) return false;
    return GM_getValue(config.unopenedOnlyKey, false) === true;
  }
  function isBatchProgressLocatorEnabled() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function" || !isBatchOpenHistoryEnabled()) return false;
    return GM_getValue(config.progressLocatorEnabledKey, true) !== false;
  }
  function batchOpenHistoryLimit() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function") return DEFAULT_BATCH_OPEN_HISTORY_LIMIT;
    const numeric = Number(GM_getValue(config.limitKey, DEFAULT_BATCH_OPEN_HISTORY_LIMIT));
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5e4 ? numeric : DEFAULT_BATCH_OPEN_HISTORY_LIMIT;
  }
  function batchOpenHistoryColor() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function") return DEFAULT_BATCH_OPEN_HISTORY_COLOR;
    const value = String(GM_getValue(config.colorKey, DEFAULT_BATCH_OPEN_HISTORY_COLOR) || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_BATCH_OPEN_HISTORY_COLOR;
  }
  function batchOpenHistoryId(value) {
    const config = batchOpenHistoryConfig();
    if (!config) return "";
    try {
      const url = new URL(value, location.href);
      if (config.kind === "agaghhh") {
        const resourceId = url.pathname.match(/^\/resources\/([a-z0-9]+)\/?$/i)?.[1];
        if (resourceId) return `resource:${resourceId}`;
        const queryTid = url.searchParams.get("mod") === "viewthread" ? url.searchParams.get("tid") : "";
        if (queryTid && /^\d+$/.test(queryTid)) return `tid:${queryTid}`;
        const pathMatch = url.pathname.match(/(?:thread|viewthread)[-_](\d+)/i);
        return pathMatch ? `tid:${pathMatch[1]}` : "";
      }
      const postMatch = url.pathname.match(/^\/(\d+)(?:\/|$)/);
      if (postMatch) return `post:${postMatch[1]}`;
      return `url:${url.pathname}${url.search}`;
    } catch {
      return "";
    }
  }
  function batchThreadHistoryKeys(thread) {
    if (!thread) return [];
    const id = batchOpenHistoryId(thread.url);
    const title = thread.link?.getAttribute("title") || thread.link?.textContent || "";
    return [...new Set([id, ...historyAliasesForTitle(title)].filter(Boolean))];
  }
  function isBatchThreadVisited(thread, history = new Set(readBatchOpenHistory())) {
    return batchThreadHistoryKeys(thread).some((key) => history.has(key));
  }
  function readBatchOpenHistory() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function") return [];
    const rawStored = GM_getValue(config.historyKey, []);
    const stored = config.kind === "agaghhh" ? compatibleHistoryKeys(rawStored) : rawStored;
    const legacy = config.modern ? compatibleHistoryKeys(GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, [])) : [];
    const aliases = config.kind === "agaghhh" ? GM_getValue(AGAGHHH_HISTORY_ALIASES_KEY, []) : [];
    const resolvedAliases = config.kind === "agaghhh" ? [
      ...resolvedLegacyHistoryAliases(GM_getValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, {})),
      ...resolvedLegacyHistoryAliases(GM_getValue(AGAGHHH_HISTORY_RECOVERED_KEY, {}))
    ] : [];
    const values = [
      ...Array.isArray(stored) ? stored : [],
      ...Array.isArray(legacy) ? legacy.filter(isUsableHistoryAlias) : [],
      ...Array.isArray(aliases) ? aliases : [],
      ...resolvedAliases
    ];
    return [...new Set(values.filter((value) => typeof value === "string" && (!/^(?:code|title|number):/i.test(value) || isUsableHistoryAlias(value)) && (config.modern ? /^resource:[a-z0-9]+$/i.test(value) || /^(?:code|title|number):/i.test(value) : /^(?:tid|post):\d+$/.test(value) || /^resource:[a-z0-9]+$/i.test(value) || /^url:\//.test(value) || /^(?:code|title|number):/i.test(value))))];
  }
  function saveHistoryAliases(aliases) {
    if (typeof GM_getValue !== "function" || typeof GM_setValue !== "function") return 0;
    const existing = GM_getValue(AGAGHHH_HISTORY_ALIASES_KEY, []);
    const merged = [...new Set([
      ...Array.isArray(existing) ? existing : [],
      ...Array.isArray(aliases) ? aliases : []
    ].filter(isUsableHistoryAlias))].slice(-2e4);
    GM_setValue(AGAGHHH_HISTORY_ALIASES_KEY, merged);
    return merged.length;
  }
  async function requestLegacyHistoryAliases(tid) {
    const urls = [...new Set([
      legacyThreadUrl(tid, `https://${getAgaghhhPrimaryDomain()}`),
      legacyThreadUrl(tid)
    ].filter(Boolean))];
    for (const url of urls) {
      const result = await new Promise((resolve) => {
        if (typeof GM_xmlhttpRequest !== "function") {
          resolve([]);
          return;
        }
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 15e3,
          onload: (response) => {
            const aliases = response.status >= 200 && response.status < 400 ? extractLegacyHistoryAliases(
              response.responseText || "",
              document.defaultView?.DOMParser || globalThis.DOMParser
            ) : [];
            const finalUrl = response.finalUrl || response.responseURL || "";
            try {
              const resourceId = new URL(finalUrl, url).pathname.match(/^\/resources\/([a-z0-9]+)\/?$/i)?.[1];
              if (resourceId && response.status >= 200 && response.status < 400 && isAgaghhhHost(new URL(finalUrl, url).hostname)) aliases.unshift(`resource:${resourceId}`);
            } catch {
            }
            resolve([...new Set(aliases)]);
          },
          onerror: () => resolve([]),
          ontimeout: () => resolve([])
        });
      });
      if (result.length) return result;
    }
    return [];
  }
  async function migrateLegacyHistory({ limit = LEGACY_HISTORY_AUTO_MIGRATION_LIMIT, force = false } = {}) {
    if (legacyHistoryMigrationInProgress) {
      return { checked: 0, matched: 0, unresolved: 0, busy: true };
    }
    if (typeof GM_getValue !== "function" || typeof GM_setValue !== "function" || typeof GM_xmlhttpRequest !== "function") {
      return { checked: 0, matched: 0, unresolved: 0, unsupported: true };
    }
    const legacy = GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, []);
    const legacyKeys = compatibleHistoryKeys(legacy);
    saveHistoryAliases(legacyKeys.filter(isUsableHistoryAlias));
    const tids = [...new Set(legacyKeys.map(legacyTidFromHistoryValue).filter(Boolean))];
    const state = GM_getValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, {});
    const attemptedAt = state?.resolverVersion === 2 && state?.attemptedAt && typeof state.attemptedAt === "object" ? { ...state.attemptedAt } : {};
    const resolved = state?.resolved && typeof state.resolved === "object" ? { ...state.resolved } : {};
    const recovered = GM_getValue(AGAGHHH_HISTORY_RECOVERED_KEY, {});
    if (recovered?.resolved && typeof recovered.resolved === "object") {
      for (const [tid, values] of Object.entries(recovered.resolved)) {
        if (!Array.isArray(values)) continue;
        resolved[tid] = [.../* @__PURE__ */ new Set([...Array.isArray(resolved[tid]) ? resolved[tid] : [], ...values.filter(isUsableHistoryAlias)])];
      }
    }
    for (const [tid, aliases] of Object.entries(resolved)) {
      const valid = Array.isArray(aliases) ? aliases.filter(isUsableHistoryAlias) : [];
      if (valid.length) resolved[tid] = valid;
      else delete resolved[tid];
    }
    const now = Date.now();
    saveHistoryAliases(resolvedLegacyHistoryAliases(state));
    const pending = tids.slice().reverse().filter((tid) => !Array.isArray(resolved[tid]) && (force || !attemptedAt[tid] || now - Number(attemptedAt[tid]) > 7 * 24 * 60 * 60 * 1e3)).slice(0, Math.max(0, Number(limit) || 0));
    if (!pending.length) {
      return {
        checked: 0,
        matched: 0,
        unresolved: tids.filter((tid) => !Array.isArray(resolved[tid])).length
      };
    }
    legacyHistoryMigrationInProgress = true;
    let matched = 0;
    try {
      for (let offset = 0; offset < pending.length; offset += 4) {
        const batch = pending.slice(offset, offset + 4);
        const results = await Promise.all(batch.map(async (tid) => ({
          tid,
          aliases: await requestLegacyHistoryAliases(tid)
        })));
        const latestState = GM_getValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, {});
        if (latestState?.resolved && typeof latestState.resolved === "object") {
          for (const [tid, values] of Object.entries(latestState.resolved)) {
            if (!Array.isArray(values)) continue;
            const valid = values.filter(isUsableHistoryAlias);
            if (valid.length) resolved[tid] = [.../* @__PURE__ */ new Set([...resolved[tid] || [], ...valid])];
          }
        }
        if (latestState?.attemptedAt && typeof latestState.attemptedAt === "object") Object.assign(attemptedAt, latestState.attemptedAt);
        for (const result of results) {
          attemptedAt[result.tid] = Date.now();
          if (result.aliases.length) {
            resolved[result.tid] = [.../* @__PURE__ */ new Set([...resolved[result.tid] || [], ...result.aliases])];
            saveHistoryAliases(result.aliases);
            matched += 1;
          }
        }
        GM_setValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, { ...latestState, resolverVersion: 2, attemptedAt, resolved });
        if (offset + 4 < pending.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 180));
        }
      }
      return {
        checked: pending.length,
        matched,
        unresolved: tids.filter((tid) => !Array.isArray(resolved[tid])).length
      };
    } finally {
      legacyHistoryMigrationInProgress = false;
    }
  }
  function batchProgressScopeKey(value = location.href) {
    const config = batchOpenHistoryConfig();
    if (!config) return "";
    try {
      const url = new URL(value, location.href);
      url.hash = "";
      if (config.kind === "agaghhh" && /^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname)) {
        url.searchParams.delete("page");
        url.searchParams.delete("view");
        url.searchParams.sort();
        return `https://${LEGACY_AGAGHHH_DOMAIN}${url.pathname}${url.search}`;
      }
      if (config.kind === "agaghhh") {
        const fid = url.searchParams.get("fid") || url.pathname.match(/forum[-_](\d+)(?:[-_]\d+)?(?:\.html)?/i)?.[1] || "";
        const legacyOrigin = `https://${LEGACY_AGAGHHH_DOMAIN}`;
        if (fid) return `${legacyOrigin}/forum:${fid}`;
        url.searchParams.delete("page");
        url.searchParams.sort();
        return legacyOrigin + url.pathname + url.search;
      }
      url.searchParams.delete("paged");
      url.pathname = url.pathname.replace(/\/page\/\d+\/?$/i, "/");
      url.searchParams.sort();
      return url.href;
    } catch {
      return "";
    }
  }
  function readBatchProgressMap() {
    const config = batchOpenHistoryConfig();
    if (!config || typeof GM_getValue !== "function") return {};
    const stored = GM_getValue(config.progressMapKey, {});
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  }
  function startAutomaticLegacyHistoryMigration() {
    if (legacyHistoryMigrationStartedThisPage || !isAgaghhhHost(location) || currentHost() === LEGACY_AGAGHHH_DOMAIN || !/^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname) || !isBatchOpenHistoryEnabled()) return;
    legacyHistoryMigrationStartedThisPage = true;
    void migrateLegacyHistory({ limit: LEGACY_HISTORY_AUTO_MIGRATION_LIMIT }).then((result) => {
      if (result.matched > 0 && isBatchOpenPage()) {
        applyBatchOpenHistory(document);
        const button = document.getElementById(BATCH_BUTTON_ID);
        if (button && !batchOpenState) setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
        refreshBatchProgressLocatorButton();
      }
    }).catch((error) => console.warn("[x1080x-ex] legacy history migration failed", error));
  }
  function nextBatchListPageUrl2(document2) {
    return nextBatchListPageUrl(document2, document2?.baseURI);
  }
  function rememberBatchProgressTarget(url) {
    const config = batchOpenHistoryConfig();
    const scope = batchProgressScopeKey();
    if (!config || !scope || !url || !isBatchProgressLocatorEnabled() || typeof GM_setValue !== "function") return false;
    const map = readBatchProgressMap();
    map[scope] = { url, updatedAt: Date.now() };
    const entries = Object.entries(map).sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0)).slice(0, 100);
    GM_setValue(config.progressMapKey, Object.fromEntries(entries));
    refreshBatchProgressLocatorButton();
    return true;
  }
  function rememberBatchProgressForCurrentPage(document2, completed) {
    const target = completed ? nextBatchListPageUrl2(document2) || location.href : location.href;
    return rememberBatchProgressTarget(target);
  }
  function collectBatchOpenThreads(document2) {
    const threads = collectForumThreadLinks(document2);
    if (!isBatchOpenUnopenedOnlyEnabled()) return threads;
    const history = new Set(readBatchOpenHistory());
    return threads.filter((thread) => !isBatchThreadVisited(thread, history));
  }
  function rememberBatchOpenedThread(url, titleText = "") {
    const config = batchOpenHistoryConfig();
    if (!config || !isBatchOpenHistoryEnabled() || typeof GM_setValue !== "function") return false;
    const id = batchOpenHistoryId(url);
    if (!id) return false;
    const stored = GM_getValue(config.historyKey, []);
    const history = (Array.isArray(stored) ? stored : []).filter((item) => item !== id);
    history.push(id);
    GM_setValue(config.historyKey, history.slice(-batchOpenHistoryLimit()));
    let title = titleText;
    try {
      if (!title && new URL(url, location.href).href === location.href) {
        title = getThreadHeadingText(document);
      }
    } catch {
    }
    if (config.kind === "agaghhh") saveHistoryAliases(historyAliasesForTitle(title));
    return true;
  }
  function applyBatchOpenHistory(document2) {
    const config = batchOpenHistoryConfig();
    if (!document2 || !config) return 0;
    let style = document2.getElementById(BATCH_OPEN_HISTORY_STYLE_ID);
    if (!style) {
      style = document2.createElement("style");
      style.id = BATCH_OPEN_HISTORY_STYLE_ID;
      (document2.head || document2.documentElement).append(style);
    }
    const css = `a:visited, a[${BATCH_OPEN_HISTORY_ATTR}="1"] { color: ${batchOpenHistoryColor()} !important; }
.thread-list .resource-title:visited, .thread-list .resource-title[${BATCH_OPEN_HISTORY_ATTR}="1"],
.thread-list .resource-title:visited *, .thread-list .resource-title[${BATCH_OPEN_HISTORY_ATTR}="1"] * { color: ${batchOpenHistoryColor()} !important; }`;
    if (style.textContent !== css) style.textContent = css;
    document2.querySelectorAll(`a[${BATCH_OPEN_HISTORY_ATTR}="1"]`).forEach((link) => link.removeAttribute(BATCH_OPEN_HISTORY_ATTR));
    if (!isBatchOpenHistoryEnabled()) return 0;
    const history = new Set(readBatchOpenHistory());
    let marked = 0;
    collectForumThreadLinks(document2).forEach((thread) => {
      if (!isBatchThreadVisited(thread, history)) return;
      thread.link.setAttribute(BATCH_OPEN_HISTORY_ATTR, "1");
      marked += 1;
    });
    return marked;
  }
  function isThreadPage() {
    const url = new URL(location.href);
    return /^\/resources\/[a-z0-9]+\/?$/i.test(url.pathname) || url.searchParams.get("mod") === "viewthread" && url.searchParams.has("tid") || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
  }
  function isForumDisplayPage() {
    const url = new URL(location.href);
    return url.searchParams.get("mod") === "forumdisplay" || /forum[-_]\d+/i.test(url.pathname) || /^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname);
  }
  function isBatchOpenPage() {
    return isForumDisplayPage() || Boolean(document.querySelector("main#genesis-content article.entry .entry-title a[href]"));
  }
  function normalizedLabel(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isFollowing(reference, element) {
    return Boolean(reference.compareDocumentPosition(element) & 4);
  }
  function isHdblogPreviewBoundary(element) {
    if (!element || element.querySelector("img")) return false;
    const text = normalizedLabel(element.textContent);
    return /^(?:downloads?(?: links?)?|links?|magnets?(?: links?)?|torrents?(?: links?)?|password|info(?:rmation)?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\s*[:：]?$/i.test(text);
  }
  function largestSrcsetUrl(document2, value) {
    const candidates = String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean).map((part, order) => {
      const [url, descriptor = ""] = part.split(/\s+/, 2);
      const match = descriptor.match(/^(\d+(?:\.\d+)?)(w|x)$/i);
      let score = order;
      if (match) {
        const amount = Number(match[1]);
        score = match[2].toLowerCase() === "w" ? amount : amount * 1e5;
      }
      try {
        return { url: new URL(url, document2.baseURI).href, score };
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return candidates[0]?.url || "";
  }
  function directImageHref(document2, anchor) {
    const href = anchor?.getAttribute("href");
    if (!href) return "";
    try {
      const url = new URL(href, document2.baseURI);
      if (!/^https?:$/.test(url.protocol)) return "";
      return /\.(?:jpe?g|png|webp|gif|avif)$/i.test(url.pathname) ? url.href : "";
    } catch {
      return "";
    }
  }
  function hdblogPreviewImageUrl(document2, image, forcedUrl = "") {
    const anchor = image.closest("a[href]");
    const candidates = [
      forcedUrl,
      directImageHref(document2, anchor),
      image.getAttribute("data-original"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-src"),
      largestSrcsetUrl(document2, image.getAttribute("data-srcset")),
      largestSrcsetUrl(document2, image.getAttribute("srcset")),
      image.currentSrc,
      image.getAttribute("src")
    ];
    for (const candidate of candidates) {
      if (!candidate || /^(?:data:|blob:|javascript:)/i.test(candidate)) continue;
      try {
        const url = new URL(candidate, document2.baseURI);
        if (/^https?:$/.test(url.protocol)) return url.href;
      } catch {
      }
    }
    return "";
  }
  function styleHdblogPreviewImage(image, fullUrl) {
    if (!fullUrl) return false;
    image.src = fullUrl;
    [
      "srcset",
      "sizes",
      "width",
      "height",
      "data-original",
      "data-lazy-src",
      "data-src",
      "data-srcset",
      "data-lazy-srcset"
    ].forEach((attribute) => image.removeAttribute(attribute));
    image.loading = "eager";
    image.dataset.x1080xPreviewExpanded = "1";
    image.style.setProperty("display", "block", "important");
    image.style.setProperty("width", "100%", "important");
    image.style.setProperty("max-width", "100%", "important");
    image.style.setProperty("height", "auto", "important");
    image.style.setProperty("max-height", "none", "important");
    image.style.setProperty("object-fit", "contain", "important");
    image.style.setProperty("margin", "12px auto", "important");
    makePreviewGestureFriendly(image);
    return true;
  }
  function expandHdblogPreviewImages() {
    if (!isAllowedHost(location.hostname, ["hdblog.me"])) return 0;
    const content = document.querySelector(
      "main#genesis-content article.entry .entry-content, article.entry .entry-content, .entry-content"
    );
    if (!content) return 0;
    const markers = [...content.querySelectorAll("p, strong, b, h1, h2, h3, h4, h5, h6")];
    const marker = markers.find((element) => /^preview\s*[:：]?$/i.test(normalizedLabel(element.textContent)));
    if (!marker) return 0;
    const boundary = markers.find((element) => isFollowing(marker, element) && isHdblogPreviewBoundary(element));
    const isInPreviewRange = (element) => isFollowing(marker, element) && (!boundary || !isFollowing(boundary, element));
    let expanded = 0;
    const handledImages = /* @__PURE__ */ new Set();
    const anchors = [...content.querySelectorAll("a[href]")].filter(isInPreviewRange);
    anchors.forEach((anchor) => {
      const fullUrl = directImageHref(document, anchor);
      if (!fullUrl) return;
      let image = anchor.querySelector("img");
      if (!image) {
        image = document.createElement("img");
        image.alt = normalizedLabel(anchor.textContent) || "Preview";
        anchor.replaceChildren(image);
      }
      if (styleHdblogPreviewImage(image, fullUrl)) {
        anchor.href = fullUrl;
        anchor.style.setProperty("display", "block", "important");
        anchor.style.setProperty("max-width", "100%", "important");
        handledImages.add(image);
        expanded += 1;
      }
    });
    [...content.querySelectorAll("img")].filter((image) => isInPreviewRange(image) && !handledImages.has(image)).forEach((image) => {
      const fullUrl = hdblogPreviewImageUrl(document, image);
      if (!styleHdblogPreviewImage(image, fullUrl)) return;
      const anchor = image.closest("a[href]");
      if (anchor && content.contains(anchor)) {
        const directUrl = directImageHref(document, anchor);
        if (directUrl) anchor.href = directUrl;
        anchor.style.setProperty("display", "block", "important");
        anchor.style.setProperty("max-width", "100%", "important");
      }
      expanded += 1;
    });
    return expanded;
  }
  function readBatchOpenIntervalMs(key, fallback) {
    if (typeof GM_getValue !== "function") return fallback;
    const numeric = Number(GM_getValue(key, fallback));
    return Number.isFinite(numeric) && numeric >= 100 && numeric <= 6e5 ? Math.round(numeric) : fallback;
  }
  function batchOpenTiming() {
    const isHdblog = isAllowedHost(location.hostname, ["hdblog.me"]);
    const timing = isHdblog ? HDBLOG_OPEN_TIMING : DEFAULT_OPEN_TIMING;
    const minKey = isHdblog ? HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY : AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY;
    const maxKey = isHdblog ? HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY : AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY;
    const delayMin = readBatchOpenIntervalMs(minKey, timing.delayMin);
    const delayMax = readBatchOpenIntervalMs(maxKey, timing.delayMax);
    if (delayMax < delayMin) return timing;
    return { ...timing, delayMin, delayMax };
  }
  function randomDelay(minimum, maximum) {
    return Math.round(minimum + Math.random() * (maximum - minimum));
  }
  function waitForBatchDelay(milliseconds, state) {
    return new Promise((resolve) => {
      state.finishDelay = resolve;
      state.timeoutId = window.setTimeout(() => {
        state.timeoutId = null;
        state.finishDelay = null;
        resolve();
      }, milliseconds);
    });
  }
  function cancelBatchOpen() {
    if (!batchOpenState) return;
    batchOpenState.cancelled = true;
    if (batchOpenState.timeoutId !== null) {
      window.clearTimeout(batchOpenState.timeoutId);
      batchOpenState.timeoutId = null;
    }
    batchOpenState.finishDelay?.();
    batchOpenState.finishDelay = null;
  }
  function setBatchButtonIdle(button, count) {
    const unopenedOnly = isBatchOpenUnopenedOnlyEnabled();
    const label = unopenedOnly ? `\u6279\u91CF\u6253\u5F00\u672A\u6D4F\u89C8\uFF08${count}\uFF09` : `\u6279\u91CF\u6253\u5F00\u672C\u9875\uFF08${count}\uFF09`;
    if (button.textContent !== label) button.textContent = label;
    button.title = unopenedOnly ? "\u6309\u5217\u8868\u987A\u5E8F\u5728\u540E\u53F0\u9010\u4E2A\u6253\u5F00\u672C\u9875\u672A\u6D4F\u89C8\u4E3B\u9898\uFF08\u4EE5\u811A\u672C\u6D4F\u89C8\u8BB0\u5F55\u4E3A\u51C6\uFF09\uFF1B\u95F4\u9694\u968F\u673A\uFF0C\u5E76\u5B9A\u671F\u505C\u987F\uFF1B\u518D\u6B21\u70B9\u51FB\u53EF\u505C\u6B62" : "\u6309\u5217\u8868\u987A\u5E8F\u5728\u540E\u53F0\u9010\u4E2A\u6253\u5F00\u672C\u9875\u4E3B\u9898\uFF1B\u95F4\u9694\u968F\u673A\uFF0C\u5E76\u5B9A\u671F\u505C\u987F\uFF1B\u518D\u6B21\u70B9\u51FB\u53EF\u505C\u6B62";
    button.style.background = "#398bd4";
  }
  async function openCurrentPageThreads(button) {
    if (batchOpenState) {
      cancelBatchOpen();
      return;
    }
    const threads = collectBatchOpenThreads(document);
    if (!threads.length) {
      window.alert(isBatchOpenUnopenedOnlyEnabled() ? "\u5F53\u524D\u9875\u9762\u6CA1\u6709\u672A\u6253\u5F00\u7684\u4E3B\u9898\u3002" : "\u5F53\u524D\u9875\u9762\u6CA1\u6709\u627E\u5230\u53EF\u6253\u5F00\u7684\u666E\u901A\u4E3B\u9898\u3002");
      return;
    }
    const state = {
      cancelled: false,
      finishDelay: null,
      timeoutId: null
    };
    batchOpenState = state;
    rememberBatchProgressForCurrentPage(document, false);
    const failures = [];
    let opened = 0;
    const timing = batchOpenTiming();
    const endBatchOpenGuard = beginDownloadGuard(document, {
      enabled: true,
      label: "\u2197 \u6279\u91CF\u6253\u5F00\u4E2D"
    });
    button.style.background = "#b84b4b";
    try {
      await waitForBatchDelay(randomDelay(timing.initialMin, timing.initialMax), state);
      for (const [index, thread] of threads.entries()) {
        if (state.cancelled) break;
        button.textContent = `\u505C\u6B62\u540E\u53F0\u6253\u5F00\uFF08${opened}/${threads.length}\uFF09`;
        try {
          GM_openInTab(thread.url, {
            active: false,
            insert: false,
            setParent: true
          });
          if (rememberBatchOpenedThread(thread.url, thread.link?.textContent || "")) applyBatchOpenHistory(document);
          opened += 1;
        } catch (error) {
          failures.push(`${index + 1}. ${redactDiagnostic(error?.message || error || "\u6253\u5F00\u5931\u8D25")}`);
        }
        if (index === threads.length - 1 || state.cancelled) break;
        const completedCount = index + 1;
        const isLongPause = completedCount % timing.pauseEvery === 0;
        const delay = isLongPause ? randomDelay(timing.pauseMin, timing.pauseMax) : randomDelay(timing.delayMin, timing.delayMax);
        button.textContent = `${isLongPause ? "\u505C\u987F" : "\u7B49\u5F85"} ${Math.ceil(delay / 1e3)} \u79D2\uFF08${opened}/${threads.length}\uFF09`;
        await waitForBatchDelay(delay, state);
      }
    } finally {
      endBatchOpenGuard();
      const wasCancelled = state.cancelled;
      const completedPage = !wasCancelled && failures.length === 0 && opened === threads.length;
      rememberBatchProgressForCurrentPage(document, completedPage);
      batchOpenState = null;
      button.textContent = wasCancelled ? `\u5DF2\u505C\u6B62\uFF08\u5DF2\u6253\u5F00 ${opened}/${threads.length}\uFF09` : failures.length ? `\u5B8C\u6210\uFF08\u6253\u5F00 ${opened}\uFF0C\u5931\u8D25 ${failures.length}\uFF09` : `\u2713 \u5DF2\u6309\u987A\u5E8F\u6253\u5F00 ${opened} \u4E2A\u4E3B\u9898`;
      button.style.background = failures.length ? "#b36b22" : "#398bd4";
      window.setTimeout(() => {
        if (!batchOpenState) {
          setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
        }
      }, 3e3);
    }
    if (failures.length) {
      window.alert(`\u4EE5\u4E0B\u4E3B\u9898\u6253\u5F00\u5931\u8D25\uFF1A

${failures.join("\n")}`);
    }
  }
  function parseResponseHeaders(value) {
    const headers = /* @__PURE__ */ new Map();
    String(value ?? "").split(/\r?\n/).forEach((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) return;
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    });
    return headers;
  }
  function redactDiagnostic(value) {
    return String(value ?? "").replace(/(\/api\/downloads\/file\/)[a-z0-9-]+/gi, "$1[\u5DF2\u8131\u654F]").replace(/((?:cookie|authorization|token|auth|sid)=)[^;\s&]+/gi, "$1[\u5DF2\u8131\u654F]").replace(/([?&](?:token|auth|sid|key)=)[^&#\s]+/gi, "$1[\u5DF2\u8131\u654F]");
  }
  function safeErrorDetails(error) {
    if (!error || typeof error !== "object") {
      return { error: redactDiagnostic(error || "unknown_error"), details: "" };
    }
    const details = Object.fromEntries(
      Object.entries(error).filter(([key]) => !/(?:cookie|authorization|requestHeaders)/i.test(key)).map(([key, value]) => [
        key,
        typeof value === "object" ? redactDiagnostic(JSON.stringify(value)) : redactDiagnostic(value)
      ])
    );
    if (error.name && !details.name) details.name = redactDiagnostic(error.name);
    if (error.message && !details.message) details.message = redactDiagnostic(error.message);
    return details;
  }
  function finalUrlType(finalUrl) {
    try {
      return new URL(finalUrl, location.href).origin === location.origin ? "\u540C\u7AD9\u5730\u5740" : "\u8DE8\u7AD9\u5730\u5740";
    } catch {
      return "\u672A\u77E5\u5730\u5740";
    }
  }
  function responseFailure(response, reason) {
    const finalUrl = response.finalUrl || response.responseURL || location.href;
    const headers = parseResponseHeaders(response.responseHeaders);
    const contentType = headers.get("content-type") || response.response?.type || "\u672A\u77E5\u7C7B\u578B";
    return new Error(
      `HTTP ${response.status || 0}\uFF1B\u6700\u7EC8\u5730\u5740\uFF1A${finalUrlType(finalUrl)} ${redactDiagnostic(finalUrl)}\uFF1BContent-Type\uFF1A${contentType}\uFF1B\u539F\u56E0\uFF1A${reason}`
    );
  }
  async function blobPrefix(blob) {
    const prefix = blob.slice(0, 1024);
    if (typeof prefix.text === "function") return prefix.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(prefix);
    });
  }
  async function validateResponse(response) {
    if (response.status < 200 || response.status >= 300) {
      throw responseFailure(response, "\u670D\u52A1\u5668\u6CA1\u6709\u8FD4\u56DE\u6210\u529F\u72B6\u6001\uFF0C\u8BF7\u786E\u8BA4\u767B\u5F55\u3001\u9644\u4EF6\u6743\u9650\u548C\u5E16\u5B50\u662F\u5426\u4ECD\u53EF\u8BBF\u95EE");
    }
    const blob = response.response;
    if (!blob || typeof blob.size !== "number" || typeof blob.slice !== "function") {
      throw responseFailure(response, "\u54CD\u5E94\u4E0D\u662F\u53EF\u4FDD\u5B58\u7684\u4E8C\u8FDB\u5236 Blob");
    }
    const headers = parseResponseHeaders(response.responseHeaders);
    const contentType = headers.get("content-type") || blob.type || "";
    const prefix = await blobPrefix(blob);
    const looksLikeHtml = /text\/html|application\/xhtml\+xml/i.test(contentType) || /^\s*(?:<!doctype\s+html|<html\b)/i.test(prefix);
    if (looksLikeHtml) {
      let reason = "\u670D\u52A1\u5668\u8FD4\u56DE HTML \u9875\u9762\uFF0C\u672A\u4FDD\u5B58\uFF0C\u907F\u514D\u628A\u767B\u5F55\u9875\u6216\u9519\u8BEF\u9875\u4F2A\u88C5\u6210\u9644\u4EF6";
      if (/(?:login|登录|登錄|請先登入|请先登录)/i.test(prefix)) {
        reason = "\u670D\u52A1\u5668\u8FD4\u56DE\u767B\u5F55\u9875\uFF0C\u8BF7\u5237\u65B0\u5E16\u5B50\u5E76\u786E\u8BA4 Tampermonkey \u8BF7\u6C42\u643A\u5E26\u5F53\u524D\u767B\u5F55\u72B6\u6001";
      } else if (/(?:permission|权限|權限|无权|無權|附件不存在|附件不存在)/i.test(prefix)) {
        reason = "\u670D\u52A1\u5668\u8FD4\u56DE\u6743\u9650\u6216\u9644\u4EF6\u9519\u8BEF\u9875\uFF0C\u8BF7\u786E\u8BA4\u8D26\u53F7\u6709\u4E0B\u8F7D\u6743\u9650\u4E14\u9644\u4EF6\u4ECD\u5B58\u5728";
      } else if (/(?:cloudflare|cf-chl|captcha|验证|驗證)/i.test(prefix)) {
        reason = "\u670D\u52A1\u5668\u8FD4\u56DE\u6D4F\u89C8\u5668\u9A8C\u8BC1\u9875\uFF0C\u8BF7\u5148\u5728\u5F53\u524D\u9875\u9762\u5B8C\u6210\u9A8C\u8BC1\u540E\u91CD\u8BD5";
      }
      throw responseFailure(response, reason);
    }
    if (blob.size === 0) throw responseFailure(response, "\u54CD\u5E94\u5927\u5C0F\u4E3A 0\uFF0C\u672A\u4FDD\u5B58\u7A7A\u6587\u4EF6");
    return {
      blob,
      status: response.status,
      finalUrl: response.finalUrl || response.responseURL || location.href,
      contentType: contentType || "application/octet-stream"
    };
  }
  async function requestBlobWithPageFetch(job) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT2);
    try {
      const response = await window.fetch(job.url, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        signal: controller.signal
      });
      const blob = await response.blob();
      const responseHeaders = [];
      response.headers.forEach((value, key) => responseHeaders.push(`${key}: ${value}`));
      return validateResponse({
        status: response.status,
        finalUrl: response.url,
        responseHeaders: responseHeaders.join("\r\n"),
        response: blob
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT2 / 1e3} \u79D2\uFF09`);
      }
      const details = safeErrorDetails(error);
      console.error("[x1080x-ex] page fetch failed", details);
      throw new Error(
        `\u9875\u9762\u540C\u6E90\u8BF7\u6C42\u5931\u8D25\uFF1Aerror=${details.name || details.error || "fetch_failed"}\uFF1Bdetails=${details.message || details.details || "\u65E0\u8BE6\u7EC6\u4FE1\u606F"}`
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  function previewRefererForJob(job) {
    if (job.kind !== "image") return "";
    let target = "";
    try {
      target = new URL(job.url, location.href).href;
    } catch {
      return "";
    }
    const image = [...document.querySelectorAll(`img[${PREVIEW_IMAGE_URL_ATTR}]`)].find((candidate) => {
      try {
        return new URL(candidate.getAttribute(PREVIEW_IMAGE_URL_ATTR), location.href).href === target;
      } catch {
        return false;
      }
    });
    if (!image) return "";
    return image.getAttribute(PREVIEW_REFERER_ATTR) || image.closest("section")?.querySelector("a[href]")?.href || "";
  }
  function requestBlobWithGmXhrOnce(job, referer) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: job.url,
        responseType: "blob",
        timeout: REQUEST_TIMEOUT2,
        // Omitting the header lets the manager supply its default page Referer.
        // An explicit empty value is needed for images marked no-referrer.
        headers: { Referer: referer },
        onload: (response) => {
          validateResponse(response).then(resolve, reject);
        },
        onerror: (error) => {
          const details = safeErrorDetails(error);
          reject(new Error(
            `\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1Aerror=${details.error || "unknown_error"}\uFF1Bdetails=${details.details || details.message || "\u65E0\u8BE6\u7EC6\u4FE1\u606F"}`
          ));
        },
        ontimeout: () => reject(new Error(`\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT2 / 1e3} \u79D2\uFF09`))
      });
    });
  }
  function imageRefererPolicyForJob(job) {
    if (job.kind !== "image") return null;
    let target;
    try {
      target = new URL(job.url, location.href);
    } catch {
      return null;
    }
    const image = [...document.querySelectorAll("img")].find((candidate) => {
      const values = [
        candidate.currentSrc,
        candidate.getAttribute("src"),
        candidate.getAttribute("data-src"),
        candidate.getAttribute("data-original")
      ];
      return values.some((value) => {
        if (!value) return false;
        try {
          return new URL(value, location.href).href === target.href;
        } catch {
          return false;
        }
      });
    });
    if (!image) return null;
    const policy = String(
      image.getAttribute("referrerpolicy") || document.referrerPolicy || "strict-origin-when-cross-origin"
    ).trim().toLowerCase();
    const crossOrigin = target.origin !== location.origin;
    const origin = `${location.origin}/`;
    const downgrade = location.protocol === "https:" && target.protocol === "http:";
    if (policy === "no-referrer" || policy === "same-origin" && crossOrigin || downgrade && ["strict-origin", "strict-origin-when-cross-origin", "no-referrer-when-downgrade"].includes(policy)) {
      return { matched: true, referers: [""] };
    }
    if (policy === "origin" || policy === "strict-origin") {
      return { matched: true, referers: [origin, ""] };
    }
    if (policy === "strict-origin-when-cross-origin") {
      return { matched: true, referers: crossOrigin ? [origin, ""] : [location.href, ""] };
    }
    if (policy === "unsafe-url" || policy === "no-referrer-when-downgrade") {
      return { matched: true, referers: [location.href, ""] };
    }
    return { matched: true, referers: crossOrigin ? [origin, ""] : [location.href, ""] };
  }
  async function requestBlobWithGmXhr(job) {
    const sourceReferer = previewRefererForJob(job);
    const imageReferer = imageRefererPolicyForJob({ ...job, url: job.sourceUrl || job.url });
    const referers = sourceReferer ? [sourceReferer, "", location.href] : imageReferer ? imageReferer.referers : [location.href, ""];
    let lastError = null;
    for (const referer of [...new Set(referers)]) {
      try {
        return await requestBlobWithGmXhrOnce(job, referer);
      } catch (error) {
        lastError = error;
      }
    }
    console.error("[x1080x-ex] GM_xmlhttpRequest failed after referer retries", safeErrorDetails(lastError));
    throw lastError || new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25");
  }
  function requestBlob(job) {
    const url = new URL(job.url, location.href);
    if (job.kind === "attachment" && url.origin === location.origin) {
      return requestBlobWithPageFetch(job);
    }
    return requestBlobWithGmXhr(job);
  }
  async function requestImageBlobWithFallbacks(job) {
    const candidates = [];
    for (const value of [job.url, ...Array.isArray(job.fallbackUrls) ? job.fallbackUrls : []]) {
      if (!value) continue;
      for (const candidate of [value, ...alternateImageUrls(value)]) {
        if (!candidates.includes(candidate)) candidates.push(candidate);
      }
    }
    let lastError = null;
    let allNotFound = candidates.length > 0;
    for (const url of candidates) {
      try {
        return await requestBlob({ ...job, sourceUrl: job.url, url });
      } catch (error) {
        lastError = error;
        if (!/HTTP (?:404|410)\b/i.test(String(error?.message || error))) allNotFound = false;
        console.warn("[x1080x-ex] image source failed; trying fallback", {
          name: job.name,
          url: redactDiagnostic(url),
          error: redactDiagnostic(error?.message || error)
        });
      }
    }
    if (allNotFound) return null;
    throw lastError || new Error("\u6CA1\u6709\u53EF\u7528\u7684\u56FE\u7247\u5730\u5740");
  }
  function isLikelyUnavailablePixhostPreview(job, blob) {
    if (!blob || typeof blob.size !== "number") return false;
    const isPixhostPreview = Boolean(
      job?.pixhostPreview || job?.pixhostThumbUrl || job?.pixhostShowUrl
    );
    return isPixhostPreview && blob.size > 0 && blob.size <= PIXHOST_PLACEHOLDER_MAX_BYTES;
  }
  async function download(job, { deferImageSave = false } = {}) {
    if (job.kind === "torrent") {
      const result2 = await requestTorrentBytes(job.url);
      const saved = await saveDownloadBlob(new Blob([result2.bytes], { type: "application/x-bittorrent" }), job.name, document, { browserDownload: true });
      console.info("[x1080x-ex] integrated torrent download", {
        name: job.name,
        hash: result2.hash,
        torrentName: result2.torrentName,
        source: new URL(result2.sourceUrl).hostname,
        size: result2.bytes.byteLength
      });
      return { skipped: false, ...saved };
    }
    let downloadJob = job;
    if (job.kind === "image" && job.pixhostShowUrl) {
      const resolvedUrl = await resolvePixhostShowUrl(
        document,
        job.pixhostShowUrl,
        job.pixhostThumbUrl || job.url,
        globalThis.GM_xmlhttpRequest
      );
      if (!resolvedUrl) {
        console.info("[x1080x-ex] skipped unavailable Pixhost image", {
          name: job.name,
          showUrl: job.pixhostShowUrl
        });
        return { skipped: true, reason: "Pixhost Preview \u5DF2\u5931\u6548" };
      }
      downloadJob = { ...job, url: resolvedUrl };
    } else if (job.kind === "image" && job.pixhostThumbUrl) {
      console.info("[x1080x-ex] skipped standalone Pixhost thumbnail", {
        name: job.name,
        thumbnailUrl: job.pixhostThumbUrl
      });
      return { skipped: true, reason: "Pixhost \u7F29\u7565\u56FE\u672A\u627E\u5230\u53EF\u9A8C\u8BC1\u7684\u5927\u56FE\u5730\u5740" };
    }
    const result = job.kind === "image" ? await requestImageBlobWithFallbacks(downloadJob) : await requestBlob(downloadJob);
    if (!result && job.kind === "image") {
      console.info("[x1080x-ex] skipped image after all source paths returned 404/410", {
        name: job.name,
        url: redactDiagnostic(downloadJob.url)
      });
      return { skipped: true, reason: "\u56FE\u7247\u6E90\u5DF2\u5931\u6548\uFF08HTTP 404/410\uFF09" };
    }
    console.info("[x1080x-ex] response", {
      kind: job.kind,
      name: job.name,
      status: result.status,
      finalUrl: redactDiagnostic(result.finalUrl),
      contentType: result.contentType,
      size: result.blob.size
    });
    if (job.kind === "image" && isLikelyUnavailablePixhostPreview(job, result.blob)) {
      console.info("[x1080x-ex] skipped likely unavailable Pixhost preview blob", {
        name: job.name,
        size: result.blob.size,
        url: redactDiagnostic(downloadJob.url)
      });
      return { skipped: true, reason: "Pixhost Preview \u5DF2\u5931\u6548" };
    }
    if (job.kind === "image" && deferImageSave) {
      return { skipped: false, blob: result.blob, name: job.name };
    }
    return { skipped: false, ...await saveDownloadBlob(result.blob, job.name) };
  }
  var activeDownloadState = null;
  function setDownloadStatus(button, text, label = text) {
    if (activeDownloadState?.button === button) {
      Object.assign(activeDownloadState, { text, label });
      if (activeDownloadState.pathname !== location.pathname) return;
      button = document.getElementById(BUTTON_ID) || button;
    }
    button.title = text;
    button.setAttribute("aria-label", text);
    if (!/^\/resources\/[a-z0-9]+\/?$/i.test(location.pathname)) {
      if (button.textContent !== text) button.textContent = text;
      return;
    }
    const count = text.match(/(?:处理中|已处理) (\d+\/\d+)/)?.[1] || "";
    renderModernDownloadButton(button, label.startsWith("\u4E0B\u8F7D\u4E2D") ? "progress" : label.startsWith("\u26A0") ? "error" : "done", count);
    button.setAttribute("aria-label", `${label}\uFF1A${text}`);
    const status = ensureModernDownloadStatus(document);
    if (status) {
      if (status.textContent !== text) status.textContent = text;
      status.title = text;
    }
  }
  var downloadResetTimers = /* @__PURE__ */ new WeakMap();
  async function downloadAll(button) {
    if (button.disabled || activeDownloadState) return;
    const jobs = buildDownloadJobs(document);
    const nativeFiles = collectModernNativeAttachments(document);
    const totalTasks = jobs.length + nativeFiles.length;
    if (!totalTasks) {
      window.alert("\u4E3B\u697C\u4E2D\u6CA1\u6709\u627E\u5230\u9644\u4EF6\u3001\u78C1\u529B\u94FE\u6216\u53EF\u4E0B\u8F7D\u56FE\u7247\u3002");
      return;
    }
    window.clearTimeout(downloadResetTimers.get(button));
    activeDownloadState = { button, pathname: location.pathname, text: "", label: "" };
    const endDownloadGuard = beginDownloadGuard(document, {
      enabled: isDownloadGuardEnabled(AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY)
    });
    button.disabled = true;
    const failures = [];
    const pendingImages = [];
    let skipped = 0;
    let processed = 0;
    let saved = 0;
    let started = 0;
    const recordSave = (result) => {
      if (result?.confirmed) saved += 1;
      else started += 1;
    };
    const progress = () => setDownloadStatus(button, `\u5904\u7406\u4E2D ${processed}/${totalTasks} \xB7 \u5DF2\u4FDD\u5B58 ${saved}${started ? ` \xB7 \u5DF2\u53D1\u8D77 ${started}` : ""}`, `\u4E0B\u8F7D\u4E2D ${processed}/${totalTasks}`);
    try {
      const nativeResult = { total: 0 };
      progress();
      for (const file of nativeFiles) {
        try {
          const attachment = await prepareModernAttachmentDownload(document, file);
          if (attachment.delegated) nativeResult.total += 1;
          else {
            const result = await requestBlobWithPageFetch(attachment);
            if (/(?:application\/json|text\/html)/i.test(result.contentType)) throw new Error("\u7F51\u7AD9\u8FD4\u56DE\u4E86\u9519\u8BEF\u4FE1\u606F\uFF0C\u672A\u4FDD\u5B58\u4E3A\u9644\u4EF6");
            if (/\.zip$/i.test(attachment.name) && !/^PK(?:\x03\x04|\x05\x06|\x07\x08)/.test(await blobPrefix(result.blob))) throw new Error("\u7F51\u7AD9\u54CD\u5E94\u4E0D\u662F\u6709\u6548 ZIP\uFF0C\u672A\u4FDD\u5B58\u9519\u8BEF\u9875");
            recordSave(await saveDownloadBlob(result.blob, attachment.name, document, { browserDownload: true }));
            attachment.complete();
          }
        } catch (error) {
          failures.push(`${file.name}\uFF1A${redactDiagnostic(error?.message || "\u7AD9\u5185\u9644\u4EF6\u4E0B\u8F7D\u5931\u8D25")}`);
        }
        processed += 1;
        progress();
      }
      console.info("[x1080x-ex] environment", {
        downloadMode: typeof GM_info === "object" ? GM_info.downloadMode : void 0,
        scriptHandler: typeof GM_info === "object" ? GM_info.scriptHandler : void 0,
        version: typeof GM_info === "object" ? GM_info.version : void 0
      });
      for (const job of jobs) {
        try {
          const result = await download(job, { deferImageSave: job.kind === "image" });
          if (result?.skipped) {
            skipped += 1;
          } else if (job.kind === "image" && result?.blob) {
            pendingImages.push(result);
            continue;
          } else {
            recordSave(result);
          }
        } catch (error) {
          failures.push(`${job.name}\uFF1A${redactDiagnostic(error?.message || error?.error || "\u672A\u77E5\u9519\u8BEF")}`);
        }
        processed += 1;
        progress();
      }
      for (const { blob, name } of pendingImages) {
        const finalName = pendingImages.length === 1 ? name.replace(/ A(?=\.[^.]+$)/i, "") : name;
        try {
          recordSave(await saveDownloadBlob(blob, finalName));
        } catch (error) {
          failures.push(`${finalName}\uFF1A${redactDiagnostic(error?.message || "\u4FDD\u5B58\u5931\u8D25")}`);
        }
        processed += 1;
        progress();
      }
      const summary = [`\u5DF2\u5904\u7406 ${processed}/${totalTasks}`, `\u5DF2\u4FDD\u5B58 ${saved}`];
      if (started) summary.push(`\u5DF2\u53D1\u8D77 ${started}\uFF08\u8BF7\u67E5\u770B\u6D4F\u89C8\u5668\u4E0B\u8F7D\u5217\u8868\uFF09`);
      if (skipped) summary.push(`\u8DF3\u8FC7 ${skipped}`);
      if (failures.length) summary.push(`\u5931\u8D25 ${failures.length}`);
      if (nativeResult.total) summary.push(`\u7AD9\u5185\u9644\u4EF6\u5DF2\u8BF7\u6C42 ${nativeResult.total}\uFF08\u7ED3\u679C\u8BF7\u67E5\u770B\u7F51\u7AD9\u63D0\u793A\uFF09`);
      const modern = /^\/resources\/[a-z0-9]+\/?$/i.test(location.pathname);
      const completedLabel = failures.length ? `\u26A0 \u5931\u8D25 ${failures.length}` : started || nativeResult.total || skipped ? `\u2713 \u5DF2\u5904\u7406 ${processed}/${totalTasks}` : "\u2713 \u4E0B\u8F7D\u5B8C\u6210";
      setDownloadStatus(button, !modern && skipped && !failures.length ? skipped === 1 ? "\u5DF2\u8DF3\u8FC7\u5931\u6548 Preview" : `\u5DF2\u8DF3\u8FC7\u5931\u6548 Preview \xD7${skipped}` : summary.join(" \xB7 "), completedLabel);
      const visibleButton = activeDownloadState.pathname === location.pathname ? document.getElementById(BUTTON_ID) || button : button;
      downloadResetTimers.set(visibleButton, window.setTimeout(() => {
        if (modern) renderModernDownloadButton(visibleButton);
        else visibleButton.textContent = "\u2B07";
        visibleButton.setAttribute("aria-label", "\u4E0B\u8F7D\u8D44\u6E90");
      }, 2500));
      if (failures.length) {
        window.alert(`\u4EE5\u4E0B\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25\uFF1A

${failures.join("\n")}

\u53EF\u68C0\u67E5\u767B\u5F55\u72B6\u6001\u6216\u6D4F\u89C8\u5668\u4E0B\u8F7D\u6743\u9650\u540E\u91CD\u8BD5\u3002`);
      }
    } finally {
      button.disabled = false;
      if (activeDownloadState.pathname === location.pathname) {
        const visibleButton = document.getElementById(BUTTON_ID);
        if (visibleButton) visibleButton.disabled = false;
      }
      activeDownloadState = null;
      endDownloadGuard();
    }
  }
  function addDownloadButton() {
    if (isAgaghhhHost(location) && typeof GM_getValue === "function" && GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) === false) return;
    const modern = /^\/resources\/[a-z0-9]+\/?$/i.test(location.pathname);
    const title = document.querySelector(modern ? ".thread-header h1" : "#thread_subject");
    const actionGroup = modern ? ensureModernResourceActionGroup(document) : null;
    if (modern) ensureModernDownloadStatus(document);
    const host = modern ? actionGroup || title?.closest(".thread-header") : title?.closest(".vwthd, .ts") || title?.parentElement;
    if (!title || !host) return;
    let button = document.getElementById(BUTTON_ID);
    if (button) {
      if (activeDownloadState?.pathname === location.pathname) {
        button.disabled = true;
        setDownloadStatus(activeDownloadState.button, activeDownloadState.text, activeDownloadState.label);
      }
      if (modern) {
        if (placeModernResourceActionButton(document, button)) return;
        if (title.nextElementSibling !== button) title.after(button);
      }
      return;
    }
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "\u2B07";
    if (modern) renderModernDownloadButton(button);
    button.setAttribute("aria-label", "\u4E0B\u8F7D\u8D44\u6E90");
    button.title = modern ? "\u4E0B\u8F7D\u4E3B\u697C\u56FE\u7247\u3001\u9884\u89C8\u548C\u79CD\u5B50\uFF1B\u514D\u8D39/\u989D\u5EA6\u9644\u4EF6\u6309\u5E16\u5B50\u6807\u9898\u547D\u540D\uFF0C\u4ED8\u8D39\u9644\u4EF6\u7531\u7F51\u7AD9\u786E\u8BA4" : "\u4E0B\u8F7D\u4E3B\u697C\u9644\u4EF6\u3001\u6B63\u6587\u5927\u56FE\u548C\u78C1\u529B\u94FE\u79CD\u5B50\uFF1B\u666E\u901A\u5E16\u5B50\u53D6\u6700\u5927\u56FE\uFF0CFC2 \u5E16\u5B50\u53D6\u5168\u90E8\u5927\u56FE";
    Object.assign(button.style, {
      float: modern ? "none" : "right",
      display: modern ? "inline-flex" : "",
      alignItems: modern ? "center" : "",
      justifyContent: modern ? "center" : "",
      width: modern ? "max-content" : "",
      position: "relative",
      zIndex: "20",
      margin: modern ? "0" : "0 8px 6px 6px",
      padding: "7px 13px",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "14px",
      lineHeight: "20px",
      ...modern ? { height: "36px", padding: "0", flexDirection: "column", gap: "0", borderRadius: "7px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" } : {}
    });
    button.addEventListener("mouseenter", () => {
      if (!modern || button.dataset.downloadState === "idle") button.style.background = "#246eaf";
    });
    button.addEventListener("mouseleave", () => {
      if (!modern || button.dataset.downloadState === "idle") button.style.background = "#398bd4";
    });
    button.addEventListener("click", () => void downloadAll(button));
    if (modern && placeModernResourceActionButton(document, button)) return;
    if (modern) title.after(button);
    else host.prepend(button);
  }
  function refreshBatchProgressLocatorButton(button = document.getElementById(BATCH_PROGRESS_BUTTON_ID)) {
    if (!button || batchProgressScanState) return;
    const historyCount = readBatchOpenHistory().length;
    button.textContent = "\u5B9A\u4F4D\u6D4F\u89C8\u8FDB\u5EA6";
    button.title = historyCount ? `\u8DE8\u9875\u67E5\u627E\u5DF2\u6253\u5F00\u4E0E\u672A\u6253\u5F00\u4E3B\u9898\u76F8\u90BB\u7684\u5206\u9875\uFF08\u73B0\u6709 ${historyCount} \u6761\u811A\u672C\u8BB0\u5F55\uFF09` : "\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\uFF0C\u6D4F\u89C8\u5668\u81EA\u5DF1\u7684 :visited \u8BB0\u5F55\u4E0D\u80FD\u81EA\u52A8\u8BFB\u53D6";
    button.style.background = "#6d7d87";
  }
  async function requestBatchListPageHtml(url) {
    let lastError = null;
    if (typeof window.fetch === "function") {
      try {
        const response = await window.fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } catch (error) {
        lastError = error;
      }
    }
    if (typeof GM_xmlhttpRequest !== "function") {
      throw lastError || new Error("\u7F3A\u5C11\u53EF\u7528\u7684\u5206\u9875\u8BFB\u53D6\u63A5\u53E3");
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 15e3,
        onload: (response) => {
          if (response.status < 200 || response.status >= 400) {
            reject(new Error(`HTTP ${response.status}`));
          } else {
            resolve(response.responseText || "");
          }
        },
        ontimeout: () => reject(new Error("\u8BFB\u53D6\u5206\u9875\u8D85\u65F6")),
        onerror: (error) => reject(new Error(error?.error || "\u65E0\u6CD5\u8BFB\u53D6\u5206\u9875"))
      });
    });
  }
  async function locateCurrentBatchProgress(button) {
    if (batchProgressScanState) {
      batchProgressScanState.cancelled = true;
      button.textContent = "\u6B63\u5728\u505C\u6B62\u67E5\u627E\u2026";
      return;
    }
    if (!isBatchProgressLocatorEnabled()) return;
    const historyIds = readBatchOpenHistory();
    if (!historyIds.length) {
      window.alert("\u6CA1\u6709\u53EF\u7528\u7684\u811A\u672C\u6253\u5F00\u8BB0\u5F55\u3002\u8BF7\u5148\u5F00\u542F\u201C\u4FDD\u5B58\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u201D\u5E76\u4F7F\u7528\u6279\u91CF\u6253\u5F00\uFF1BChrome \u7684 :visited \u7D2B\u8272\u94FE\u63A5\u65E0\u6CD5\u7531\u811A\u672C\u8BFB\u53D6\u3002");
      return;
    }
    const scan = { cancelled: false };
    batchProgressScanState = scan;
    button.style.background = "#b36b22";
    button.textContent = "\u6B63\u5728\u67E5\u627E\u5206\u9875\uFF08\u518D\u6B21\u70B9\u51FB\u505C\u6B62\uFF09";
    try {
      const config = batchOpenHistoryConfig();
      const result = await scanBatchProgressPages({
        startUrl: firstBatchListPageUrl(location.href, config.kind),
        currentUrl: location.href,
        currentDocument: document,
        historyIds,
        loadPage: requestBatchListPageHtml,
        collectThreads: collectForumThreadLinks,
        getId: batchOpenHistoryId,
        getIds: batchThreadHistoryKeys,
        getScope: batchProgressScopeKey,
        maxPages: 120,
        onProgress: ({ checked, opened, unopened }) => {
          button.textContent = `\u505C\u6B62\u67E5\u627E \xB7 \u7B2C ${checked} \u9875\uFF08\u5DF2\u5F00 ${opened} / \u672A\u5F00 ${unopened}\uFF09`;
        },
        cancelled: () => scan.cancelled
      });
      if (scan.cancelled || result.status === "cancelled") return;
      if (result.status === "found") {
        button.textContent = `\u5DF2\u5B9A\u4F4D\u5230\u7B2C ${result.checked} \u9875`;
        rememberBatchProgressTarget(result.url);
        if (result.url !== location.href) window.location.assign(result.url);
        else {
          const history = new Set(historyIds);
          const firstUnopened = collectForumThreadLinks(document).find((thread) => !isBatchThreadVisited(thread, history));
          firstUnopened?.link?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        }
        return;
      }
      if (result.status === "unreadable") {
        window.alert(`\u7B2C ${result.checked + 1} \u9875\u672A\u8BFB\u53D6\u5230\u4E3B\u9898\uFF08\u53EF\u80FD\u9700\u8981\u767B\u5F55\u6216\u89E6\u53D1\u4E86\u7F51\u7AD9\u9A8C\u8BC1\uFF09\uFF0C\u4E0D\u80FD\u53EF\u9760\u5B9A\u4F4D\u6D4F\u89C8\u8FDB\u5EA6\u3002
${result.pageUrl}`);
      } else if (result.status === "limit") {
        window.alert("\u5DF2\u68C0\u67E5\u524D 120 \u9875\uFF0C\u4ECD\u672A\u627E\u5230\u5DF2\u6253\u5F00\u4E0E\u672A\u6253\u5F00\u4E3B\u9898\u7684\u4EA4\u754C\u5904\u3002\u8BF7\u5728\u66F4\u63A5\u8FD1\u5386\u53F2\u8FDB\u5EA6\u7684\u5217\u8868\u9875\u5C1D\u8BD5\uFF0C\u6216\u589E\u52A0\u626B\u63CF\u4E0A\u9650\u3002");
      } else if (result.status === "end") {
        window.alert(result.visitedFound ? "\u5DF2\u68C0\u67E5\u5B8C\u80FD\u8BBF\u95EE\u7684\u5206\u9875\uFF0C\u6CA1\u6709\u627E\u5230\u660E\u786E\u7684\u5DF2\u6253\u5F00/\u672A\u6253\u5F00\u5206\u754C\u9875\u3002" : "\u5DF2\u68C0\u67E5\u5B8C\u80FD\u8BBF\u95EE\u7684\u5206\u9875\uFF0C\u4F46\u6CA1\u6709\u5728\u8FD9\u4E9B\u4E3B\u9898\u4E2D\u627E\u5230\u811A\u672C\u4FDD\u5B58\u7684\u6253\u5F00\u8BB0\u5F55\u3002");
      } else {
        window.alert("\u65E0\u6CD5\u8BC6\u522B\u5F53\u524D\u5217\u8868\u7684\u5206\u9875\u4F4D\u7F6E\u3002");
      }
    } catch (error) {
      if (!scan.cancelled) {
        window.alert(`\u5B9A\u4F4D\u6D4F\u89C8\u8FDB\u5EA6\u5931\u8D25\uFF1A${error?.message || error}\u3002\u8BF7\u786E\u8BA4\u4E24\u4E2A\u7AD9\u70B9\u5DF2\u767B\u5F55\u4E14\u5206\u9875\u53EF\u4EE5\u6B63\u5E38\u6253\u5F00\u3002`);
      }
    } finally {
      if (batchProgressScanState === scan) batchProgressScanState = null;
      refreshBatchProgressLocatorButton(button);
    }
  }
  function addBatchProgressLocatorButton(host, prependButton = false) {
    if (!host || document.getElementById(BATCH_PROGRESS_BUTTON_ID)) return;
    if (!isBatchProgressLocatorEnabled()) return;
    const button = document.createElement("button");
    button.id = BATCH_PROGRESS_BUTTON_ID;
    button.type = "button";
    Object.assign(button.style, {
      float: "right",
      position: "relative",
      zIndex: "20",
      margin: "0 8px 6px 0",
      padding: "7px 13px",
      border: "1px solid #5f6f7a",
      borderRadius: "5px",
      color: "#fff",
      background: "#6d7d87",
      cursor: "pointer",
      fontSize: "14px",
      lineHeight: "20px"
    });
    button.addEventListener("mouseenter", () => {
      if (!batchProgressScanState) button.style.background = "#56656e";
    });
    button.addEventListener("mouseleave", () => {
      if (!batchProgressScanState) button.style.background = "#6d7d87";
    });
    button.addEventListener("click", () => void locateCurrentBatchProgress(button));
    refreshBatchProgressLocatorButton(button);
    if (prependButton) {
      const batchButton = document.getElementById(BATCH_BUTTON_ID);
      if (batchButton?.parentElement === host) batchButton.after(button);
      else host.prepend(button);
    } else {
      host.append(button);
    }
  }
  function addBatchOpenButton() {
    if (document.getElementById(BATCH_BUTTON_ID)) return;
    const threads = collectForumThreadLinks(document);
    let prependButton = false;
    let host = document.querySelector("#pgt") || document.querySelector("#threadlist .th") || document.querySelector("#threadlist");
    if (!host && isAgaghhhHost(location) && /^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)) {
      const pagination = document.querySelector(".thread-list .pgt");
      if (pagination) {
        host = document.getElementById(BATCH_TOOLBAR_ID);
        if (!host) {
          host = document.createElement("div");
          host.id = BATCH_TOOLBAR_ID;
          Object.assign(host.style, {
            display: "flex",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: "8px",
            padding: "8px 0",
            minHeight: "42px"
          });
          pagination.before(host);
        }
      }
    }
    if (!host) {
      host = document.querySelector("main#genesis-content .archive-description");
      if (host) {
        prependButton = true;
      } else {
        const firstArticle = document.querySelector("main#genesis-content article.entry");
        if (firstArticle) {
          host = document.createElement("div");
          host.id = BATCH_TOOLBAR_ID;
          Object.assign(host.style, {
            minHeight: "42px",
            margin: "0 0 16px"
          });
          firstArticle.before(host);
        }
      }
    }
    if (!threads.length || !host) return;
    const button = document.createElement("button");
    button.id = BATCH_BUTTON_ID;
    button.type = "button";
    Object.assign(button.style, {
      float: "right",
      position: "relative",
      zIndex: "20",
      margin: "0 8px 6px 12px",
      padding: "7px 13px",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "14px",
      lineHeight: "20px"
    });
    setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
    button.addEventListener("mouseenter", () => {
      if (!batchOpenState) button.style.background = "#246eaf";
    });
    button.addEventListener("mouseleave", () => {
      if (!batchOpenState) button.style.background = "#398bd4";
    });
    button.addEventListener("click", () => void openCurrentPageThreads(button));
    if (prependButton) {
      button.style.margin = "0 0 0 12px";
      host.prepend(button);
    } else {
      host.append(button);
    }
    addBatchProgressLocatorButton(host, prependButton);
  }
  function observeModernBoard() {
    if (!isAgaghhhHost(location) || currentHost() === LEGACY_AGAGHHH_DOMAIN) return;
    if (!document.body || typeof window.MutationObserver !== "function") return;
    let timer = null;
    let previousUrl = location.href;
    const detectRouteChange = () => {
      if (location.href === previousUrl) return false;
      previousUrl = location.href;
      if (isThreadPage() && isBatchOpenHistoryEnabled()) rememberBatchOpenedThread(location.href);
      if (isThreadPage() && (typeof GM_getValue !== "function" || GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) !== false)) addDownloadButton();
      window.dispatchEvent(new window.Event("x1080x-ex:routechange"));
      return true;
    };
    const refresh = () => {
      timer = null;
      if (isThreadPage()) {
        if (typeof GM_getValue !== "function" || GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) !== false) addDownloadButton();
        return;
      }
      if (!/^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)) return;
      startAutomaticLegacyHistoryMigration();
      applyBatchOpenHistory(document);
      if (isBatchOpenEnabledForCurrentHost()) {
        addBatchOpenButton();
        const button = document.getElementById(BATCH_BUTTON_ID);
        if (button && !batchOpenState) {
          setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
        }
      }
    };
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 120);
    };
    const observer = new window.MutationObserver((mutations) => {
      if (detectRouteChange()) {
        schedule();
        return;
      }
      if (isThreadPage()) {
        if (typeof GM_getValue !== "function" || GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) !== false) addDownloadButton();
        return;
      }
      if (!/^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)) return;
      if (!mutations.some((mutation) => mutation.target?.matches?.(".thread-list, .thread-row, .thread-line, .pgt") || [...mutation.addedNodes].some((node) => node.nodeType === 1 && (node.matches?.(".thread-list, .thread-row, .resource-title, .pgt") || node.querySelector?.(".thread-list, .thread-row, .resource-title, .pgt"))))) return;
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", () => {
      detectRouteChange();
      schedule();
    });
  }
  registerSettingsMenu();
  if (isAllowedHost(location.hostname, getConfiguredDomains())) {
    const expandHdblogPreview = typeof GM_getValue !== "function" || GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, true) !== false;
    if (expandHdblogPreview) expandHdblogPreviewImages();
    if (isThreadPage()) {
      if (isAgaghhhHost(location) && isBatchOpenHistoryEnabled()) {
        rememberBatchOpenedThread(location.href);
      }
      addDownloadButton();
    }
    if (isBatchOpenPage()) {
      applyBatchOpenHistory(document);
      if (isBatchOpenEnabledForCurrentHost()) addBatchOpenButton();
    }
    startAutomaticLegacyHistoryMigration();
    observeModernBoard();
  }

  // src/clipboard.js
  async function copyTextToClipboard(document2, value, gmSetClipboard = globalThis.GM_setClipboard) {
    const text = String(value ?? "").trim();
    if (!text) throw new Error("\u6CA1\u6709\u8BC6\u522B\u5230\u5F71\u7247\u756A\u53F7\u3002");
    if (typeof gmSetClipboard === "function") {
      await Promise.resolve(gmSetClipboard(text, "text"));
      return text;
    }
    const clipboard = document2?.defaultView?.navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return text;
    }
    if (!document2?.body) throw new Error("\u5F53\u524D\u9875\u9762\u65E0\u6CD5\u8BBF\u95EE\u526A\u5207\u677F\u3002");
    const textarea = document2.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    Object.assign(textarea.style, {
      position: "fixed",
      left: "-9999px",
      top: "0",
      opacity: "0"
    });
    document2.body.append(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = typeof document2.execCommand === "function" && document2.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u81EA\u52A8\u590D\u5236\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u3002");
    return text;
  }
  async function copyCodeWithButtonFeedback(button, document2, code) {
    if (!button) return false;
    const originalText = button.textContent || "\u{1F4CB}";
    const originalTitle = button.title || "\u590D\u5236\u756A\u53F7\u5230\u526A\u5207\u677F";
    button.disabled = true;
    try {
      const copied = await copyTextToClipboard(document2, code);
      button.textContent = "\u2713";
      button.title = `\u5DF2\u590D\u5236\uFF1A${copied}`;
      return true;
    } catch (error) {
      button.textContent = "!";
      button.title = error?.message || "\u590D\u5236\u756A\u53F7\u5931\u8D25";
      document2?.defaultView?.alert?.(`\u590D\u5236\u756A\u53F7\u5931\u8D25\uFF1A${error?.message || error}`);
      return false;
    } finally {
      document2?.defaultView?.setTimeout?.(() => {
        button.disabled = false;
        button.textContent = originalText;
        button.title = originalTitle;
      }, 1200);
    }
  }

  // src/hdblog-search.js
  var STORAGE_KEY2 = "x1080x-ex:hdblog-blocked-keywords";
  var HDBLOG_SEARCH_FILTER_ENABLED_KEY = "x1080x-ex:hdblog-search-filter-enabled";
  var HDBLOG_BROWSE_FILTER_ENABLED_KEY = "x1080x-ex:hdblog-browse-filter-enabled";
  var DEFAULT_BLOCKED_KEYWORDS = "\u30E2\u30B6\u30A4\u30AF\u7834\u58CA";
  function normalizeKeyword(value) {
    return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }
  function parseBlockedKeywords(value) {
    const seen = /* @__PURE__ */ new Set();
    const keywords = [];
    String(value ?? "").split(/[\r\n,;，；]+/).map((entry) => entry.trim()).filter(Boolean).forEach((entry) => {
      const normalized = normalizeKeyword(entry);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      keywords.push(entry);
    });
    return keywords;
  }
  function isBlockedTitle(title, keywords) {
    const normalizedTitle = normalizeKeyword(title);
    return keywords.some((keyword) => {
      const normalizedKeyword = normalizeKeyword(keyword);
      return normalizedKeyword && normalizedTitle.includes(normalizedKeyword);
    });
  }
  function isHdblogUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      return host === "hdblog.me" || host.endsWith(".hdblog.me");
    } catch {
      return false;
    }
  }
  function isHdblogSearchUrl(value) {
    try {
      const url = new URL(value);
      return isHdblogUrl(url.href) && url.searchParams.has("s") && Boolean(url.searchParams.get("s")?.trim());
    } catch {
      return false;
    }
  }
  function isHdblogArticleUrl(value) {
    try {
      const url = new URL(value);
      return isHdblogUrl(url.href) && /^\/\d+\/[^/]+\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }
  function filterSearchCandidates(candidates, keywords) {
    const blocked = [];
    const remaining = [];
    for (const candidate of candidates) {
      (isBlockedTitle(candidate.title, keywords) ? blocked : remaining).push(candidate);
    }
    return { blocked, remaining };
  }
  function redirectTargetForSearch(candidates) {
    return candidates.length === 1 ? candidates[0].url : "";
  }
  function collectHdblogSearchResults(document2) {
    const baseUrl = new URL(document2.baseURI);
    return [...document2.querySelectorAll("main#genesis-content article.entry")].map((article) => {
      const link = article.querySelector(
        ".entry-header .entry-title a[href], h2.entry-title a[href], .entry-title a[href]"
      );
      if (!link) return null;
      try {
        const url = new URL(link.getAttribute("href"), document2.baseURI);
        if (!/^https?:$/.test(url.protocol) || url.origin !== baseUrl.origin) return null;
        return {
          article,
          link,
          title: String(link.textContent ?? "").replace(/\s+/g, " ").trim(),
          url: url.href
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
  function filterHdblogSearchResults(document2, keywords) {
    const candidates = collectHdblogSearchResults(document2);
    const { blocked, remaining } = filterSearchCandidates(candidates, keywords);
    blocked.forEach(({ article }) => article.remove());
    return { blocked, remaining };
  }
  function getBlockedKeywords() {
    const stored = typeof GM_getValue === "function" ? GM_getValue(STORAGE_KEY2, null) : null;
    if (stored === null || stored === void 0) {
      return parseBlockedKeywords(DEFAULT_BLOCKED_KEYWORDS);
    }
    return parseBlockedKeywords(stored);
  }
  function isHdblogSearchEnhancementEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY, true) !== false;
  }
  function isHdblogBrowseFilterEnabled() {
    if (typeof GM_getValue !== "function") return false;
    return GM_getValue(HDBLOG_BROWSE_FILTER_ENABLED_KEY, false) === true;
  }
  function applyHdblogSearchEnhancement(windowObject = window) {
    if (!isHdblogSearchEnhancementEnabled() || !isHdblogSearchUrl(windowObject.location.href)) {
      return { blocked: [], remaining: [], redirectTarget: "" };
    }
    const keywords = getBlockedKeywords();
    const result = filterHdblogSearchResults(windowObject.document, keywords);
    const redirectTarget = redirectTargetForSearch(result.remaining);
    if (redirectTarget && redirectTarget !== windowObject.location.href) {
      windowObject.location.assign(redirectTarget);
    }
    return { ...result, redirectTarget };
  }
  function applyHdblogBrowseEnhancement(windowObject = window) {
    const href = windowObject.location.href;
    if (!isHdblogBrowseFilterEnabled() || !isHdblogUrl(href) || isHdblogSearchUrl(href) || isHdblogArticleUrl(href)) {
      return { blocked: [], remaining: [] };
    }
    return filterHdblogSearchResults(windowObject.document, getBlockedKeywords());
  }
  function installHdblogSearchEnhancement() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (isHdblogSearchUrl(window.location.href)) {
      applyHdblogSearchEnhancement(window);
      return;
    }
    applyHdblogBrowseEnhancement(window);
  }

  // src/hdblog-preview-variants.js
  var FOUR_K_PREVIEW_TOKEN_PATTERN = /(?:^|[^a-z0-9])(?:4k(?:\d{2,3}fps)?|2160p|uhd)(?=$|[^a-z0-9])/i;
  function searchablePreviewValue(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, "https://example.invalid/");
      return decodeURIComponent(url.pathname);
    } catch {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  function isFourKPreviewValue(value) {
    return FOUR_K_PREVIEW_TOKEN_PATTERN.test(searchablePreviewValue(value));
  }
  function isFourKPreviewCandidate(candidate) {
    if (typeof candidate === "string") return isFourKPreviewValue(candidate);
    if (!candidate || typeof candidate !== "object") return false;
    const values = [
      candidate.href,
      candidate.pixhostShowUrl,
      candidate.directUrl,
      candidate.thumbUrl,
      ...Array.isArray(candidate.values) ? candidate.values : []
    ];
    return values.some(isFourKPreviewValue);
  }
  function partitionPreviewCandidates(candidates = []) {
    const standard = [];
    const fourK = [];
    for (const candidate of candidates) {
      (isFourKPreviewCandidate(candidate) ? fourK : standard).push(candidate);
    }
    return { standard, fourK };
  }

  // src/javfree.js
  var JAVFREE_ORIGIN = "https://javfree.me";
  var REQUEST_TIMEOUT3 = 3e4;
  var HDBLOG_SECTION_ID = "x1080x-ex-hdblog-javfree-preview";
  var JAVFREE_SETTINGS_PANEL_ID = "x1080x-ex-javfree-settings-panel";
  var JAVFREE_DOWNLOAD_BUTTON_ID = "x1080x-ex-javfree-preview-download";
  var JAVFREE_AGAGHHH_SEARCH_BUTTON_ID = "x1080x-ex-javfree-agaghhh-search";
  var JAVFREE_COPY_CODE_BUTTON_ID = "x1080x-ex-javfree-copy-code";
  var JAVFREE_PREVIEW_ATTR = "data-x1080x-javfree-preview-url";
  var PREVIEW_REFERER_ATTR2 = "data-x1080x-preview-referer";
  var AGAGHHH_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY = "x1080x-ex:agaghhh-javfree-preview-fallback-enabled";
  var HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY = "x1080x-ex:hdblog-javfree-preview-fallback-enabled";
  var HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY = "x1080x-ex:hdblog-deleted-javfree-search-enabled";
  var JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY = "x1080x-ex:javfree-search-auto-redirect-enabled";
  var JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY = "x1080x-ex:javfree-preview-download-enabled";
  var JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY = "x1080x-ex:javfree-agaghhh-search-enabled";
  var JAVFREE_COPY_CODE_ENABLED_KEY = "x1080x-ex:javfree-copy-code-enabled";
  var IMAGE_EXTENSION_PATTERN2 = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
  var HDBLOG_BOUNDARY_PATTERN = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function absoluteHttpUrl(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function parseHtml(html, baseUrl, hostDocument = globalThis.document) {
    const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    const parsed = new Parser().parseFromString(String(html || ""), "text/html");
    const base = parsed.createElement("base");
    base.href = baseUrl;
    (parsed.head || parsed.documentElement).prepend(base);
    return parsed;
  }
  function requestText(url, request = globalThis.GM_xmlhttpRequest, referer = "") {
    return new Promise((resolve, reject) => {
      if (typeof request !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      request({
        method: "GET",
        url,
        responseType: "text",
        timeout: REQUEST_TIMEOUT3,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          ...referer ? { Referer: referer } : {}
        },
        onload(response) {
          if (response.status < 200 || response.status >= 400) {
            reject(new Error("\u8BF7\u6C42\u5931\u8D25\uFF08HTTP " + (response.status || 0) + "\uFF09"));
            return;
          }
          resolve({
            html: String(response.responseText ?? response.response ?? ""),
            finalUrl: response.finalUrl || response.responseURL || url
          });
        },
        onerror: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25")),
        ontimeout: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  function requestImageBlob(url, referer, request = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof request !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      request({
        method: "GET",
        url,
        responseType: "blob",
        timeout: REQUEST_TIMEOUT3,
        headers: referer ? { Referer: referer } : void 0,
        onload(response) {
          if (response.status < 200 || response.status >= 300 || !response.response) {
            reject(new Error("\u56FE\u7247\u8BF7\u6C42\u5931\u8D25\uFF08HTTP " + (response.status || 0) + "\uFF09"));
            return;
          }
          resolve(response.response);
        },
        onerror: () => reject(new Error("\u56FE\u7247\u8BF7\u6C42\u5931\u8D25")),
        ontimeout: () => reject(new Error("\u56FE\u7247\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  function readEnabled(key, fallback = true) {
    if (typeof GM_getValue !== "function") return fallback;
    return GM_getValue(key, fallback) !== false;
  }
  function isAgaghhhJavfreePreviewFallbackEnabled() {
    return readEnabled(AGAGHHH_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, true);
  }
  function isHdblogJavfreePreviewFallbackEnabled() {
    return readEnabled(HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, true);
  }
  function isHdblogDeletedJavfreeSearchEnabled() {
    return readEnabled(HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY, true);
  }
  function isJavfreeSearchAutoRedirectEnabled() {
    return readEnabled(JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY, true);
  }
  function isJavfreePreviewDownloadEnabled() {
    return readEnabled(JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY, true);
  }
  function isJavfreeAgaghhhSearchEnabled() {
    return readEnabled(JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY, true);
  }
  function isJavfreeCopyCodeEnabled() {
    return readEnabled(JAVFREE_COPY_CODE_ENABLED_KEY, true);
  }
  function isJavfreeHost(locationObject = globalThis.location) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "javfree.me" || hostname.endsWith(".javfree.me");
  }
  function isHdblogHost2(locationObject = globalThis.location) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "hdblog.me" || hostname.endsWith(".hdblog.me");
  }
  function extractJavfreeVideoCode(value) {
    const source = normalizeText(value).toUpperCase();
    if (!source) return "";
    const fc2 = source.match(/\bFC2[\s_-]*(PPV[\s_-]*)?(\d{5,9})\b/i);
    if (fc2) return "FC2" + (fc2[1] ? "-PPV" : "") + "-" + fc2[2];
    const alphanumericPrefix = source.match(
      /(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{1,11})-(\d{2,8}[A-Z]?)(?:$|[^A-Z0-9])/i
    );
    if (alphanumericPrefix) return alphanumericPrefix[1] + "-" + alphanumericPrefix[2];
    const standard = source.match(
      /(?:^|[^A-Z0-9])([A-Z]{2,12})[\s_-]?(\d{2,8}[A-Z]?)(?:$|[^A-Z0-9])/i
    );
    return standard ? standard[1] + "-" + standard[2] : "";
  }
  function codeTokenMatches(value, code) {
    const target = String(code || "").trim().toUpperCase();
    if (!target) return false;
    const normalized = normalizeText(value).toUpperCase();
    const escaped = target.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[^A-Z0-9])" + escaped + "(?:$|[^A-Z0-9])", "i").test(normalized);
  }
  function javfreeSearchUrl(code) {
    const normalized = String(code || "").trim().toUpperCase();
    return normalized ? JAVFREE_ORIGIN + "/search/" + encodeURIComponent(normalized) : "";
  }
  function isJavfreeArticleUrl(value, baseUrl = JAVFREE_ORIGIN) {
    const href = absoluteHttpUrl(value, baseUrl);
    if (!href) return false;
    try {
      const url = new URL(href);
      return url.origin === JAVFREE_ORIGIN && /^\/\d+\/[^/?#]+\/?$/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function collectJavfreeSearchResults(document2) {
    if (!document2) return [];
    let anchors = [...document2.querySelectorAll(
      "main#main article .entry-title a[href], main.site-main article .entry-title a[href]"
    )];
    if (!anchors.length) anchors = [...document2.querySelectorAll("article .entry-title a[href]")];
    const seen = /* @__PURE__ */ new Set();
    return anchors.map((anchor) => {
      const url = absoluteHttpUrl(anchor.getAttribute("href"), document2.baseURI || JAVFREE_ORIGIN);
      if (!isJavfreeArticleUrl(url) || seen.has(url)) return null;
      seen.add(url);
      return { title: normalizeText(anchor.textContent), url };
    }).filter(Boolean);
  }
  function chooseJavfreeSearchResult(candidates, code = "") {
    const unique = [...new Map(
      (candidates || []).filter(Boolean).map((candidate) => [candidate.url, candidate])
    ).values()];
    if (unique.length === 1) return unique[0];
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return null;
    const slug = normalizedCode.toLowerCase();
    const slugMatches = unique.filter((candidate) => {
      try {
        return new URL(candidate.url).pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() === slug;
      } catch {
        return false;
      }
    });
    if (slugMatches.length === 1) return slugMatches[0];
    const titleMatches = unique.filter((candidate) => codeTokenMatches(candidate.title, normalizedCode));
    return titleMatches.length === 1 ? titleMatches[0] : null;
  }
  function imageUrlFromElement(document2, image) {
    const candidates = [
      image?.getAttribute("data-original"),
      image?.getAttribute("data-lazy-src"),
      image?.getAttribute("data-src"),
      image?.currentSrc,
      image?.getAttribute("src")
    ];
    for (const candidate of candidates) {
      const url = absoluteHttpUrl(candidate, document2.baseURI || JAVFREE_ORIGIN);
      if (url) return url;
    }
    return "";
  }
  function filenameOf(value) {
    try {
      return decodeURIComponent(new URL(value).pathname.split("/").pop() || "").toUpperCase();
    } catch {
      return "";
    }
  }
  function imageMatchesCode(url, code) {
    const compactCode = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const compactFilename = filenameOf(url).replace(/[^A-Z0-9]/g, "");
    return compactCode && compactFilename.includes(compactCode);
  }
  function collectJavfreeArticleImages(document2, code = "") {
    const content = document2?.querySelector(
      "main#main article .entry-content, main.site-main article .entry-content, article .entry-content, .entry-content"
    );
    if (!content) return { coverUrl: "", previewUrl: "", imageUrls: [] };
    const all = [...content.querySelectorAll("img")].map((image) => imageUrlFromElement(document2, image)).filter(Boolean);
    const matching = code ? all.filter((url) => imageMatchesCode(url, code)) : [];
    const imageUrls = matching.length >= 2 ? matching : all;
    if (!imageUrls.length) return { coverUrl: "", previewUrl: "", imageUrls: [] };
    const coverUrl = imageUrls[0] || "";
    const preferred = imageUrls.find((url, index) => index > 0 && /(?:^|[-_])(?:1080p|2160p|4k(?:\d{2,3}fps)?|preview|sample)(?:[-_.]|$)/i.test(filenameOf(url)));
    return {
      coverUrl,
      previewUrl: preferred || imageUrls[1] || "",
      imageUrls
    };
  }
  function javfreeCodeFromDocument(document2, locationObject = document2?.location) {
    const title = document2?.querySelector(
      "main#main article h1.entry-title, article h1.entry-title, h1.entry-title"
    )?.textContent || document2?.title || "";
    const fromTitle = extractJavfreeVideoCode(title);
    if (fromTitle) return fromTitle;
    try {
      const slug = new URL(locationObject?.href || document2?.baseURI || JAVFREE_ORIGIN).pathname.split("/").filter(Boolean).at(-1) || "";
      return extractJavfreeVideoCode(slug);
    } catch {
      return "";
    }
  }
  function buildJavfreeAgaghhhSearchUrl(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return "";
    const fc2 = normalized.match(/^FC2[-_ ]*(?:PPV[-_ ]*)?(\d{5,9})$/i);
    return `${getAgaghhhOrigin()}/search?q=${encodeURIComponent(fc2 ? fc2[1] : normalized)}`;
  }
  function openJavfreeAgaghhhSearch(document2, code) {
    const url = buildJavfreeAgaghhhSearchUrl(code);
    if (!url) return false;
    if (typeof GM_openInTab === "function") {
      try {
        GM_openInTab(url, { active: true, insert: true, setParent: true });
        return true;
      } catch (error) {
        console.warn("[x1080x-ex] JavFree agaghhh search GM_openInTab failed", {
          url,
          error: error?.message || String(error)
        });
      }
    }
    return Boolean(document2.defaultView?.open?.(url, "_blank"));
  }
  function styleJavfreeActionButton(button) {
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      margin: "0 0 4px 8px",
      padding: "5px 8px",
      minWidth: "34px",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "20px"
    });
    button.addEventListener("mouseenter", () => {
      if (!button.disabled) button.style.background = "#246eaf";
    });
    button.addEventListener("mouseleave", () => {
      if (!button.disabled) button.style.background = "#398bd4";
    });
  }
  function installJavfreeAgaghhhSearchButton(document2, locationObject) {
    if (!isJavfreeAgaghhhSearchEnabled() || document2.getElementById(JAVFREE_AGAGHHH_SEARCH_BUTTON_ID)) {
      return null;
    }
    let url;
    try {
      url = new URL(locationObject?.href || document2.baseURI);
    } catch {
      return null;
    }
    if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return null;
    const title = document2.querySelector(
      "main#main article h1.entry-title, article h1.entry-title, h1.entry-title"
    );
    const code = javfreeCodeFromDocument(document2, locationObject);
    if (!title || !code) return null;
    const button = document2.createElement("button");
    button.id = JAVFREE_AGAGHHH_SEARCH_BUTTON_ID;
    button.type = "button";
    button.textContent = "\u{1F50D}";
    button.title = "\u6309\u5F53\u524D\u756A\u53F7\u5728 x1080x \u641C\u7D22";
    button.setAttribute("aria-label", "\u5728 x1080x \u641C\u7D22\u5F53\u524D\u756A\u53F7");
    styleJavfreeActionButton(button);
    button.addEventListener("click", () => {
      openJavfreeAgaghhhSearch(document2, javfreeCodeFromDocument(document2, locationObject));
    });
    title.append(button);
    return button;
  }
  function installJavfreeCopyCodeButton(document2, locationObject) {
    if (!isJavfreeCopyCodeEnabled() || document2.getElementById(JAVFREE_COPY_CODE_BUTTON_ID)) {
      return null;
    }
    let url;
    try {
      url = new URL(locationObject?.href || document2.baseURI);
    } catch {
      return null;
    }
    if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return null;
    const title = document2.querySelector(
      "main#main article h1.entry-title, article h1.entry-title, h1.entry-title"
    );
    const code = javfreeCodeFromDocument(document2, locationObject);
    if (!title || !code) return null;
    const button = document2.createElement("button");
    button.id = JAVFREE_COPY_CODE_BUTTON_ID;
    button.type = "button";
    button.textContent = "\u{1F4CB}";
    button.title = "\u590D\u5236\u5F53\u524D\u756A\u53F7\u5230\u526A\u5207\u677F";
    button.setAttribute("aria-label", "\u590D\u5236\u5F53\u524D\u756A\u53F7\u5230\u526A\u5207\u677F");
    styleJavfreeActionButton(button);
    button.addEventListener("click", () => {
      void copyCodeWithButtonFeedback(
        button,
        document2,
        javfreeCodeFromDocument(document2, locationObject)
      );
    });
    title.append(button);
    return button;
  }
  async function fetchJavfreePreviewForCode(code, request = globalThis.GM_xmlhttpRequest, hostDocument = globalThis.document) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const empty = {
      code: normalizedCode,
      sourceName: "JavFree",
      sourceUrl: "",
      articleUrl: "",
      referer: "",
      imageUrls: []
    };
    if (!normalizedCode) return empty;
    const searchUrl = javfreeSearchUrl(normalizedCode);
    const search = await requestText(searchUrl, request, JAVFREE_ORIGIN + "/");
    let articleUrl = "";
    let articleHtml = "";
    let articleFinalUrl = "";
    if (isJavfreeArticleUrl(search.finalUrl, JAVFREE_ORIGIN)) {
      articleUrl = search.finalUrl;
      articleHtml = search.html;
      articleFinalUrl = search.finalUrl;
    } else {
      const searchDocument = parseHtml(search.html, search.finalUrl || searchUrl, hostDocument);
      const selected = chooseJavfreeSearchResult(
        collectJavfreeSearchResults(searchDocument),
        normalizedCode
      );
      if (!selected) return { ...empty, sourceUrl: searchUrl };
      articleUrl = selected.url;
      const article = await requestText(articleUrl, request, searchUrl);
      articleHtml = article.html;
      articleFinalUrl = article.finalUrl || articleUrl;
    }
    const articleDocument = parseHtml(articleHtml, articleFinalUrl || articleUrl, hostDocument);
    const images = collectJavfreeArticleImages(articleDocument, normalizedCode);
    return {
      code: normalizedCode,
      sourceName: "JavFree",
      sourceUrl: articleUrl,
      articleUrl,
      referer: articleUrl,
      coverUrl: images.coverUrl,
      imageUrls: images.previewUrl ? [images.previewUrl] : []
    };
  }
  function javfreeUniqueSearchTarget(document2, locationObject = document2?.location) {
    if (!document2 || !isJavfreeHost(locationObject)) return "";
    let url;
    try {
      url = new URL(locationObject?.href || document2.baseURI);
    } catch {
      return "";
    }
    if (!/^\/search(?:\/|$)/i.test(url.pathname)) return "";
    const results = collectJavfreeSearchResults(document2);
    return results.length === 1 ? results[0].url : "";
  }
  function extensionFromBlob(blob, url) {
    const type = String(blob?.type || "").toLowerCase();
    if (type.includes("jpeg")) return "jpg";
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    if (type.includes("avif")) return "avif";
    try {
      const match = new URL(url).pathname.match(/\.((?:jpe?g|png|webp|gif|avif))$/i);
      return match?.[1]?.toLowerCase().replace("jpeg", "jpg") || "jpg";
    } catch {
      return "jpg";
    }
  }
  function saveBlob(document2, blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document2.createElement("a");
    anchor.hidden = true;
    anchor.href = objectUrl;
    anchor.download = filename;
    document2.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      document2.defaultView?.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  }
  async function downloadJavfreePreview(button, document2, locationObject, request) {
    const code = javfreeCodeFromDocument(document2, locationObject);
    const previewUrl = collectJavfreeArticleImages(document2, code).previewUrl;
    if (!code || !previewUrl) return;
    button.disabled = true;
    button.textContent = "\u4E0B\u8F7D\u4E2D\u2026";
    try {
      const blob = await requestImageBlob(previewUrl, locationObject?.href || document2.baseURI, request);
      saveBlob(document2, blob, code + "." + extensionFromBlob(blob, previewUrl));
      button.textContent = "\u2713";
    } catch (error) {
      button.textContent = "\u5931\u8D25";
      button.title = error?.message || "Preview \u4E0B\u8F7D\u5931\u8D25";
    } finally {
      document2.defaultView?.setTimeout(() => {
        button.disabled = false;
        button.textContent = "\u2B07";
        button.title = "\u4E0B\u8F7D JavFree Preview\uFF0C\u5E76\u6309\u756A\u53F7\u547D\u540D";
      }, 2500);
    }
  }
  function installJavfreePreviewDownloadButton(document2, locationObject, request) {
    if (!isJavfreePreviewDownloadEnabled() || document2.getElementById(JAVFREE_DOWNLOAD_BUTTON_ID)) {
      return null;
    }
    let url;
    try {
      url = new URL(locationObject?.href || document2.baseURI);
    } catch {
      return null;
    }
    if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return null;
    const title = document2.querySelector("main#main article h1.entry-title, article h1.entry-title, h1.entry-title");
    const code = javfreeCodeFromDocument(document2, locationObject);
    const previewUrl = collectJavfreeArticleImages(document2, code).previewUrl;
    if (!title || !code || !previewUrl) return null;
    const button = document2.createElement("button");
    button.id = JAVFREE_DOWNLOAD_BUTTON_ID;
    button.type = "button";
    button.textContent = "\u2B07";
    button.title = "\u4E0B\u8F7D JavFree Preview\uFF0C\u5E76\u6309\u756A\u53F7\u547D\u540D";
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      margin: "0 0 4px 8px",
      padding: "5px 8px",
      minWidth: "34px",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "20px"
    });
    button.addEventListener("click", () => void downloadJavfreePreview(
      button,
      document2,
      locationObject,
      request
    ));
    title.append(button);
    return button;
  }
  function closeJavfreeSettingsPanel(document2) {
    document2?.getElementById(JAVFREE_SETTINGS_PANEL_ID)?.remove();
  }
  function openJavfreeSettingsPanel(document2 = globalThis.document) {
    if (!document2?.body) return null;
    closeJavfreeSettingsPanel(document2);
    const overlay = document2.createElement("div");
    overlay.id = JAVFREE_SETTINGS_PANEL_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "rgba(0,0,0,.42)",
      boxSizing: "border-box"
    });
    const form = document2.createElement("form");
    Object.assign(form.style, {
      width: "min(480px, 100%)",
      padding: "22px",
      borderRadius: "10px",
      background: "#fff",
      color: "#222",
      boxShadow: "0 18px 60px rgba(0,0,0,.28)",
      boxSizing: "border-box",
      font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    });
    form.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">JavFree \u8BBE\u7F6E</h2>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
      <input data-setting="search-auto-redirect" type="checkbox" style="margin-top:3px">
      <span><strong>\u641C\u7D22\u5355\u7ED3\u679C\u81EA\u52A8\u8DF3\u8F6C</strong><small style="display:block;margin-top:2px;color:#666">\u641C\u7D22\u9875\u53EA\u6709 1 \u4E2A\u552F\u4E00\u6587\u7AE0\u7ED3\u679C\u65F6\u81EA\u52A8\u8FDB\u5165\u8BE6\u60C5\u9875\u3002</small></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
      <input data-setting="agaghhh-search" type="checkbox" style="margin-top:3px">
      <span><strong>x1080x \u641C\u7D22\u6309\u94AE\uFF08\u{1F50D}\uFF09</strong><small style="display:block;margin-top:2px;color:#666">\u8BE6\u60C5\u9875\u8BC6\u522B\u5F53\u524D\u756A\u53F7\uFF0C\u5E76\u5728 x1080x \u7AD9\u70B9\u641C\u7D22\u3002</small></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
      <input data-setting="copy-code" type="checkbox" style="margin-top:3px">
      <span><strong>\u590D\u5236\u756A\u53F7\u6309\u94AE\uFF08\u{1F4CB}\uFF09</strong><small style="display:block;margin-top:2px;color:#666">\u8BE6\u60C5\u9875\u6807\u9898\u65C1\u663E\u793A\u590D\u5236\u6309\u94AE\uFF0C\u884C\u4E3A\u4E0E HDblog \u4E00\u81F4\u3002</small></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:9px">
      <input data-setting="preview-download" type="checkbox" style="margin-top:3px">
      <span><strong>Preview \u4E0B\u8F7D\u6309\u94AE</strong><small style="display:block;margin-top:2px;color:#666">\u8BE6\u60C5\u9875\u6807\u9898\u65C1\u663E\u793A\u4E0B\u8F7D\u6309\u94AE\uFF0C\u53EA\u4E0B\u8F7D\u5C01\u9762\u540E\u7684 Preview\uFF0C\u5E76\u6309\u756A\u53F7\u547D\u540D\u3002</small></span>
    </label>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
      <button type="button" data-action="cancel" style="padding:7px 14px">\u53D6\u6D88</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">\u4FDD\u5B58</button>
    </div>`;
    organizeSettingsPanel(form, [
      {
        "key": "search",
        "title": "\u641C\u7D22\u529F\u80FD",
        "description": "\u81EA\u52A8\u8DF3\u8F6C\u4E0E\u8DE8\u7AD9\u641C\u7D22",
        "settings": [
          "search-auto-redirect",
          "agaghhh-search"
        ]
      },
      {
        "key": "buttons",
        "title": "\u6587\u7AE0\u64CD\u4F5C",
        "description": "\u5FEB\u901F\u590D\u5236\u756A\u53F7\u53CA\u4E0B\u8F7D\u9884\u89C8\u56FE",
        "settings": [
          "copy-code",
          "preview-download"
        ]
      }
    ]);
    const redirectInput = form.querySelector('[data-setting="search-auto-redirect"]');
    const agaghhhSearchInput = form.querySelector('[data-setting="agaghhh-search"]');
    const copyCodeInput = form.querySelector('[data-setting="copy-code"]');
    const downloadInput = form.querySelector('[data-setting="preview-download"]');
    redirectInput.checked = isJavfreeSearchAutoRedirectEnabled();
    agaghhhSearchInput.checked = isJavfreeAgaghhhSearchEnabled();
    copyCodeInput.checked = isJavfreeCopyCodeEnabled();
    downloadInput.checked = isJavfreePreviewDownloadEnabled();
    form.querySelector('[data-action="cancel"]')?.addEventListener(
      "click",
      () => closeJavfreeSettingsPanel(document2)
    );
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeJavfreeSettingsPanel(document2);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (typeof GM_setValue === "function") {
        GM_setValue(JAVFREE_SEARCH_AUTO_REDIRECT_ENABLED_KEY, redirectInput.checked);
        GM_setValue(JAVFREE_AGAGHHH_SEARCH_ENABLED_KEY, agaghhhSearchInput.checked);
        GM_setValue(JAVFREE_COPY_CODE_ENABLED_KEY, copyCodeInput.checked);
        GM_setValue(JAVFREE_PREVIEW_DOWNLOAD_ENABLED_KEY, downloadInput.checked);
      }
      closeJavfreeSettingsPanel(document2);
      document2.defaultView?.location?.reload?.();
    });
    overlay.append(form);
    document2.body.append(overlay);
    return overlay;
  }
  function registerJavfreeSettingsMenu(document2, locationObject) {
    if (!isJavfreeHost(locationObject) || typeof GM_registerMenuCommand !== "function") return;
    const view = document2?.defaultView;
    if (view && view.top !== view) return;
    GM_registerMenuCommand("\u2699\uFE0F JavFree \u8BBE\u7F6E", () => openJavfreeSettingsPanel(document2));
  }
  function installJavfreeEnhancement(document2 = globalThis.document, locationObject = globalThis.location, request = globalThis.GM_xmlhttpRequest) {
    if (!document2 || !isJavfreeHost(locationObject)) return null;
    registerJavfreeSettingsMenu(document2, locationObject);
    if (isJavfreeSearchAutoRedirectEnabled()) {
      const target = javfreeUniqueSearchTarget(document2, locationObject);
      if (target && typeof locationObject?.replace === "function") {
        locationObject.replace(target);
        return { redirectTarget: target, button: null };
      }
    }
    const downloadButton = installJavfreePreviewDownloadButton(document2, locationObject, request);
    const copyButton = installJavfreeCopyCodeButton(document2, locationObject);
    const searchButton = installJavfreeAgaghhhSearchButton(document2, locationObject);
    return {
      redirectTarget: "",
      searchButton,
      copyButton,
      button: downloadButton
    };
  }
  function hdblogCodeFromLocation(document2, locationObject) {
    try {
      const slug = new URL(locationObject?.href || document2?.baseURI || "").pathname.split("/").filter(Boolean).at(-1) || "";
      const slugCode = extractJavfreeVideoCode(slug);
      if (slugCode && !/^ERROR-?404$/i.test(slugCode)) return slugCode;
    } catch {
    }
    const titleCode = extractJavfreeVideoCode(
      document2?.querySelector("h1.entry-title, #genesis-content h1, h1")?.textContent || ""
    );
    return /^ERROR-?404$/i.test(titleCode) ? "" : titleCode;
  }
  function isDeletedHdblogArticlePage(document2, locationObject = document2?.location) {
    if (!document2 || !isHdblogHost2(locationObject)) return false;
    let url;
    try {
      url = new URL(locationObject?.href || document2.baseURI);
    } catch {
      return false;
    }
    if (!/^\/\d+\/[^/?#]+\/?$/i.test(url.pathname)) return false;
    const bodyClass = String(document2.body?.className || "");
    const signalTexts = [
      document2.title,
      document2.querySelector("h1, .entry-title, .page-title")?.textContent
    ].map(normalizeText).filter(Boolean);
    const has404Signal = /(?:^|\s)(?:error404|error-404|not-found)(?:\s|$)/i.test(bodyClass) || signalTexts.some((text) => /(?:\berror[-\s]?404\b|page\s+not\s+found|not\s+found)/i.test(text) || /^404(?:$|\s|[|:–—])/i.test(text));
    if (has404Signal) return true;
    return !document2.querySelector(
      "main#genesis-content article.entry h1.entry-title, article.entry h1.entry-title"
    );
  }
  function openJavfreeSearchTab(document2, code) {
    const url = javfreeSearchUrl(code);
    if (!url) return false;
    const key = "x1080x-ex:hdblog-javfree-opened:" + (document2?.location?.pathname || code);
    try {
      if (document2.defaultView?.sessionStorage?.getItem(key) === "1") return false;
      document2.defaultView?.sessionStorage?.setItem(key, "1");
    } catch {
    }
    if (typeof GM_openInTab === "function") {
      try {
        GM_openInTab(url, { active: true, insert: true, setParent: true });
        return true;
      } catch (error) {
        console.warn("[x1080x-ex] GM_openInTab failed, fallback to window.open", {
          url,
          error: error?.message || String(error)
        });
      }
    }
    const opened = document2.defaultView?.open?.(url, "_blank");
    return Boolean(opened);
  }
  function textNodesUnder(root) {
    const view = root?.ownerDocument?.defaultView;
    const showText = view?.NodeFilter?.SHOW_TEXT ?? 4;
    const walker = root?.ownerDocument?.createTreeWalker?.(root, showText);
    if (!walker) return [];
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest("script, style, noscript, textarea")) nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }
  function isAfter(reference, node) {
    return Boolean(reference?.compareDocumentPosition(node) & 4);
  }
  function hdblogPreviewRange(document2) {
    const content = document2?.querySelector(
      "main#genesis-content article.entry .entry-content, article.entry .entry-content, .entry-content"
    );
    if (!content) return null;
    const nodes = textNodesUnder(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter(marker, node) && HDBLOG_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))) || null;
    return { content, marker, boundary };
  }
  function inHdblogPreviewRange(range, node) {
    if (!range || !isAfter(range.marker, node)) return false;
    return !range.boundary || !isAfter(range.boundary, node);
  }
  async function hasUsableHdblogPreview(document2, request) {
    const range = hdblogPreviewRange(document2);
    if (!range) return false;
    if ([...range.content.querySelectorAll(
      'img[data-x1080x-preview-large="1"], img[data-x1080x-preview-expanded="1"]'
    )].some((image) => inHdblogPreviewRange(range, image))) {
      return true;
    }
    const anchors = [...range.content.querySelectorAll("a[href]")].filter((anchor) => inHdblogPreviewRange(range, anchor));
    for (const anchor of anchors) {
      const href = absoluteHttpUrl(anchor.getAttribute("href"), document2.baseURI);
      if (!href) continue;
      if (isPixhostShowUrl(href, document2.baseURI)) {
        const thumb = imageUrlFromElement(document2, anchor.querySelector("img"));
        try {
          if (await resolvePixhostShowUrl(document2, href, thumb, request)) return true;
        } catch {
        }
        continue;
      }
      if (IMAGE_EXTENSION_PATTERN2.test(href)) return true;
    }
    return [...range.content.querySelectorAll("img")].filter((image) => inHdblogPreviewRange(range, image)).some((image) => {
      const anchor = image.closest("a[href]");
      if (anchor && isPixhostShowUrl(anchor.getAttribute("href"), document2.baseURI)) return false;
      return Boolean(imageUrlFromElement(document2, image));
    });
  }
  function renderHdblogJavfreePreview(document2, result) {
    if (!document2 || !result?.imageUrls?.length || document2.getElementById(HDBLOG_SECTION_ID)) {
      return null;
    }
    const content = document2.querySelector(
      "main#genesis-content article.entry .entry-content, article.entry .entry-content, .entry-content"
    );
    if (!content) return null;
    const url = absoluteHttpUrl(result.imageUrls[0], result.articleUrl || JAVFREE_ORIGIN);
    if (!url) return null;
    const section = document2.createElement("section");
    section.id = HDBLOG_SECTION_ID;
    section.style.cssText = "clear:both;margin:24px 0 8px;padding:16px 0 0;border-top:1px solid #ddd";
    const heading = document2.createElement("div");
    heading.style.cssText = "margin:0 0 12px;font-size:15px;font-weight:700;color:#444";
    const source = document2.createElement("a");
    source.href = result.articleUrl || result.sourceUrl || JAVFREE_ORIGIN;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "JavFree Preview \xB7 " + (result.code || "");
    source.style.cssText = "color:inherit;text-decoration:none";
    heading.append(source);
    const anchor = document2.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.cssText = "display:block;clear:both;margin:14px 0;text-align:center";
    const image = document2.createElement("img");
    image.src = url;
    image.alt = ((result.code || "") + " Preview").trim();
    image.loading = "eager";
    image.decoding = "async";
    image.setAttribute(JAVFREE_PREVIEW_ATTR, url);
    image.setAttribute(
      PREVIEW_REFERER_ATTR2,
      result.referer || result.articleUrl || JAVFREE_ORIGIN
    );
    image.style.cssText = "display:block;width:auto;height:auto;max-width:100%;margin:0 auto;object-fit:contain";
    anchor.append(image);
    makePreviewGestureFriendly(image);
    section.append(heading, anchor);
    content.append(section);
    return section;
  }
  async function installHdblogJavfreeFallback(document2 = globalThis.document, locationObject = globalThis.location, request = globalThis.GM_xmlhttpRequest) {
    if (!document2 || !isHdblogHost2(locationObject)) return null;
    const code = hdblogCodeFromLocation(document2, locationObject);
    if (!code) return null;
    if (isDeletedHdblogArticlePage(document2, locationObject)) {
      if (isHdblogDeletedJavfreeSearchEnabled()) openJavfreeSearchTab(document2, code);
      return null;
    }
    if (!isHdblogJavfreePreviewFallbackEnabled()) return null;
    if (!document2.querySelector(
      "main#genesis-content article.entry .entry-content, article.entry .entry-content"
    )) {
      return null;
    }
    try {
      if (await hasUsableHdblogPreview(document2, request)) return null;
      return renderHdblogJavfreePreview(
        document2,
        await fetchJavfreePreviewForCode(code, request, document2)
      );
    } catch (error) {
      console.warn("[x1080x-ex] JavFree preview fallback failed on hdblog", {
        code,
        error: error?.message || String(error)
      });
      return null;
    }
  }

  // src/hdblog-article.js
  var HDBLOG_ARTICLE_WIDTH_KEY = "x1080x-ex:hdblog-article-width";
  var HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY = "x1080x-ex:hdblog-article-layout-enabled";
  var HDBLOG_SHOW_DOWNLOAD_AREA_KEY = "x1080x-ex:hdblog-show-download-area";
  var HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY = "x1080x-ex:hdblog-show-image-download-button";
  var HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY = "x1080x-ex:hdblog-show-cross-search-button";
  var HDBLOG_SHOW_COPY_CODE_BUTTON_KEY = "x1080x-ex:hdblog-show-copy-code-button";
  var HDBLOG_EXPAND_PREVIEW_IMAGES_KEY2 = "x1080x-ex:hdblog-expand-preview-images";
  var HDBLOG_BLOCKED_KEYWORDS_KEY = "x1080x-ex:hdblog-blocked-keywords";
  var HDBLOG_SEARCH_FILTER_ENABLED_KEY2 = "x1080x-ex:hdblog-search-filter-enabled";
  var HDBLOG_BROWSE_FILTER_ENABLED_KEY2 = "x1080x-ex:hdblog-browse-filter-enabled";
  var HDBLOG_BATCH_OPEN_ENABLED_KEY2 = "x1080x-ex:hdblog-batch-open-enabled";
  var HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY2 = "x1080x-ex:hdblog-batch-open-interval-min-ms";
  var HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY2 = "x1080x-ex:hdblog-batch-open-interval-max-ms";
  var HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY2 = "x1080x-ex:hdblog-batch-open-history-enabled";
  var HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY2 = "x1080x-ex:hdblog-batch-open-history-limit";
  var HDBLOG_BATCH_OPEN_HISTORY_KEY2 = "x1080x-ex:hdblog-batch-open-history";
  var HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY2 = "x1080x-ex:hdblog-batch-open-history-color";
  var HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY2 = "x1080x-ex:hdblog-batch-open-unopened-only";
  var HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY2 = "x1080x-ex:hdblog-batch-progress-locator-enabled";
  var DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT = 5e3;
  var DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR = "#bd10e0";
  var DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS = 800;
  var DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS = 1600;
  var DEFAULT_HDBLOG_ARTICLE_WIDTH = 1280;
  var DEFAULT_HDBLOG_BLOCKED_KEYWORDS = "\u30E2\u30B6\u30A4\u30AF\u7834\u58CA";
  var HDBLOG_SETTINGS_PANEL_ID2 = "x1080x-ex-hdblog-settings-panel";
  var DOWNLOAD_HIDDEN_ATTR = "data-x1080x-hdblog-download-hidden";
  var DOWNLOAD_WRAPPER_ATTR = "data-x1080x-hdblog-download-wrapper";
  var DOWNLOAD_SECTION_LABEL_PATTERN = /^(?:bt(?:a)?file|katfile|freedl|rapidgator)\s*[:：]?$/i;
  var PREVIEW_LABEL_PATTERN = /^preview\s*[:：]?$/i;
  var MIN_HDBLOG_ARTICLE_WIDTH = 600;
  var MAX_HDBLOG_ARTICLE_WIDTH = 3e3;
  var LAYOUT_STYLE_ID = "x1080x-ex-hdblog-article-layout";
  var DOWNLOAD_BUTTON_ID = "x1080x-ex-hdblog-image-download";
  var SEARCH_BUTTON_ID = "x1080x-ex-hdblog-agaghhh-search";
  var COPY_BUTTON_ID = "x1080x-ex-hdblog-copy-code";
  var ARTICLE_BODY_CLASS = "x1080x-hdblog-single";
  var REQUEST_TIMEOUT4 = 6e4;
  var PREVIEW_BOUNDARY_PATTERN = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?)\b/i;
  var PIXHOST_IMAGE_HOST_PATTERN = /^img\d+\.(?:pixhost\.(?:to|cc)|pixho\.st)$/i;
  function normalizeText2(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHost3(locationObject) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "hdblog.me" || hostname.endsWith(".hdblog.me");
  }
  function normalizeHdblogArticleWidth(value, fallback = DEFAULT_HDBLOG_ARTICLE_WIDTH) {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_HDBLOG_ARTICLE_WIDTH, Math.max(MIN_HDBLOG_ARTICLE_WIDTH, parsed));
  }
  function articleElement(document2) {
    return document2?.querySelector(
      "main#genesis-content article.entry, main#genesis-content article, article.entry, article.post"
    ) || null;
  }
  function articleTitleElement(document2) {
    const article = articleElement(document2);
    return article?.querySelector(".entry-header .entry-title, h1.entry-title, header h1, h1") || document2?.querySelector("main#genesis-content h1.entry-title, h1.entry-title") || null;
  }
  function articleContentElement(document2) {
    const article = articleElement(document2);
    return article?.querySelector(".entry-content, .post-content, .post-entry, .entry-body") || document2?.querySelector("main#genesis-content .entry-content, .entry-content") || null;
  }
  function isHdblogArticlePage(document2, locationObject = document2?.location) {
    if (!document2 || !isHdblogHost3(locationObject)) return false;
    let url;
    try {
      url = new URL(locationObject?.href || document2.baseURI);
    } catch {
      return false;
    }
    if (url.searchParams.has("s")) return false;
    const title = articleTitleElement(document2);
    const content = articleContentElement(document2);
    if (!title || !content) return false;
    if (title.matches("a[href]") || title.querySelector("a[href]")) return false;
    const bodyClass = document2.body?.className || "";
    return /\bsingle(?:-post)?\b/i.test(bodyClass) || /^\/\d+\/[^/?#]+\/?$/i.test(url.pathname) || Boolean(document2.querySelector("article.entry .entry-meta, article.post .entry-meta"));
  }
  function originalHdblogArticleWidth(document2, fallback) {
    const stored = Number(document2?.body?.dataset?.x1080xHdblogOriginalArticleWidth || 0);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const candidates = [
      articleElement(document2),
      document2?.querySelector("main#genesis-content, #genesis-content.content")
    ].filter(Boolean);
    for (const element of candidates) {
      const measured = Number(element.getBoundingClientRect?.().width || 0);
      if (!Number.isFinite(measured) || measured <= 0) continue;
      const rounded = Math.round(measured * 100) / 100;
      if (document2.body?.dataset) {
        document2.body.dataset.x1080xHdblogOriginalArticleWidth = String(rounded);
      }
      return rounded;
    }
    return fallback;
  }
  function applyHdblogArticleLayout(document2, width = DEFAULT_HDBLOG_ARTICLE_WIDTH) {
    if (!document2?.head || !document2.body) return false;
    const safeWidth = normalizeHdblogArticleWidth(width);
    const originalWidth = originalHdblogArticleWidth(document2, safeWidth);
    document2.body.classList.add(ARTICLE_BODY_CLASS);
    let style = document2.getElementById(LAYOUT_STYLE_ID);
    if (!style) {
      style = document2.createElement("style");
      style.id = LAYOUT_STYLE_ID;
      document2.head.append(style);
    }
    style.textContent = `
body.${ARTICLE_BODY_CLASS} {
  --x1080x-hdblog-article-width: ${safeWidth}px;
  --x1080x-hdblog-original-article-width: ${originalWidth}px;
  --x1080x-hdblog-sidebar-width: 300px;
  --x1080x-hdblog-column-gap: 32px;
}
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header {
  padding-bottom: 14px;
  margin-bottom: 18px;
  border-bottom: 1px solid rgba(0, 0, 0, .08);
}
body.${ARTICLE_BODY_CLASS} article.entry .entry-title,
body.${ARTICLE_BODY_CLASS} article.post .entry-title {
  line-height: 1.4;
}
body.${ARTICLE_BODY_CLASS} article.entry .entry-content,
body.${ARTICLE_BODY_CLASS} article.post .entry-content {
  line-height: 1.75;
}
body.${ARTICLE_BODY_CLASS} .site-header .wrap,
body.${ARTICLE_BODY_CLASS} .nav-primary .wrap,
body.${ARTICLE_BODY_CLASS} .site-inner,
body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.${ARTICLE_BODY_CLASS} article.entry,
body.${ARTICLE_BODY_CLASS} article.post {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  box-shadow: none !important;
}
body.${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.${ARTICLE_BODY_CLASS} article.post > .entry-header,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-content,
body.${ARTICLE_BODY_CLASS} article.post > .entry-content,
body.${ARTICLE_BODY_CLASS} article.entry > .entry-footer,
body.${ARTICLE_BODY_CLASS} article.post > .entry-footer,
body.${ARTICLE_BODY_CLASS} main#genesis-content > .entry-comments,
body.${ARTICLE_BODY_CLASS} main#genesis-content > .comment-respond,
body.${ARTICLE_BODY_CLASS} #genesis-content.content > .entry-comments,
body.${ARTICLE_BODY_CLASS} #genesis-content.content > .comment-respond {
  width: min(100%, var(--x1080x-hdblog-original-article-width)) !important;
  max-width: var(--x1080x-hdblog-original-article-width) !important;
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.${ARTICLE_BODY_CLASS} .nav-primary .genesis-nav-menu {
  display: flex !important;
  flex-wrap: wrap !important;
  width: 100% !important;
  max-width: none !important;
}
body.${ARTICLE_BODY_CLASS} main#genesis-content,
body.${ARTICLE_BODY_CLASS} #genesis-content.content {
  background: #fff !important;
  box-sizing: border-box !important;
}
@media (min-width: 1100px) {
  body.${ARTICLE_BODY_CLASS} .site-header .wrap,
  body.${ARTICLE_BODY_CLASS} .nav-primary .wrap,
  body.${ARTICLE_BODY_CLASS} .site-inner,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: min(
      calc(var(--x1080x-hdblog-article-width) + var(--x1080x-hdblog-sidebar-width) + var(--x1080x-hdblog-column-gap)),
      calc(100vw - 40px)
    ) !important;
    max-width: none !important;
  }
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    display: grid !important;
    grid-template-columns: minmax(0, var(--x1080x-hdblog-article-width)) var(--x1080x-hdblog-sidebar-width) !important;
    column-gap: var(--x1080x-hdblog-column-gap) !important;
    justify-content: center !important;
    align-items: start !important;
    position: static !important;
    float: none !important;
  }
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap::before,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap::after {
    content: none !important;
    display: none !important;
  }
  body.${ARTICLE_BODY_CLASS} main#genesis-content,
  body.${ARTICLE_BODY_CLASS} #genesis-content.content {
    grid-column: 1 !important;
    grid-row: 1 !important;
    width: 100% !important;
    max-width: var(--x1080x-hdblog-article-width) !important;
    min-width: 0 !important;
    justify-self: stretch !important;
    align-self: start !important;
    float: none !important;
    position: static !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    margin: 0 !important;
  }
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    grid-column: 2 !important;
    grid-row: 1 !important;
    width: 100% !important;
    max-width: var(--x1080x-hdblog-sidebar-width) !important;
    min-width: 0 !important;
    justify-self: stretch !important;
    align-self: start !important;
    float: none !important;
    position: static !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
}
@media (max-width: 1099px) {
  body.${ARTICLE_BODY_CLASS} .site-header .wrap,
  body.${ARTICLE_BODY_CLASS} .nav-primary .wrap,
  body.${ARTICLE_BODY_CLASS} .site-inner,
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: calc(100vw - 24px) !important;
    max-width: none !important;
  }
  body.${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    display: block !important;
  }
  body.${ARTICLE_BODY_CLASS} main#genesis-content,
  body.${ARTICLE_BODY_CLASS} #genesis-content.content,
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    grid-column: auto !important;
    grid-row: auto !important;
    width: 100% !important;
    max-width: none !important;
    float: none !important;
    position: static !important;
    left: auto !important;
    right: auto !important;
    transform: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  body.${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    margin-top: 28px !important;
  }
}
`;
    return true;
  }
  function clearHdblogArticleLayout(document2) {
    if (!document2) return false;
    document2.body?.classList.remove(ARTICLE_BODY_CLASS);
    if (document2.body?.dataset) delete document2.body.dataset.x1080xHdblogOriginalArticleWidth;
    document2.getElementById(LAYOUT_STYLE_ID)?.remove();
    return true;
  }
  function extractHdblogVideoCode(value) {
    const source = normalizeText2(value);
    if (!source) return "";
    const uncensored = source.match(/^([A-Z0-9][A-Z0-9.+-]{1,31})\s+(\d{6}[-_]\d{2,4})\b/i);
    if (uncensored) return `${uncensored[1]} ${uncensored[2]}`;
    const text = source.toUpperCase();
    const fc2 = text.match(/\bFC2[\s_-]*(PPV[\s_-]*)?(\d{5,9})\b/i);
    if (fc2) return `FC2${fc2[1] ? "-PPV" : ""}-${fc2[2]}`;
    const alphanumericPrefix = text.match(/\b([A-Z][A-Z0-9]{1,11})-(\d{2,8}[A-Z]?)\b/i);
    const standard = alphanumericPrefix || text.match(/\b([A-Z]{2,12})[\s_-]?(\d{2,8}[A-Z]?)\b/i);
    if (!standard) return "";
    const prefix = standard[1];
    if (["HTTP", "HTTPS", "IMG", "IMAGE", "JPG", "JPEG", "PNG", "WEBP", "ERROR"].includes(prefix)) return "";
    return `${prefix}-${standard[2]}`;
  }
  function extractHdblogArticleCode(document2) {
    try {
      const slug = new URL(document2?.location?.href || document2?.baseURI || "").pathname.split("/").filter(Boolean).at(-1) || "";
      const fromSlug = extractHdblogVideoCode(slug);
      if (fromSlug) return fromSlug;
    } catch {
    }
    const titleText = normalizeText2(articleTitleElement(document2)?.textContent || document2?.title);
    const fromTitle = extractHdblogVideoCode(titleText);
    if (fromTitle) return fromTitle;
    const content = articleContentElement(document2);
    if (!content) return "";
    const text = normalizeText2(content.textContent).slice(0, 5e3);
    const labelled = text.match(/(?:品番|品號|品号|番号|番號|code)\s*[:：]?\s*([A-Z0-9 _-]{4,30})/i);
    return extractHdblogVideoCode(labelled?.[1] || text);
  }
  function hdblogAgaghhhSearchKeyword(code) {
    const source = normalizeText2(code);
    const fc2 = source.match(/^FC2(?:[\s_-]*PPV)?[\s_-]*(\d{5,9})$/i);
    if (fc2) return fc2[1];
    const uncensored = source.match(/^[A-Z0-9][A-Z0-9.+-]{1,31}\s+(\d{6}[-_]\d{2,4})$/i);
    return uncensored?.[1] || source;
  }
  function buildAgaghhhSearchUrl(code) {
    const keyword = hdblogAgaghhhSearchKeyword(code);
    if (!keyword) return "";
    return `${getAgaghhhOrigin()}/search?q=${encodeURIComponent(keyword)}`;
  }
  function openSearchTab(document2, url) {
    if (!url) return;
    if (typeof GM_openInTab === "function") {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
      return;
    }
    document2.defaultView?.open(url, "_blank", "noopener");
  }
  function absoluteHttpUrl2(document2, value) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), document2.baseURI);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function largestSrcsetUrl2(document2, value) {
    const candidates = String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean).map((part, order) => {
      const match = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      const rawUrl = match ? match[1] : part.split(/\s+/, 1)[0];
      const amount = match ? Number(match[2]) : order;
      const score = match?.[3]?.toLowerCase() === "x" ? amount * 1e5 : amount;
      const url = absoluteHttpUrl2(document2, rawUrl);
      return url ? { url, score } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return candidates[0]?.url || "";
  }
  function thumbnailUrl(document2, image) {
    if (!image) return "";
    const values = [
      image.getAttribute("data-orig-file"),
      image.getAttribute("data-original"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-src"),
      largestSrcsetUrl2(document2, image.getAttribute("data-srcset")),
      largestSrcsetUrl2(document2, image.getAttribute("data-lazy-srcset")),
      largestSrcsetUrl2(document2, image.getAttribute("srcset")),
      image.currentSrc,
      image.getAttribute("src")
    ];
    for (const value of values) {
      const url = absoluteHttpUrl2(document2, value);
      if (url) return url;
    }
    return "";
  }
  function isPixhostImageUrl(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl);
      return PIXHOST_IMAGE_HOST_PATTERN.test(url.hostname) && /^\/images\//i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function displayedPixhostImageUrl(document2, image) {
    if (!image || image.dataset.x1080xPreviewLarge !== "1") return "";
    const anchorHref = absoluteHttpUrl2(document2, image.closest("a[href]")?.getAttribute("href"));
    const candidates = [image.currentSrc, image.getAttribute("src"), anchorHref];
    for (const value of candidates) {
      const url = absoluteHttpUrl2(document2, value);
      if (url && isPixhostImageUrl(url, document2.baseURI)) return url;
    }
    return "";
  }
  function textNodesUnder2(root) {
    const view = root.ownerDocument.defaultView;
    const showText = view?.NodeFilter?.SHOW_TEXT ?? 4;
    const walker = root.ownerDocument.createTreeWalker(root, showText);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest("script, style, noscript, textarea")) nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }
  function lowestCommonAncestorWithin(first, second, limit) {
    if (!first || !second || !limit) return null;
    const ancestors = /* @__PURE__ */ new Set();
    let current = first.parentNode;
    while (current) {
      ancestors.add(current);
      if (current === limit) break;
      current = current.parentNode;
    }
    current = second.parentNode;
    while (current) {
      if (ancestors.has(current)) return current;
      if (current === limit) break;
      current = current.parentNode;
    }
    return null;
  }
  function directChildContaining(ancestor, node) {
    let current = node;
    while (current && current.parentNode !== ancestor) current = current.parentNode;
    return current?.parentNode === ancestor ? current : null;
  }
  function markDownloadAreaNode(document2, node) {
    if (!node) return false;
    if (node.nodeType === 1) {
      node.setAttribute(DOWNLOAD_HIDDEN_ATTR, "1");
      node.style.setProperty("display", "none", "important");
      return true;
    }
    if (node.nodeType === 3 && normalizeText2(node.nodeValue)) {
      const wrapper = document2.createElement("span");
      wrapper.setAttribute(DOWNLOAD_HIDDEN_ATTR, "1");
      wrapper.setAttribute(DOWNLOAD_WRAPPER_ATTR, "1");
      wrapper.style.setProperty("display", "none", "important");
      node.parentNode?.insertBefore(wrapper, node);
      wrapper.append(node);
      return true;
    }
    return false;
  }
  function clearHdblogDownloadAreaMarkers(document2) {
    if (!document2) return;
    [...document2.querySelectorAll(`[${DOWNLOAD_HIDDEN_ATTR}="1"]`)].forEach((element) => {
      if (element.getAttribute(DOWNLOAD_WRAPPER_ATTR) === "1") {
        element.replaceWith(...element.childNodes);
        return;
      }
      element.style.removeProperty("display");
      element.removeAttribute(DOWNLOAD_HIDDEN_ATTR);
    });
  }
  function applyHdblogDownloadAreaVisibility(document2, visible = true) {
    if (!document2) return 0;
    clearHdblogDownloadAreaMarkers(document2);
    if (visible) return 0;
    const content = articleContentElement(document2);
    if (!content) return 0;
    const nodes = textNodesUnder2(content);
    const start = nodes.find((node) => DOWNLOAD_SECTION_LABEL_PATTERN.test(normalizeText2(node.nodeValue)));
    if (!start) return 0;
    const preview = nodes.find((node) => isAfter2(start, node) && PREVIEW_LABEL_PATTERN.test(normalizeText2(node.nodeValue)));
    if (!preview) return 0;
    const common = lowestCommonAncestorWithin(start, preview, content);
    if (!common) return 0;
    const first = directChildContaining(common, start);
    const stop = directChildContaining(common, preview);
    if (!first || !stop || first === stop) return 0;
    let hidden = 0;
    let current = first;
    while (current && current !== stop) {
      const next = current.nextSibling;
      if (markDownloadAreaNode(document2, current)) hidden += 1;
      current = next;
    }
    return hidden;
  }
  function isAfter2(reference, node) {
    return Boolean(reference?.compareDocumentPosition(node) & 4);
  }
  function previewRange(content) {
    const nodes = textNodesUnder2(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText2(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter2(marker, node) && PREVIEW_BOUNDARY_PATTERN.test(normalizeText2(node.nodeValue))) || null;
    return { marker, boundary };
  }
  function inPreviewRange(range, node) {
    if (!range || !isAfter2(range.marker, node)) return false;
    return !range.boundary || !isAfter2(range.boundary, node);
  }
  function collectHdblogPixhostPreviewImages(document2) {
    const content = articleContentElement(document2);
    if (!content) return [];
    const range = previewRange(content);
    const seen = /* @__PURE__ */ new Set();
    const candidates = [];
    if (range) {
      candidates.push(
        ...[...content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange(range, anchor)).map((anchor) => {
          const image = anchor.querySelector("img");
          if (!image) return null;
          const href = absoluteHttpUrl2(document2, anchor.getAttribute("href"));
          const pixhostShowUrl = isPixhostShowUrl(href, document2.baseURI) ? href : "";
          const directUrl = displayedPixhostImageUrl(document2, image);
          if (!pixhostShowUrl && !directUrl) return null;
          return {
            image,
            pixhostShowUrl,
            thumbUrl: thumbnailUrl(document2, image),
            directUrl,
            referer: document2.baseURI
          };
        }).filter(Boolean)
      );
    }
    candidates.push(
      ...[...content.querySelectorAll("img[" + JAVFREE_PREVIEW_ATTR + "]")].map((image) => {
        const directUrl = absoluteHttpUrl2(document2, image.getAttribute(JAVFREE_PREVIEW_ATTR));
        if (!directUrl) return null;
        return {
          image,
          pixhostShowUrl: "",
          thumbUrl: directUrl,
          directUrl,
          referer: image.getAttribute(PREVIEW_REFERER_ATTR2) || "https://javfree.me/"
        };
      }).filter(Boolean)
    );
    return candidates.filter((candidate) => {
      const key = candidate.pixhostShowUrl || candidate.directUrl;
      return !seen.has(key) && seen.add(key);
    }).slice(0, 24);
  }
  function hdblogImageFilename(code, index, total, extension = "jpg") {
    const safeCode = normalizeText2(code).replace(/[<>:"/\\|?*]/g, "-");
    const safeExtension = String(extension || "jpg").replace(/^\./, "").toLowerCase();
    const suffix = total > 1 ? `-${index + 1}` : "";
    return `${safeCode}${suffix}.${safeExtension || "jpg"}`;
  }
  function extensionFromUrl(value) {
    try {
      const match = new URL(value).pathname.match(/\.((?:jpe?g|png|webp|gif|avif))$/i);
      return match?.[1]?.toLowerCase().replace("jpeg", "jpg") || "";
    } catch {
      return "";
    }
  }
  function extensionFromBlob2(blob, url) {
    const type = String(blob?.type || "").toLowerCase();
    if (type.includes("jpeg")) return "jpg";
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    if (type.includes("avif")) return "avif";
    return extensionFromUrl(url) || "jpg";
  }
  function requestImageBlob2(url, referer, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D\u6CB9\u7334\u73AF\u5883\u4E0D\u652F\u6301 GM_xmlhttpRequest\u3002"));
        return;
      }
      gmRequest2({
        method: "GET",
        url,
        responseType: "blob",
        timeout: REQUEST_TIMEOUT4,
        headers: referer ? { Referer: referer } : void 0,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300 || !response.response) {
            reject(new Error(`\u56FE\u7247\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
            return;
          }
          resolve(response.response);
        },
        onerror: () => reject(new Error("\u56FE\u7247\u8BF7\u6C42\u5931\u8D25\u3002")),
        ontimeout: () => reject(new Error(`\u56FE\u7247\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT4 / 1e3} \u79D2\uFF09\u3002`))
      });
    });
  }
  function saveBlob2(document2, blob, name) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document2.createElement("a");
    anchor.hidden = true;
    anchor.download = name;
    anchor.href = objectUrl;
    document2.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      document2.defaultView?.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  }
  async function resolveCandidateUrl(document2, candidate, gmRequest2) {
    const displayed = displayedPixhostImageUrl(document2, candidate.image);
    if (displayed) return displayed;
    if (!candidate.pixhostShowUrl) return candidate.directUrl;
    return resolvePixhostShowUrl(
      document2,
      candidate.pixhostShowUrl,
      candidate.thumbUrl,
      gmRequest2
    );
  }
  async function downloadHdblogArticleImages(button, document2, locationObject, gmRequest2, initialCandidates = []) {
    const view = document2.defaultView;
    const resetButton = (delay = 3e3) => {
      view?.setTimeout(() => {
        button.textContent = "\u2B07";
        button.title = "\u4E0B\u8F7D Pixhost Preview \u5927\u56FE\uFF0C\u5E76\u81EA\u52A8\u6309\u5F71\u7247\u756A\u53F7\u91CD\u547D\u540D";
      }, delay);
    };
    const showStatus = (text, detail = "") => {
      button.disabled = false;
      button.textContent = text;
      if (detail) button.title = detail;
      resetButton();
    };
    const code = extractHdblogArticleCode(document2);
    if (!code) {
      showStatus("\u672A\u8BC6\u522B\u756A\u53F7", "\u6CA1\u6709\u8BC6\u522B\u5230\u5F71\u7247\u756A\u53F7\uFF0C\u672A\u5F00\u59CB\u4E0B\u8F7D\u3002");
      return;
    }
    const liveCandidates = collectHdblogPixhostPreviewImages(document2);
    const candidateMap = /* @__PURE__ */ new Map();
    [...initialCandidates, ...liveCandidates].forEach((candidate) => {
      const key = candidate?.pixhostShowUrl || candidate?.directUrl || candidate?.thumbUrl;
      if (key && !candidateMap.has(key)) candidateMap.set(key, candidate);
    });
    const candidates = [...candidateMap.values()];
    if (!candidates.length) {
      showStatus("\u65E0 Preview", "Preview \u533A\u6CA1\u6709\u627E\u5230 Pixhost show \u56FE\u7247\u3002");
      return;
    }
    const { standard, fourK } = partitionPreviewCandidates(candidates);
    const phases = standard.length ? [
      { candidates: standard, label: "\u666E\u901A Preview", fallback: false },
      ...fourK.length ? [{ candidates: fourK, label: "4K Preview", fallback: true }] : []
    ] : [{ candidates: fourK, label: "4K Preview", fallback: false }];
    const endDownloadGuard = beginDownloadGuard(document2, {
      enabled: isDownloadGuardEnabled(HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY)
    });
    button.disabled = true;
    const failures = [];
    let skipped = 0;
    let downloaded = 0;
    let usedFourKFallback = false;
    try {
      for (const [phaseIndex, phase] of phases.entries()) {
        const hasFallbackPhase = phaseIndex < phases.length - 1;
        button.textContent = phase.fallback ? "\u56DE\u9000\u89E3\u6790 4K Preview\u2026" : "\u89E3\u6790 Preview\u2026";
        const phaseFailures = [];
        let phaseSkipped = 0;
        const resolved = [];
        const seen = /* @__PURE__ */ new Set();
        for (const candidate of phase.candidates) {
          try {
            const url = await resolveCandidateUrl(document2, candidate, gmRequest2);
            if (!url) {
              if (candidate.pixhostShowUrl) phaseSkipped += 1;
              continue;
            }
            if (!seen.has(url)) {
              seen.add(url);
              resolved.push({ url, candidate });
            }
          } catch (error) {
            phaseFailures.push(error?.message || "Pixhost \u5927\u56FE\u5730\u5740\u89E3\u6790\u5931\u8D25");
          }
        }
        if (!resolved.length) {
          if (hasFallbackPhase) continue;
          skipped += phaseSkipped;
          failures.push(...phaseFailures);
          break;
        }
        let phaseDownloaded = 0;
        const downloadFailures = [];
        let downloadSkipped = 0;
        for (const [index, item] of resolved.entries()) {
          const { url, candidate } = item;
          button.textContent = phase.fallback ? `4K \u56DE\u9000\u4E0B\u8F7D ${index + 1}/${resolved.length}` : `\u4E0B\u8F7D ${index + 1}/${resolved.length}`;
          try {
            const blob = await requestImageBlob2(
              url,
              candidate?.referer || locationObject?.href,
              gmRequest2
            );
            const extension = extensionFromBlob2(blob, url);
            saveBlob2(
              document2,
              blob,
              hdblogImageFilename(code, downloaded + phaseDownloaded, resolved.length, extension)
            );
            phaseDownloaded += 1;
          } catch (error) {
            const message = error?.message || "\u4E0B\u8F7D\u5931\u8D25";
            const unavailable = Boolean(candidate?.pixhostShowUrl) && /HTTP\s+(?:404|410)\b/i.test(message);
            if (unavailable) {
              downloadSkipped += 1;
              continue;
            }
            downloadFailures.push(`${index + 1}. ${message}`);
          }
        }
        if (phaseDownloaded > 0) {
          downloaded += phaseDownloaded;
          skipped += phaseSkipped + downloadSkipped;
          failures.push(...phaseFailures, ...downloadFailures);
          usedFourKFallback = phase.fallback;
          break;
        }
        if (hasFallbackPhase) continue;
        skipped += phaseSkipped + downloadSkipped;
        failures.push(...phaseFailures, ...downloadFailures);
        break;
      }
      if (!downloaded && isHdblogJavfreePreviewFallbackEnabled()) {
        try {
          button.textContent = "\u5C1D\u8BD5 JavFree Preview\u2026";
          const javfree = await fetchJavfreePreviewForCode(code, gmRequest2, document2);
          const javfreeUrl = javfree.imageUrls?.[0] || "";
          if (javfreeUrl) {
            const blob = await requestImageBlob2(
              javfreeUrl,
              javfree.referer || javfree.articleUrl || "https://javfree.me/",
              gmRequest2
            );
            const extension = extensionFromBlob2(blob, javfreeUrl);
            saveBlob2(document2, blob, hdblogImageFilename(code, 0, 1, extension));
            downloaded = 1;
            failures.length = 0;
            skipped = 0;
          }
        } catch (error) {
          failures.push("JavFree\uFF1A" + (error?.message || "Preview \u4E0B\u8F7D\u5931\u8D25"));
        }
      }
      if (!downloaded && !failures.length) {
        if (skipped) {
          showStatus("\u5DF2\u8DF3\u8FC7\u5931\u6548 Preview", "Pixhost Preview \u5DF2\u5931\u6548\uFF0C\u672A\u4E0B\u8F7D\u5360\u4F4D\u56FE\u3002");
          return;
        }
        showStatus("\u65E0\u53EF\u4E0B\u8F7D Preview", "HDblog \u4E0E JavFree \u90FD\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684 Preview\u3002");
        return;
      }
    } catch (error) {
      failures.push(error?.message || "\u4E0B\u8F7D\u5931\u8D25");
    } finally {
      if (button.disabled) {
        button.disabled = false;
        button.textContent = failures.length ? `\u5B8C\u6210\uFF08\u5931\u8D25 ${failures.length}\uFF09` : skipped ? downloaded ? `\u2713 \u5B8C\u6210\uFF08\u8DF3\u8FC7 ${skipped}\uFF09` : "\u5DF2\u8DF3\u8FC7\u5931\u6548 Preview" : "\u2713 \u4E0B\u8F7D\u5B8C\u6210";
        if (failures.length) button.title = failures.join("\uFF1B");
        else if (usedFourKFallback) button.title = "\u666E\u901A Preview \u4E0D\u53EF\u7528\uFF0C\u5DF2\u81EA\u52A8\u56DE\u9000\u4E0B\u8F7D 4K Preview\u3002";
        else if (skipped) button.title = "Pixhost Preview \u5DF2\u5931\u6548\uFF0C\u672A\u4E0B\u8F7D\u5360\u4F4D\u56FE\u3002";
        resetButton();
      }
      endDownloadGuard();
    }
  }
  function installDownloadButton(document2, locationObject, gmRequest2) {
    if (document2.getElementById(DOWNLOAD_BUTTON_ID)) return;
    const title = articleTitleElement(document2);
    if (!title) return;
    const initialCandidates = collectHdblogPixhostPreviewImages(document2);
    const button = document2.createElement("button");
    button.id = DOWNLOAD_BUTTON_ID;
    button.type = "button";
    button.textContent = "\u2B07";
    button.title = "\u4E0B\u8F7D Pixhost Preview \u5927\u56FE\uFF0C\u5E76\u81EA\u52A8\u6309\u5F71\u7247\u756A\u53F7\u91CD\u547D\u540D";
    button.setAttribute("aria-label", "\u4E0B\u8F7D Pixhost Preview \u5927\u56FE");
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      margin: "0 0 4px 8px",
      padding: "5px 8px",
      minWidth: "34px",
      justifyContent: "center",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "20px"
    });
    button.addEventListener("mouseenter", () => {
      if (!button.disabled) button.style.background = "#246eaf";
    });
    button.addEventListener("mouseleave", () => {
      if (!button.disabled) button.style.background = "#398bd4";
    });
    button.addEventListener("click", () => void downloadHdblogArticleImages(
      button,
      document2,
      locationObject,
      gmRequest2,
      initialCandidates
    ));
    title.append(" ", button);
  }
  function installAgaghhhSearchButton(document2) {
    if (document2.getElementById(SEARCH_BUTTON_ID)) return;
    const title = articleTitleElement(document2);
    if (!title) return;
    const searchButton = document2.createElement("button");
    searchButton.id = SEARCH_BUTTON_ID;
    searchButton.type = "button";
    searchButton.textContent = "\u{1F50D}";
    searchButton.title = "\u6309\u5F53\u524D\u756A\u53F7\u5728 x1080x \u641C\u7D22";
    searchButton.setAttribute("aria-label", "\u5728 x1080x \u641C\u7D22\u5F53\u524D\u756A\u53F7");
    Object.assign(searchButton.style, {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      margin: "0 0 4px 8px",
      padding: "5px 8px",
      minWidth: "34px",
      justifyContent: "center",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "20px"
    });
    searchButton.addEventListener("mouseenter", () => {
      searchButton.style.background = "#246eaf";
    });
    searchButton.addEventListener("mouseleave", () => {
      searchButton.style.background = "#398bd4";
    });
    searchButton.addEventListener("click", () => {
      const url = buildAgaghhhSearchUrl(extractHdblogArticleCode(document2));
      if (!url) {
        document2.defaultView?.alert("\u6CA1\u6709\u8BC6\u522B\u5230\u5F71\u7247\u756A\u53F7\u3002");
        return;
      }
      openSearchTab(document2, url);
    });
    title.append(searchButton);
  }
  function installCopyCodeButton(document2) {
    if (document2.getElementById(COPY_BUTTON_ID)) return;
    const code = extractHdblogArticleCode(document2);
    if (!code) return;
    const title = articleTitleElement(document2);
    if (!title) return;
    const downloadButton = document2.getElementById(DOWNLOAD_BUTTON_ID);
    const searchButton = document2.getElementById(SEARCH_BUTTON_ID);
    const button = document2.createElement("button");
    button.id = COPY_BUTTON_ID;
    button.type = "button";
    button.textContent = "\u{1F4CB}";
    button.title = "\u590D\u5236\u5F53\u524D\u756A\u53F7\u5230\u526A\u5207\u677F";
    button.setAttribute("aria-label", "\u590D\u5236\u5F53\u524D\u756A\u53F7\u5230\u526A\u5207\u677F");
    Object.assign(button.style, {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      margin: "0 0 4px 8px",
      padding: "5px 8px",
      minWidth: "34px",
      justifyContent: "center",
      border: "1px solid #2878c8",
      borderRadius: "5px",
      color: "#fff",
      background: "#398bd4",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: "600",
      lineHeight: "20px"
    });
    button.addEventListener("mouseenter", () => {
      if (!button.disabled) button.style.background = "#246eaf";
    });
    button.addEventListener("mouseleave", () => {
      if (!button.disabled) button.style.background = "#398bd4";
    });
    button.addEventListener("click", () => {
      void copyCodeWithButtonFeedback(button, document2, extractHdblogArticleCode(document2));
    });
    if (downloadButton) downloadButton.insertAdjacentElement("afterend", button);
    else if (searchButton) searchButton.insertAdjacentElement("beforebegin", button);
    else title.append(button);
  }
  function rawStoredWidth() {
    if (typeof GM_getValue !== "function") return "";
    const value = GM_getValue(HDBLOG_ARTICLE_WIDTH_KEY, "");
    return value === null || value === void 0 ? "" : String(value).trim();
  }
  function readStoredWidth() {
    const stored = rawStoredWidth();
    return stored ? normalizeHdblogArticleWidth(stored, DEFAULT_HDBLOG_ARTICLE_WIDTH) : null;
  }
  function isHdblogArticleLayoutEnabled() {
    if (typeof GM_getValue !== "function") return Boolean(rawStoredWidth());
    const stored = GM_getValue(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, null);
    if (stored === null || stored === void 0) return Boolean(rawStoredWidth());
    return stored !== false;
  }
  function readDownloadAreaVisible() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, true) !== false;
  }
  function readImageDownloadButtonVisible() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, true) !== false;
  }
  function isHdblogCrossSearchEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, true) !== false;
  }
  function isHdblogCopyCodeEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SHOW_COPY_CODE_BUTTON_KEY, true) !== false;
  }
  function isHdblogSearchFilterEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY2, true) !== false;
  }
  function isHdblogBrowseFilterEnabled2() {
    if (typeof GM_getValue !== "function") return false;
    return GM_getValue(HDBLOG_BROWSE_FILTER_ENABLED_KEY2, false) === true;
  }
  function isHdblogBatchOpenEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_BATCH_OPEN_ENABLED_KEY2, true) !== false;
  }
  function readBatchOpenIntervalMs2(key, fallback) {
    if (typeof GM_getValue !== "function") return fallback;
    const numeric = Number(GM_getValue(key, fallback));
    return Number.isFinite(numeric) && numeric >= 100 && numeric <= 6e5 ? Math.round(numeric) : fallback;
  }
  function getHdblogBatchOpenInterval() {
    const delayMin = readBatchOpenIntervalMs2(
      HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY2,
      DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS
    );
    const delayMax = readBatchOpenIntervalMs2(
      HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY2,
      DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS
    );
    if (delayMax < delayMin) {
      return {
        delayMin: DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS,
        delayMax: DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS
      };
    }
    return { delayMin, delayMax };
  }
  function isHdblogBatchOpenHistoryEnabled() {
    if (typeof GM_getValue !== "function") return false;
    return GM_getValue(HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY2, false) === true;
  }
  function isHdblogBatchOpenUnopenedOnlyEnabled() {
    if (typeof GM_getValue !== "function") return false;
    return GM_getValue(HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY2, false) === true;
  }
  function isHdblogBatchProgressLocatorEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY2, true) !== false;
  }
  function getHdblogBatchOpenHistoryLimit() {
    if (typeof GM_getValue !== "function") return DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT;
    const numeric = Number(GM_getValue(
      HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY2,
      DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT
    ));
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5e4 ? numeric : DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_LIMIT;
  }
  function getHdblogBatchOpenHistoryColor() {
    if (typeof GM_getValue !== "function") return DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR;
    const value = String(GM_getValue(
      HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY2,
      DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR
    ) || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR;
  }
  function isHdblogPreviewExpansionEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY2, true) !== false;
  }
  function readBlockedKeywordsText() {
    if (typeof GM_getValue !== "function") return DEFAULT_HDBLOG_BLOCKED_KEYWORDS;
    const stored = GM_getValue(HDBLOG_BLOCKED_KEYWORDS_KEY, null);
    return stored === null || stored === void 0 ? DEFAULT_HDBLOG_BLOCKED_KEYWORDS : String(stored);
  }
  function normalizeBlockedKeywordsText(value) {
    const seen = /* @__PURE__ */ new Set();
    return String(value ?? "").split(/[\r\n,;，；]+/).map((entry) => entry.trim()).filter(Boolean).filter((entry) => {
      const key = entry.normalize("NFKC").toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join("\n");
  }
  function closeHdblogSettingsPanel(document2) {
    document2?.getElementById(HDBLOG_SETTINGS_PANEL_ID2)?.remove();
  }
  function openHdblogSettingsPanel(document2 = globalThis.document) {
    if (!document2?.body) return null;
    closeHdblogSettingsPanel(document2);
    const overlay = document2.createElement("div");
    overlay.id = HDBLOG_SETTINGS_PANEL_ID2;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "rgba(0,0,0,.42)",
      boxSizing: "border-box"
    });
    const panel = document2.createElement("form");
    Object.assign(panel.style, {
      width: "min(560px, 100%)",
      maxHeight: "calc(100vh - 40px)",
      overflow: "auto",
      padding: "22px",
      borderRadius: "10px",
      background: "#fff",
      color: "#222",
      boxShadow: "0 18px 60px rgba(0,0,0,.28)",
      boxSizing: "border-box",
      font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    });
    panel.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">HDBLOG \u8BBE\u7F6E</h2>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">\u6587\u7AE0\u5E03\u5C40</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="layout-enabled" type="checkbox">
        \u542F\u7528\u6587\u7AE0\u5BBD\u5EA6\u589E\u5F3A
      </label>
      <label data-width-row style="display:block;margin-left:24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">\u6587\u7AE0\u4E3B\u5185\u5BB9\u533A\u5BBD\u5EA6\uFF08px\uFF09</span>
        <input data-setting="width" type="number" min="${MIN_HDBLOG_ARTICLE_WIDTH}" max="${MAX_HDBLOG_ARTICLE_WIDTH}" step="1"
          placeholder="${DEFAULT_HDBLOG_ARTICLE_WIDTH}"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
        <small style="display:block;margin-top:5px;color:#666">\u5173\u95ED\u5F00\u5173\u65F6\u5B8C\u5168\u4F7F\u7528\u7F51\u7AD9\u539F\u59CB\u5E03\u5C40\uFF1B\u5F00\u542F\u540E\u53EA\u6269\u5C55\u767D\u8272\u4E3B\u5185\u5BB9\u533A\u57DF\u3002</small>
      </label>
    </div>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">\u6587\u7AE0\u9875\u529F\u80FD</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="show-downloads" type="checkbox">
        \u663E\u793A Btfile / katfile / Freedl / Rapidgator \u7F51\u76D8\u4E0B\u8F7D\u533A\u57DF
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <input data-setting="show-image-download" type="checkbox">
        \u663E\u793A\u6807\u9898\u65C1\u7684\u56FE\u7247\u4E0B\u8F7D\u6309\u94AE\uFF08\u2B07\uFF09
      </label>
      <label data-download-guard-row style="display:flex;align-items:flex-start;gap:9px;margin:0 0 10px 24px">
        <input data-setting="download-guard" type="checkbox" style="margin-top:3px">
        <span>\u4E0B\u8F7D\u65F6\u6807\u8BB0\u6807\u7B7E\u9875\u5E76\u5728\u5173\u95ED\u65F6\u63D0\u9192<small style="display:block;margin-top:2px;color:#666">\u4EC5\u4E0B\u8F7D\u8FDB\u884C\u4E2D\u751F\u6548\uFF0C\u5B8C\u6210\u540E\u81EA\u52A8\u6062\u590D\u6807\u7B7E\u6807\u9898\u5E76\u89E3\u9664\u5173\u95ED\u63D0\u793A\u3002</small></span>
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="cross-search" type="checkbox">
        \u663E\u793A\u8DE8\u7AD9\u641C\u7D22\u6309\u94AE\uFF08\u{1F50D}\uFF0C\u641C\u7D22 x1080x\uFF09
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="copy-code" type="checkbox">
        \u663E\u793A\u590D\u5236\u756A\u53F7\u6309\u94AE\uFF08\u{1F4CB}\uFF09
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <input data-setting="expand-preview" type="checkbox">
        \u81EA\u52A8\u5C55\u5F00 Preview \u5927\u56FE\uFF08\u542B Pixhost / refer \u89E3\u6790\uFF09
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin:0 0 10px 24px">
        <input data-setting="javfree-preview-fallback" type="checkbox" style="margin-top:3px">
        <span>JavFree Preview \u540E\u5907\u6E90<small style="display:block;margin-top:2px;color:#666">\u5F53\u524D\u6587\u7AE0\u6CA1\u6709\u53EF\u7528 Preview \u6216 Pixhost \u5DF2\u5931\u6548\u65F6\uFF0C\u6309\u756A\u53F7\u4ECE javfree.me \u8865\u5145\u7B2C 2 \u5F20 Preview\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px">
        <input data-setting="deleted-javfree-search" type="checkbox" style="margin-top:3px">
        <span>\u5DF2\u5220\u9664\u6587\u7AE0\u81EA\u52A8\u641C\u7D22 JavFree<small style="display:block;margin-top:2px;color:#666">\u8BBF\u95EE HDblog \u5DF2\u5220\u9664\u7684\u5386\u53F2\u6587\u7AE0\u65F6\uFF0C\u81EA\u52A8\u65B0\u5F00\u6807\u7B7E\u641C\u7D22\u540C\u756A\u53F7\u7684 javfree.me\u3002</small></span>
      </label>
    </div>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">\u641C\u7D22 / \u5217\u8868\u9875\u529F\u80FD</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
        <input data-setting="batch-open" type="checkbox">
        \u663E\u793A\u201C\u540E\u53F0\u987A\u5E8F\u6253\u5F00\u672C\u9875\u4E3B\u9898\u201D\u6309\u94AE
      </label>
      <div data-batch-open-interval-row style="margin:0 0 10px 24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">\u4E3B\u9898\u6253\u5F00\u95F4\u9694\uFF08\u79D2\uFF09</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input data-setting="batch-open-interval-min" type="number" min="0.1" max="600" step="0.1" aria-label="\u6700\u5C0F\u95F4\u9694"
            style="width:88px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <span>\u2014</span>
          <input data-setting="batch-open-interval-max" type="number" min="0.1" max="600" step="0.1" aria-label="\u6700\u5927\u95F4\u9694"
            style="width:88px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <button type="button" data-action="reset-batch-open-interval" style="padding:6px 10px;appearance:none;background:#fff !important;color:#333 !important;border:1px solid #bbb !important;border-radius:6px;cursor:pointer;font:inherit;line-height:1.4">\u6062\u590D\u9ED8\u8BA4</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666">\u6BCF\u4E2A\u4E3B\u9898\u5728\u8BE5\u8303\u56F4\u5185\u968F\u673A\u7B49\u5F85\uFF1B\u9ED8\u8BA4 0.8\u20131.6 \u79D2\u3002\u5B9A\u671F\u957F\u505C\u987F\u89C4\u5219\u4FDD\u6301\u4E0D\u53D8\u3002</small>
      </div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:8px">
        <input data-setting="batch-open-history" type="checkbox" style="margin-top:3px">
        <span><strong>\u4FDD\u5B58\u6279\u91CF\u6253\u5F00\u8BB0\u5F55</strong><small style="display:block;margin-top:2px;color:#666">\u8BB0\u5F55\u811A\u672C\u6279\u91CF\u6253\u5F00\u8FC7\u7684\u6587\u7AE0\u5E76\u6301\u4E45\u6807\u8BB0\uFF1B\u624B\u52A8\u8BBF\u95EE\u8FC7\u7684\u94FE\u63A5\u4E5F\u4F7F\u7528\u76F8\u540C\u989C\u8272\u663E\u793A\u3002</small></span>
      </label>
      <div data-batch-open-history-row style="margin:0 0 13px 24px">
        <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
          <input data-setting="batch-open-unopened-only" type="checkbox" style="margin-top:3px">
          <span><strong>\u53EA\u6253\u5F00\u672A\u6253\u5F00\u7684\u4E3B\u9898</strong><small style="display:block;margin-top:2px;color:#666">\u6279\u91CF\u6253\u5F00\u65F6\u8DF3\u8FC7\u5DF2\u7ECF\u4FDD\u5B58\u5728\u201C\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u201D\u4E2D\u7684\u6587\u7AE0\u3002</small></span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
          <input data-setting="batch-progress-locator" type="checkbox" style="margin-top:3px">
          <span><strong>\u663E\u793A\u201C\u5B9A\u4F4D\u6D4F\u89C8\u8FDB\u5EA6\u201D\u6309\u94AE</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u6279\u91CF\u6253\u5F00\u6309\u94AE\u65C1\u663E\u793A\u5165\u53E3\uFF0C\u8DF3\u5230\u5DF2\u6253\u5F00\u8BB0\u5F55\u4E0E\u672A\u6253\u5F00\u6587\u7AE0\u76F8\u90BB\u7684\u5206\u9875\u4F4D\u7F6E\u3002</small></span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:600">\u6700\u591A\u4FDD\u5B58</span>
          <input data-setting="batch-open-history-limit" type="number" min="1" max="50000" step="1" aria-label="\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u4FDD\u5B58\u6761\u6570"
            style="width:100px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <span>\u6761</span>
        </label>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
          <span style="font-weight:600">\u8BBF\u95EE\u6807\u8BB0\u989C\u8272</span>
          <input data-setting="batch-open-history-color" type="color" aria-label="\u8BBF\u95EE\u6807\u8BB0\u989C\u8272"
            style="width:44px;height:32px;padding:2px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer">
          <button type="button" data-action="reset-batch-open-history-color"
            style="padding:6px 10px;appearance:none;background:#fff !important;color:#333 !important;border:1px solid #bbb !important;border-radius:6px;cursor:pointer;font:inherit;line-height:1.4">\u8FD8\u539F\u9ED8\u8BA4\u7D2B\u8272</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666">\u9ED8\u8BA4 5000 \u6761\uFF0C\u9ED8\u8BA4\u989C\u8272 #bd10e0\uFF1B\u8D85\u8FC7\u4E0A\u9650\u81EA\u52A8\u5220\u9664\u6700\u65E7\u8BB0\u5F55\u3002</small>
      </div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
        <input data-setting="search-filter" type="checkbox" style="margin-top:3px">
        <span><strong>\u641C\u7D22\u7ED3\u679C\u5C4F\u853D\u4E0E\u5355\u7ED3\u679C\u81EA\u52A8\u8DF3\u8F6C</strong><small style="display:block;margin-top:2px;color:#666">\u4EC5\u4F5C\u7528\u4E8E hdblog \u641C\u7D22\u7ED3\u679C\u9875\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
        <input data-setting="browse-filter" type="checkbox" style="margin-top:3px">
        <span><strong>\u6B63\u5E38\u6D4F\u89C8\u5173\u952E\u8BCD\u5C4F\u853D</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u9996\u9875\u3001\u5206\u7C7B\u3001\u6807\u7B7E\u548C\u5206\u9875\u7B49\u6587\u7AE0\u5217\u8868\u4E2D\u6309\u76F8\u540C\u5173\u952E\u8BCD\u9690\u85CF\u4E3B\u9898\uFF1B\u4E0D\u5F71\u54CD\u6587\u7AE0\u8BE6\u60C5\u9875\u3002</small></span>
      </label>
      <label data-keywords-row style="display:block;margin-left:24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">\u5C4F\u853D\u5173\u952E\u8BCD\uFF08\u641C\u7D22 / \u6B63\u5E38\u6D4F\u89C8\u5171\u7528\uFF09</span>
        <textarea data-setting="keywords" rows="5" placeholder="\u7559\u7A7A = \u4E0D\u5C4F\u853D"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical"></textarea>
        <small style="display:block;margin-top:5px;color:#666">\u6BCF\u884C\u4E00\u4E2A\uFF0C\u4E5F\u53EF\u7528\u9017\u53F7\u6216\u5206\u53F7\u5206\u9694\uFF1B\u641C\u7D22\u4E0E\u6B63\u5E38\u6D4F\u89C8\u5171\u7528\uFF0C\u8BE5\u89C4\u5219\u4E5F\u4F9B x1080x \u7684 hdblog Preview \u641C\u7D22\u590D\u7528\u3002</small>
      </label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">\u53D6\u6D88</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">\u4FDD\u5B58</button>
    </div>`;
    organizeSettingsPanel(panel, [
      {
        "key": "layout",
        "title": "\u6587\u7AE0\u5E03\u5C40",
        "description": "\u4E3B\u5185\u5BB9\u533A\u663E\u793A\u5BBD\u5EA6\u4E0E\u9875\u9762\u5E03\u5C40",
        "settings": [
          "layout-enabled",
          "width"
        ]
      },
      {
        "key": "download",
        "title": "\u4E0B\u8F7D\u4E0E\u6309\u94AE",
        "description": "\u4E0B\u8F7D\u533A\u57DF\u3001\u56FE\u7247\u4E0B\u8F7D\u548C\u5E38\u7528\u64CD\u4F5C",
        "settings": [
          "show-downloads",
          "show-image-download",
          "download-guard",
          "cross-search",
          "copy-code"
        ]
      },
      {
        "key": "preview",
        "title": "\u9884\u89C8\u4E0E\u4FEE\u590D",
        "description": "\u56FE\u7247\u5C55\u5F00\u4E0E\u5931\u6548\u6587\u7AE0\u7684\u540E\u5907\u641C\u7D22",
        "settings": [
          "expand-preview",
          "javfree-preview-fallback",
          "deleted-javfree-search"
        ]
      },
      {
        "key": "batch",
        "title": "\u6279\u91CF\u6253\u5F00",
        "description": "\u540E\u53F0\u987A\u5E8F\u6253\u5F00\u4E3B\u9898\u4E0E\u65F6\u95F4\u95F4\u9694",
        "settings": [
          "batch-open",
          "batch-open-interval-min"
        ]
      },
      {
        "key": "history",
        "title": "\u6D4F\u89C8\u8BB0\u5F55",
        "description": "\u4FDD\u5B58\u5DF2\u8BBF\u95EE\u7684\u4E3B\u9898\u3001\u8FDB\u5EA6\u5B9A\u4F4D\u548C\u989C\u8272\u6807\u8BB0",
        "settings": [
          "batch-open-history",
          "batch-open-unopened-only"
        ]
      },
      {
        "key": "filter",
        "title": "\u5173\u952E\u8BCD\u8FC7\u6EE4",
        "description": "\u641C\u7D22\u9875\u548C\u666E\u901A\u5217\u8868\u9875\u7684\u5173\u952E\u8BCD\u5C4F\u853D",
        "settings": [
          "search-filter",
          "browse-filter",
          "keywords"
        ]
      }
    ]);
    const layoutInput = panel.querySelector('[data-setting="layout-enabled"]');
    const widthInput = panel.querySelector('[data-setting="width"]');
    const downloadsInput = panel.querySelector('[data-setting="show-downloads"]');
    const imageDownloadInput = panel.querySelector('[data-setting="show-image-download"]');
    const downloadGuardInput = panel.querySelector('[data-setting="download-guard"]');
    const crossSearchInput = panel.querySelector('[data-setting="cross-search"]');
    const copyCodeInput = panel.querySelector('[data-setting="copy-code"]');
    const previewInput = panel.querySelector('[data-setting="expand-preview"]');
    const javfreePreviewInput = panel.querySelector('[data-setting="javfree-preview-fallback"]');
    const deletedJavfreeSearchInput = panel.querySelector('[data-setting="deleted-javfree-search"]');
    const batchOpenInput = panel.querySelector('[data-setting="batch-open"]');
    const batchIntervalMinInput = panel.querySelector('[data-setting="batch-open-interval-min"]');
    const batchIntervalMaxInput = panel.querySelector('[data-setting="batch-open-interval-max"]');
    const batchIntervalResetButton = panel.querySelector('[data-action="reset-batch-open-interval"]');
    const batchHistoryInput = panel.querySelector('[data-setting="batch-open-history"]');
    const batchUnopenedOnlyInput = panel.querySelector('[data-setting="batch-open-unopened-only"]');
    const batchProgressLocatorInput = panel.querySelector('[data-setting="batch-progress-locator"]');
    const batchHistoryLimitInput = panel.querySelector('[data-setting="batch-open-history-limit"]');
    const batchHistoryColorInput = panel.querySelector('[data-setting="batch-open-history-color"]');
    const batchHistoryColorResetButton = panel.querySelector('[data-action="reset-batch-open-history-color"]');
    const searchFilterInput = panel.querySelector('[data-setting="search-filter"]');
    const browseFilterInput = panel.querySelector('[data-setting="browse-filter"]');
    const keywordsInput = panel.querySelector('[data-setting="keywords"]');
    layoutInput.checked = isHdblogArticleLayoutEnabled();
    widthInput.value = rawStoredWidth() || String(DEFAULT_HDBLOG_ARTICLE_WIDTH);
    downloadsInput.checked = readDownloadAreaVisible();
    imageDownloadInput.checked = readImageDownloadButtonVisible();
    downloadGuardInput.checked = isDownloadGuardEnabled(HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY);
    crossSearchInput.checked = isHdblogCrossSearchEnabled();
    copyCodeInput.checked = isHdblogCopyCodeEnabled();
    previewInput.checked = isHdblogPreviewExpansionEnabled();
    javfreePreviewInput.checked = isHdblogJavfreePreviewFallbackEnabled();
    deletedJavfreeSearchInput.checked = isHdblogDeletedJavfreeSearchEnabled();
    batchOpenInput.checked = isHdblogBatchOpenEnabled();
    const batchInterval = getHdblogBatchOpenInterval();
    batchIntervalMinInput.value = String(batchInterval.delayMin / 1e3);
    batchIntervalMaxInput.value = String(batchInterval.delayMax / 1e3);
    batchHistoryInput.checked = isHdblogBatchOpenHistoryEnabled();
    batchUnopenedOnlyInput.checked = isHdblogBatchOpenUnopenedOnlyEnabled();
    batchProgressLocatorInput.checked = isHdblogBatchProgressLocatorEnabled();
    batchHistoryLimitInput.value = String(getHdblogBatchOpenHistoryLimit());
    batchHistoryColorInput.value = getHdblogBatchOpenHistoryColor();
    searchFilterInput.checked = isHdblogSearchFilterEnabled();
    browseFilterInput.checked = isHdblogBrowseFilterEnabled2();
    keywordsInput.value = readBlockedKeywordsText();
    const syncDependentFields = () => {
      widthInput.disabled = !layoutInput.checked;
      downloadGuardInput.disabled = !imageDownloadInput.checked;
      keywordsInput.disabled = !searchFilterInput.checked && !browseFilterInput.checked;
      javfreePreviewInput.disabled = !previewInput.checked;
      const batchIntervalDisabled = !batchOpenInput.checked;
      batchIntervalMinInput.disabled = batchIntervalDisabled;
      batchIntervalMaxInput.disabled = batchIntervalDisabled;
      batchIntervalResetButton.disabled = batchIntervalDisabled;
      batchHistoryInput.disabled = batchIntervalDisabled;
      batchUnopenedOnlyInput.disabled = batchIntervalDisabled || !batchHistoryInput.checked;
      batchProgressLocatorInput.disabled = batchIntervalDisabled || !batchHistoryInput.checked;
      batchHistoryLimitInput.disabled = batchIntervalDisabled || !batchHistoryInput.checked;
    };
    syncDependentFields();
    layoutInput.addEventListener("change", syncDependentFields);
    imageDownloadInput.addEventListener("change", syncDependentFields);
    searchFilterInput.addEventListener("change", syncDependentFields);
    browseFilterInput.addEventListener("change", syncDependentFields);
    previewInput.addEventListener("change", syncDependentFields);
    batchOpenInput.addEventListener("change", syncDependentFields);
    batchHistoryInput.addEventListener("change", syncDependentFields);
    batchIntervalResetButton.addEventListener("click", () => {
      batchIntervalMinInput.value = String(DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MIN_MS / 1e3);
      batchIntervalMaxInput.value = String(DEFAULT_HDBLOG_BATCH_OPEN_INTERVAL_MAX_MS / 1e3);
      batchIntervalResetButton.blur();
    });
    batchHistoryColorResetButton.addEventListener("click", () => {
      batchHistoryColorInput.value = DEFAULT_HDBLOG_BATCH_OPEN_HISTORY_COLOR;
      batchHistoryColorResetButton.blur();
    });
    panel.querySelector('[data-action="cancel"]')?.addEventListener("click", () => closeHdblogSettingsPanel(document2));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeHdblogSettingsPanel(document2);
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const widthText = widthInput.value.trim();
      let numeric = DEFAULT_HDBLOG_ARTICLE_WIDTH;
      if (widthText) {
        numeric = Number.parseInt(widthText, 10);
        if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
          document2.defaultView?.alert(`\u8BF7\u8F93\u5165 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} \u4E4B\u95F4\u7684\u6574\u6570\u3002`);
          widthInput.focus();
          return;
        }
      }
      const batchIntervalMinSeconds = Number(batchIntervalMinInput.value);
      const batchIntervalMaxSeconds = Number(batchIntervalMaxInput.value);
      if (!Number.isFinite(batchIntervalMinSeconds) || !Number.isFinite(batchIntervalMaxSeconds) || batchIntervalMinSeconds < 0.1 || batchIntervalMaxSeconds > 600 || batchIntervalMaxSeconds < batchIntervalMinSeconds) {
        document2.defaultView?.alert("\u6279\u91CF\u6253\u5F00\u4E3B\u9898\u95F4\u9694\u8BF7\u8F93\u5165 0.1\u2013600 \u79D2\uFF0C\u4E14\u6700\u5927\u95F4\u9694\u4E0D\u80FD\u5C0F\u4E8E\u6700\u5C0F\u95F4\u9694\u3002");
        batchIntervalMinInput.focus();
        return;
      }
      const batchHistoryLimit = Number(batchHistoryLimitInput.value);
      if (!Number.isInteger(batchHistoryLimit) || batchHistoryLimit < 1 || batchHistoryLimit > 5e4) {
        document2.defaultView?.alert("\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u4FDD\u5B58\u6761\u6570\u8BF7\u8F93\u5165 1\u201350000 \u7684\u6574\u6570\u3002");
        batchHistoryLimitInput.focus();
        return;
      }
      const batchIntervalMinMs = Math.round(batchIntervalMinSeconds * 1e3);
      const batchIntervalMaxMs = Math.round(batchIntervalMaxSeconds * 1e3);
      if (typeof GM_setValue === "function") {
        GM_setValue(HDBLOG_ARTICLE_LAYOUT_ENABLED_KEY, layoutInput.checked);
        GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, numeric);
        GM_setValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, downloadsInput.checked);
        GM_setValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, imageDownloadInput.checked);
        GM_setValue(HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY, downloadGuardInput.checked);
        GM_setValue(HDBLOG_SHOW_CROSS_SEARCH_BUTTON_KEY, crossSearchInput.checked);
        GM_setValue(HDBLOG_SHOW_COPY_CODE_BUTTON_KEY, copyCodeInput.checked);
        GM_setValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY2, previewInput.checked);
        GM_setValue(HDBLOG_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, javfreePreviewInput.checked);
        GM_setValue(HDBLOG_DELETED_JAVFREE_SEARCH_ENABLED_KEY, deletedJavfreeSearchInput.checked);
        GM_setValue(HDBLOG_BATCH_OPEN_ENABLED_KEY2, batchOpenInput.checked);
        GM_setValue(HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY2, batchIntervalMinMs);
        GM_setValue(HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY2, batchIntervalMaxMs);
        GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY2, batchHistoryInput.checked);
        GM_setValue(HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY2, batchUnopenedOnlyInput.checked);
        GM_setValue(HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY2, batchProgressLocatorInput.checked);
        GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY2, batchHistoryLimit);
        GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY2, batchHistoryColorInput.value);
        if (typeof GM_getValue === "function") {
          const existingHistory = GM_getValue(HDBLOG_BATCH_OPEN_HISTORY_KEY2, []);
          if (Array.isArray(existingHistory) && existingHistory.length > batchHistoryLimit) {
            GM_setValue(HDBLOG_BATCH_OPEN_HISTORY_KEY2, existingHistory.slice(-batchHistoryLimit));
          }
        }
        GM_setValue(HDBLOG_SEARCH_FILTER_ENABLED_KEY2, searchFilterInput.checked);
        GM_setValue(HDBLOG_BROWSE_FILTER_ENABLED_KEY2, browseFilterInput.checked);
        GM_setValue(HDBLOG_BLOCKED_KEYWORDS_KEY, normalizeBlockedKeywordsText(keywordsInput.value));
      }
      closeHdblogSettingsPanel(document2);
      const view = document2.defaultView;
      if (view?.location?.reload) view.location.reload();
    });
    overlay.append(panel);
    document2.body.append(overlay);
    return overlay;
  }
  function registerHdblogSettingsMenu(document2, locationObject) {
    if (!isHdblogHost3(locationObject) || typeof GM_registerMenuCommand !== "function") return;
    const view = document2?.defaultView;
    if (view && view.top !== view) return;
    GM_registerMenuCommand("\u2699\uFE0F hdblog \u8BBE\u7F6E", () => openHdblogSettingsPanel(document2));
  }
  function installHdblogArticleEnhancement(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2) return;
    registerHdblogSettingsMenu(document2, locationObject);
    if (!isHdblogArticlePage(document2, locationObject)) return;
    const storedWidth = readStoredWidth();
    if (isHdblogArticleLayoutEnabled()) {
      applyHdblogArticleLayout(document2, storedWidth || DEFAULT_HDBLOG_ARTICLE_WIDTH);
    } else {
      clearHdblogArticleLayout(document2);
    }
    applyHdblogDownloadAreaVisibility(document2, readDownloadAreaVisible());
    if (readImageDownloadButtonVisible()) installDownloadButton(document2, locationObject, gmRequest2);
    else document2.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
    if (isHdblogCrossSearchEnabled()) installAgaghhhSearchButton(document2);
    else document2.getElementById(SEARCH_BUTTON_ID)?.remove();
    if (isHdblogCopyCodeEnabled()) installCopyCodeButton(document2);
    else document2.getElementById(COPY_BUTTON_ID)?.remove();
  }

  // src/hdblog-preview.js
  var IMAGE_EXTENSION_PATTERN3 = /\.(?:jpe?g|png|webp|gif|avif)$/i;
  var PREVIEW_BOUNDARY_PATTERN2 = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  var PREVIEW_VIEWPORT_WIDTH = "min(var(--x1080x-hdblog-article-width, 100%), calc(100vw - 40px))";
  function normalizeText3(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHost4(locationObject) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "hdblog.me" || hostname.endsWith(".hdblog.me");
  }
  function absoluteHttpUrl3(document2, value) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(value)) return "";
    try {
      const url = new URL(value, document2.baseURI);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function pixhostShowHref(document2, anchor) {
    const href = absoluteHttpUrl3(document2, anchor?.getAttribute("href"));
    return href && isPixhostShowUrl(href, document2.baseURI) ? href : "";
  }
  function directImageHref2(document2, anchor) {
    const href = absoluteHttpUrl3(document2, anchor?.getAttribute("href"));
    if (!href || isPixhostShowUrl(href, document2.baseURI)) return "";
    try {
      return IMAGE_EXTENSION_PATTERN3.test(new URL(href).pathname) ? href : "";
    } catch {
      return "";
    }
  }
  function wordpressOriginalUrl(document2, value) {
    const href = absoluteHttpUrl3(document2, value);
    if (!href) return "";
    try {
      const url = new URL(href);
      if (!/(?:\/wp-content\/uploads\/|\/uploads\/)/i.test(url.pathname)) return "";
      const originalPath = url.pathname.replace(
        /-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif|avif)$)/i,
        ""
      );
      if (originalPath === url.pathname) return "";
      url.pathname = originalPath;
      return url.href;
    } catch {
      return "";
    }
  }
  function largestSrcsetUrl3(document2, value) {
    const candidates = String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean).map((part, order) => {
      const match = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      const rawUrl = match ? match[1] : part.split(/\s+/, 1)[0];
      const amount = match ? Number(match[2]) : order;
      const score = match?.[3]?.toLowerCase() === "x" ? amount * 1e5 : amount;
      const url = absoluteHttpUrl3(document2, rawUrl);
      return url ? { url, score } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return candidates[0]?.url || "";
  }
  function previewThumbnailUrl(document2, image) {
    const candidates = [
      image?.currentSrc,
      image?.getAttribute("src"),
      image?.getAttribute("data-original"),
      image?.getAttribute("data-lazy-src"),
      image?.getAttribute("data-src")
    ];
    for (const candidate of candidates) {
      const url = absoluteHttpUrl3(document2, candidate);
      if (url) return url;
    }
    return "";
  }
  function bestPreviewImageUrl(document2, image) {
    const anchor = image.closest("a[href]");
    if (pixhostShowHref(document2, anchor)) return "";
    const rawCandidates = [
      directImageHref2(document2, anchor),
      image.getAttribute("data-orig-file"),
      image.getAttribute("data-original"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-src"),
      image.currentSrc,
      image.getAttribute("src")
    ];
    for (const candidate of rawCandidates) {
      const direct = absoluteHttpUrl3(document2, candidate);
      if (!direct) continue;
      const original = wordpressOriginalUrl(document2, direct);
      if (original) return original;
      if (candidate === rawCandidates[0] || candidate === image.getAttribute("data-orig-file")) {
        return direct;
      }
    }
    const srcsetCandidates = [
      image.getAttribute("data-srcset"),
      image.getAttribute("data-lazy-srcset"),
      image.getAttribute("srcset")
    ];
    for (const value of srcsetCandidates) {
      const url = largestSrcsetUrl3(document2, value);
      if (url) return wordpressOriginalUrl(document2, url) || url;
    }
    for (const candidate of rawCandidates) {
      const url = absoluteHttpUrl3(document2, candidate);
      if (url) return url;
    }
    return "";
  }
  function textNodesUnder3(root) {
    const view = root.ownerDocument.defaultView;
    const walker = root.ownerDocument.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest("script, style, noscript, textarea")) nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }
  function findPreviewMarker(root) {
    return textNodesUnder3(root).find((node) => /^preview\s*[:：]?$/i.test(normalizeText3(node.nodeValue))) || null;
  }
  function isAfter3(reference, node) {
    return Boolean(reference.compareDocumentPosition(node) & 4);
  }
  function findBoundary(root, marker) {
    return textNodesUnder3(root).find((node) => {
      if (!isAfter3(marker, node)) return false;
      const text = normalizeText3(node.nodeValue);
      return text && PREVIEW_BOUNDARY_PATTERN2.test(text);
    }) || null;
  }
  function inPreviewRange2(marker, boundary, node) {
    if (!isAfter3(marker, node)) return false;
    return !boundary || !isAfter3(boundary, node);
  }
  function findArticleContent(document2) {
    const article = document2.querySelector(
      "main#genesis-content article.entry, main#genesis-content article, article.entry, article.post, article"
    );
    if (article) {
      return article.querySelector(".entry-content, .post-content, .post-entry, .entry-body") || article;
    }
    return document2.querySelector("main#genesis-content, main, #content") || document2.body;
  }
  function revealPreviewOverflow(image) {
    const document2 = image.ownerDocument;
    const view = document2.defaultView;
    let ancestor = image.parentElement;
    while (ancestor && ancestor !== document2.body && ancestor !== document2.documentElement) {
      try {
        const computed = view?.getComputedStyle?.(ancestor);
        if (computed?.overflow === "hidden" || computed?.overflow === "clip") {
          ancestor.style.setProperty("overflow", "visible", "important");
        }
        if (computed?.overflowX === "hidden" || computed?.overflowX === "clip") {
          ancestor.style.setProperty("overflow-x", "visible", "important");
        }
      } catch {
      }
      ancestor = ancestor.parentElement;
    }
  }
  function styleViewportBleed(element) {
    element.style.setProperty("display", "block", "important");
    element.style.setProperty("float", "none", "important");
    element.style.setProperty("clear", "both", "important");
    element.style.setProperty("box-sizing", "border-box", "important");
    element.style.setProperty("position", "relative", "important");
    element.style.setProperty("left", "50%", "important");
    element.style.setProperty("transform", "translateX(-50%)", "important");
    element.style.setProperty("width", PREVIEW_VIEWPORT_WIDTH, "important");
    element.style.setProperty("max-width", "none", "important");
    element.style.setProperty("margin", "14px 0", "important");
    element.style.setProperty("overflow", "visible", "important");
  }
  function styleExpandedImage(image, fullUrl) {
    if (!fullUrl) return false;
    if (image.dataset.x1080xPreviewLarge === "1" && image.src === fullUrl) {
      makePreviewGestureFriendly(image);
      return false;
    }
    image.src = fullUrl;
    [
      "srcset",
      "sizes",
      "width",
      "height",
      "data-original",
      "data-lazy-src",
      "data-src",
      "data-srcset",
      "data-lazy-srcset"
    ].forEach((attribute) => image.removeAttribute(attribute));
    image.loading = "eager";
    image.decoding = "async";
    image.dataset.x1080xPreviewLarge = "1";
    image.dataset.x1080xPreviewExpanded = "1";
    revealPreviewOverflow(image);
    image.style.setProperty("display", "block", "important");
    image.style.setProperty("float", "none", "important");
    image.style.setProperty("clear", "both", "important");
    image.style.setProperty("width", "auto", "important");
    image.style.setProperty("height", "auto", "important");
    image.style.setProperty("max-height", "none", "important");
    image.style.setProperty("object-fit", "contain", "important");
    const anchor = image.closest("a[href]");
    if (anchor) {
      anchor.href = fullUrl;
      styleViewportBleed(anchor);
      anchor.style.setProperty("text-align", "center", "important");
      image.style.setProperty("max-width", "100%", "important");
      image.style.setProperty("position", "static", "important");
      image.style.setProperty("left", "auto", "important");
      image.style.setProperty("transform", "none", "important");
      image.style.setProperty("margin", "0 auto", "important");
    } else {
      image.style.setProperty("max-width", PREVIEW_VIEWPORT_WIDTH, "important");
      image.style.setProperty("position", "relative", "important");
      image.style.setProperty("left", "50%", "important");
      image.style.setProperty("transform", "translateX(-50%)", "important");
      image.style.setProperty("margin", "14px 0", "important");
    }
    makePreviewGestureFriendly(image);
    return true;
  }
  function previewRange2(document2, locationObject) {
    if (!document2 || !isHdblogHost4(locationObject)) return null;
    const content = findArticleContent(document2);
    if (!content) return null;
    const marker = findPreviewMarker(content);
    if (!marker) return null;
    return { content, marker, boundary: findBoundary(content, marker) };
  }
  function expandHdblogPreviewImages2(document2, locationObject = document2?.location) {
    const range = previewRange2(document2, locationObject);
    if (!range) return 0;
    const { content, marker, boundary } = range;
    let expanded = 0;
    const handled = /* @__PURE__ */ new Set();
    [...content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange2(marker, boundary, anchor)).forEach((anchor) => {
      if (pixhostShowHref(document2, anchor)) return;
      const fullUrl = directImageHref2(document2, anchor);
      if (!fullUrl) return;
      let image = anchor.querySelector("img");
      if (!image) {
        image = document2.createElement("img");
        image.alt = normalizeText3(anchor.textContent) || "Preview";
        anchor.replaceChildren(image);
      }
      if (styleExpandedImage(image, wordpressOriginalUrl(document2, fullUrl) || fullUrl)) {
        handled.add(image);
        expanded += 1;
      }
    });
    [...content.querySelectorAll("img")].filter((image) => inPreviewRange2(marker, boundary, image) && !handled.has(image)).forEach((image) => {
      if (styleExpandedImage(image, bestPreviewImageUrl(document2, image))) expanded += 1;
    });
    return expanded;
  }
  async function expandHdblogPixhostPreviewImages(document2, locationObject = document2?.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const range = previewRange2(document2, locationObject);
    if (!range) return 0;
    const { content, marker, boundary } = range;
    const anchors = [...content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange2(marker, boundary, anchor)).map((anchor) => ({ anchor, showUrl: pixhostShowHref(document2, anchor) })).filter(({ showUrl }) => showUrl);
    const results = await Promise.all(anchors.map(async ({ anchor, showUrl }) => {
      let image = anchor.querySelector("img");
      const thumbnailUrl2 = previewThumbnailUrl(document2, image);
      const fullUrl = await resolvePixhostShowUrl(document2, showUrl, thumbnailUrl2, gmRequest2);
      if (!fullUrl) return false;
      if (!image) {
        image = document2.createElement("img");
        image.alt = normalizeText3(anchor.textContent) || "Preview";
        anchor.replaceChildren(image);
      }
      return styleExpandedImage(image, fullUrl);
    }));
    return results.filter(Boolean).length;
  }
  function installHdblogPreviewImages(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isHdblogHost4(locationObject) || !isHdblogPreviewExpansionEnabled()) return;
    const run = () => {
      if (!isHdblogPreviewExpansionEnabled()) return;
      expandHdblogPreviewImages2(document2, locationObject);
      void expandHdblogPixhostPreviewImages(document2, locationObject);
    };
    run();
    const view = document2.defaultView;
    if (!view) return;
    view.setTimeout(run, 400);
    view.setTimeout(run, 1400);
  }

  // src/hdblog-refer.js
  var REQUEST_TIMEOUT5 = 3e4;
  var PREVIEW_BOUNDARY_PATTERN3 = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  var resolutionCache2 = /* @__PURE__ */ new Map();
  function normalizeText4(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHostname(hostname) {
    const host = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
    return host === "hdblog.me" || host.endsWith(".hdblog.me");
  }
  function absoluteHttpUrl4(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function isHdblogReferUrl(value, baseUrl = "https://hdblog.me/") {
    const href = absoluteHttpUrl4(value, baseUrl);
    if (!href) return false;
    try {
      const url = new URL(href);
      return isHdblogHostname(url.hostname) && /^\/refer\/[^?#]+/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function responseHeadersMap(value) {
    const headers = /* @__PURE__ */ new Map();
    String(value ?? "").split(/\r?\n/).forEach((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) return;
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    });
    return headers;
  }
  function htmlRedirectTarget(document2, html, baseUrl) {
    if (!document2 || !html) return "";
    try {
      const parsed = document2.implementation.createHTMLDocument("hdblog-refer");
      parsed.documentElement.innerHTML = String(html);
      const meta = parsed.querySelector("meta[http-equiv]");
      if (meta && /^refresh$/i.test(meta.getAttribute("http-equiv") || "")) {
        const content = meta.getAttribute("content") || "";
        const match = content.match(/(?:^|;)\s*url\s*=\s*["']?([^"']+)\s*$/i);
        const target = absoluteHttpUrl4(match?.[1], baseUrl);
        if (target) return target;
      }
    } catch {
    }
    const scriptMatch = String(html).match(
      /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i
    );
    return absoluteHttpUrl4(scriptMatch?.[1], baseUrl);
  }
  function targetFromResponse(document2, response, referUrl) {
    const finalUrl = absoluteHttpUrl4(
      response?.finalUrl || response?.responseURL,
      referUrl
    );
    if (finalUrl && finalUrl !== referUrl && !isHdblogReferUrl(finalUrl, referUrl)) {
      return finalUrl;
    }
    const location2 = responseHeadersMap(response?.responseHeaders).get("location");
    const locationUrl = absoluteHttpUrl4(location2, referUrl);
    if (locationUrl && !isHdblogReferUrl(locationUrl, referUrl)) return locationUrl;
    const html = String(response?.responseText ?? response?.response ?? "");
    const htmlTarget = htmlRedirectTarget(document2, html, referUrl);
    return htmlTarget && !isHdblogReferUrl(htmlTarget, referUrl) ? htmlTarget : "";
  }
  function requestReferTarget(document2, referUrl, gmRequest2, referer) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest2({
        method: "GET",
        url: referUrl,
        responseType: "text",
        timeout: REQUEST_TIMEOUT5,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          ...referer ? { Referer: referer } : {}
        },
        onload(response) {
          if (response.status >= 400 || response.status === 0) {
            reject(new Error(`hdblog refer \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
            return;
          }
          const target = targetFromResponse(document2, response, referUrl);
          if (!target) {
            reject(new Error("hdblog refer \u6CA1\u6709\u8FD4\u56DE\u53EF\u8BC6\u522B\u7684\u8DF3\u8F6C\u5730\u5740"));
            return;
          }
          resolve(target);
        },
        onerror: () => reject(new Error("hdblog refer \u8BF7\u6C42\u53D1\u751F\u7F51\u7EDC\u9519\u8BEF")),
        ontimeout: () => reject(new Error("hdblog refer \u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  function resolveHdblogReferUrl(document2, referUrl, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const absoluteReferUrl = absoluteHttpUrl4(referUrl, document2?.baseURI || "https://hdblog.me/");
    if (!absoluteReferUrl || !isHdblogReferUrl(absoluteReferUrl, document2?.baseURI)) {
      return Promise.resolve("");
    }
    if (resolutionCache2.has(absoluteReferUrl)) return resolutionCache2.get(absoluteReferUrl);
    const promise = requestReferTarget(
      document2,
      absoluteReferUrl,
      gmRequest2,
      document2?.location?.href
    ).catch(() => "");
    resolutionCache2.set(absoluteReferUrl, promise);
    return promise;
  }
  function textNodesUnder4(root) {
    const view = root.ownerDocument.defaultView;
    const showText = view?.NodeFilter?.SHOW_TEXT ?? 4;
    const walker = root.ownerDocument.createTreeWalker(root, showText);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest("script, style, noscript, textarea")) nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }
  function isAfter4(reference, node) {
    return Boolean(reference?.compareDocumentPosition(node) & 4);
  }
  function findArticleContent2(document2) {
    const article = document2.querySelector(
      "main#genesis-content article.entry, main#genesis-content article, article.entry, article.post, article"
    );
    if (article) {
      return article.querySelector(".entry-content, .post-content, .post-entry, .entry-body") || article;
    }
    return document2.querySelector("main#genesis-content, main, #content") || document2.body;
  }
  function previewRange3(document2, locationObject) {
    if (!document2 || !isHdblogHostname(locationObject?.hostname)) return null;
    const content = findArticleContent2(document2);
    if (!content) return null;
    const nodes = textNodesUnder4(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText4(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter4(marker, node) && PREVIEW_BOUNDARY_PATTERN3.test(normalizeText4(node.nodeValue))) || null;
    return { content, marker, boundary };
  }
  function inPreviewRange3(range, node) {
    if (!range || !isAfter4(range.marker, node)) return false;
    return !range.boundary || !isAfter4(range.boundary, node);
  }
  async function resolveHdblogPreviewReferLinks(document2, locationObject = document2?.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const range = previewRange3(document2, locationObject);
    if (!range) return 0;
    const anchors = [...range.content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange3(range, anchor)).map((anchor) => ({
      anchor,
      referUrl: absoluteHttpUrl4(anchor.getAttribute("href"), document2.baseURI)
    })).filter(({ referUrl }) => isHdblogReferUrl(referUrl, document2.baseURI));
    if (!anchors.length) return 0;
    const results = await Promise.all(anchors.map(async ({ anchor, referUrl }) => {
      const target = await resolveHdblogReferUrl(document2, referUrl, gmRequest2);
      if (!target) return false;
      anchor.dataset.x1080xHdblogReferUrl = referUrl;
      anchor.href = target;
      return true;
    }));
    const resolved = results.filter(Boolean).length;
    if (resolved) {
      expandHdblogPreviewImages2(document2, locationObject);
      await expandHdblogPixhostPreviewImages(document2, locationObject, gmRequest2);
    }
    return resolved;
  }
  function installHdblogReferResolver(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2 || !isHdblogHostname(locationObject?.hostname) || !isHdblogPreviewExpansionEnabled()) return;
    const run = () => {
      if (!isHdblogPreviewExpansionEnabled()) return;
      void resolveHdblogPreviewReferLinks(document2, locationObject, gmRequest2);
    };
    run();
    const view = document2.defaultView;
    if (!view) return;
    view.setTimeout(run, 500);
    view.setTimeout(run, 1500);
  }

  // src/preview-image-health.js
  var PIXHOST_IMAGE_HOST = /^(?:img\d+|t\d+)\.(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i;
  var IMAGE_CHECK_TIMEOUT = 8e3;
  function isPixhostAssetUrl2(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && PIXHOST_IMAGE_HOST.test(url.hostname) && /^\/(?:images|thumbs)\//i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function isPixhostRemovedPlaceholder(value, width, height) {
    if (!isPixhostAssetUrl2(value)) return false;
    return width >= 240 && width <= 285 && height >= 110 && height <= 155 && width / height >= 1.7 && width / height <= 2.35;
  }
  function checkPixhostPreviewImage(value, document2, timeout = IMAGE_CHECK_TIMEOUT) {
    if (!isPixhostAssetUrl2(value)) return Promise.resolve(true);
    const ImageConstructor = document2?.defaultView?.Image;
    if (typeof ImageConstructor !== "function") return Promise.resolve(true);
    return new Promise((resolve) => {
      const image = new ImageConstructor();
      let settled = false;
      let timer;
      const finish = (valid) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(valid);
      };
      image.onload = () => finish(
        image.naturalWidth > 0 && image.naturalHeight > 0 && !isPixhostRemovedPlaceholder(value, image.naturalWidth, image.naturalHeight)
      );
      image.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), timeout);
      image.src = value;
      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        image.onload();
      }
    });
  }
  async function filterPixhostUnavailableImageUrls(result, document2) {
    if (!result?.imageUrls?.length) return result;
    const valid = await Promise.all(result.imageUrls.map(
      (url) => checkPixhostPreviewImage(url, document2)
    ));
    if (valid.every(Boolean)) return result;
    const imageUrls = result.imageUrls.filter((_url, index) => valid[index]);
    console.warn("[x1080x-ex] Pixhost unavailable Preview skipped", {
      code: result.code,
      skipped: result.imageUrls.length - imageUrls.length
    });
    return { ...result, imageUrls };
  }

  // src/agaghhh-preview-official.js
  var AV_WIKI_ORIGIN = "https://av-wiki.net";
  var FANZA_IMAGE_ORIGIN = "https://pics.dmm.co.jp";
  var FANZA_REFERER = "https://www.dmm.co.jp/";
  var MGS_ORIGIN = "https://www.mgstage.com";
  var REQUEST_TIMEOUT6 = 3e4;
  var MAX_PREVIEW_IMAGES = 20;
  var AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY = "x1080x-ex:agaghhh-official-preview-fallback-enabled";
  function normalizeText5(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function absoluteHttpUrl5(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function gmRequest(details, request = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof request !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      request({
        timeout: REQUEST_TIMEOUT6,
        ...details,
        onload: resolve,
        onerror: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25")),
        ontimeout: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  async function requestText2(url, request, options = {}) {
    const response = await gmRequest({
      method: "GET",
      url,
      responseType: "text",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        ...options.referer ? { Referer: options.referer } : {},
        ...options.headers || {}
      },
      ...options.cookie ? { cookie: options.cookie } : {}
    }, request);
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`);
    }
    return {
      html: String(response.responseText ?? response.response ?? ""),
      finalUrl: response.finalUrl || response.responseURL || url
    };
  }
  async function urlExists(url, request, referer = "") {
    try {
      const response = await gmRequest({
        method: "HEAD",
        url,
        responseType: "text",
        headers: referer ? { Referer: referer } : void 0
      }, request);
      return response.status >= 200 && response.status < 400;
    } catch {
      return false;
    }
  }
  function parseHtml2(html, baseUrl, hostDocument = globalThis.document) {
    const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    const parsed = new Parser().parseFromString(String(html || ""), "text/html");
    const base = parsed.createElement("base");
    base.href = baseUrl;
    (parsed.head || parsed.documentElement).prepend(base);
    return parsed;
  }
  function codeTokenMatches2(text, code) {
    const target = String(code || "").trim().toUpperCase();
    if (!target) return false;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, "i").test(normalizeText5(text).toUpperCase());
  }
  function findAvWikiResultUrl(document2, code) {
    if (!document2 || !code) return "";
    const exactPath = `/${String(code).toLowerCase()}/`;
    const anchors = [...document2.querySelectorAll("a[href]")];
    for (const anchor of anchors) {
      const url = absoluteHttpUrl5(anchor.getAttribute("href"), AV_WIKI_ORIGIN);
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (parsed.origin === AV_WIKI_ORIGIN && parsed.pathname.toLowerCase() === exactPath) return parsed.href;
      } catch {
      }
    }
    for (const anchor of anchors) {
      const article = anchor.closest("article");
      if (!codeTokenMatches2(article?.textContent || anchor.textContent, code)) continue;
      const url = absoluteHttpUrl5(anchor.getAttribute("href"), AV_WIKI_ORIGIN);
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (parsed.origin === AV_WIKI_ORIGIN && parsed.pathname !== "/") return parsed.href;
      } catch {
      }
    }
    return "";
  }
  function cleanProviderId(value) {
    return normalizeText5(value).replace(/^(?:MGS|FANZA)\s*品番\s*[:：]?\s*/i, "").split(/\s+/, 1)[0].replace(/[，,;；]+$/u, "").trim();
  }
  function labeledValue(document2, labelPattern) {
    if (!document2) return "";
    for (const row of document2.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      if (cells.length < 2) continue;
      if (labelPattern.test(normalizeText5(cells[0].textContent))) {
        return cleanProviderId(cells[1].textContent);
      }
    }
    for (const term of document2.querySelectorAll("dt")) {
      if (!labelPattern.test(normalizeText5(term.textContent))) continue;
      return cleanProviderId(term.nextElementSibling?.textContent || "");
    }
    const lines = String(document2.body?.innerText || document2.body?.textContent || "").replace(/\r/g, "").split("\n").map((line) => normalizeText5(line)).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      if (!labelPattern.test(lines[index])) continue;
      const inline = lines[index].replace(labelPattern, "").replace(/^\s*[:：]\s*/, "");
      if (inline) return cleanProviderId(inline);
      return cleanProviderId(lines[index + 1] || "");
    }
    return "";
  }
  function parseAvWikiProviderIds(document2) {
    return {
      fanzaId: labeledValue(document2, /^FANZA\s*品番\s*[:：]?/i),
      mgsId: labeledValue(document2, /^MGS\s*品番\s*[:：]?/i)
    };
  }
  async function fetchAvWikiProductInfo(code, request, hostDocument) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return { code: "", detailUrl: "", fanzaId: "", mgsId: "" };
    const searchUrl = `${AV_WIKI_ORIGIN}/?s=${encodeURIComponent(normalizedCode)}`;
    const search = await requestText2(searchUrl, request, { referer: `${AV_WIKI_ORIGIN}/` });
    const searchDocument = parseHtml2(search.html, search.finalUrl || searchUrl, hostDocument);
    const detailUrl = findAvWikiResultUrl(searchDocument, normalizedCode) || `${AV_WIKI_ORIGIN}/${normalizedCode.toLowerCase()}/`;
    const detail = await requestText2(detailUrl, request, { referer: searchUrl });
    const detailDocument = parseHtml2(detail.html, detail.finalUrl || detailUrl, hostDocument);
    return {
      code: normalizedCode,
      detailUrl,
      ...parseAvWikiProviderIds(detailDocument)
    };
  }
  function fanzaPreviewUrl(fanzaId, index, large = true) {
    const id = String(fanzaId || "").trim();
    if (!id || !Number.isInteger(index) || index < 1) return "";
    const suffix = large ? `jp-${index}.jpg` : `-${index}.jpg`;
    return `${FANZA_IMAGE_ORIGIN}/digital/video/${encodeURIComponent(id)}/${encodeURIComponent(id)}${suffix}`;
  }
  async function fetchFanzaPreviewImages(fanzaId, request = globalThis.GM_xmlhttpRequest) {
    const id = String(fanzaId || "").trim();
    if (!id) return [];
    const urls = [];
    let consecutiveMisses = 0;
    for (let index = 1; index <= MAX_PREVIEW_IMAGES; index += 1) {
      const thumbnail = fanzaPreviewUrl(id, index, false);
      const exists = await urlExists(thumbnail, request, FANZA_REFERER);
      if (exists) {
        urls.push(fanzaPreviewUrl(id, index, true));
        consecutiveMisses = 0;
        continue;
      }
      consecutiveMisses += 1;
      if (urls.length && consecutiveMisses >= 2) break;
      if (!urls.length && index >= 4) break;
    }
    return urls;
  }
  function parseMgsPreviewImages(document2, baseUrl) {
    if (!document2) return [];
    const seen = /* @__PURE__ */ new Set();
    return [...document2.querySelectorAll("a.sample_image[href], .sample_image[href]")].map((element) => absoluteHttpUrl5(element.getAttribute("href"), baseUrl)).filter((url) => url && !seen.has(url) && seen.add(url));
  }
  async function fetchMgsPreviewImages(mgsId, request = globalThis.GM_xmlhttpRequest, hostDocument = globalThis.document) {
    const id = String(mgsId || "").trim();
    if (!id) return { productUrl: "", imageUrls: [] };
    const productUrl = `${MGS_ORIGIN}/product/product_detail/${encodeURIComponent(id)}/`;
    const response = await requestText2(productUrl, request, {
      referer: `${MGS_ORIGIN}/`,
      cookie: "adc=1; coc=1",
      headers: { "Accept-Language": "ja-JP" }
    });
    const document2 = parseHtml2(response.html, response.finalUrl || productUrl, hostDocument);
    return {
      productUrl,
      imageUrls: parseMgsPreviewImages(document2, response.finalUrl || productUrl)
    };
  }
  function isOfficialPreviewFallbackEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY, true) !== false;
  }
  async function fetchOfficialPreviewFallbackForCode(code, request = globalThis.GM_xmlhttpRequest, hostDocument = globalThis.document) {
    const info = await fetchAvWikiProductInfo(code, request, hostDocument);
    if (!info.code) return { code: "", sourceName: "", sourceUrl: "", referer: "", imageUrls: [] };
    if (info.fanzaId) {
      try {
        const imageUrls = await fetchFanzaPreviewImages(info.fanzaId, request);
        if (imageUrls.length) {
          return {
            code: info.code,
            sourceName: "FANZA",
            sourceUrl: info.detailUrl,
            referer: FANZA_REFERER,
            imageUrls
          };
        }
      } catch (error) {
        console.warn("[x1080x-ex] FANZA preview fallback failed", {
          code: info.code,
          error: error?.message || String(error)
        });
      }
    }
    if (info.mgsId) {
      try {
        const mgs = await fetchMgsPreviewImages(info.mgsId, request, hostDocument);
        if (mgs.imageUrls.length) {
          return {
            code: info.code,
            sourceName: "MGStage",
            sourceUrl: mgs.productUrl || info.detailUrl,
            referer: mgs.productUrl || `${MGS_ORIGIN}/`,
            imageUrls: mgs.imageUrls
          };
        }
      } catch (error) {
        console.warn("[x1080x-ex] MGStage preview fallback failed", {
          code: info.code,
          error: error?.message || String(error)
        });
      }
    }
    return {
      code: info.code,
      sourceName: "",
      sourceUrl: info.detailUrl,
      referer: "",
      imageUrls: []
    };
  }
  function injectOfficialPreviewFallbackSetting(document2 = globalThis.document) {
    const overlay = document2?.getElementById("x1080x-ex-settings-panel");
    const form = overlay?.shadowRoot?.querySelector("form") || overlay?.querySelector("form");
    const master = form?.querySelector('[data-setting="hdblog-preview"]');
    if (!form || !master) return false;
    const masterLabel = master.closest("label");
    const strong = masterLabel?.querySelector("strong");
    const small = masterLabel?.querySelector("small");
    if (strong) strong.textContent = "\u663E\u793A\u5927\u9884\u89C8\u56FE";
    if (small) small.textContent = "\u4F18\u5148\u6309\u756A\u53F7\u641C\u7D22 hdblog\uFF1B\u6CA1\u6709\u53EF\u7528 Preview \u65F6\u4F9D\u6B21\u5C1D\u8BD5 JavFree\uFF0C\u518D\u5C1D\u8BD5\u5B98\u65B9\u540E\u5907\u6E90\u3002";
    let input = form.querySelector('[data-setting="official-preview-fallback"]');
    if (!input) {
      const label = document2.createElement("label");
      label.style.cssText = "display:flex;align-items:flex-start;gap:9px;margin:-3px 0 13px 24px";
      label.innerHTML = `
      <input data-setting="official-preview-fallback" type="checkbox" style="margin-top:3px">
      <span><strong>\u5B98\u65B9\u540E\u5907\u9884\u89C8\u56FE\uFF08FANZA / MGStage\uFF09</strong><small style="display:block;margin-top:2px;color:#666">\u4EC5\u5728 hdblog \u548C JavFree \u90FD\u6CA1\u6709\u53EF\u7528 Preview \u65F6\u542F\u7528\uFF0C\u987A\u5E8F\u4E3A FANZA \u5B98\u65B9\u56FE\u7247 CDN \u2192 MGStage \u5B98\u65B9\u5546\u54C1\u9875\u3002</small></span>`;
      const javfreeLabel = form.querySelector('[data-setting="javfree-preview-fallback"]')?.closest("label");
      (javfreeLabel || masterLabel)?.after(label);
      input = label.querySelector('[data-setting="official-preview-fallback"]');
    }
    input.checked = isOfficialPreviewFallbackEnabled();
    const syncDisabled = () => {
      input.disabled = !master.checked;
    };
    syncDisabled();
    if (master.dataset.x1080xOfficialFallbackBound !== "1") {
      master.dataset.x1080xOfficialFallbackBound = "1";
      master.addEventListener("change", syncDisabled);
    }
    if (form.dataset.x1080xOfficialFallbackBound !== "1") {
      form.dataset.x1080xOfficialFallbackBound = "1";
      form.addEventListener("submit", () => {
        if (typeof GM_setValue === "function") {
          GM_setValue(AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY, input.checked);
        }
      }, true);
    }
    return true;
  }
  function installOfficialPreviewFallbackSetting(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isAgaghhhHost(locationObject)) return null;
    if (injectOfficialPreviewFallbackSetting(document2)) return null;
    const Observer = document2.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (typeof Observer !== "function" || !document2.body) return null;
    const observer = new Observer(() => injectOfficialPreviewFallbackSetting(document2));
    observer.observe(document2.body, { childList: true, subtree: true });
    return observer;
  }

  // src/agaghhh-hdblog-preview.js
  installOfficialPreviewFallbackSetting();
  var HDBLOG_ORIGIN = "https://hdblog.me";
  var HDBLOG_BLOCKED_KEYWORDS_KEY2 = "x1080x-ex:hdblog-blocked-keywords";
  var DEFAULT_HDBLOG_BLOCKED_KEYWORDS2 = "\u30E2\u30B6\u30A4\u30AF\u7834\u58CA";
  var REQUEST_TIMEOUT7 = 3e4;
  var CONTAINER_ID = "x1080x-ex-agaghhh-hdblog-preview";
  var PREVIEW_IMAGE_ATTR = "data-x1080x-hdblog-preview-url";
  var IMAGE_EXTENSION_PATTERN4 = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
  var PREVIEW_BOUNDARY_PATTERN4 = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  function normalizeText6(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function absoluteHttpUrl6(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function requestText3(url, gmRequest2, referer = "") {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest2({
        method: "GET",
        url,
        responseType: "text",
        timeout: REQUEST_TIMEOUT7,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          ...referer ? { Referer: referer } : {}
        },
        onload(response) {
          if (response.status >= 400 || response.status === 0) {
            reject(new Error(`\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
            return;
          }
          resolve({
            html: String(response.responseText ?? response.response ?? ""),
            finalUrl: response.finalUrl || response.responseURL || url,
            responseHeaders: response.responseHeaders || ""
          });
        },
        onerror: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25")),
        ontimeout: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  function parseHtml3(html, baseUrl, hostDocument = globalThis.document) {
    const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    const parsed = new Parser().parseFromString(String(html || ""), "text/html");
    const base = parsed.createElement("base");
    base.href = baseUrl;
    (parsed.head || parsed.documentElement).prepend(base);
    return parsed;
  }
  function getHdblogBlockedKeywords() {
    if (typeof GM_getValue === "function" && GM_getValue("x1080x-ex:hdblog-search-filter-enabled", true) === false) return [];
    const stored = typeof GM_getValue === "function" ? GM_getValue(HDBLOG_BLOCKED_KEYWORDS_KEY2, null) : null;
    return parseBlockedKeywords(
      stored === null || stored === void 0 ? DEFAULT_HDBLOG_BLOCKED_KEYWORDS2 : stored
    );
  }
  function codeTokenMatches3(title, code) {
    const normalized = normalizeText6(title).toUpperCase();
    const target = String(code || "").trim().toUpperCase();
    if (!target) return false;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, "i").test(normalized);
  }
  function chooseHdblogSearchResult(candidates, code, keywords = getHdblogBlockedKeywords()) {
    const { blocked, remaining } = filterSearchCandidates(candidates, keywords);
    if (!remaining.length) return { blocked, remaining, selected: null };
    if (remaining.length === 1) return { blocked, remaining, selected: remaining[0] };
    const slug = String(code || "").trim().toLowerCase();
    const exactSlug = remaining.filter((candidate) => {
      try {
        const parts = new URL(candidate.url).pathname.toLowerCase().split("/").filter(Boolean);
        return parts.at(-1) === slug;
      } catch {
        return false;
      }
    });
    if (exactSlug.length === 1) return { blocked, remaining, selected: exactSlug[0] };
    const exactTitle = remaining.filter((candidate) => codeTokenMatches3(candidate.title, code));
    if (exactTitle.length === 1) return { blocked, remaining, selected: exactTitle[0] };
    return { blocked, remaining, selected: null };
  }
  function responseHeader(value, name) {
    const lower = String(name || "").toLowerCase();
    const line = String(value || "").split(/\r?\n/).find((entry) => {
      const separator = entry.indexOf(":");
      return separator > 0 && entry.slice(0, separator).trim().toLowerCase() === lower;
    });
    return line ? line.slice(line.indexOf(":") + 1).trim() : "";
  }
  function redirectFromHtml(html, baseUrl, hostDocument) {
    const parsed = parseHtml3(html, baseUrl, hostDocument);
    const meta = parsed?.querySelector("meta[http-equiv]");
    if (meta && /^refresh$/i.test(meta.getAttribute("http-equiv") || "")) {
      const content = meta.getAttribute("content") || "";
      const match = content.match(/(?:^|;)\s*url\s*=\s*["']?([^"']+)\s*$/i);
      const target = absoluteHttpUrl6(match?.[1], baseUrl);
      if (target) return target;
    }
    const scriptMatch = String(html).match(
      /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i
    );
    return absoluteHttpUrl6(scriptMatch?.[1], baseUrl);
  }
  async function resolveHdblogReferTarget(document2, referUrl, articleUrl, gmRequest2) {
    try {
      const response = await requestText3(referUrl, gmRequest2, articleUrl);
      const finalUrl = absoluteHttpUrl6(response.finalUrl, referUrl);
      if (finalUrl && finalUrl !== referUrl && !isHdblogReferUrl(finalUrl, referUrl)) {
        return finalUrl;
      }
      const location2 = absoluteHttpUrl6(responseHeader(response.responseHeaders, "location"), referUrl);
      if (location2 && !isHdblogReferUrl(location2, referUrl)) return location2;
      const htmlTarget = redirectFromHtml(response.html, referUrl, document2);
      return htmlTarget && !isHdblogReferUrl(htmlTarget, referUrl) ? htmlTarget : "";
    } catch {
      return "";
    }
  }
  function previewThumbnailUrl2(document2, image) {
    const candidates = [
      image?.currentSrc,
      image?.getAttribute("src"),
      image?.getAttribute("data-original"),
      image?.getAttribute("data-lazy-src"),
      image?.getAttribute("data-src")
    ];
    for (const candidate of candidates) {
      const url = absoluteHttpUrl6(candidate, document2.baseURI);
      if (url) return url;
    }
    return "";
  }
  function wordpressOriginalUrl2(value) {
    const href = absoluteHttpUrl6(value, HDBLOG_ORIGIN);
    if (!href) return "";
    try {
      const url = new URL(href);
      if (!/(?:\/wp-content\/uploads\/|\/uploads\/)/i.test(url.pathname)) return "";
      url.pathname = url.pathname.replace(
        /-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif|avif)$)/i,
        ""
      );
      return url.href;
    } catch {
      return "";
    }
  }
  function largestSrcsetUrl4(document2, value) {
    return String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean).map((part, order) => {
      const match = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      const rawUrl = match ? match[1] : part.split(/\s+/, 1)[0];
      const amount = match ? Number(match[2]) : order;
      const score = match?.[3]?.toLowerCase() === "x" ? amount * 1e5 : amount;
      const url = absoluteHttpUrl6(rawUrl, document2.baseURI);
      return url ? { url, score } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score)[0]?.url || "";
  }
  function pixhostAssetIdentity(value, baseUrl) {
    const href = absoluteHttpUrl6(value, baseUrl);
    if (!href) return "";
    try {
      const url = new URL(href);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      const isPixhostHost = /^(?:(?:t|img)\d+\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i.test(hostname);
      if (!isPixhostHost) return "";
      const match = url.pathname.match(/^\/(?:show|images|thumbs)\/(\d+)\/([^/?#]+)$/i);
      if (!match) return "";
      return `pixhost:${match[1]}/${match[2].toLowerCase()}`;
    } catch {
      return "";
    }
  }
  function existingPixhostAssets(content) {
    const identities = /* @__PURE__ */ new Set();
    if (!content) return identities;
    const add = (value) => {
      const identity = pixhostAssetIdentity(value, content.ownerDocument?.baseURI);
      if (identity) identities.add(identity);
    };
    for (const anchor of content.querySelectorAll("a[href]")) add(anchor.getAttribute("href"));
    for (const image of content.querySelectorAll("img")) {
      add(image.currentSrc);
      add(image.getAttribute("src"));
      add(image.getAttribute("data-original"));
      add(image.getAttribute("data-lazy-src"));
      add(image.getAttribute("data-src"));
    }
    return identities;
  }
  function bestImageUrl(document2, image) {
    if (!image) return "";
    const anchorHref = absoluteHttpUrl6(image.closest("a[href]")?.getAttribute("href"), document2.baseURI);
    const directAnchorHref = anchorHref && !isPixhostShowUrl(anchorHref, document2.baseURI) && IMAGE_EXTENSION_PATTERN4.test(anchorHref) ? anchorHref : "";
    const candidates = [
      directAnchorHref,
      image.getAttribute("data-orig-file"),
      image.getAttribute("data-original"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-src"),
      image.currentSrc,
      image.getAttribute("src")
    ];
    for (const candidate of candidates) {
      const url = absoluteHttpUrl6(candidate, document2.baseURI);
      if (!url) continue;
      return wordpressOriginalUrl2(url) || url;
    }
    const srcset = largestSrcsetUrl4(
      document2,
      image.getAttribute("data-srcset") || image.getAttribute("data-lazy-srcset") || image.getAttribute("srcset")
    );
    return wordpressOriginalUrl2(srcset) || srcset;
  }
  function textNodesUnder5(root) {
    const view = root.ownerDocument.defaultView;
    const showText = view?.NodeFilter?.SHOW_TEXT ?? 4;
    const walker = root.ownerDocument.createTreeWalker(root, showText);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest("script, style, noscript, textarea")) nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }
  function isAfter5(reference, node) {
    return Boolean(reference?.compareDocumentPosition(node) & 4);
  }
  function previewRange4(document2) {
    const article = document2.querySelector(
      "main#genesis-content article.entry, main#genesis-content article, article.entry, article.post, article"
    );
    const content = article?.querySelector(".entry-content, .post-content, .post-entry, .entry-body") || article || document2.querySelector("main#genesis-content, main, #content") || document2.body;
    if (!content) return null;
    const nodes = textNodesUnder5(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText6(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter5(marker, node) && PREVIEW_BOUNDARY_PATTERN4.test(normalizeText6(node.nodeValue))) || null;
    return { content, marker, boundary };
  }
  function inPreviewRange4(range, node) {
    if (!range || !isAfter5(range.marker, node)) return false;
    return !range.boundary || !isAfter5(range.boundary, node);
  }
  async function collectHdblogPreviewImageUrls(document2, articleUrl, gmRequest2, healthDocument = null) {
    const range = previewRange4(document2);
    if (!range) return [];
    const handledImages = /* @__PURE__ */ new Set();
    const candidates = [];
    for (const anchor of [...range.content.querySelectorAll("a[href]")].filter((node) => inPreviewRange4(range, node))) {
      const image = anchor.querySelector("img");
      if (image) handledImages.add(image);
      candidates.push({
        kind: "anchor",
        anchor,
        image,
        href: absoluteHttpUrl6(anchor.getAttribute("href"), document2.baseURI),
        thumbUrl: previewThumbnailUrl2(document2, image),
        values: [
          image?.getAttribute("src"),
          image?.getAttribute("data-original"),
          image?.getAttribute("data-lazy-src"),
          image?.getAttribute("data-src")
        ]
      });
    }
    for (const image of [...range.content.querySelectorAll("img")].filter((node) => inPreviewRange4(range, node) && !handledImages.has(node))) {
      candidates.push({
        kind: "image",
        image,
        directUrl: bestImageUrl(document2, image),
        values: [
          image.currentSrc,
          image.getAttribute("src"),
          image.getAttribute("data-original"),
          image.getAttribute("data-lazy-src"),
          image.getAttribute("data-src")
        ]
      });
    }
    const resolveCandidates = async (items) => {
      const urls = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (value) => {
        const url = absoluteHttpUrl6(value, articleUrl);
        if (!url) return;
        const key = pixhostAssetIdentity(url, articleUrl) || url;
        if (seen.has(key)) return;
        seen.add(key);
        urls.push(url);
      };
      for (const candidate of items) {
        if (candidate.kind === "image") {
          add(candidate.directUrl || bestImageUrl(document2, candidate.image));
          continue;
        }
        let target = candidate.href;
        const image = candidate.image;
        const thumbnail = candidate.thumbUrl;
        if (isHdblogReferUrl(target, document2.baseURI)) {
          target = await resolveHdblogReferTarget(document2, target, articleUrl, gmRequest2);
        }
        const pixhostShowTarget = target && isPixhostShowUrl(target, document2.baseURI);
        if (pixhostShowTarget) {
          target = await resolvePixhostShowUrl(document2, target, thumbnail, gmRequest2);
          if (!target) continue;
        }
        if (target && (IMAGE_EXTENSION_PATTERN4.test(target) || /^https?:\/\/img\d+\./i.test(target))) {
          add(wordpressOriginalUrl2(target) || target);
          continue;
        }
        if (image) add(bestImageUrl(document2, image));
      }
      return urls;
    };
    const verify = async (urls) => {
      if (!healthDocument || !urls.length) return urls;
      const checked = await filterPixhostUnavailableImageUrls({ imageUrls: urls }, healthDocument);
      return checked.imageUrls;
    };
    const { standard, fourK } = partitionPreviewCandidates(candidates);
    if (standard.length) {
      const standardUrls = await verify(await resolveCandidates(standard));
      if (standardUrls.length) return standardUrls;
    }
    return fourK.length ? verify(await resolveCandidates(fourK)) : [];
  }
  function hdblogSearchCodeForThreadCode(code) {
    const normalized = String(code || "").trim().toUpperCase();
    const fc2 = normalized.match(/^FC2-(?:PPV-)?(\d{5,9})$/i);
    if (fc2) return fc2[1];
    const uncensored = normalized.match(/^[A-Z0-9]{2,12}-(\d{6}[-_]\d{3,4})$/i);
    return uncensored?.[1] || normalized;
  }
  async function fetchHdblogPreviewForCode(code, gmRequest2 = globalThis.GM_xmlhttpRequest, hostDocument = globalThis.document, verifyImages = false) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return { code: "", articleUrl: "", imageUrls: [], blocked: [], remaining: [] };
    const searchCode = hdblogSearchCodeForThreadCode(normalizedCode);
    const searchUrl = `${HDBLOG_ORIGIN}/?s=${encodeURIComponent(searchCode)}`;
    const searchResponse = await requestText3(searchUrl, gmRequest2, `${HDBLOG_ORIGIN}/`);
    const searchDocument = parseHtml3(searchResponse.html, searchResponse.finalUrl || searchUrl, hostDocument);
    if (!searchDocument) return { code: normalizedCode, articleUrl: "", imageUrls: [], blocked: [], remaining: [] };
    const candidates = collectHdblogSearchResults(searchDocument);
    const selection = chooseHdblogSearchResult(candidates, searchCode, getHdblogBlockedKeywords());
    if (!selection.selected) {
      return { code: normalizedCode, articleUrl: "", imageUrls: [], ...selection };
    }
    const articleUrl = selection.selected.url;
    const articleResponse = await requestText3(articleUrl, gmRequest2, searchUrl);
    const articleDocument = parseHtml3(articleResponse.html, articleResponse.finalUrl || articleUrl, hostDocument);
    const imageUrls = articleDocument ? await collectHdblogPreviewImageUrls(
      articleDocument,
      articleUrl,
      gmRequest2,
      verifyImages ? hostDocument : null
    ) : [];
    return { code: normalizedCode, articleUrl, imageUrls, ...selection };
  }
  function threadCode(document2) {
    return parseThreadTitle(getThreadHeadingText(document2)).code;
  }
  function firstPostContent(document2) {
    const firstPost = [...document2.querySelectorAll('#postlist [id^="post_"]')].find((element) => /^post_\d+$/i.test(element.id)) || document2.querySelector("#postlist > div, #postlist") || document2.querySelector("#first-post");
    return firstPost?.querySelector('[id^="postmessage_"], .t_f, .post-text') || firstPost || null;
  }
  function isThreadPage2(locationObject) {
    try {
      const url = new URL(locationObject?.href || "");
      return /^\/resources\/[a-z0-9]+\/?$/i.test(url.pathname) || url.searchParams.get("mod") === "viewthread" && url.searchParams.has("tid");
    } catch {
      return false;
    }
  }
  function renderAgaghhhHdblogPreview(document2, result) {
    if (!document2 || !result?.imageUrls?.length || document2.getElementById(CONTAINER_ID)) return null;
    const content = firstPostContent(document2);
    if (!content) return null;
    const existingAssets = existingPixhostAssets(content);
    const seenResultAssets = /* @__PURE__ */ new Set();
    const imageUrls = result.imageUrls.filter((value) => {
      const url = absoluteHttpUrl6(value, document2.baseURI);
      if (!url) return false;
      const identity = pixhostAssetIdentity(url, document2.baseURI);
      const key = identity || url;
      if (identity && existingAssets.has(identity)) return false;
      if (seenResultAssets.has(key)) return false;
      seenResultAssets.add(key);
      return true;
    });
    if (!imageUrls.length) return null;
    const section = document2.createElement("section");
    section.id = CONTAINER_ID;
    section.style.cssText = "clear:both;margin:24px 0 8px;padding:16px 0 0;border-top:1px solid #ddd";
    const heading = document2.createElement("div");
    heading.style.cssText = "margin:0 0 12px;font-size:15px;font-weight:700;color:#444";
    const source = document2.createElement("a");
    source.href = result.sourceUrl || result.articleUrl || "#";
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = `${result.sourceName || "HDblog"} Preview \xB7 ${result.code}`;
    source.style.cssText = "color:inherit;text-decoration:none";
    heading.append(source);
    section.append(heading);
    const previewReferer = result.referer || result.articleUrl || result.sourceUrl || "";
    imageUrls.forEach((url, index) => {
      const anchor = document2.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.style.cssText = "display:block;clear:both;margin:14px 0;text-align:center";
      const image = document2.createElement("img");
      image.src = url;
      image.alt = `${result.code} Preview ${index + 1}`;
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";
      image.setAttribute(PREVIEW_IMAGE_ATTR, url);
      if (previewReferer) image.setAttribute("data-x1080x-preview-referer", previewReferer);
      image.style.cssText = "display:block;width:auto;height:auto;max-width:100%;margin:0 auto;object-fit:contain";
      anchor.append(image);
      makePreviewGestureFriendly(image);
      section.append(anchor);
    });
    content.append(section);
    return section;
  }
  async function installAgaghhhHdblogPreview(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2 || !isThreadPage2(locationObject) || document2.getElementById(CONTAINER_ID)) return null;
    const code = threadCode(document2);
    if (!code) return null;
    let result = null;
    try {
      result = await fetchHdblogPreviewForCode(code, gmRequest2, document2, true);
    } catch (error) {
      console.warn("[x1080x-ex] hdblog preview lookup failed", {
        code,
        error: error?.message || String(error)
      });
    }
    if (!result?.imageUrls?.length && isAgaghhhJavfreePreviewFallbackEnabled()) {
      try {
        result = await fetchJavfreePreviewForCode(code, gmRequest2, document2);
      } catch (error) {
        console.warn("[x1080x-ex] JavFree preview fallback failed", {
          code,
          error: error?.message || String(error)
        });
      }
    }
    result = await filterPixhostUnavailableImageUrls(result, document2);
    if (!result?.imageUrls?.length && isOfficialPreviewFallbackEnabled()) {
      try {
        result = await fetchOfficialPreviewFallbackForCode(code, gmRequest2, document2);
      } catch (error) {
        console.warn("[x1080x-ex] official preview fallback failed", {
          code,
          error: error?.message || String(error)
        });
      }
    }
    result = await filterPixhostUnavailableImageUrls(result, document2);
    return renderAgaghhhHdblogPreview(document2, result);
  }

  // src/agaghhh-enhancement.js
  var AGAGHHH_BATCH_OPEN_ENABLED_KEY2 = "x1080x-ex:agaghhh-batch-open-enabled";
  var AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY2 = "x1080x-ex:agaghhh-batch-open-interval-min-ms";
  var AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY2 = "x1080x-ex:agaghhh-batch-open-interval-max-ms";
  var AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY2 = "x1080x-ex:agaghhh-batch-open-history-enabled";
  var AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY2 = "x1080x-ex:agaghhh-batch-open-history-limit";
  var AGAGHHH_BATCH_OPEN_HISTORY_KEY2 = "x1080x-ex:agaghhh-batch-open-history";
  var AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY2 = "x1080x-ex:agaghhh-batch-open-history-color";
  var AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY2 = "x1080x-ex:agaghhh-batch-open-unopened-only";
  var AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY2 = "x1080x-ex:agaghhh-batch-progress-locator-enabled";
  var DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_LIMIT = 5e3;
  var DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_COLOR = "#bd10e0";
  var DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MIN_MS = 1800;
  var DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MAX_MS = 3500;
  var AGAGHHH_DOWNLOAD_ENABLED_KEY2 = "x1080x-ex:agaghhh-download-enabled";
  var AGAGHHH_CROSS_SEARCH_ENABLED_KEY = "x1080x-ex:agaghhh-cross-search-enabled";
  var AGAGHHH_COPY_CODE_ENABLED_KEY = "x1080x-ex:agaghhh-copy-code-enabled";
  var AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY = "x1080x-ex:agaghhh-search-auto-redirect-enabled";
  var AGAGHHH_SEARCH_FILTER_ENABLED_KEY = "x1080x-ex:agaghhh-search-filter-enabled";
  var AGAGHHH_BLOCKED_KEYWORDS_KEY = "x1080x-ex:agaghhh-blocked-keywords";
  var DEFAULT_AGAGHHH_BLOCKED_KEYWORDS = "\u65E0\u7801\u7834\u89E3\n\u7121\u78BC\u7834\u89E3";
  var AGAGHHH_REAL_ACTRESS_ENABLED_KEY = "x1080x-ex:agaghhh-real-actress-enabled";
  var AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY = "x1080x-ex:agaghhh-hdblog-preview-enabled";
  var LEGACY_AGAGHHH_ENHANCEMENT_ENABLED_KEY = "x1080x-ex:agaghhh-enhancement-enabled";
  var MODERN_RESOURCE_HISTORY_KEY2 = "x1080x-ex:1080xin-resource-history";
  var SETTINGS_PANEL_ID = "x1080x-ex-settings-panel";
  var DOWNLOAD_BUTTON_ID2 = "x1080x-ex-download";
  var SEARCH_BUTTON_ID2 = "x1080x-ex-agaghhh-hdblog-search";
  var COPY_BUTTON_ID2 = "x1080x-ex-agaghhh-copy-code";
  var BATCH_BUTTON_ID2 = "x1080x-ex-open-page";
  var BATCH_PROGRESS_BUTTON_ID2 = "x1080x-ex-batch-progress-locator";
  var BATCH_TOOLBAR_ID2 = "x1080x-ex-open-page-toolbar";
  var AV_WIKI_ORIGIN2 = "https://av-wiki.net";
  var AV_WIKI_TIMEOUT = 2e4;
  var REAL_ACTRESS_BOUND_ATTR = "data-x1080x-real-actress-bound";
  var REAL_ACTRESS_BYPASS_ATTR = "data-x1080x-real-actress-bypass";
  function normalizeText7(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function legacyDefault() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(LEGACY_AGAGHHH_ENHANCEMENT_ENABLED_KEY, true) !== false;
  }
  function readBooleanSetting(key) {
    if (typeof GM_getValue !== "function") return true;
    const stored = GM_getValue(key, null);
    if (stored === null || stored === void 0) return legacyDefault();
    return stored !== false;
  }
  function isAgaghhhBatchOpenEnabled() {
    return readBooleanSetting(AGAGHHH_BATCH_OPEN_ENABLED_KEY2);
  }
  function readBatchOpenIntervalMs3(key, fallback) {
    if (typeof GM_getValue !== "function") return fallback;
    const numeric = Number(GM_getValue(key, fallback));
    return Number.isFinite(numeric) && numeric >= 100 && numeric <= 6e5 ? Math.round(numeric) : fallback;
  }
  function getAgaghhhBatchOpenInterval() {
    const delayMin = readBatchOpenIntervalMs3(
      AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY2,
      DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MIN_MS
    );
    const delayMax = readBatchOpenIntervalMs3(
      AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY2,
      DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MAX_MS
    );
    if (delayMax < delayMin) {
      return {
        delayMin: DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MIN_MS,
        delayMax: DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MAX_MS
      };
    }
    return { delayMin, delayMax };
  }
  function isAgaghhhBatchOpenHistoryEnabled() {
    if (typeof GM_getValue !== "function") return false;
    return GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY2, false) === true;
  }
  function isAgaghhhBatchOpenUnopenedOnlyEnabled() {
    if (typeof GM_getValue !== "function") return false;
    return GM_getValue(AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY2, false) === true;
  }
  function isAgaghhhBatchProgressLocatorEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY2, true) !== false;
  }
  function getAgaghhhBatchOpenHistoryLimit() {
    if (typeof GM_getValue !== "function") return DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_LIMIT;
    const numeric = Number(GM_getValue(
      AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY2,
      DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_LIMIT
    ));
    return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5e4 ? numeric : DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_LIMIT;
  }
  function getAgaghhhBatchOpenHistoryColor() {
    if (typeof GM_getValue !== "function") return DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_COLOR;
    const value = String(GM_getValue(
      AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY2,
      DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_COLOR
    ) || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_COLOR;
  }
  function isAgaghhhDownloadEnabled() {
    return readBooleanSetting(AGAGHHH_DOWNLOAD_ENABLED_KEY2);
  }
  function isAgaghhhCrossSearchEnabled() {
    return readBooleanSetting(AGAGHHH_CROSS_SEARCH_ENABLED_KEY);
  }
  function isAgaghhhCopyCodeEnabled() {
    return readBooleanSetting(AGAGHHH_COPY_CODE_ENABLED_KEY);
  }
  function isAgaghhhSearchAutoRedirectEnabled() {
    return readBooleanSetting(AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY);
  }
  function isAgaghhhSearchFilterEnabled() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(AGAGHHH_SEARCH_FILTER_ENABLED_KEY, true) !== false;
  }
  function normalizeSearchFilterText(value) {
    return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }
  function parseAgaghhhBlockedKeywords(value) {
    const seen = /* @__PURE__ */ new Set();
    const keywords = [];
    String(value ?? "").split(/[\r\n,;，；]+/).map((entry) => entry.trim()).filter(Boolean).forEach((entry) => {
      const normalized = normalizeSearchFilterText(entry);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      keywords.push(entry);
    });
    return keywords;
  }
  function getAgaghhhBlockedKeywordsText() {
    if (typeof GM_getValue !== "function") return DEFAULT_AGAGHHH_BLOCKED_KEYWORDS;
    const stored = GM_getValue(AGAGHHH_BLOCKED_KEYWORDS_KEY, null);
    return stored === null || stored === void 0 ? DEFAULT_AGAGHHH_BLOCKED_KEYWORDS : String(stored);
  }
  function normalizeAgaghhhBlockedKeywordsText(value) {
    return parseAgaghhhBlockedKeywords(value).join("\n");
  }
  function isAgaghhhRealActressEnabled() {
    return readBooleanSetting(AGAGHHH_REAL_ACTRESS_ENABLED_KEY);
  }
  function isAgaghhhHdblogPreviewEnabled() {
    return readBooleanSetting(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY);
  }
  function isAgaghhhForumSearchPage(locationObject = globalThis.location) {
    if (!isAgaghhhHost(locationObject)) return false;
    let url;
    try {
      url = new URL(locationObject?.href || "");
    } catch {
      return false;
    }
    if (!/\/search\.php$/i.test(url.pathname) || url.searchParams.get("mod") !== "forum") return false;
    const hasSearch = normalizeText7(url.searchParams.get("srchtxt")) || url.searchParams.has("searchid");
    if (!hasSearch) return false;
    const page = Number.parseInt(url.searchParams.get("page") || "1", 10);
    return !Number.isFinite(page) || page <= 1;
  }
  function isAgaghhhThreadResultUrl(value, baseUrl) {
    try {
      const url = new URL(value, baseUrl);
      if (!isAgaghhhHost({ hostname: url.hostname })) return false;
      return url.searchParams.get("mod") === "viewthread" && url.searchParams.has("tid") || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
    } catch {
      return false;
    }
  }
  function collectAgaghhhSearchResults(document2) {
    if (!document2) return [];
    const baseUrl = document2.baseURI || "https://agaghhh.cc/";
    return [...document2.querySelectorAll("#ct .slst li.pbw")].map((element) => {
      const link = element.querySelector(
        'h3.xs3 a[href*="mod=viewthread"][href*="tid="], h3 a[href*="viewthread"], a[href*="mod=viewthread"][href*="tid="]'
      );
      if (!link) return null;
      let url = "";
      try {
        url = new URL(link.getAttribute("href"), baseUrl).href;
      } catch {
        return null;
      }
      if (!isAgaghhhThreadResultUrl(url, baseUrl)) return null;
      const forumLink = element.querySelector(
        'a[href*="mod=forumdisplay"][href*="fid="]'
      );
      return {
        element,
        link,
        url,
        title: normalizeText7(link.textContent),
        forum: normalizeText7(forumLink?.textContent),
        text: normalizeText7(element.textContent)
      };
    }).filter(Boolean);
  }
  function isAgaghhhSearchResultBlocked(candidate, keywords) {
    const haystack = normalizeSearchFilterText(
      [candidate?.title, candidate?.forum, candidate?.text].filter(Boolean).join(" ")
    );
    return (keywords || []).some((keyword) => {
      const normalizedKeyword = normalizeSearchFilterText(keyword);
      return normalizedKeyword && haystack.includes(normalizedKeyword);
    });
  }
  function filterAgaghhhSearchResults(document2, keywords) {
    const candidates = collectAgaghhhSearchResults(document2);
    const blocked = [];
    const remaining = [];
    for (const candidate of candidates) {
      (isAgaghhhSearchResultBlocked(candidate, keywords) ? blocked : remaining).push(candidate);
    }
    blocked.forEach(({ element }) => element.remove());
    return { blocked, remaining };
  }
  function getAgaghhhBlockedKeywords() {
    return parseAgaghhhBlockedKeywords(getAgaghhhBlockedKeywordsText());
  }
  function collectAgaghhhSearchResultUrls(document2) {
    if (!document2) return [];
    const seen = /* @__PURE__ */ new Set();
    const anchors = document2.querySelectorAll(
      '#ct .slst a[href], #threadlist a.xst[href], #threadlist a[href*="mod=viewthread"][href*="tid="]'
    );
    return [...anchors].map((anchor) => {
      try {
        return new URL(anchor.getAttribute("href"), document2.baseURI).href;
      } catch {
        return "";
      }
    }).filter((url) => url && isAgaghhhThreadResultUrl(url, document2.baseURI)).filter((url) => !seen.has(url) && seen.add(url));
  }
  function findAgaghhhSingleSearchResultUrl(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isAgaghhhForumSearchPage(locationObject)) return "";
    const results = collectAgaghhhSearchResultUrls(document2);
    return results.length === 1 ? results[0] : "";
  }
  function installAgaghhhSearchAutoRedirect(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!isAgaghhhSearchAutoRedirectEnabled()) return "";
    const target = findAgaghhhSingleSearchResultUrl(document2, locationObject);
    if (!target) return "";
    if (typeof locationObject?.assign === "function") locationObject.assign(target);
    else if (locationObject && "href" in locationObject) locationObject.href = target;
    return target;
  }
  function firstPostContent2(document2) {
    const firstPost = [...document2.querySelectorAll('#postlist [id^="post_"]')].find((element) => /^post_\d+$/i.test(element.id)) || document2.querySelector("#postlist > div, #postlist") || document2.querySelector("#first-post");
    return firstPost?.querySelector('[id^="postmessage_"], .t_f, .post-text') || firstPost || null;
  }
  function extractThreadPerformerField(document2) {
    const content = firstPostContent2(document2);
    if (!content) return { found: false, value: "" };
    const raw = String(content.innerText || content.textContent || "").replace(/\r/g, "");
    const lines = raw.split("\n").map((line) => line.trim());
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(/^(?:出演者|演员|演員)\s*[:：]\s*(.*)$/i);
      if (!match) continue;
      const inlineValue = normalizeText7(match[1]);
      if (inlineValue) return { found: true, value: inlineValue };
      const nextLine = normalizeText7(lines[index + 1] || "");
      if (nextLine && !/^[^:：]{1,12}\s*[:：]/u.test(nextLine)) {
        return { found: true, value: nextLine };
      }
      return { found: true, value: "" };
    }
    const flattened = normalizeText7(raw);
    const inline = flattened.match(/(?:^|\s)(?:出演者|演员|演員)\s*[:：]\s*([^:：]{1,80}?)(?=\s+[\p{L}\p{N}_-]{1,16}\s*[:：]|$)/iu);
    if (inline) return { found: true, value: normalizeText7(inline[1]) };
    return { found: false, value: "" };
  }
  function nodeActressText(node) {
    if (!node) return "";
    const anchors = [...node.querySelectorAll?.("a") || []].map((anchor) => normalizeText7(anchor.textContent)).filter(Boolean).filter((text) => !/^(?:FANZA|ソクミル|DUGA|続きを読む)$/i.test(text));
    if (anchors.length) return [...new Set(anchors)].join(" ");
    return normalizeText7(node.textContent).replace(/^AV女優名\s*[:：]?\s*/i, "").replace(/\s+(?:メーカー品番|FANZA品番|SOKMIL品番|DUGA品番|配信開始日)\b.*$/i, "").trim();
  }
  function scopeForCode(document2, code) {
    const upperCode = String(code || "").toUpperCase();
    const articles = [...document2.querySelectorAll("article")];
    return articles.find((article) => normalizeText7(article.textContent).toUpperCase().includes(upperCode)) || document2.body || document2.documentElement;
  }
  function parseAvWikiActressesFromDocument(document2, code = "") {
    if (!document2) return "";
    const scope = scopeForCode(document2, code);
    if (!scope) return "";
    for (const row of scope.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      if (cells.length < 2) continue;
      if (/^AV女優名\s*[:：]?$/i.test(normalizeText7(cells[0].textContent))) {
        return nodeActressText(cells[1]);
      }
    }
    for (const term of scope.querySelectorAll("dt")) {
      if (!/^AV女優名\s*[:：]?$/i.test(normalizeText7(term.textContent))) continue;
      const value = term.nextElementSibling;
      const text2 = nodeActressText(value);
      if (text2) return text2;
    }
    const labels = [...scope.querySelectorAll("strong, b, span, div, p, li")].filter((element) => /^AV女優名\s*[:：]?$/i.test(normalizeText7(element.textContent)));
    for (const label of labels) {
      const candidates = [
        label.nextElementSibling,
        label.parentElement?.nextElementSibling,
        label.parentElement?.querySelector(":scope > *:not(strong):not(b):not(span)")
      ];
      for (const candidate of candidates) {
        const text2 = nodeActressText(candidate);
        if (text2) return text2;
      }
    }
    const text = String(scope.innerText || scope.textContent || "").replace(/\r/g, "");
    const lines = text.split("\n").map((line) => normalizeText7(line)).filter(Boolean);
    const labelIndex = lines.findIndex((line) => /^AV女優名\s*[:：]?$/i.test(line));
    if (labelIndex >= 0) return normalizeText7(lines[labelIndex + 1] || "");
    const inline = lines.find((line) => /^AV女優名\s*[:：]/i.test(line));
    return inline ? normalizeText7(inline.replace(/^AV女優名\s*[:：]\s*/i, "")) : "";
  }
  function findAvWikiResultUrl2(document2, code) {
    if (!document2 || !code) return "";
    const targetCode = String(code).toUpperCase();
    const targetPath = `/${String(code).toLowerCase()}/`;
    const anchors = [...document2.querySelectorAll("a[href]")];
    for (const anchor of anchors) {
      try {
        const url = new URL(anchor.getAttribute("href"), AV_WIKI_ORIGIN2);
        if (url.origin !== AV_WIKI_ORIGIN2) continue;
        if (url.pathname.toLowerCase() === targetPath) return url.href;
      } catch {
      }
    }
    for (const anchor of anchors) {
      const article = anchor.closest("article");
      const text = normalizeText7(article?.textContent || anchor.textContent).toUpperCase();
      if (!text.includes(targetCode)) continue;
      try {
        const url = new URL(anchor.getAttribute("href"), AV_WIKI_ORIGIN2);
        if (url.origin === AV_WIKI_ORIGIN2 && url.pathname !== "/") return url.href;
      } catch {
      }
    }
    return "";
  }
  function requestHtml(url, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D\u6CB9\u7334\u73AF\u5883\u4E0D\u652F\u6301 GM_xmlhttpRequest\u3002"));
        return;
      }
      gmRequest2({
        method: "GET",
        url,
        responseType: "text",
        timeout: AV_WIKI_TIMEOUT,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Referer: `${AV_WIKI_ORIGIN2}/`
        },
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`av-wiki \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
            return;
          }
          resolve(String(response.responseText || response.response || ""));
        },
        onerror: () => reject(new Error("av-wiki \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\u3002")),
        ontimeout: () => reject(new Error(`av-wiki \u8BF7\u6C42\u8D85\u65F6\uFF08${AV_WIKI_TIMEOUT / 1e3} \u79D2\uFF09\u3002`))
      });
    });
  }
  function parseHtml4(html, document2 = globalThis.document) {
    const Parser = document2?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    return new Parser().parseFromString(String(html || ""), "text/html");
  }
  async function fetchRealActressFromAvWiki(code, gmRequest2 = globalThis.GM_xmlhttpRequest, document2 = globalThis.document) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return "";
    const searchUrl = `${AV_WIKI_ORIGIN2}/?s=${encodeURIComponent(normalizedCode)}`;
    const searchDocument = parseHtml4(await requestHtml(searchUrl, gmRequest2), document2);
    if (!searchDocument) return "";
    const fromSearch = parseAvWikiActressesFromDocument(searchDocument, normalizedCode);
    if (fromSearch) return fromSearch;
    const detailUrl = findAvWikiResultUrl2(searchDocument, normalizedCode) || `${AV_WIKI_ORIGIN2}/${normalizedCode.toLowerCase()}/`;
    const detailDocument = parseHtml4(await requestHtml(detailUrl, gmRequest2), document2);
    return parseAvWikiActressesFromDocument(detailDocument, normalizedCode);
  }
  function appendActressToTitleText(titleText, actress) {
    const cleanTitle = normalizeText7(titleText);
    const cleanActress = normalizeText7(actress);
    if (!cleanActress || cleanTitle.includes(cleanActress)) return cleanTitle;
    return `${cleanTitle} ${cleanActress}`;
  }
  function threadTitleElement(document2) {
    return document2.querySelector("#thread_subject, .thread-header h1") || document2.querySelector("h1.ts, .vwthd h1, h1");
  }
  function threadCode2(document2) {
    return parseThreadTitle(getThreadHeadingText(document2)).code;
  }
  function buildHdblogSearchUrlForThreadCode(code) {
    const keyword = hdblogSearchCodeForThreadCode(code);
    return keyword ? `http://hdblog.me/?s=${encodeURIComponent(keyword)}` : "";
  }
  function openSearchTab2(document2, url) {
    if (!url) return;
    if (typeof GM_openInTab === "function") {
      GM_openInTab(url, { active: true, insert: true, setParent: true });
      return;
    }
    document2.defaultView?.open(url, "_blank", "noopener");
  }
  function isModernResourceDetailPage(document2) {
    const pathname = document2?.defaultView?.location?.pathname || "";
    return /^\/resources\/[a-z0-9]+\/?$/i.test(pathname) && Boolean(document2.querySelector(".thread-header h1"));
  }
  function installHdblogSearchButton(document2) {
    const code = threadCode2(document2);
    if (!code) return;
    let button = document2.getElementById(SEARCH_BUTTON_ID2);
    const created = !button;
    if (!button) {
      button = document2.createElement("button");
      button.id = SEARCH_BUTTON_ID2;
      button.type = "button";
      button.textContent = "\u{1F50D}";
      button.title = "\u6309\u5F53\u524D\u756A\u53F7\u5728 hdblog \u641C\u7D22";
      button.setAttribute("aria-label", "\u5728 hdblog \u641C\u7D22\u5F53\u524D\u756A\u53F7");
      Object.assign(button.style, {
        float: "right",
        position: "relative",
        zIndex: "20",
        margin: "0 0 6px 6px",
        padding: "7px 10px",
        minWidth: "38px",
        border: "1px solid #2878c8",
        borderRadius: "5px",
        color: "#fff",
        background: "#398bd4",
        cursor: "pointer",
        fontSize: "14px",
        lineHeight: "20px"
      });
      button.addEventListener("mouseenter", () => {
        button.style.background = "#246eaf";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "#398bd4";
      });
      button.addEventListener("click", () => {
        const url = buildHdblogSearchUrlForThreadCode(threadCode2(document2));
        if (!url) {
          document2.defaultView?.alert("\u6CA1\u6709\u8BC6\u522B\u5230\u5F71\u7247\u756A\u53F7\u3002");
          return;
        }
        openSearchTab2(document2, url);
      });
    }
    if (isModernResourceDetailPage(document2) && placeModernResourceActionButton(document2, button)) return;
    if (!created) return;
    const downloadButton = document2.getElementById(DOWNLOAD_BUTTON_ID2);
    const title = threadTitleElement(document2);
    const host = downloadButton?.parentElement || title?.closest(".vwthd, .ts") || title?.parentElement;
    if (!host) return;
    if (downloadButton) downloadButton.insertAdjacentElement("afterend", button);
    else host.prepend(button);
  }
  function installCopyCodeButton2(document2) {
    const code = threadCode2(document2);
    if (!code) return;
    let button = document2.getElementById(COPY_BUTTON_ID2);
    const created = !button;
    if (!button) {
      button = document2.createElement("button");
      button.id = COPY_BUTTON_ID2;
      button.type = "button";
      button.textContent = "\u{1F4CB}";
      button.title = "\u590D\u5236\u5F53\u524D\u756A\u53F7\u5230\u526A\u5207\u677F";
      button.setAttribute("aria-label", "\u590D\u5236\u5F53\u524D\u756A\u53F7\u5230\u526A\u5207\u677F");
      Object.assign(button.style, {
        float: "right",
        position: "relative",
        zIndex: "20",
        margin: "0 0 6px 6px",
        padding: "7px 10px",
        minWidth: "38px",
        border: "1px solid #2878c8",
        borderRadius: "5px",
        color: "#fff",
        background: "#398bd4",
        cursor: "pointer",
        fontSize: "14px",
        lineHeight: "20px"
      });
      button.addEventListener("mouseenter", () => {
        if (!button.disabled) button.style.background = "#246eaf";
      });
      button.addEventListener("mouseleave", () => {
        if (!button.disabled) button.style.background = "#398bd4";
      });
      button.addEventListener("click", () => {
        void copyCodeWithButtonFeedback(button, document2, threadCode2(document2));
      });
    }
    if (isModernResourceDetailPage(document2) && placeModernResourceActionButton(document2, button)) return;
    if (!created) return;
    const downloadButton = document2.getElementById(DOWNLOAD_BUTTON_ID2);
    const searchButton = document2.getElementById(SEARCH_BUTTON_ID2);
    const title = threadTitleElement(document2);
    const host = downloadButton?.parentElement || searchButton?.parentElement || title?.closest(".vwthd, .ts") || title?.parentElement;
    if (!host) return;
    if (downloadButton) downloadButton.insertAdjacentElement("afterend", button);
    else if (searchButton) searchButton.insertAdjacentElement("afterend", button);
    else host.prepend(button);
  }
  var modernActionObservers = /* @__PURE__ */ new WeakMap();
  function refreshModernResourceActionButtons(document2) {
    if (!isModernResourceDetailPage(document2)) return;
    const downloadButton = document2.getElementById(DOWNLOAD_BUTTON_ID2);
    if (downloadButton) placeModernResourceActionButton(document2, downloadButton);
    if (isAgaghhhCrossSearchEnabled()) installHdblogSearchButton(document2);
    else document2.getElementById(SEARCH_BUTTON_ID2)?.remove();
    if (isAgaghhhCopyCodeEnabled()) installCopyCodeButton2(document2);
    else document2.getElementById(COPY_BUTTON_ID2)?.remove();
  }
  function observeModernResourceActionButtons(document2) {
    if (!document2?.body || modernActionObservers.has(document2)) return;
    const Observer = document2.defaultView?.MutationObserver;
    if (typeof Observer !== "function") return;
    const observer = new Observer(() => refreshModernResourceActionButtons(document2));
    observer.observe(document2.body, { childList: true, subtree: true });
    modernActionObservers.set(document2, observer);
  }
  function bindRealActressDownload(document2, gmRequest2) {
    const button = document2.getElementById(DOWNLOAD_BUTTON_ID2);
    if (!button || button.getAttribute(REAL_ACTRESS_BOUND_ATTR) === "1") return;
    button.setAttribute(REAL_ACTRESS_BOUND_ATTR, "1");
    button.addEventListener("click", async (event) => {
      if (button.getAttribute(REAL_ACTRESS_BYPASS_ATTR) === "1") {
        button.removeAttribute(REAL_ACTRESS_BYPASS_ATTR);
        return;
      }
      const performer = extractThreadPerformerField(document2);
      if (!performer.found || performer.value) return;
      const code = threadCode2(document2);
      if (!code) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const idleText = button.textContent;
      button.disabled = true;
      button.textContent = "\u67E5\u6F14\u5458\u2026";
      let actress = "";
      try {
        actress = await fetchRealActressFromAvWiki(code, gmRequest2, document2);
      } catch (error) {
        console.warn("[x1080x-ex] av-wiki actress lookup failed", {
          code,
          error: error?.message || String(error)
        });
      }
      button.disabled = false;
      button.textContent = idleText;
      const title = threadTitleElement(document2);
      const originalTitle = title?.textContent || "";
      if (actress && title) {
        title.textContent = appendActressToTitleText(originalTitle, actress);
        console.info("[x1080x-ex] real actress resolved", { code, actress });
      }
      button.setAttribute(REAL_ACTRESS_BYPASS_ATTR, "1");
      button.click();
      if (title && actress) title.textContent = originalTitle;
    }, true);
  }
  function closeX1080xSettingsPanel(document2) {
    document2?.getElementById(SETTINGS_PANEL_ID)?.remove();
  }
  function openX1080xSettingsPanel(document2 = globalThis.document) {
    if (!document2?.body) return null;
    closeX1080xSettingsPanel(document2);
    const host = document2.createElement("div");
    host.id = SETTINGS_PANEL_ID;
    host.setAttribute("data-x1080x-settings-host", "1");
    const root = typeof host.attachShadow === "function" ? host.attachShadow({ mode: "open" }) : host;
    const overlay = document2.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "rgba(0,0,0,.42)",
      boxSizing: "border-box"
    });
    const panel = document2.createElement("form");
    Object.assign(panel.style, {
      width: "min(520px, 100%)",
      maxHeight: "calc(100vh - 40px)",
      overflow: "auto",
      padding: "22px",
      borderRadius: "10px",
      background: "#fff",
      color: "#222",
      boxShadow: "0 18px 60px rgba(0,0,0,.28)",
      boxSizing: "border-box",
      font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    });
    panel.innerHTML = `
    <h2 style="margin:0 0 18px;font-size:20px">x1080x \u8BBE\u7F6E</h2>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:11px">x1080x \u589E\u5F3A\u529F\u80FD</div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:8px">
        <input data-setting="batch-open" type="checkbox" style="margin-top:3px">
        <span><strong>\u6279\u91CF\u6253\u5F00\u5E16\u5B50\u529F\u80FD</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u5217\u8868\u9875\u663E\u793A\u201C\u540E\u53F0\u987A\u5E8F\u6253\u5F00\u672C\u9875\u4E3B\u9898\u201D\u6309\u94AE\u3002</small></span>
      </label>
      <div data-batch-open-interval-row style="margin:0 0 13px 24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">\u4E3B\u9898\u6253\u5F00\u95F4\u9694\uFF08\u79D2\uFF09</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input data-setting="batch-open-interval-min" type="number" min="0.1" max="600" step="0.1" aria-label="\u6700\u5C0F\u95F4\u9694"
            style="width:88px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <span>\u2014</span>
          <input data-setting="batch-open-interval-max" type="number" min="0.1" max="600" step="0.1" aria-label="\u6700\u5927\u95F4\u9694"
            style="width:88px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <button type="button" data-action="reset-batch-open-interval" style="padding:6px 10px;appearance:none;background:#fff !important;color:#333 !important;border:1px solid #bbb !important;border-radius:6px;cursor:pointer;font:inherit;line-height:1.4">\u6062\u590D\u9ED8\u8BA4</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666">\u6BCF\u4E2A\u4E3B\u9898\u5728\u8BE5\u8303\u56F4\u5185\u968F\u673A\u7B49\u5F85\uFF1B\u9ED8\u8BA4 1.8\u20133.5 \u79D2\u3002\u5B9A\u671F\u957F\u505C\u987F\u89C4\u5219\u4FDD\u6301\u4E0D\u53D8\u3002</small>
      </div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:8px">
        <input data-setting="batch-open-history" type="checkbox" style="margin-top:3px">
        <span><strong>\u4FDD\u5B58\u6279\u91CF\u6253\u5F00\u8BB0\u5F55</strong><small style="display:block;margin-top:2px;color:#666">\u8BB0\u5F55\u811A\u672C\u6279\u91CF\u6253\u5F00\u8FC7\u7684\u4E3B\u9898\u5E76\u6301\u4E45\u6807\u8BB0\uFF1B\u624B\u52A8\u8BBF\u95EE\u8FC7\u7684\u94FE\u63A5\u4E5F\u4F7F\u7528\u76F8\u540C\u989C\u8272\u663E\u793A\u3002</small></span>
      </label>
      <div data-batch-open-history-row style="margin:0 0 13px 24px">
        <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
          <input data-setting="batch-open-unopened-only" type="checkbox" style="margin-top:3px">
          <span><strong>\u6279\u91CF\u53EA\u6253\u5F00\u672A\u6253\u5F00\u4E3B\u9898</strong><small style="display:block;margin-top:2px;color:#666">\u5F00\u542F\u540E\uFF0C\u6279\u91CF\u6253\u5F00\u65F6\u8DF3\u8FC7\u5DF2\u7ECF\u4FDD\u5B58\u5728\u201C\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u201D\u4E2D\u7684\u4E3B\u9898\u3002</small></span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px">
          <input data-setting="batch-progress-locator" type="checkbox" style="margin-top:3px">
          <span><strong>\u663E\u793A\u201C\u5B9A\u4F4D\u6D4F\u89C8\u8FDB\u5EA6\u201D\u6309\u94AE</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u6279\u91CF\u6253\u5F00\u6309\u94AE\u65C1\u663E\u793A\u5165\u53E3\uFF0C\u8DF3\u5230\u5DF2\u6253\u5F00\u8BB0\u5F55\u4E0E\u672A\u6253\u5F00\u4E3B\u9898\u76F8\u90BB\u7684\u5206\u9875\u4F4D\u7F6E\u3002</small></span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:600">\u6700\u591A\u4FDD\u5B58</span>
          <input data-setting="batch-open-history-limit" type="number" min="1" max="50000" step="1" aria-label="\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u4FDD\u5B58\u6761\u6570"
            style="width:100px;box-sizing:border-box;padding:6px 8px;border:1px solid #bbb;border-radius:6px">
          <span>\u6761</span>
        </label>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
          <span style="font-weight:600">\u8BBF\u95EE\u6807\u8BB0\u989C\u8272</span>
          <input data-setting="batch-open-history-color" type="color" aria-label="\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u6807\u8BB0\u989C\u8272"
            style="width:44px;height:32px;padding:2px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer">
          <button type="button" data-action="reset-batch-open-history-color"
            style="padding:6px 10px;appearance:none;background:#fff !important;color:#333 !important;border:1px solid #bbb !important;border-radius:6px;cursor:pointer;font:inherit;line-height:1.4">\u8FD8\u539F\u9ED8\u8BA4\u7D2B\u8272</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666">\u9ED8\u8BA4 5000 \u6761\uFF1B\u8D85\u8FC7\u4E0A\u9650\u540E\u81EA\u52A8\u5220\u9664\u6700\u65E7\u8BB0\u5F55\u3002\u9ED8\u8BA4\u6807\u8BB0\u989C\u8272\u4E3A #bd10e0\u3002\u5173\u95ED\u6B64\u529F\u80FD\u4E0D\u4F1A\u5220\u9664\u5DF2\u7ECF\u4FDD\u5B58\u7684\u8BB0\u5F55\u3002</small>
      </div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:6px">
        <input data-setting="search-filter" type="checkbox" style="margin-top:3px">
        <span><strong>\u641C\u7D22\u7ED3\u679C\u5C4F\u853D</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u8BBA\u575B\u641C\u7D22\u9875\u6309\u5173\u952E\u8BCD\u9690\u85CF\u7ED3\u679C\uFF1B\u5339\u914D\u6807\u9898\u3001\u6458\u8981\u6216\u6240\u5C5E\u7248\u5757\u3002</small></span>
      </label>
      <label data-search-filter-keywords-row style="display:block;margin:0 0 13px 24px">
        <span style="display:block;font-weight:600;margin-bottom:6px">\u641C\u7D22\u7ED3\u679C\u5C4F\u853D\u5173\u952E\u8BCD</span>
        <textarea data-setting="blocked-keywords" rows="4" placeholder="\u6BCF\u884C\u4E00\u4E2A\u5173\u952E\u8BCD\uFF0C\u4E5F\u652F\u6301\u9017\u53F7\u5206\u9694"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical"></textarea>
        <small style="display:block;margin-top:5px;color:#666">\u9ED8\u8BA4\u5C4F\u853D\u201C\u65E0\u7801\u7834\u89E3 / \u7121\u78BC\u7834\u89E3\u201D\uFF1B\u53EF\u81EA\u884C\u589E\u5220\u3002\u5173\u95ED\u4E0A\u65B9\u5F00\u5173\u540E\u4E0D\u505A\u4EFB\u4F55\u5C4F\u853D\u3002</small>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:6px">
        <input data-setting="download" type="checkbox" style="margin-top:3px">
        <span><strong>\u4E0B\u8F7D\u589E\u5F3A</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u5E16\u5B50\u9875\u663E\u793A\u4E0B\u8F7D\u6309\u94AE\uFF0C\u5E76\u4F7F\u7528\u73B0\u6709\u9644\u4EF6\u3001\u56FE\u7247\u3001\u79CD\u5B50\u4E0B\u8F7D\u4E0E\u81EA\u52A8\u547D\u540D\u903B\u8F91\u3002</small></span>
      </label>
      <label data-download-guard-row style="display:flex;align-items:flex-start;gap:9px;margin:0 0 13px 24px">
        <input data-setting="download-guard" type="checkbox" style="margin-top:3px">
        <span><strong>\u4E0B\u8F7D\u65F6\u4FDD\u62A4\u6807\u7B7E\u9875</strong><small style="display:block;margin-top:2px;color:#666">\u4E0B\u8F7D\u4E2D\u5728\u6807\u7B7E\u6807\u9898\u663E\u793A\u201C\u2B07 \u4E0B\u8F7D\u4E2D\u201D\uFF0C\u5173\u95ED\u6807\u7B7E\u9875\u65F6\u7531\u6D4F\u89C8\u5668\u5F39\u51FA\u786E\u8BA4\u63D0\u793A\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:8px">
        <input data-setting="cross-search" type="checkbox" style="margin-top:3px">
        <span><strong>\u8DE8\u7AD9\u641C\u7D22\u6309\u94AE\uFF08\u{1F50D}\uFF09</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u5E16\u5B50\u6807\u9898\u65C1\u663E\u793A\u641C\u7D22\u6309\u94AE\uFF0C\u8BC6\u522B\u756A\u53F7\u540E\u76F4\u63A5\u6253\u5F00 hdblog \u641C\u7D22\uFF1B\u53EF\u72EC\u7ACB\u4E8E\u4E0B\u8F7D\u589E\u5F3A\u4F7F\u7528\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="copy-code" type="checkbox" style="margin-top:3px">
        <span><strong>\u590D\u5236\u756A\u53F7\u6309\u94AE\uFF08\u{1F4CB}\uFF09</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u641C\u7D22\u4E0E\u4E0B\u8F7D\u6309\u94AE\u4E4B\u95F4\u663E\u793A\u590D\u5236\u6309\u94AE\uFF0C\u4E00\u952E\u590D\u5236\u5F53\u524D\u5E16\u5B50\u756A\u53F7\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="search-auto-redirect" type="checkbox" style="margin-top:3px">
        <span><strong>\u641C\u7D22\u5355\u7ED3\u679C\u81EA\u52A8\u8DF3\u8F6C</strong><small style="display:block;margin-top:2px;color:#666">x1080x \u8BBA\u575B\u641C\u7D22\u7B2C\u4E00\u9875\u53EA\u6709 1 \u4E2A\u552F\u4E00\u4E3B\u9898\u65F6\uFF0C\u81EA\u52A8\u8FDB\u5165\u8BE5\u4E3B\u9898\uFF1B0 \u4E2A\u6216\u591A\u4E2A\u7ED3\u679C\u4E0D\u8DF3\u8F6C\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="hdblog-preview" type="checkbox" style="margin-top:3px">
        <span><strong>\u663E\u793A hdblog \u5927\u9884\u89C8\u56FE</strong><small style="display:block;margin-top:2px;color:#666">\u6309\u5E16\u5B50\u756A\u53F7\u641C\u7D22 hdblog\uFF0C\u6CBF\u7528 hdblog \u7684\u201C\u641C\u7D22\u7ED3\u679C\u5C4F\u853D\u5173\u952E\u8BCD\u201D\uFF0C\u5E76\u628A\u5339\u914D\u6587\u7AE0\u7684 Preview \u5927\u56FE\u663E\u793A\u5230\u4E3B\u697C\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin:-5px 0 13px 24px">
        <input data-setting="javfree-preview-fallback" type="checkbox" style="margin-top:3px">
        <span><strong>JavFree Preview \u540E\u5907\u6E90</strong><small style="display:block;margin-top:2px;color:#666">hdblog \u6CA1\u6709\u53EF\u7528 Preview \u65F6\uFF0C\u518D\u641C\u7D22 javfree.me\uFF0C\u5E76\u53EA\u53D6\u5C01\u9762\u540E\u7684\u7B2C 1 \u5F20 Preview\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px">
        <input data-setting="real-actress" type="checkbox" style="margin-top:3px">
        <span><strong>\u67E5\u771F\u5B9E\u6F14\u5458\u4FE1\u606F</strong><small style="display:block;margin-top:2px;color:#666">\u4EC5\u5F53\u5E16\u5B50\u201C\u51FA\u6F14\u8005\u201D\u4E3A\u7A7A\u4E14\u542F\u7528\u4E86\u4E0B\u8F7D\u589E\u5F3A\u65F6\uFF0C\u901A\u8FC7 av-wiki \u67E5\u8BE2\u6F14\u5458\u5E76\u8FFD\u52A0\u5230\u9644\u4EF6\u6587\u4EF6\u540D\u3002</small></span>
      </label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">\u53D6\u6D88</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">\u4FDD\u5B58</button>
    </div>`;
    organizeSettingsPanel(panel, [
      {
        "key": "batch",
        "title": "\u6279\u91CF\u6253\u5F00",
        "description": "\u6279\u91CF\u6253\u5F00\u5E16\u5B50\u53CA\u6253\u5F00\u95F4\u9694\u8BBE\u7F6E",
        "settings": [
          "batch-open",
          "batch-open-interval-min"
        ]
      },
      {
        "key": "history",
        "title": "\u6D4F\u89C8\u8BB0\u5F55",
        "description": "\u5DF2\u6253\u5F00\u6807\u8BB0\u3001\u8DF3\u8FC7\u5DF2\u8BFB\u4E3B\u9898\u548C\u6D4F\u89C8\u8FDB\u5EA6",
        "settings": [
          "batch-open-history",
          "batch-open-unopened-only"
        ]
      },
      {
        "key": "filter",
        "title": "\u641C\u7D22\u4E0E\u8FC7\u6EE4",
        "description": "\u641C\u7D22\u7ED3\u679C\u8FC7\u6EE4\u3001\u5355\u7ED3\u679C\u81EA\u52A8\u8DF3\u8F6C",
        "settings": [
          "search-filter",
          "blocked-keywords",
          "search-auto-redirect"
        ]
      },
      {
        "key": "download",
        "title": "\u4E0B\u8F7D\u4E0E\u6309\u94AE",
        "description": "\u4E0B\u8F7D\u589E\u5F3A\u3001\u6807\u7B7E\u4FDD\u62A4\u53CA\u6807\u9898\u5FEB\u6377\u64CD\u4F5C",
        "settings": [
          "download",
          "download-guard",
          "cross-search",
          "copy-code"
        ]
      },
      {
        "key": "preview",
        "title": "\u9884\u89C8\u4E0E\u6F14\u5458",
        "description": "\u9884\u89C8\u56FE\u540E\u5907\u6E90\u548C\u6F14\u5458\u4FE1\u606F\u8865\u5168",
        "settings": [
          "hdblog-preview",
          "javfree-preview-fallback",
          "real-actress"
        ]
      }
    ]);
    const batchInput = panel.querySelector('[data-setting="batch-open"]');
    const batchIntervalMinInput = panel.querySelector('[data-setting="batch-open-interval-min"]');
    const batchIntervalMaxInput = panel.querySelector('[data-setting="batch-open-interval-max"]');
    const batchIntervalResetButton = panel.querySelector('[data-action="reset-batch-open-interval"]');
    const batchHistoryInput = panel.querySelector('[data-setting="batch-open-history"]');
    const batchUnopenedOnlyInput = panel.querySelector('[data-setting="batch-open-unopened-only"]');
    const batchProgressLocatorInput = panel.querySelector('[data-setting="batch-progress-locator"]');
    const batchHistoryLimitInput = panel.querySelector('[data-setting="batch-open-history-limit"]');
    const batchHistoryColorInput = panel.querySelector('[data-setting="batch-open-history-color"]');
    const batchHistoryColorResetButton = panel.querySelector('[data-action="reset-batch-open-history-color"]');
    const downloadInput = panel.querySelector('[data-setting="download"]');
    const downloadGuardInput = panel.querySelector('[data-setting="download-guard"]');
    const crossSearchInput = panel.querySelector('[data-setting="cross-search"]');
    const copyCodeInput = panel.querySelector('[data-setting="copy-code"]');
    const searchFilterInput = panel.querySelector('[data-setting="search-filter"]');
    const blockedKeywordsInput = panel.querySelector('[data-setting="blocked-keywords"]');
    const searchAutoRedirectInput = panel.querySelector('[data-setting="search-auto-redirect"]');
    const previewInput = panel.querySelector('[data-setting="hdblog-preview"]');
    const javfreePreviewInput = panel.querySelector('[data-setting="javfree-preview-fallback"]');
    const actressInput = panel.querySelector('[data-setting="real-actress"]');
    batchInput.checked = isAgaghhhBatchOpenEnabled();
    const batchInterval = getAgaghhhBatchOpenInterval();
    batchIntervalMinInput.value = String(batchInterval.delayMin / 1e3);
    batchIntervalMaxInput.value = String(batchInterval.delayMax / 1e3);
    batchHistoryInput.checked = isAgaghhhBatchOpenHistoryEnabled();
    batchUnopenedOnlyInput.checked = isAgaghhhBatchOpenUnopenedOnlyEnabled();
    batchProgressLocatorInput.checked = isAgaghhhBatchProgressLocatorEnabled();
    batchHistoryLimitInput.value = String(getAgaghhhBatchOpenHistoryLimit());
    batchHistoryColorInput.value = getAgaghhhBatchOpenHistoryColor();
    downloadInput.checked = isAgaghhhDownloadEnabled();
    downloadGuardInput.checked = isDownloadGuardEnabled(AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY);
    crossSearchInput.checked = isAgaghhhCrossSearchEnabled();
    copyCodeInput.checked = isAgaghhhCopyCodeEnabled();
    searchFilterInput.checked = isAgaghhhSearchFilterEnabled();
    blockedKeywordsInput.value = getAgaghhhBlockedKeywordsText();
    searchAutoRedirectInput.checked = isAgaghhhSearchAutoRedirectEnabled();
    previewInput.checked = isAgaghhhHdblogPreviewEnabled();
    javfreePreviewInput.checked = isAgaghhhJavfreePreviewFallbackEnabled();
    actressInput.checked = isAgaghhhRealActressEnabled();
    const syncBatchIntervalFields = () => {
      const disabled = !batchInput.checked;
      batchIntervalMinInput.disabled = disabled;
      batchIntervalMaxInput.disabled = disabled;
      batchIntervalResetButton.disabled = disabled;
    };
    const syncBatchHistoryFields = () => {
      const detailsDisabled = !batchInput.checked || !batchHistoryInput.checked;
      batchHistoryInput.disabled = !batchInput.checked;
      batchUnopenedOnlyInput.disabled = detailsDisabled;
      batchProgressLocatorInput.disabled = detailsDisabled;
      batchHistoryLimitInput.disabled = detailsDisabled;
      batchHistoryColorInput.disabled = false;
      batchHistoryColorResetButton.disabled = false;
    };
    const syncDownloadGuardField = () => {
      downloadGuardInput.disabled = !downloadInput.checked;
    };
    const syncPreviewFallbackFields = () => {
      javfreePreviewInput.disabled = !previewInput.checked;
    };
    const syncSearchFilterFields = () => {
      blockedKeywordsInput.disabled = !searchFilterInput.checked;
    };
    syncBatchIntervalFields();
    syncBatchHistoryFields();
    syncDownloadGuardField();
    syncPreviewFallbackFields();
    syncSearchFilterFields();
    batchInput.addEventListener("change", () => {
      syncBatchIntervalFields();
      syncBatchHistoryFields();
    });
    batchHistoryInput.addEventListener("change", syncBatchHistoryFields);
    downloadInput.addEventListener("change", syncDownloadGuardField);
    previewInput.addEventListener("change", syncPreviewFallbackFields);
    searchFilterInput.addEventListener("change", syncSearchFilterFields);
    batchIntervalResetButton.addEventListener("click", () => {
      batchIntervalMinInput.value = String(DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MIN_MS / 1e3);
      batchIntervalMaxInput.value = String(DEFAULT_AGAGHHH_BATCH_OPEN_INTERVAL_MAX_MS / 1e3);
      batchIntervalResetButton.blur();
    });
    batchHistoryColorResetButton.addEventListener("click", () => {
      batchHistoryColorInput.value = DEFAULT_AGAGHHH_BATCH_OPEN_HISTORY_COLOR;
      batchHistoryColorResetButton.blur();
    });
    panel.querySelector('[data-action="cancel"]')?.addEventListener("click", () => closeX1080xSettingsPanel(document2));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeX1080xSettingsPanel(document2);
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const batchIntervalMinSeconds = Number(batchIntervalMinInput.value);
      const batchIntervalMaxSeconds = Number(batchIntervalMaxInput.value);
      if (!Number.isFinite(batchIntervalMinSeconds) || !Number.isFinite(batchIntervalMaxSeconds) || batchIntervalMinSeconds < 0.1 || batchIntervalMaxSeconds > 600 || batchIntervalMaxSeconds < batchIntervalMinSeconds) {
        document2.defaultView?.alert("\u6279\u91CF\u6253\u5F00\u4E3B\u9898\u95F4\u9694\u8BF7\u8F93\u5165 0.1\u2013600 \u79D2\uFF0C\u4E14\u6700\u5927\u95F4\u9694\u4E0D\u80FD\u5C0F\u4E8E\u6700\u5C0F\u95F4\u9694\u3002");
        batchIntervalMinInput.focus();
        return;
      }
      const batchHistoryLimit = Number(batchHistoryLimitInput.value);
      if (!Number.isInteger(batchHistoryLimit) || batchHistoryLimit < 1 || batchHistoryLimit > 5e4) {
        document2.defaultView?.alert("\u6279\u91CF\u6253\u5F00\u8BB0\u5F55\u4FDD\u5B58\u6761\u6570\u8BF7\u8F93\u5165 1\u201350000 \u7684\u6574\u6570\u3002");
        batchHistoryLimitInput.focus();
        return;
      }
      const batchIntervalMinMs = Math.round(batchIntervalMinSeconds * 1e3);
      const batchIntervalMaxMs = Math.round(batchIntervalMaxSeconds * 1e3);
      if (typeof GM_setValue === "function") {
        GM_setValue(AGAGHHH_BATCH_OPEN_ENABLED_KEY2, batchInput.checked);
        GM_setValue(AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY2, batchIntervalMinMs);
        GM_setValue(AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY2, batchIntervalMaxMs);
        GM_setValue(AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY2, batchHistoryInput.checked);
        GM_setValue(AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY2, batchUnopenedOnlyInput.checked);
        GM_setValue(AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY2, batchProgressLocatorInput.checked);
        GM_setValue(AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY2, batchHistoryLimit);
        GM_setValue(AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY2, batchHistoryColorInput.value);
        if (typeof GM_getValue === "function") {
          const modern = document2.location?.hostname !== "agaghhh.cc" && !/^\/(?:forum|search)\.php$/i.test(document2.location?.pathname || "");
          const historyKey = modern ? MODERN_RESOURCE_HISTORY_KEY2 : AGAGHHH_BATCH_OPEN_HISTORY_KEY2;
          const existingHistory = GM_getValue(historyKey, []);
          if (Array.isArray(existingHistory) && existingHistory.length > batchHistoryLimit) {
            GM_setValue(historyKey, existingHistory.slice(-batchHistoryLimit));
          }
        }
        GM_setValue(AGAGHHH_DOWNLOAD_ENABLED_KEY2, downloadInput.checked);
        GM_setValue(AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY, downloadGuardInput.checked);
        GM_setValue(AGAGHHH_CROSS_SEARCH_ENABLED_KEY, crossSearchInput.checked);
        GM_setValue(AGAGHHH_COPY_CODE_ENABLED_KEY, copyCodeInput.checked);
        GM_setValue(AGAGHHH_SEARCH_FILTER_ENABLED_KEY, searchFilterInput.checked);
        GM_setValue(
          AGAGHHH_BLOCKED_KEYWORDS_KEY,
          normalizeAgaghhhBlockedKeywordsText(blockedKeywordsInput.value)
        );
        GM_setValue(AGAGHHH_SEARCH_AUTO_REDIRECT_ENABLED_KEY, searchAutoRedirectInput.checked);
        GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, previewInput.checked);
        GM_setValue(AGAGHHH_JAVFREE_PREVIEW_FALLBACK_ENABLED_KEY, javfreePreviewInput.checked);
        GM_setValue(AGAGHHH_REAL_ACTRESS_ENABLED_KEY, actressInput.checked);
      }
      closeX1080xSettingsPanel(document2);
      const view = document2.defaultView;
      if (view?.location?.reload) view.location.reload();
    });
    overlay.append(panel);
    root.append(overlay);
    document2.body.append(host);
    return overlay;
  }
  function installX1080xSettingsMenu(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isAgaghhhHost(locationObject)) return;
    const view = document2.defaultView;
    if (view && view.top !== view) return;
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("\u2699\uFE0F x1080x \u8BBE\u7F6E", () => {
      try {
        openX1080xSettingsPanel(document2);
      } catch (error) {
        console.error("[x1080x-ex] failed to open agaghhh settings", error);
        document2.defaultView?.alert?.(`x1080x \u8BBE\u7F6E\u6253\u5F00\u5931\u8D25\uFF1A${error?.message || error}`);
      }
    });
  }
  function installAgaghhhEnhancement(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2 || !isAgaghhhHost(locationObject)) return;
    if (isAgaghhhForumSearchPage(locationObject) && isAgaghhhSearchFilterEnabled()) {
      filterAgaghhhSearchResults(document2, getAgaghhhBlockedKeywords());
    }
    if (installAgaghhhSearchAutoRedirect(document2, locationObject)) return;
    if (!isAgaghhhBatchOpenEnabled()) {
      document2.getElementById(BATCH_BUTTON_ID2)?.remove();
      document2.getElementById(BATCH_PROGRESS_BUTTON_ID2)?.remove();
      document2.getElementById(BATCH_TOOLBAR_ID2)?.remove();
    } else if (!isAgaghhhBatchOpenHistoryEnabled() || !isAgaghhhBatchProgressLocatorEnabled()) {
      document2.getElementById(BATCH_PROGRESS_BUTTON_ID2)?.remove();
    }
    if (isAgaghhhHdblogPreviewEnabled()) {
      void installAgaghhhHdblogPreview(document2, locationObject, gmRequest2);
    }
    const downloadEnabled = isAgaghhhDownloadEnabled();
    if (!downloadEnabled) document2.getElementById(DOWNLOAD_BUTTON_ID2)?.remove();
    if (isAgaghhhCrossSearchEnabled()) installHdblogSearchButton(document2);
    else document2.getElementById(SEARCH_BUTTON_ID2)?.remove();
    if (isAgaghhhCopyCodeEnabled()) installCopyCodeButton2(document2);
    else document2.getElementById(COPY_BUTTON_ID2)?.remove();
    if (downloadEnabled && isAgaghhhRealActressEnabled()) bindRealActressDownload(document2, gmRequest2);
    refreshModernResourceActionButtons(document2);
    observeModernResourceActionButtons(document2);
  }

  // src/fc2cmadb.js
  var FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY = "x1080x-ex:fc2cmadb-hdblog-search-enabled";
  var LINK_ATTR = "data-x1080x-fc2cmadb-hdblog-search";
  function isFc2cmadbUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
      return host === "fc2cmadb.com" || host.endsWith(".fc2cmadb.com");
    } catch {
      return false;
    }
  }
  function buildFc2cmadbHdblogSearchUrl(value) {
    const code = String(value ?? "").trim();
    return /^\d{5,12}$/.test(code) ? "https://hdblog.me/?s=" + code : "";
  }
  function isFc2cmadbHdblogSearchEnabled() {
    return typeof GM_getValue !== "function" || GM_getValue(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, true) !== false;
  }
  function enhanceFc2cmadbArticleCodes(documentObject) {
    if (!documentObject || !isFc2cmadbHdblogSearchEnabled()) return 0;
    let changed = 0;
    for (const figure of documentObject.querySelectorAll("figure")) {
      const badge = figure.querySelector(":scope > span.absolute.top-0.left-0");
      const cover = figure.querySelector(':scope > a[href*="/articles/"]');
      if (!badge || !cover) continue;
      const code = String(badge.textContent || "").trim();
      const searchUrl = buildFc2cmadbHdblogSearchUrl(code);
      if (!searchUrl) continue;
      try {
        const articleUrl = new URL(cover.getAttribute("href"), documentObject.baseURI);
        const articleMatch = articleUrl.pathname.match(/^\/articles\/(\d+)\/?$/);
        if (!isFc2cmadbUrl(articleUrl.href) || !articleMatch || articleMatch[1] !== code) continue;
      } catch {
        continue;
      }
      const link = documentObject.createElement("a");
      link.className = badge.className;
      link.textContent = code;
      link.href = searchUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "\u5728 HDBLOG \u641C\u7D22 FC2-PPV-" + code;
      link.setAttribute("aria-label", "\u5728 HDBLOG \u641C\u7D22\u756A\u53F7 " + code);
      link.setAttribute(LINK_ATTR, code);
      link.style.cursor = "pointer";
      link.style.zIndex = "2";
      link.style.textDecoration = "underline";
      badge.replaceWith(link);
      changed += 1;
    }
    return changed;
  }
  function installFc2cmadbEnhancement(windowObject = globalThis.window) {
    if (!windowObject || !isFc2cmadbUrl(windowObject.location?.href)) return null;
    const documentObject = windowObject.document;
    if (typeof GM_registerMenuCommand === "function") {
      const enabled = isFc2cmadbHdblogSearchEnabled();
      GM_registerMenuCommand(
        "\u2699\uFE0F FC2CMADB\uFF1A\u756A\u53F7\u641C\u7D22 HDBLOG\uFF08" + (enabled ? "\u5DF2\u5F00\u542F\uFF0C\u70B9\u51FB\u5173\u95ED" : "\u5DF2\u5173\u95ED\uFF0C\u70B9\u51FB\u5F00\u542F") + "\uFF09",
        () => {
          if (typeof GM_setValue !== "function") return;
          GM_setValue(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, !enabled);
          windowObject.alert?.("FC2CMADB \u756A\u53F7\u641C\u7D22\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u5237\u65B0\u9875\u9762\u540E\u751F\u6548\u3002");
        }
      );
    }
    if (!documentObject?.body || !isFc2cmadbHdblogSearchEnabled()) return null;
    const apply = () => enhanceFc2cmadbArticleCodes(documentObject);
    apply();
    const observer = new windowObject.MutationObserver(apply);
    observer.observe(documentObject.body, { childList: true, subtree: true });
    return observer;
  }

  // src/qbittorrent-settings.js
  var SETTINGS_PANEL_ID2 = "x1080x-ex-settings-panel";
  var QB_SECTION_ATTR = "data-x1080x-qb-settings";
  var QB_BOUND_ATTR = "data-x1080x-qb-settings-bound";
  function setStatus(element, message, kind = "") {
    if (!element) return;
    element.textContent = message;
    element.style.color = kind === "error" ? "#c5221f" : kind === "success" ? "#16803c" : "#666";
  }
  function enhanceQbittorrentSettingsPanel(document2 = globalThis.document, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const overlay = document2?.getElementById(SETTINGS_PANEL_ID2);
    const form = overlay?.shadowRoot?.querySelector("form") || overlay?.querySelector("form");
    if (!form || form.querySelector(`[${QB_SECTION_ATTR}]`)) return false;
    const current = getQbSettings();
    if (!form.querySelector("[data-settings-workspace]")) {
      form.style.width = "min(640px, 100%)";
    }
    form.setAttribute("autocomplete", "off");
    const section = document2.createElement("div");
    section.setAttribute(QB_SECTION_ATTR, "1");
    section.style.cssText = "margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa";
    section.innerHTML = `
    <div style="font-weight:700;margin-bottom:11px">qBittorrent \u79CD\u5B50\u56DE\u9000</div>
    <label style="display:flex;align-items:center;gap:9px;margin-bottom:12px">
      <input data-setting="qb-enabled" type="checkbox">
      <span><strong>\u542F\u7528 qBittorrent \u5143\u6570\u636E\u56DE\u9000</strong><small style="display:block;margin-top:2px;color:#666">\u516C\u5171\u79CD\u5B50\u7F13\u5B58\u5747\u5931\u8D25\u540E\uFF0C\u901A\u8FC7 qBittorrent 5.2+ \u4ECE DHT / Tracker / Peer \u83B7\u53D6 metadata\uFF1B\u4E0D\u4F1A\u628A\u78C1\u529B\u52A0\u5165\u4E0B\u8F7D\u5217\u8868\u3002</small></span>
    </label>
    <label style="display:block;margin-bottom:10px">
      <span style="display:block;font-weight:600;margin-bottom:5px">WebUI \u5730\u5740</span>
      <input data-setting="qb-url" type="url" required placeholder="http://127.0.0.1:8080" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
    </label>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-bottom:10px">
      <label style="display:block">
        <span style="display:block;font-weight:600;margin-bottom:5px">\u7528\u6237\u540D</span>
        <input data-setting="qb-username" type="text" required autocomplete="off" data-lpignore="true" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      </label>
      <label style="display:block">
        <span style="display:block;font-weight:600;margin-bottom:5px">\u5BC6\u7801</span>
        <input data-setting="qb-password" type="password" autocomplete="off" data-lpignore="true" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      </label>
    </div>
    <label style="display:block;margin-bottom:10px">
      <span style="display:block;font-weight:600;margin-bottom:5px">\u7B49\u5F85\u5143\u6570\u636E\uFF08\u79D2\uFF09</span>
      <input data-setting="qb-timeout" type="number" min="10" max="300" step="1" required style="width:140px;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
    </label>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button data-action="qb-test" type="button" style="padding:6px 12px">\u6D4B\u8BD5 qBittorrent \u767B\u5F55</button>
      <span data-qb-status style="color:#666;overflow-wrap:anywhere"></span>
    </div>
    <small style="display:block;margin-top:9px;color:#666">\u7528\u6237\u540D\u548C\u5BC6\u7801\u4FDD\u5B58\u5728 Tampermonkey / Violentmonkey \u7684\u811A\u672C\u4E13\u5C5E\u5B58\u50A8\u4E2D\u3002\u5EFA\u8BAE WebUI \u4EC5\u5728\u53EF\u4FE1\u5C40\u57DF\u7F51\u4F7F\u7528\uFF0C\u6216\u4F7F\u7528 HTTPS\u3002</small>`;
    if (addSettingsExtraSection(form, {
      key: "qbittorrent",
      title: "qBittorrent",
      description: "\u4E0B\u8F7D\u5931\u8D25\u65F6\u901A\u8FC7 qBittorrent \u83B7\u53D6\u79CD\u5B50\u5143\u6570\u636E"
    }, section)) {
      section.style.cssText = "margin:0;padding:0;border:0;background:transparent";
    } else {
      const actions = form.lastElementChild;
      form.insertBefore(section, actions || null);
    }
    const enabledInput = section.querySelector('[data-setting="qb-enabled"]');
    const urlInput = section.querySelector('[data-setting="qb-url"]');
    const usernameInput = section.querySelector('[data-setting="qb-username"]');
    const passwordInput = section.querySelector('[data-setting="qb-password"]');
    const timeoutInput = section.querySelector('[data-setting="qb-timeout"]');
    const testButton = section.querySelector('[data-action="qb-test"]');
    const status = section.querySelector("[data-qb-status]");
    enabledInput.checked = current.enabled;
    urlInput.value = current.url;
    usernameInput.value = current.username;
    passwordInput.value = current.password;
    timeoutInput.value = String(Math.round(current.metadataTimeoutMs / 1e3));
    const formSettings = () => ({
      enabled: enabledInput.checked,
      url: urlInput.value,
      username: usernameInput.value,
      password: passwordInput.value,
      metadataTimeoutMs: Number(timeoutInput.value) * 1e3
    });
    testButton.addEventListener("click", async () => {
      testButton.disabled = true;
      setStatus(status, "\u6B63\u5728\u767B\u5F55 qBittorrent\u2026");
      try {
        const result = await testQbConnection(formSettings(), gmRequest2);
        setStatus(status, `\u767B\u5F55\u6210\u529F\uFF0CqBittorrent ${result.version}`, "success");
      } catch (error) {
        setStatus(status, error?.message || String(error), "error");
      } finally {
        testButton.disabled = false;
      }
    });
    if (form.getAttribute(QB_BOUND_ATTR) !== "1") {
      form.setAttribute(QB_BOUND_ATTR, "1");
      form.addEventListener("submit", (event) => {
        try {
          saveQbSettings(formSettings());
        } catch (error) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setStatus(status, error?.message || String(error), "error");
        }
      }, true);
    }
    return true;
  }
  function installQbittorrentSettings(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2?.body || !isAgaghhhHost(locationObject)) return null;
    if (enhanceQbittorrentSettingsPanel(document2, gmRequest2)) return null;
    const Observer = document2.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (typeof Observer !== "function") return null;
    const observer = new Observer(() => enhanceQbittorrentSettingsPanel(document2, gmRequest2));
    observer.observe(document2.body, { childList: true, subtree: true });
    return observer;
  }

  // src/index.js
  installFc2cmadbEnhancement();
  installX1080xSettingsMenu();
  installAgaghhhEnhancement();
  installQbittorrentSettings();
  installHdblogImageHostSettings();
  installHdblogReferResolver();
  installHdblogArticleEnhancement();
  installHdblogPreviewImages();
  void installHdblogJavfreeFallback();
  installHdblogSearchEnhancement();
  installJavfreeEnhancement();
})();
