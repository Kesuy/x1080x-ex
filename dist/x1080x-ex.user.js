// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.9.1
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
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==
(() => {
  // src/core.js
  var CODE_PATTERN = /^([A-Z0-9]+-\d+)\s*/i;
  var SUBTITLE_TAG_PATTERN = /^\[(?:中文)?(?:外掛|外挂)字幕\]\s*/i;
  var DIRECT_FC2_PATTERN = /^FC2-(?:PPV-)?(\d+)\b\s*/i;
  var FC2_PPV_PATTERN = /^FC2-PPV-\d+\b/i;
  var FC2_RELEASE_TAG_PATTERN = /^(?:\[(?:BT|FC2|FC2HD)\]|\((?:BT|FC2|FC2HD)\))\s*/i;
  var LEADING_GROUP_PATTERN = /^(\[([^\]]*)\]|\(([^)]*)\))\s*/u;
  var MGS_RELEASE_PREFIX_PATTERN = /^\[BT\]\s*\(MGS\)\s*\(([^)]+)\)\s*/i;
  var MAGNET_PATTERN = /magnet:\?xt=urn:btih:[a-z0-9]+(?:&[^\s<>"']+)*/gi;
  var HDBLOG_PREVIEW_URL_ATTR = "data-x1080x-hdblog-preview-url";
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
      return /^https?:$/.test(url.protocol) && url.origin === new URL(document2.baseURI).origin;
    }).filter((thread) => !seen.has(thread.url) && seen.add(thread.url));
  }
  function parseThreadTitle(rawTitle) {
    const normalized = String(rawTitle ?? "").replace(/\s+/g, " ").trim();
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
      const groupedCodeMatch = groupText.match(/^([A-Z0-9]+-\d+)$/i);
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
  function contentImages(document2, content) {
    if (!content) return [];
    const seen = /* @__PURE__ */ new Set();
    return [...content.querySelectorAll("img")].filter(isContentImage).map((image, order) => ({
      url: largeImageUrl(document2, image),
      cacheUrl: cachedImageUrl(document2, image),
      ...imageSize(image),
      order
    })).filter((image) => image.url && !seen.has(image.url) && seen.add(image.url));
  }
  function hdblogPreviewImages(document2, content) {
    if (!content) return [];
    const seen = /* @__PURE__ */ new Set();
    return [...content.querySelectorAll(`img[${HDBLOG_PREVIEW_URL_ATTR}]`)].map((image) => absoluteUrl(document2, image.getAttribute(HDBLOG_PREVIEW_URL_ATTR))).filter((url) => url && !seen.has(url) && seen.add(url)).map((url) => ({ url }));
  }
  function contentMagnets(content) {
    const matches = String(content?.textContent ?? "").match(MAGNET_PATTERN) || [];
    return [...new Set(matches.map((value) => value.replace(/[),.;，。；]+$/u, "")))];
  }
  function isFc2PpvTitle(rawTitle) {
    return FC2_PPV_PATTERN.test(String(rawTitle ?? "").replace(/\s+/g, " ").trim());
  }
  function fc2ImageFilename(code, index, total, useAbNames) {
    const safeCode = sanitizeFilename(code);
    if (!useAbNames) return `${safeCode}${total > 1 ? ` (${index + 1})` : ""}.jpg`;
    if (index === 0) return `${safeCode} A.jpg`;
    if (total === 2) return `${safeCode} B.jpg`;
    return `${safeCode} B${index}.jpg`;
  }
  function extractThreadResources(document2) {
    const rawTitle = document2.querySelector("#thread_subject")?.textContent || document2.querySelector("h1.ts, .vwthd h1, h1")?.textContent || document2.title;
    const title = parseThreadTitle(rawTitle);
    const firstPost = [...document2.querySelectorAll('#postlist [id^="post_"]')].find((element) => /^post_\d+$/i.test(element.id)) || document2.querySelector("#postlist > div, #postlist");
    const content = firstPost?.querySelector('[id^="postmessage_"], .t_f') || firstPost;
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
      useFc2AbImageNames: isFc2PpvTitle(rawTitle),
      imageUrl: largestImage?.url || "",
      imageCacheUrl: largestImage?.cacheUrl || "",
      imageFilename: title.code ? `${sanitizeFilename(title.code)}.jpg` : "thread-image.jpg"
    };
  }
  function buildTorrentFilename(value) {
    const raw = String(value ?? "").replace(/\s+/g, " ").trim();
    const normalized = raw.replace(
      /^([A-Z0-9]+-\d+)\s+\[BT\]\s*(?:\([^)]*\)\s*)*/i,
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
    if (resources.title.code.startsWith("FC2-")) {
      resources.images.forEach((image, index) => {
        const preferredUrl = image.cacheUrl || image.url;
        jobs.push({
          kind: "image",
          url: preferredUrl,
          name: fc2ImageFilename(
            resources.title.code,
            index,
            resources.images.length,
            resources.useFc2AbImageNames
          )
        });
      });
    } else if (resources.imageUrl) {
      const preferredUrl = resources.imageCacheUrl || resources.imageUrl;
      jobs.push({
        kind: "image",
        url: preferredUrl,
        name: resources.hdblogPreviews.length ? `${sanitizeFilename(resources.title.code || "thread-image")} A.jpg` : resources.imageFilename
      });
    }
    if (resources.hdblogPreviews.length) {
      const safeCode = sanitizeFilename(resources.title.code || "preview");
      resources.hdblogPreviews.forEach((image, index) => {
        jobs.push({
          kind: "image",
          url: image.url,
          name: resources.title.code.startsWith("FC2-") ? `${safeCode} -${index + 1}.jpg` : resources.hdblogPreviews.length === 1 ? `${safeCode} B.jpg` : `${safeCode} B${index + 1}.jpg`
        });
      });
    }
    return jobs;
  }

  // src/torrent.js
  var TORRENT_SOURCES = Object.freeze([
    (hash) => `https://itorrents.net/torrent/${hash}.torrent`,
    (hash) => `https://torrage.info/torrent/${hash}.torrent`,
    (hash) => `https://itorrents.org/torrent/${hash}.torrent`
  ]);
  var BTIH_PATTERN = /urn:btih:([a-f\d]{40}|[a-z2-7]{32})/i;
  var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
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
        timeout: 3e4,
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
  async function requestTorrentBytes(magnet, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const hash = extractBtih(magnet);
    if (!hash) throw new Error("\u78C1\u529B\u94FE\u4E2D\u6CA1\u6709\u6709\u6548\u7684 BTIH");
    const errors = [];
    for (const buildUrl of TORRENT_SOURCES) {
      const url = buildUrl(hash);
      try {
        const bytes = await requestTorrentUrl(url, gmRequest2);
        const torrentName = parseTorrentName(bytes);
        verifyTorrentHash(bytes, hash);
        return { bytes, hash, torrentName, sourceUrl: url };
      } catch (error) {
        errors.push(`${new URL(url).hostname}: ${error?.message || error}`);
      }
    }
    throw new Error(`\u6240\u6709 torrent \u7F13\u5B58\u6E90\u5747\u4E0D\u53EF\u7528\uFF1A${errors.join("\uFF1B")}`);
  }

  // src/userscript.js
  var STORAGE_KEY = "x1080x-ex:domains";
  var HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = "x1080x-ex:hdblog-expand-preview-images";
  var DEFAULT_DOMAINS = "agaghhh.cc\nhdblog.me";
  var BUTTON_ID = "x1080x-ex-download";
  var BATCH_BUTTON_ID = "x1080x-ex-open-page";
  var BATCH_TOOLBAR_ID = "x1080x-ex-open-page-toolbar";
  var REQUEST_TIMEOUT = 6e4;
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
  function getConfiguredDomains() {
    const stored = GM_getValue(STORAGE_KEY, null);
    if (stored === null || stored === void 0) return parseDomainList(DEFAULT_DOMAINS);
    const domains = parseDomainList(stored);
    const isLegacyDefault = domains.length === 1 && domains[0] === "agaghhh.cc";
    return isLegacyDefault ? parseDomainList(DEFAULT_DOMAINS) : domains;
  }
  function saveDomains(domains) {
    GM_setValue(STORAGE_KEY, domains.join("\n"));
  }
  function registerSettingsMenu() {
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
      window.alert(`\u5DF2\u6062\u590D\u9ED8\u8BA4\u57DF\u540D\uFF1A${DEFAULT_DOMAINS}`);
    });
  }
  function isThreadPage() {
    const url = new URL(location.href);
    return url.searchParams.get("mod") === "viewthread" && url.searchParams.has("tid") || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
  }
  function isForumDisplayPage() {
    const url = new URL(location.href);
    return url.searchParams.get("mod") === "forumdisplay" || /forum[-_]\d+/i.test(url.pathname);
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
  function batchOpenTiming() {
    return isAllowedHost(location.hostname, ["hdblog.me"]) ? HDBLOG_OPEN_TIMING : DEFAULT_OPEN_TIMING;
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
    button.textContent = `\u540E\u53F0\u987A\u5E8F\u6253\u5F00\u672C\u9875\u4E3B\u9898\uFF08${count}\uFF09`;
    button.title = "\u6309\u9875\u9762\u987A\u5E8F\u5728\u540E\u53F0\u9010\u4E2A\u6253\u5F00\u666E\u901A\u4E3B\u9898\uFF1B\u95F4\u9694\u968F\u673A\uFF0C\u5E76\u5B9A\u671F\u505C\u987F\uFF1B\u518D\u6B21\u70B9\u51FB\u53EF\u505C\u6B62";
    button.style.background = "#398bd4";
  }
  async function openCurrentPageThreads(button) {
    if (batchOpenState) {
      cancelBatchOpen();
      return;
    }
    const threads = collectForumThreadLinks(document);
    if (!threads.length) {
      window.alert("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u627E\u5230\u53EF\u6253\u5F00\u7684\u666E\u901A\u4E3B\u9898\u3002");
      return;
    }
    const state = {
      cancelled: false,
      finishDelay: null,
      timeoutId: null
    };
    batchOpenState = state;
    const failures = [];
    let opened = 0;
    const timing = batchOpenTiming();
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
      const wasCancelled = state.cancelled;
      batchOpenState = null;
      button.textContent = wasCancelled ? `\u5DF2\u505C\u6B62\uFF08\u5DF2\u6253\u5F00 ${opened}/${threads.length}\uFF09` : failures.length ? `\u5B8C\u6210\uFF08\u6253\u5F00 ${opened}\uFF0C\u5931\u8D25 ${failures.length}\uFF09` : `\u2713 \u5DF2\u6309\u987A\u5E8F\u6253\u5F00 ${opened} \u4E2A\u4E3B\u9898`;
      button.style.background = failures.length ? "#b36b22" : "#398bd4";
      window.setTimeout(() => {
        if (!batchOpenState) {
          setBatchButtonIdle(button, collectForumThreadLinks(document).length);
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
    return String(value ?? "").replace(/((?:cookie|authorization|token|auth|sid)=)[^;\s&]+/gi, "$1[\u5DF2\u8131\u654F]").replace(/([?&](?:token|auth|sid|key)=)[^&#\s]+/gi, "$1[\u5DF2\u8131\u654F]");
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
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
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
        throw new Error(`\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT / 1e3} \u79D2\uFF09`);
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
        timeout: REQUEST_TIMEOUT,
        ...referer ? { headers: { Referer: referer } } : {},
        onload: (response) => {
          validateResponse(response).then(resolve, reject);
        },
        onerror: (error) => {
          const details = safeErrorDetails(error);
          reject(new Error(
            `\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1Aerror=${details.error || "unknown_error"}\uFF1Bdetails=${details.details || details.message || "\u65E0\u8BE6\u7EC6\u4FE1\u606F"}`
          ));
        },
        ontimeout: () => reject(new Error(`\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT / 1e3} \u79D2\uFF09`))
      });
    });
  }
  async function requestBlobWithGmXhr(job) {
    const sourceReferer = previewRefererForJob(job);
    const referers = sourceReferer ? [sourceReferer, "", location.href] : [location.href, ""];
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
  function saveBlob(blob, name) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.hidden = true;
    anchor.download = name;
    anchor.href = objectUrl;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  }
  async function download(job) {
    if (job.kind === "torrent") {
      const result2 = await requestTorrentBytes(job.url);
      saveBlob(new Blob([result2.bytes], { type: "application/x-bittorrent" }), job.name);
      console.info("[x1080x-ex] integrated torrent download", {
        name: job.name,
        hash: result2.hash,
        torrentName: result2.torrentName,
        source: new URL(result2.sourceUrl).hostname,
        size: result2.bytes.byteLength
      });
      return;
    }
    const result = await requestBlob(job);
    console.info("[x1080x-ex] response", {
      kind: job.kind,
      name: job.name,
      status: result.status,
      finalUrl: redactDiagnostic(result.finalUrl),
      contentType: result.contentType,
      size: result.blob.size
    });
    saveBlob(result.blob, job.name);
  }
  async function downloadAll(button) {
    const jobs = buildDownloadJobs(document);
    if (!jobs.length) {
      window.alert("\u4E3B\u697C\u4E2D\u6CA1\u6709\u627E\u5230\u9644\u4EF6\u6216\u53EF\u4E0B\u8F7D\u56FE\u7247\u3002");
      return;
    }
    button.disabled = true;
    const failures = [];
    console.info("[x1080x-ex] environment", {
      downloadMode: typeof GM_info === "object" ? GM_info.downloadMode : void 0,
      scriptHandler: typeof GM_info === "object" ? GM_info.scriptHandler : void 0,
      version: typeof GM_info === "object" ? GM_info.version : void 0
    });
    for (const [index, job] of jobs.entries()) {
      button.textContent = `\u4E0B\u8F7D\u4E2D ${index + 1}/${jobs.length}`;
      try {
        await download(job);
      } catch (error) {
        failures.push(`${job.name}\uFF1A${redactDiagnostic(error?.message || error?.error || "\u672A\u77E5\u9519\u8BEF")}`);
      }
    }
    button.disabled = false;
    button.textContent = failures.length ? `\u5B8C\u6210\uFF08\u5931\u8D25 ${failures.length}\uFF09` : "\u2713 \u4E0B\u8F7D\u5B8C\u6210";
    window.setTimeout(() => {
      button.textContent = "\u2B07";
    }, 2500);
    if (failures.length) {
      window.alert(`\u4EE5\u4E0B\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25\uFF1A

${failures.join("\n")}

\u53EF\u68C0\u67E5\u767B\u5F55\u72B6\u6001\u6216\u6D4F\u89C8\u5668\u4E0B\u8F7D\u6743\u9650\u540E\u91CD\u8BD5\u3002`);
    }
  }
  function addDownloadButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const title = document.querySelector("#thread_subject");
    const host = title?.closest(".vwthd, .ts") || title?.parentElement;
    if (!title || !host) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "\u2B07";
    button.title = "\u4E0B\u8F7D\u4E3B\u697C\u9644\u4EF6\u3001\u6B63\u6587\u5927\u56FE\u548C\u78C1\u529B\u94FE\u79CD\u5B50\uFF1B\u666E\u901A\u5E16\u5B50\u53D6\u6700\u5927\u56FE\uFF0CFC2 \u5E16\u5B50\u53D6\u5168\u90E8\u5927\u56FE";
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
    button.addEventListener("mouseenter", () => {
      button.style.background = "#246eaf";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "#398bd4";
    });
    button.addEventListener("click", () => void downloadAll(button));
    host.prepend(button);
  }
  function addBatchOpenButton() {
    if (document.getElementById(BATCH_BUTTON_ID)) return;
    const threads = collectForumThreadLinks(document);
    let prependButton = false;
    let host = document.querySelector("#pgt") || document.querySelector("#threadlist .th") || document.querySelector("#threadlist");
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
    setBatchButtonIdle(button, threads.length);
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
  }
  registerSettingsMenu();
  if (isAllowedHost(location.hostname, getConfiguredDomains())) {
    const expandHdblogPreview = typeof GM_getValue !== "function" || GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, true) !== false;
    if (expandHdblogPreview) expandHdblogPreviewImages();
    if (isThreadPage()) addDownloadButton();
    if (isBatchOpenPage()) addBatchOpenButton();
  }

  // src/hdblog-search.js
  var STORAGE_KEY2 = "x1080x-ex:hdblog-blocked-keywords";
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
  function isHdblogSearchUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      return (host === "hdblog.me" || host.endsWith(".hdblog.me")) && url.searchParams.has("s") && Boolean(url.searchParams.get("s")?.trim());
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
    const stored = GM_getValue(STORAGE_KEY2, null);
    if (stored === null || stored === void 0) {
      return parseBlockedKeywords(DEFAULT_BLOCKED_KEYWORDS);
    }
    return parseBlockedKeywords(stored);
  }
  function applyHdblogSearchEnhancement(windowObject = window) {
    if (!isHdblogSearchUrl(windowObject.location.href)) {
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
  function installHdblogSearchEnhancement() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    applyHdblogSearchEnhancement(window);
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
    panel.insertBefore(label, panel.lastElementChild || null);
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
  var REQUEST_TIMEOUT2 = 3e4;
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
  function parsePixhostImagePage(document2, html, pageUrl) {
    if (!document2 || !html) return "";
    const parsed = document2.implementation.createHTMLDocument("image-host");
    parsed.documentElement.innerHTML = String(html);
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
        timeout: REQUEST_TIMEOUT2,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          ...referer ? { Referer: referer } : {}
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`\u56FE\u5E8A\u9875\u9762\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
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
    const promise = requestPixhostPage(absoluteShowUrl, gmRequest2, document2?.location?.href).then(({ html, finalUrl }) => parsePixhostImagePage(document2, html, finalUrl || absoluteShowUrl) || fallback).catch(() => fallback);
    resolutionCache.set(absoluteShowUrl, promise);
    return promise;
  }

  // src/hdblog-article.js
  var HDBLOG_ARTICLE_WIDTH_KEY = "x1080x-ex:hdblog-article-width";
  var HDBLOG_SHOW_DOWNLOAD_AREA_KEY = "x1080x-ex:hdblog-show-download-area";
  var HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY = "x1080x-ex:hdblog-show-image-download-button";
  var HDBLOG_EXPAND_PREVIEW_IMAGES_KEY2 = "x1080x-ex:hdblog-expand-preview-images";
  var HDBLOG_BLOCKED_KEYWORDS_KEY = "x1080x-ex:hdblog-blocked-keywords";
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
  var ARTICLE_BODY_CLASS = "x1080x-hdblog-single";
  var REQUEST_TIMEOUT3 = 6e4;
  var PREVIEW_BOUNDARY_PATTERN = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?)\b/i;
  var PIXHOST_IMAGE_HOST_PATTERN = /^img\d+\.(?:pixhost\.(?:to|cc)|pixho\.st)$/i;
  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHost2(locationObject) {
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
    if (!document2 || !isHdblogHost2(locationObject)) return false;
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
    const text = normalizeText(value).toUpperCase();
    if (!text) return "";
    const fc2 = text.match(/\bFC2[\s_-]*(PPV[\s_-]*)?(\d{5,9})\b/i);
    if (fc2) return `FC2${fc2[1] ? "-PPV" : ""}-${fc2[2]}`;
    const standard = text.match(/\b([A-Z]{2,12})[\s_-]?(\d{2,8})\b/i);
    if (!standard) return "";
    const prefix = standard[1];
    if (["HTTP", "HTTPS", "IMG", "IMAGE", "JPG", "JPEG", "PNG", "WEBP"].includes(prefix)) return "";
    return `${prefix}-${standard[2]}`;
  }
  function extractHdblogArticleCode(document2) {
    const titleText = normalizeText(articleTitleElement(document2)?.textContent || document2?.title);
    const fromTitle = extractHdblogVideoCode(titleText);
    if (fromTitle) return fromTitle;
    const content = articleContentElement(document2);
    if (!content) return "";
    const text = normalizeText(content.textContent).slice(0, 5e3);
    const labelled = text.match(/(?:品番|品號|品号|番号|番號|code)\s*[:：]?\s*([A-Z0-9 _-]{4,30})/i);
    return extractHdblogVideoCode(labelled?.[1] || text);
  }
  function absoluteHttpUrl(document2, value) {
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
      const url = absoluteHttpUrl(document2, rawUrl);
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
      const url = absoluteHttpUrl(document2, value);
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
    const anchorHref = absoluteHttpUrl(document2, image.closest("a[href]")?.getAttribute("href"));
    const candidates = [image.currentSrc, image.getAttribute("src"), anchorHref];
    for (const value of candidates) {
      const url = absoluteHttpUrl(document2, value);
      if (url && isPixhostImageUrl(url, document2.baseURI)) return url;
    }
    return "";
  }
  function textNodesUnder(root) {
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
    if (node.nodeType === 3 && normalizeText(node.nodeValue)) {
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
    const nodes = textNodesUnder(content);
    const start = nodes.find((node) => DOWNLOAD_SECTION_LABEL_PATTERN.test(normalizeText(node.nodeValue)));
    if (!start) return 0;
    const preview = nodes.find((node) => isAfter(start, node) && PREVIEW_LABEL_PATTERN.test(normalizeText(node.nodeValue)));
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
  function isAfter(reference, node) {
    return Boolean(reference?.compareDocumentPosition(node) & 4);
  }
  function previewRange(content) {
    const nodes = textNodesUnder(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter(marker, node) && PREVIEW_BOUNDARY_PATTERN.test(normalizeText(node.nodeValue))) || null;
    return { marker, boundary };
  }
  function inPreviewRange(range, node) {
    if (!range || !isAfter(range.marker, node)) return false;
    return !range.boundary || !isAfter(range.boundary, node);
  }
  function collectHdblogPixhostPreviewImages(document2) {
    const content = articleContentElement(document2);
    if (!content) return [];
    const range = previewRange(content);
    if (!range) return [];
    const seen = /* @__PURE__ */ new Set();
    return [...content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange(range, anchor)).map((anchor) => {
      const image = anchor.querySelector("img");
      if (!image) return null;
      const href = absoluteHttpUrl(document2, anchor.getAttribute("href"));
      const pixhostShowUrl = isPixhostShowUrl(href, document2.baseURI) ? href : "";
      const directUrl = displayedPixhostImageUrl(document2, image);
      if (!pixhostShowUrl && !directUrl) return null;
      return {
        image,
        pixhostShowUrl,
        thumbUrl: thumbnailUrl(document2, image),
        directUrl
      };
    }).filter(Boolean).filter((candidate) => {
      const key = candidate.pixhostShowUrl || candidate.directUrl;
      return !seen.has(key) && seen.add(key);
    }).slice(0, 24);
  }
  function hdblogImageFilename(code, index, total, extension = "jpg") {
    const safeCode = normalizeText(code).replace(/[<>:"/\\|?*]/g, "-");
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
  function extensionFromBlob(blob, url) {
    const type = String(blob?.type || "").toLowerCase();
    if (type.includes("jpeg")) return "jpg";
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    if (type.includes("avif")) return "avif";
    return extensionFromUrl(url) || "jpg";
  }
  function requestImageBlob(url, referer, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D\u6CB9\u7334\u73AF\u5883\u4E0D\u652F\u6301 GM_xmlhttpRequest\u3002"));
        return;
      }
      gmRequest2({
        method: "GET",
        url,
        responseType: "blob",
        timeout: REQUEST_TIMEOUT3,
        headers: referer ? { Referer: referer } : void 0,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300 || !response.response) {
            reject(new Error(`\u56FE\u7247\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
            return;
          }
          resolve(response.response);
        },
        onerror: () => reject(new Error("\u56FE\u7247\u8BF7\u6C42\u5931\u8D25\u3002")),
        ontimeout: () => reject(new Error(`\u56FE\u7247\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT3 / 1e3} \u79D2\uFF09\u3002`))
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
    const code = extractHdblogArticleCode(document2);
    if (!code) {
      view?.alert("\u6CA1\u6709\u8BC6\u522B\u5230\u5F71\u7247\u756A\u53F7\uFF0C\u672A\u5F00\u59CB\u4E0B\u8F7D\u3002");
      return;
    }
    const candidates = initialCandidates.length ? initialCandidates : collectHdblogPixhostPreviewImages(document2);
    if (!candidates.length) {
      view?.alert("Preview \u533A\u6CA1\u6709\u627E\u5230 Pixhost show \u56FE\u7247\u3002");
      return;
    }
    button.disabled = true;
    const failures = [];
    try {
      button.textContent = "\u89E3\u6790 Preview\u2026";
      const resolved = [];
      const seen = /* @__PURE__ */ new Set();
      for (const candidate of candidates) {
        try {
          const url = await resolveCandidateUrl(document2, candidate, gmRequest2);
          if (url && !seen.has(url)) {
            seen.add(url);
            resolved.push(url);
          }
        } catch (error) {
          failures.push(error?.message || "Pixhost \u5927\u56FE\u5730\u5740\u89E3\u6790\u5931\u8D25");
        }
      }
      if (!resolved.length) throw new Error("\u6CA1\u6709\u89E3\u6790\u5230\u53EF\u4E0B\u8F7D\u7684 Pixhost Preview \u5927\u56FE\u3002");
      for (const [index, url] of resolved.entries()) {
        button.textContent = `\u4E0B\u8F7D ${index + 1}/${resolved.length}`;
        try {
          const blob = await requestImageBlob(url, locationObject?.href, gmRequest2);
          const extension = extensionFromBlob(blob, url);
          saveBlob2(document2, blob, hdblogImageFilename(code, index, resolved.length, extension));
        } catch (error) {
          failures.push(`${index + 1}. ${error?.message || "\u4E0B\u8F7D\u5931\u8D25"}`);
        }
      }
    } catch (error) {
      failures.push(error?.message || "\u4E0B\u8F7D\u5931\u8D25");
    } finally {
      button.disabled = false;
      button.textContent = failures.length ? `\u5B8C\u6210\uFF08\u5931\u8D25 ${failures.length}\uFF09` : "\u2713 \u4E0B\u8F7D\u5B8C\u6210";
      view?.setTimeout(() => {
        button.textContent = "\u2B07";
      }, 2500);
    }
    if (failures.length) view?.alert(`\u90E8\u5206\u56FE\u7247\u5904\u7406\u5931\u8D25\uFF1A

${failures.join("\n")}`);
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
      margin: "0 0 4px 12px",
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
  function rawStoredWidth() {
    if (typeof GM_getValue !== "function") return "";
    const value = GM_getValue(HDBLOG_ARTICLE_WIDTH_KEY, "");
    return value === null || value === void 0 ? "" : String(value).trim();
  }
  function readStoredWidth() {
    const stored = rawStoredWidth();
    return stored ? normalizeHdblogArticleWidth(stored, DEFAULT_HDBLOG_ARTICLE_WIDTH) : null;
  }
  function readDownloadAreaVisible() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, true) !== false;
  }
  function readImageDownloadButtonVisible() {
    if (typeof GM_getValue !== "function") return true;
    return GM_getValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, true) !== false;
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
    <h2 style="margin:0 0 18px;font-size:20px">x1080x-ex \xB7 hdblog \u8BBE\u7F6E</h2>
    <label style="display:block;margin-bottom:16px">
      <span style="display:block;font-weight:600;margin-bottom:6px">\u6587\u7AE0\u4E3B\u5185\u5BB9\u533A\u5BBD\u5EA6\uFF08px\uFF09</span>
      <input data-setting="width" type="number" min="${MIN_HDBLOG_ARTICLE_WIDTH}" max="${MAX_HDBLOG_ARTICLE_WIDTH}" step="1"
        placeholder="\u7559\u7A7A = \u7F51\u7AD9\u9ED8\u8BA4\u5BBD\u5EA6"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      <small style="display:block;margin-top:5px;color:#666">\u53EA\u6269\u5C55\u767D\u8272\u4E3B\u5185\u5BB9\u533A\u57DF\uFF1B\u539F\u6B63\u6587\u5BBD\u5EA6\u4FDD\u6301\u4E0D\u53D8\u5E76\u5C45\u4E2D\u3002</small>
    </label>
    <div style="margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa">
      <div style="font-weight:700;margin-bottom:10px">\u6587\u7AE0\u9875\u663E\u793A</div>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="show-downloads" type="checkbox">
        \u663E\u793A Btfile / katfile / Freedl / Rapidgator \u7F51\u76D8\u4E0B\u8F7D\u533A\u57DF
      </label>
      <label style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
        <input data-setting="show-image-download" type="checkbox">
        \u663E\u793A\u6807\u9898\u65C1\u7684\u56FE\u7247\u4E0B\u8F7D\u6309\u94AE\uFF08\u2B07\uFF09
      </label>
      <label style="display:flex;align-items:center;gap:9px">
        <input data-setting="expand-preview" type="checkbox">
        \u81EA\u52A8\u5C55\u5F00 Preview \u5927\u56FE
      </label>
      <small style="display:block;margin-top:9px;color:#666">\u5173\u95ED Preview \u5927\u56FE\u540E\u4FDD\u7559\u7F51\u7AD9\u539F\u59CB\u7F29\u7565\u56FE\uFF1B\u4FDD\u5B58\u8BBE\u7F6E\u540E\u9875\u9762\u4F1A\u81EA\u52A8\u5237\u65B0\u3002</small>
    </div>
    <label style="display:block;margin-bottom:18px">
      <span style="display:block;font-weight:600;margin-bottom:6px">\u641C\u7D22\u7ED3\u679C\u5C4F\u853D\u5173\u952E\u8BCD</span>
      <textarea data-setting="keywords" rows="5" placeholder="\u7559\u7A7A = \u4E0D\u5C4F\u853D"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical"></textarea>
      <small style="display:block;margin-top:5px;color:#666">\u6BCF\u884C\u4E00\u4E2A\uFF0C\u4E5F\u53EF\u7528\u9017\u53F7\u6216\u5206\u53F7\u5206\u9694\uFF1B\u641C\u7D22\u9875\u5237\u65B0\u540E\u751F\u6548\u3002</small>
    </label>
    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button type="button" data-action="cancel" style="padding:7px 14px">\u53D6\u6D88</button>
      <button type="submit" style="padding:7px 16px;font-weight:600">\u4FDD\u5B58</button>
    </div>`;
    const widthInput = panel.querySelector('[data-setting="width"]');
    const downloadsInput = panel.querySelector('[data-setting="show-downloads"]');
    const imageDownloadInput = panel.querySelector('[data-setting="show-image-download"]');
    const previewInput = panel.querySelector('[data-setting="expand-preview"]');
    const keywordsInput = panel.querySelector('[data-setting="keywords"]');
    widthInput.value = rawStoredWidth();
    downloadsInput.checked = readDownloadAreaVisible();
    imageDownloadInput.checked = readImageDownloadButtonVisible();
    previewInput.checked = isHdblogPreviewExpansionEnabled();
    keywordsInput.value = readBlockedKeywordsText();
    panel.querySelector('[data-action="cancel"]')?.addEventListener("click", () => closeHdblogSettingsPanel(document2));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeHdblogSettingsPanel(document2);
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const widthText = widthInput.value.trim();
      let numeric = null;
      if (widthText) {
        numeric = Number.parseInt(widthText, 10);
        if (!Number.isFinite(numeric) || numeric < MIN_HDBLOG_ARTICLE_WIDTH || numeric > MAX_HDBLOG_ARTICLE_WIDTH) {
          document2.defaultView?.alert(`\u8BF7\u8F93\u5165 ${MIN_HDBLOG_ARTICLE_WIDTH}-${MAX_HDBLOG_ARTICLE_WIDTH} \u4E4B\u95F4\u7684\u6574\u6570\uFF0C\u6216\u7559\u7A7A\u4F7F\u7528\u7F51\u7AD9\u9ED8\u8BA4\u5BBD\u5EA6\u3002`);
          widthInput.focus();
          return;
        }
      }
      if (typeof GM_setValue === "function") {
        GM_setValue(HDBLOG_ARTICLE_WIDTH_KEY, widthText ? numeric : "");
        GM_setValue(HDBLOG_SHOW_DOWNLOAD_AREA_KEY, downloadsInput.checked);
        GM_setValue(HDBLOG_SHOW_IMAGE_DOWNLOAD_BUTTON_KEY, imageDownloadInput.checked);
        GM_setValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY2, previewInput.checked);
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
    if (!isHdblogHost2(locationObject) || typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("\u2699\uFE0F hdblog \u8BBE\u7F6E", () => openHdblogSettingsPanel(document2));
  }
  function installHdblogArticleEnhancement(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2) return;
    registerHdblogSettingsMenu(document2, locationObject);
    if (!isHdblogArticlePage(document2, locationObject)) return;
    const storedWidth = readStoredWidth();
    if (storedWidth === null) clearHdblogArticleLayout(document2);
    else applyHdblogArticleLayout(document2, storedWidth);
    applyHdblogDownloadAreaVisibility(document2, readDownloadAreaVisible());
    if (readImageDownloadButtonVisible()) installDownloadButton(document2, locationObject, gmRequest2);
    else document2.getElementById(DOWNLOAD_BUTTON_ID)?.remove();
  }

  // src/hdblog-preview.js
  var IMAGE_EXTENSION_PATTERN2 = /\.(?:jpe?g|png|webp|gif|avif)$/i;
  var PREVIEW_BOUNDARY_PATTERN2 = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  var PREVIEW_VIEWPORT_WIDTH = "min(var(--x1080x-hdblog-article-width, 100%), calc(100vw - 40px))";
  function normalizeText2(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHost3(locationObject) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "hdblog.me" || hostname.endsWith(".hdblog.me");
  }
  function absoluteHttpUrl2(document2, value) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(value)) return "";
    try {
      const url = new URL(value, document2.baseURI);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function pixhostShowHref(document2, anchor) {
    const href = absoluteHttpUrl2(document2, anchor?.getAttribute("href"));
    return href && isPixhostShowUrl(href, document2.baseURI) ? href : "";
  }
  function directImageHref2(document2, anchor) {
    const href = absoluteHttpUrl2(document2, anchor?.getAttribute("href"));
    if (!href || isPixhostShowUrl(href, document2.baseURI)) return "";
    try {
      return IMAGE_EXTENSION_PATTERN2.test(new URL(href).pathname) ? href : "";
    } catch {
      return "";
    }
  }
  function wordpressOriginalUrl(document2, value) {
    const href = absoluteHttpUrl2(document2, value);
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
      const url = absoluteHttpUrl2(document2, rawUrl);
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
      const url = absoluteHttpUrl2(document2, candidate);
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
      const direct = absoluteHttpUrl2(document2, candidate);
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
      const url = absoluteHttpUrl2(document2, candidate);
      if (url) return url;
    }
    return "";
  }
  function textNodesUnder2(root) {
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
    return textNodesUnder2(root).find((node) => /^preview\s*[:：]?$/i.test(normalizeText2(node.nodeValue))) || null;
  }
  function isAfter2(reference, node) {
    return Boolean(reference.compareDocumentPosition(node) & 4);
  }
  function findBoundary(root, marker) {
    return textNodesUnder2(root).find((node) => {
      if (!isAfter2(marker, node)) return false;
      const text = normalizeText2(node.nodeValue);
      return text && PREVIEW_BOUNDARY_PATTERN2.test(text);
    }) || null;
  }
  function inPreviewRange2(marker, boundary, node) {
    if (!isAfter2(marker, node)) return false;
    return !boundary || !isAfter2(boundary, node);
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
    if (image.dataset.x1080xPreviewLarge === "1" && image.src === fullUrl) return false;
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
    return true;
  }
  function previewRange2(document2, locationObject) {
    if (!document2 || !isHdblogHost3(locationObject)) return null;
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
        image.alt = normalizeText2(anchor.textContent) || "Preview";
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
        image.alt = normalizeText2(anchor.textContent) || "Preview";
        anchor.replaceChildren(image);
      }
      return styleExpandedImage(image, fullUrl);
    }));
    return results.filter(Boolean).length;
  }
  function installHdblogPreviewImages(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isHdblogHost3(locationObject) || !isHdblogPreviewExpansionEnabled()) return;
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
  var REQUEST_TIMEOUT4 = 3e4;
  var PREVIEW_BOUNDARY_PATTERN3 = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  var resolutionCache2 = /* @__PURE__ */ new Map();
  function normalizeText3(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHostname(hostname) {
    const host = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
    return host === "hdblog.me" || host.endsWith(".hdblog.me");
  }
  function absoluteHttpUrl3(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(String(value))) return "";
    try {
      const url = new URL(String(value), baseUrl);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function isHdblogReferUrl(value, baseUrl = "https://hdblog.me/") {
    const href = absoluteHttpUrl3(value, baseUrl);
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
        const target = absoluteHttpUrl3(match?.[1], baseUrl);
        if (target) return target;
      }
    } catch {
    }
    const scriptMatch = String(html).match(
      /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i
    );
    return absoluteHttpUrl3(scriptMatch?.[1], baseUrl);
  }
  function targetFromResponse(document2, response, referUrl) {
    const finalUrl = absoluteHttpUrl3(
      response?.finalUrl || response?.responseURL,
      referUrl
    );
    if (finalUrl && finalUrl !== referUrl && !isHdblogReferUrl(finalUrl, referUrl)) {
      return finalUrl;
    }
    const location2 = responseHeadersMap(response?.responseHeaders).get("location");
    const locationUrl = absoluteHttpUrl3(location2, referUrl);
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
        timeout: REQUEST_TIMEOUT4,
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
    const absoluteReferUrl = absoluteHttpUrl3(referUrl, document2?.baseURI || "https://hdblog.me/");
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
  function textNodesUnder3(root) {
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
  function isAfter3(reference, node) {
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
    const nodes = textNodesUnder3(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText3(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter3(marker, node) && PREVIEW_BOUNDARY_PATTERN3.test(normalizeText3(node.nodeValue))) || null;
    return { content, marker, boundary };
  }
  function inPreviewRange3(range, node) {
    if (!range || !isAfter3(range.marker, node)) return false;
    return !range.boundary || !isAfter3(range.boundary, node);
  }
  async function resolveHdblogPreviewReferLinks(document2, locationObject = document2?.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    const range = previewRange3(document2, locationObject);
    if (!range) return 0;
    const anchors = [...range.content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange3(range, anchor)).map((anchor) => ({
      anchor,
      referUrl: absoluteHttpUrl3(anchor.getAttribute("href"), document2.baseURI)
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
    if (!document2 || !isHdblogHostname(locationObject?.hostname)) return;
    const run = () => void resolveHdblogPreviewReferLinks(document2, locationObject, gmRequest2);
    run();
    const view = document2.defaultView;
    if (!view) return;
    view.setTimeout(run, 500);
    view.setTimeout(run, 1500);
  }

  // src/agaghhh-preview-official.js
  var AV_WIKI_ORIGIN = "https://av-wiki.net";
  var FANZA_IMAGE_ORIGIN = "https://pics.dmm.co.jp";
  var FANZA_REFERER = "https://www.dmm.co.jp/";
  var MGS_ORIGIN = "https://www.mgstage.com";
  var REQUEST_TIMEOUT5 = 3e4;
  var MAX_PREVIEW_IMAGES = 20;
  var AGAGHHH_OFFICIAL_PREVIEW_FALLBACK_ENABLED_KEY = "x1080x-ex:agaghhh-official-preview-fallback-enabled";
  function normalizeText4(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
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
  function gmRequest(details, request = globalThis.GM_xmlhttpRequest) {
    return new Promise((resolve, reject) => {
      if (typeof request !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      request({
        timeout: REQUEST_TIMEOUT5,
        ...details,
        onload: resolve,
        onerror: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25")),
        ontimeout: () => reject(new Error("\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  async function requestText(url, request, options = {}) {
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
  function parseHtml(html, baseUrl, hostDocument = globalThis.document) {
    const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    const parsed = new Parser().parseFromString(String(html || ""), "text/html");
    const base = parsed.createElement("base");
    base.href = baseUrl;
    (parsed.head || parsed.documentElement).prepend(base);
    return parsed;
  }
  function codeTokenMatches(text, code) {
    const target = String(code || "").trim().toUpperCase();
    if (!target) return false;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`, "i").test(normalizeText4(text).toUpperCase());
  }
  function findAvWikiResultUrl(document2, code) {
    if (!document2 || !code) return "";
    const exactPath = `/${String(code).toLowerCase()}/`;
    const anchors = [...document2.querySelectorAll("a[href]")];
    for (const anchor of anchors) {
      const url = absoluteHttpUrl4(anchor.getAttribute("href"), AV_WIKI_ORIGIN);
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (parsed.origin === AV_WIKI_ORIGIN && parsed.pathname.toLowerCase() === exactPath) return parsed.href;
      } catch {
      }
    }
    for (const anchor of anchors) {
      const article = anchor.closest("article");
      if (!codeTokenMatches(article?.textContent || anchor.textContent, code)) continue;
      const url = absoluteHttpUrl4(anchor.getAttribute("href"), AV_WIKI_ORIGIN);
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
    return normalizeText4(value).replace(/^(?:MGS|FANZA)\s*品番\s*[:：]?\s*/i, "").split(/\s+/, 1)[0].replace(/[，,;；]+$/u, "").trim();
  }
  function labeledValue(document2, labelPattern) {
    if (!document2) return "";
    for (const row of document2.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      if (cells.length < 2) continue;
      if (labelPattern.test(normalizeText4(cells[0].textContent))) {
        return cleanProviderId(cells[1].textContent);
      }
    }
    for (const term of document2.querySelectorAll("dt")) {
      if (!labelPattern.test(normalizeText4(term.textContent))) continue;
      return cleanProviderId(term.nextElementSibling?.textContent || "");
    }
    const lines = String(document2.body?.innerText || document2.body?.textContent || "").replace(/\r/g, "").split("\n").map((line) => normalizeText4(line)).filter(Boolean);
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
    const search = await requestText(searchUrl, request, { referer: `${AV_WIKI_ORIGIN}/` });
    const searchDocument = parseHtml(search.html, search.finalUrl || searchUrl, hostDocument);
    const detailUrl = findAvWikiResultUrl(searchDocument, normalizedCode) || `${AV_WIKI_ORIGIN}/${normalizedCode.toLowerCase()}/`;
    const detail = await requestText(detailUrl, request, { referer: searchUrl });
    const detailDocument = parseHtml(detail.html, detail.finalUrl || detailUrl, hostDocument);
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
    return [...document2.querySelectorAll("a.sample_image[href], .sample_image[href]")].map((element) => absoluteHttpUrl4(element.getAttribute("href"), baseUrl)).filter((url) => url && !seen.has(url) && seen.add(url));
  }
  async function fetchMgsPreviewImages(mgsId, request = globalThis.GM_xmlhttpRequest, hostDocument = globalThis.document) {
    const id = String(mgsId || "").trim();
    if (!id) return { productUrl: "", imageUrls: [] };
    const productUrl = `${MGS_ORIGIN}/product/product_detail/${encodeURIComponent(id)}/`;
    const response = await requestText(productUrl, request, {
      referer: `${MGS_ORIGIN}/`,
      cookie: "adc=1; coc=1",
      headers: { "Accept-Language": "ja-JP" }
    });
    const document2 = parseHtml(response.html, response.finalUrl || productUrl, hostDocument);
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
  function isAgaghhhHost(locationObject) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "agaghhh.cc" || hostname.endsWith(".agaghhh.cc");
  }
  function injectOfficialPreviewFallbackSetting(document2 = globalThis.document) {
    const overlay = document2?.getElementById("x1080x-ex-settings-panel");
    const form = overlay?.querySelector("form");
    const master = form?.querySelector('[data-setting="hdblog-preview"]');
    if (!form || !master) return false;
    const masterLabel = master.closest("label");
    const strong = masterLabel?.querySelector("strong");
    const small = masterLabel?.querySelector("small");
    if (strong) strong.textContent = "\u663E\u793A\u5927\u9884\u89C8\u56FE";
    if (small) small.textContent = "\u4F18\u5148\u6309\u756A\u53F7\u641C\u7D22 hdblog\uFF1Bhdblog \u6CA1\u6709\u5339\u914D\u5927\u56FE\u65F6\uFF0C\u53EF\u7EE7\u7EED\u4F7F\u7528\u5B98\u65B9\u540E\u5907\u6E90\u3002";
    let input = form.querySelector('[data-setting="official-preview-fallback"]');
    if (!input) {
      const label = document2.createElement("label");
      label.style.cssText = "display:flex;align-items:flex-start;gap:9px;margin:-3px 0 13px 24px";
      label.innerHTML = `
      <input data-setting="official-preview-fallback" type="checkbox" style="margin-top:3px">
      <span><strong>\u5B98\u65B9\u540E\u5907\u9884\u89C8\u56FE\uFF08FANZA / MGStage\uFF09</strong><small style="display:block;margin-top:2px;color:#666">\u4EC5\u5728 hdblog \u6CA1\u627E\u5230 Preview \u65F6\u542F\u7528\uFF0C\u987A\u5E8F\u4E3A FANZA \u5B98\u65B9\u56FE\u7247 CDN \u2192 MGStage \u5B98\u65B9\u5546\u54C1\u9875\u3002</small></span>`;
      masterLabel?.after(label);
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
  var REQUEST_TIMEOUT6 = 3e4;
  var CONTAINER_ID = "x1080x-ex-agaghhh-hdblog-preview";
  var PREVIEW_IMAGE_ATTR = "data-x1080x-hdblog-preview-url";
  var IMAGE_EXTENSION_PATTERN3 = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
  var PREVIEW_BOUNDARY_PATTERN4 = /^(?:btfile|katfile|freedl|rapidgator|downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
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
  function requestText2(url, gmRequest2, referer = "") {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest2 !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest2({
        method: "GET",
        url,
        responseType: "text",
        timeout: REQUEST_TIMEOUT6,
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
  function parseHtml2(html, baseUrl, hostDocument = globalThis.document) {
    const Parser = hostDocument?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    const parsed = new Parser().parseFromString(String(html || ""), "text/html");
    const base = parsed.createElement("base");
    base.href = baseUrl;
    (parsed.head || parsed.documentElement).prepend(base);
    return parsed;
  }
  function getHdblogBlockedKeywords() {
    const stored = typeof GM_getValue === "function" ? GM_getValue(HDBLOG_BLOCKED_KEYWORDS_KEY2, null) : null;
    return parseBlockedKeywords(
      stored === null || stored === void 0 ? DEFAULT_HDBLOG_BLOCKED_KEYWORDS2 : stored
    );
  }
  function codeTokenMatches2(title, code) {
    const normalized = normalizeText5(title).toUpperCase();
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
    const exactTitle = remaining.filter((candidate) => codeTokenMatches2(candidate.title, code));
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
    const parsed = parseHtml2(html, baseUrl, hostDocument);
    const meta = parsed?.querySelector("meta[http-equiv]");
    if (meta && /^refresh$/i.test(meta.getAttribute("http-equiv") || "")) {
      const content = meta.getAttribute("content") || "";
      const match = content.match(/(?:^|;)\s*url\s*=\s*["']?([^"']+)\s*$/i);
      const target = absoluteHttpUrl5(match?.[1], baseUrl);
      if (target) return target;
    }
    const scriptMatch = String(html).match(
      /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i
    );
    return absoluteHttpUrl5(scriptMatch?.[1], baseUrl);
  }
  async function resolveHdblogReferTarget(document2, referUrl, articleUrl, gmRequest2) {
    try {
      const response = await requestText2(referUrl, gmRequest2, articleUrl);
      const finalUrl = absoluteHttpUrl5(response.finalUrl, referUrl);
      if (finalUrl && finalUrl !== referUrl && !isHdblogReferUrl(finalUrl, referUrl)) {
        return finalUrl;
      }
      const location2 = absoluteHttpUrl5(responseHeader(response.responseHeaders, "location"), referUrl);
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
      const url = absoluteHttpUrl5(candidate, document2.baseURI);
      if (url) return url;
    }
    return "";
  }
  function wordpressOriginalUrl2(value) {
    const href = absoluteHttpUrl5(value, HDBLOG_ORIGIN);
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
      const url = absoluteHttpUrl5(rawUrl, document2.baseURI);
      return url ? { url, score } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score)[0]?.url || "";
  }
  function bestImageUrl(document2, image) {
    if (!image) return "";
    const anchorHref = absoluteHttpUrl5(image.closest("a[href]")?.getAttribute("href"), document2.baseURI);
    const candidates = [
      anchorHref && IMAGE_EXTENSION_PATTERN3.test(anchorHref) ? anchorHref : "",
      image.getAttribute("data-orig-file"),
      image.getAttribute("data-original"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-src"),
      image.currentSrc,
      image.getAttribute("src")
    ];
    for (const candidate of candidates) {
      const url = absoluteHttpUrl5(candidate, document2.baseURI);
      if (!url) continue;
      return wordpressOriginalUrl2(url) || url;
    }
    const srcset = largestSrcsetUrl4(
      document2,
      image.getAttribute("data-srcset") || image.getAttribute("data-lazy-srcset") || image.getAttribute("srcset")
    );
    return wordpressOriginalUrl2(srcset) || srcset;
  }
  async function resolvePixhostTarget(document2, showUrl, thumbnailUrl2, articleUrl, gmRequest2) {
    const fallback = derivePixhostImageUrlFromThumbnail(thumbnailUrl2, document2.baseURI || showUrl);
    try {
      const response = await requestText2(showUrl, gmRequest2, articleUrl);
      return parsePixhostImagePage(document2, response.html, response.finalUrl || showUrl) || fallback;
    } catch {
      return fallback;
    }
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
  function previewRange4(document2) {
    const article = document2.querySelector(
      "main#genesis-content article.entry, main#genesis-content article, article.entry, article.post, article"
    );
    const content = article?.querySelector(".entry-content, .post-content, .post-entry, .entry-body") || article || document2.querySelector("main#genesis-content, main, #content") || document2.body;
    if (!content) return null;
    const nodes = textNodesUnder4(content);
    const marker = nodes.find((node) => /^preview\s*[:：]?$/i.test(normalizeText5(node.nodeValue)));
    if (!marker) return null;
    const boundary = nodes.find((node) => isAfter4(marker, node) && PREVIEW_BOUNDARY_PATTERN4.test(normalizeText5(node.nodeValue))) || null;
    return { content, marker, boundary };
  }
  function inPreviewRange4(range, node) {
    if (!range || !isAfter4(range.marker, node)) return false;
    return !range.boundary || !isAfter4(range.boundary, node);
  }
  async function collectHdblogPreviewImageUrls(document2, articleUrl, gmRequest2) {
    const range = previewRange4(document2);
    if (!range) return [];
    const urls = [];
    const seen = /* @__PURE__ */ new Set();
    const handledImages = /* @__PURE__ */ new Set();
    const add = (value) => {
      const url = absoluteHttpUrl5(value, articleUrl);
      if (!url || seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    };
    for (const anchor of [...range.content.querySelectorAll("a[href]")].filter((node) => inPreviewRange4(range, node))) {
      let target = absoluteHttpUrl5(anchor.getAttribute("href"), document2.baseURI);
      const image = anchor.querySelector("img");
      const thumbnail = previewThumbnailUrl2(document2, image);
      if (isHdblogReferUrl(target, document2.baseURI)) {
        target = await resolveHdblogReferTarget(document2, target, articleUrl, gmRequest2);
      }
      if (target && isPixhostShowUrl(target, document2.baseURI)) {
        target = await resolvePixhostTarget(document2, target, thumbnail, articleUrl, gmRequest2);
      }
      if (target && (IMAGE_EXTENSION_PATTERN3.test(target) || /^https?:\/\/img\d+\./i.test(target))) {
        add(wordpressOriginalUrl2(target) || target);
        if (image) handledImages.add(image);
        continue;
      }
      if (image) {
        const best = bestImageUrl(document2, image);
        if (best) {
          add(best);
          handledImages.add(image);
        }
      }
    }
    for (const image of [...range.content.querySelectorAll("img")].filter((node) => inPreviewRange4(range, node) && !handledImages.has(node))) {
      add(bestImageUrl(document2, image));
    }
    return urls;
  }
  async function fetchHdblogPreviewForCode(code, gmRequest2 = globalThis.GM_xmlhttpRequest, hostDocument = globalThis.document) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return { code: "", articleUrl: "", imageUrls: [], blocked: [], remaining: [] };
    const searchUrl = `${HDBLOG_ORIGIN}/?s=${encodeURIComponent(normalizedCode)}`;
    const searchResponse = await requestText2(searchUrl, gmRequest2, `${HDBLOG_ORIGIN}/`);
    const searchDocument = parseHtml2(searchResponse.html, searchResponse.finalUrl || searchUrl, hostDocument);
    if (!searchDocument) return { code: normalizedCode, articleUrl: "", imageUrls: [], blocked: [], remaining: [] };
    const candidates = collectHdblogSearchResults(searchDocument);
    const selection = chooseHdblogSearchResult(candidates, normalizedCode, getHdblogBlockedKeywords());
    if (!selection.selected) {
      return { code: normalizedCode, articleUrl: "", imageUrls: [], ...selection };
    }
    const articleUrl = selection.selected.url;
    const articleResponse = await requestText2(articleUrl, gmRequest2, searchUrl);
    const articleDocument = parseHtml2(articleResponse.html, articleResponse.finalUrl || articleUrl, hostDocument);
    const imageUrls = articleDocument ? await collectHdblogPreviewImageUrls(articleDocument, articleUrl, gmRequest2) : [];
    return { code: normalizedCode, articleUrl, imageUrls, ...selection };
  }
  function threadCode(document2) {
    const rawTitle = document2.querySelector("#thread_subject")?.textContent || document2.querySelector("h1.ts, .vwthd h1, h1")?.textContent || document2.title;
    return parseThreadTitle(rawTitle).code;
  }
  function firstPostContent(document2) {
    const firstPost = [...document2.querySelectorAll('#postlist [id^="post_"]')].find((element) => /^post_\d+$/i.test(element.id)) || document2.querySelector("#postlist > div, #postlist");
    return firstPost?.querySelector('[id^="postmessage_"], .t_f') || firstPost || null;
  }
  function isThreadPage2(locationObject) {
    try {
      const url = new URL(locationObject?.href || "");
      return url.searchParams.get("mod") === "viewthread" && url.searchParams.has("tid");
    } catch {
      return false;
    }
  }
  function renderAgaghhhHdblogPreview(document2, result) {
    if (!document2 || !result?.imageUrls?.length || document2.getElementById(CONTAINER_ID)) return null;
    const content = firstPostContent(document2);
    if (!content) return null;
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
    result.imageUrls.forEach((url, index) => {
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
      result = await fetchHdblogPreviewForCode(code, gmRequest2, document2);
    } catch (error) {
      console.warn("[x1080x-ex] hdblog preview lookup failed", {
        code,
        error: error?.message || String(error)
      });
    }
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
    return renderAgaghhhHdblogPreview(document2, result);
  }

  // src/agaghhh-enhancement.js
  var AGAGHHH_BATCH_OPEN_ENABLED_KEY = "x1080x-ex:agaghhh-batch-open-enabled";
  var AGAGHHH_DOWNLOAD_ENABLED_KEY = "x1080x-ex:agaghhh-download-enabled";
  var AGAGHHH_REAL_ACTRESS_ENABLED_KEY = "x1080x-ex:agaghhh-real-actress-enabled";
  var AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY = "x1080x-ex:agaghhh-hdblog-preview-enabled";
  var LEGACY_AGAGHHH_ENHANCEMENT_ENABLED_KEY = "x1080x-ex:agaghhh-enhancement-enabled";
  var SETTINGS_PANEL_ID = "x1080x-ex-settings-panel";
  var DOWNLOAD_BUTTON_ID2 = "x1080x-ex-download";
  var BATCH_BUTTON_ID2 = "x1080x-ex-open-page";
  var BATCH_TOOLBAR_ID2 = "x1080x-ex-open-page-toolbar";
  var AV_WIKI_ORIGIN2 = "https://av-wiki.net";
  var AV_WIKI_TIMEOUT = 2e4;
  var REAL_ACTRESS_BOUND_ATTR = "data-x1080x-real-actress-bound";
  var REAL_ACTRESS_BYPASS_ATTR = "data-x1080x-real-actress-bypass";
  function normalizeText6(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isAgaghhhHost2(locationObject = globalThis.location) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "agaghhh.cc" || hostname.endsWith(".agaghhh.cc");
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
    return readBooleanSetting(AGAGHHH_BATCH_OPEN_ENABLED_KEY);
  }
  function isAgaghhhDownloadEnabled() {
    return readBooleanSetting(AGAGHHH_DOWNLOAD_ENABLED_KEY);
  }
  function isAgaghhhRealActressEnabled() {
    return readBooleanSetting(AGAGHHH_REAL_ACTRESS_ENABLED_KEY);
  }
  function isAgaghhhHdblogPreviewEnabled() {
    return readBooleanSetting(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY);
  }
  function firstPostContent2(document2) {
    const firstPost = [...document2.querySelectorAll('#postlist [id^="post_"]')].find((element) => /^post_\d+$/i.test(element.id)) || document2.querySelector("#postlist > div, #postlist");
    return firstPost?.querySelector('[id^="postmessage_"], .t_f') || firstPost || null;
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
      const inlineValue = normalizeText6(match[1]);
      if (inlineValue) return { found: true, value: inlineValue };
      const nextLine = normalizeText6(lines[index + 1] || "");
      if (nextLine && !/^[^:：]{1,12}\s*[:：]/u.test(nextLine)) {
        return { found: true, value: nextLine };
      }
      return { found: true, value: "" };
    }
    const flattened = normalizeText6(raw);
    const inline = flattened.match(/(?:^|\s)(?:出演者|演员|演員)\s*[:：]\s*([^:：]{1,80}?)(?=\s+[\p{L}\p{N}_-]{1,16}\s*[:：]|$)/iu);
    if (inline) return { found: true, value: normalizeText6(inline[1]) };
    return { found: false, value: "" };
  }
  function nodeActressText(node) {
    if (!node) return "";
    const anchors = [...node.querySelectorAll?.("a") || []].map((anchor) => normalizeText6(anchor.textContent)).filter(Boolean).filter((text) => !/^(?:FANZA|ソクミル|DUGA|続きを読む)$/i.test(text));
    if (anchors.length) return [...new Set(anchors)].join(" ");
    return normalizeText6(node.textContent).replace(/^AV女優名\s*[:：]?\s*/i, "").replace(/\s+(?:メーカー品番|FANZA品番|SOKMIL品番|DUGA品番|配信開始日)\b.*$/i, "").trim();
  }
  function scopeForCode(document2, code) {
    const upperCode = String(code || "").toUpperCase();
    const articles = [...document2.querySelectorAll("article")];
    return articles.find((article) => normalizeText6(article.textContent).toUpperCase().includes(upperCode)) || document2.body || document2.documentElement;
  }
  function parseAvWikiActressesFromDocument(document2, code = "") {
    if (!document2) return "";
    const scope = scopeForCode(document2, code);
    if (!scope) return "";
    for (const row of scope.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      if (cells.length < 2) continue;
      if (/^AV女優名\s*[:：]?$/i.test(normalizeText6(cells[0].textContent))) {
        return nodeActressText(cells[1]);
      }
    }
    for (const term of scope.querySelectorAll("dt")) {
      if (!/^AV女優名\s*[:：]?$/i.test(normalizeText6(term.textContent))) continue;
      const value = term.nextElementSibling;
      const text2 = nodeActressText(value);
      if (text2) return text2;
    }
    const labels = [...scope.querySelectorAll("strong, b, span, div, p, li")].filter((element) => /^AV女優名\s*[:：]?$/i.test(normalizeText6(element.textContent)));
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
    const lines = text.split("\n").map((line) => normalizeText6(line)).filter(Boolean);
    const labelIndex = lines.findIndex((line) => /^AV女優名\s*[:：]?$/i.test(line));
    if (labelIndex >= 0) return normalizeText6(lines[labelIndex + 1] || "");
    const inline = lines.find((line) => /^AV女優名\s*[:：]/i.test(line));
    return inline ? normalizeText6(inline.replace(/^AV女優名\s*[:：]\s*/i, "")) : "";
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
      const text = normalizeText6(article?.textContent || anchor.textContent).toUpperCase();
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
  function parseHtml3(html, document2 = globalThis.document) {
    const Parser = document2?.defaultView?.DOMParser || globalThis.DOMParser;
    if (typeof Parser !== "function") return null;
    return new Parser().parseFromString(String(html || ""), "text/html");
  }
  async function fetchRealActressFromAvWiki(code, gmRequest2 = globalThis.GM_xmlhttpRequest, document2 = globalThis.document) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return "";
    const searchUrl = `${AV_WIKI_ORIGIN2}/?s=${encodeURIComponent(normalizedCode)}`;
    const searchDocument = parseHtml3(await requestHtml(searchUrl, gmRequest2), document2);
    if (!searchDocument) return "";
    const fromSearch = parseAvWikiActressesFromDocument(searchDocument, normalizedCode);
    if (fromSearch) return fromSearch;
    const detailUrl = findAvWikiResultUrl2(searchDocument, normalizedCode) || `${AV_WIKI_ORIGIN2}/${normalizedCode.toLowerCase()}/`;
    const detailDocument = parseHtml3(await requestHtml(detailUrl, gmRequest2), document2);
    return parseAvWikiActressesFromDocument(detailDocument, normalizedCode);
  }
  function appendActressToTitleText(titleText, actress) {
    const cleanTitle = normalizeText6(titleText);
    const cleanActress = normalizeText6(actress);
    if (!cleanActress || cleanTitle.includes(cleanActress)) return cleanTitle;
    return `${cleanTitle} ${cleanActress}`;
  }
  function threadTitleElement(document2) {
    return document2.querySelector("#thread_subject") || document2.querySelector("h1.ts, .vwthd h1, h1");
  }
  function threadCode2(document2) {
    return parseThreadTitle(threadTitleElement(document2)?.textContent || document2.title).code;
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
    const overlay = document2.createElement("div");
    overlay.id = SETTINGS_PANEL_ID;
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
      <div style="font-weight:700;margin-bottom:11px">agaghhh.cc \u589E\u5F3A\u529F\u80FD</div>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="batch-open" type="checkbox" style="margin-top:3px">
        <span><strong>\u6279\u91CF\u6253\u5F00\u5E16\u5B50\u529F\u80FD</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u5217\u8868\u9875\u663E\u793A\u201C\u540E\u53F0\u987A\u5E8F\u6253\u5F00\u672C\u9875\u4E3B\u9898\u201D\u6309\u94AE\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="download" type="checkbox" style="margin-top:3px">
        <span><strong>\u4E0B\u8F7D\u589E\u5F3A</strong><small style="display:block;margin-top:2px;color:#666">\u5728\u5E16\u5B50\u9875\u663E\u793A\u4E0B\u8F7D\u6309\u94AE\uFF0C\u5E76\u4F7F\u7528\u73B0\u6709\u9644\u4EF6\u3001\u56FE\u7247\u3001\u79CD\u5B50\u4E0B\u8F7D\u4E0E\u81EA\u52A8\u547D\u540D\u903B\u8F91\u3002</small></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:13px">
        <input data-setting="hdblog-preview" type="checkbox" style="margin-top:3px">
        <span><strong>\u663E\u793A hdblog \u5927\u9884\u89C8\u56FE</strong><small style="display:block;margin-top:2px;color:#666">\u6309\u5E16\u5B50\u756A\u53F7\u641C\u7D22 hdblog\uFF0C\u6CBF\u7528 hdblog \u7684\u201C\u641C\u7D22\u7ED3\u679C\u5C4F\u853D\u5173\u952E\u8BCD\u201D\uFF0C\u5E76\u628A\u5339\u914D\u6587\u7AE0\u7684 Preview \u5927\u56FE\u663E\u793A\u5230\u4E3B\u697C\u3002</small></span>
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
    const batchInput = panel.querySelector('[data-setting="batch-open"]');
    const downloadInput = panel.querySelector('[data-setting="download"]');
    const previewInput = panel.querySelector('[data-setting="hdblog-preview"]');
    const actressInput = panel.querySelector('[data-setting="real-actress"]');
    batchInput.checked = isAgaghhhBatchOpenEnabled();
    downloadInput.checked = isAgaghhhDownloadEnabled();
    previewInput.checked = isAgaghhhHdblogPreviewEnabled();
    actressInput.checked = isAgaghhhRealActressEnabled();
    panel.querySelector('[data-action="cancel"]')?.addEventListener("click", () => closeX1080xSettingsPanel(document2));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeX1080xSettingsPanel(document2);
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      if (typeof GM_setValue === "function") {
        GM_setValue(AGAGHHH_BATCH_OPEN_ENABLED_KEY, batchInput.checked);
        GM_setValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, downloadInput.checked);
        GM_setValue(AGAGHHH_HDBLOG_PREVIEW_ENABLED_KEY, previewInput.checked);
        GM_setValue(AGAGHHH_REAL_ACTRESS_ENABLED_KEY, actressInput.checked);
      }
      closeX1080xSettingsPanel(document2);
      const view = document2.defaultView;
      if (view?.location?.reload) view.location.reload();
    });
    overlay.append(panel);
    document2.body.append(overlay);
    return overlay;
  }
  function installX1080xSettingsMenu(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isAgaghhhHost2(locationObject)) return;
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("\u2699\uFE0F x1080x \u8BBE\u7F6E", () => openX1080xSettingsPanel(document2));
  }
  function installAgaghhhEnhancement(document2 = globalThis.document, locationObject = globalThis.location, gmRequest2 = globalThis.GM_xmlhttpRequest) {
    if (!document2 || !isAgaghhhHost2(locationObject)) return;
    if (!isAgaghhhBatchOpenEnabled()) {
      document2.getElementById(BATCH_BUTTON_ID2)?.remove();
      document2.getElementById(BATCH_TOOLBAR_ID2)?.remove();
    }
    if (isAgaghhhHdblogPreviewEnabled()) {
      void installAgaghhhHdblogPreview(document2, locationObject, gmRequest2);
    }
    if (!isAgaghhhDownloadEnabled()) {
      document2.getElementById(DOWNLOAD_BUTTON_ID2)?.remove();
      return;
    }
    if (isAgaghhhRealActressEnabled()) bindRealActressDownload(document2, gmRequest2);
  }

  // src/index.js
  installX1080xSettingsMenu();
  installAgaghhhEnhancement();
  installHdblogImageHostSettings();
  installHdblogReferResolver();
  installHdblogArticleEnhancement();
  installHdblogPreviewImages();
  installHdblogSearchEnhancement();
})();
