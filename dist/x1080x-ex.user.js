// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.6.4
// @description  一键下载主楼资源，并增强 hdblog Preview 大图显示及主题批量后台打开
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
      imageUrl: largestImage?.url || "",
      imageCacheUrl: largestImage?.cacheUrl || "",
      imageFilename: title.code ? `${sanitizeFilename(title.code)}.jpg` : "thread-image.jpg"
    };
  }
  function buildDownloadJobs(document2) {
    const resources = extractThreadResources(document2);
    const jobs = resources.magnets.map((magnet) => ({
      kind: "torrent",
      url: magnet,
      name: `${sanitizeFilename(resources.title.cleanTitle || resources.title.code || "download")}.torrent`
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
      return jobs;
    }
    if (resources.imageUrl) {
      const preferredUrl = resources.imageCacheUrl || resources.imageUrl;
      jobs.push({
        kind: "image",
        url: preferredUrl,
        name: resources.imageFilename
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
  function requestTorrentUrl(url, gmRequest) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest({
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
  async function requestTorrentBytes(magnet, gmRequest = globalThis.GM_xmlhttpRequest) {
    const hash = extractBtih(magnet);
    if (!hash) throw new Error("\u78C1\u529B\u94FE\u4E2D\u6CA1\u6709\u6709\u6548\u7684 BTIH");
    const errors = [];
    for (const buildUrl of TORRENT_SOURCES) {
      const url = buildUrl(hash);
      try {
        const bytes = await requestTorrentUrl(url, gmRequest);
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
  var DEFAULT_DOMAINS = "agaghhh.cc\nhdblog.me";
  var BUTTON_ID = "x1080x-ex-download";
  var BATCH_BUTTON_ID = "x1080x-ex-open-page";
  var BATCH_TOOLBAR_ID = "x1080x-ex-open-page-toolbar";
  var REQUEST_TIMEOUT = 6e4;
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
  function requestBlobWithGmXhr(job) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: job.url,
        responseType: "blob",
        timeout: REQUEST_TIMEOUT,
        headers: { Referer: location.href },
        onload: (response) => {
          validateResponse(response).then(resolve, reject);
        },
        onerror: (error) => {
          const details = safeErrorDetails(error);
          console.error("[x1080x-ex] GM_xmlhttpRequest failed", details);
          reject(new Error(
            `\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1Aerror=${details.error || "unknown_error"}\uFF1Bdetails=${details.details || details.message || "\u65E0\u8BE6\u7EC6\u4FE1\u606F"}`
          ));
        },
        ontimeout: () => reject(new Error(`\u7F51\u7EDC\u8BF7\u6C42\u8D85\u65F6\uFF08${REQUEST_TIMEOUT / 1e3} \u79D2\uFF09`))
      });
    });
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
    expandHdblogPreviewImages();
    if (isThreadPage()) addDownloadButton();
    if (isBatchOpenPage()) addBatchOpenButton();
  }

  // src/pixhost.js
  var PIXHOST_PAGE_HOST_PATTERN = /^(?:www\.)?(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i;
  var PIXHOST_THUMB_HOST_PATTERN = /^t(\d+)\.(pixhost\.(?:to|cc)|pixho\.st)$/i;
  var IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)$/i;
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
  function isPixhostShowUrl(value, baseUrl = "https://pixhost.to/") {
    const href = absoluteUrl2(value, baseUrl);
    if (!href) return false;
    try {
      const url = new URL(href);
      return PIXHOST_PAGE_HOST_PATTERN.test(url.hostname) && /^\/show\/\d+\/\d+_[^/?#]+$/i.test(url.pathname);
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
    try {
      const url = new URL(href);
      return IMAGE_EXTENSION_PATTERN.test(url.pathname) ? href : "";
    } catch {
      return "";
    }
  }
  function parsePixhostImagePage(document2, html, pageUrl) {
    if (!document2 || !html) return "";
    const parsed = document2.implementation.createHTMLDocument("pixhost");
    parsed.documentElement.innerHTML = String(html);
    const selectors = [
      ["img.image-img[src]", "src"],
      ["img.image-img[data-src]", "data-src"],
      ['meta[property="og:image"]', "content"],
      ['meta[name="twitter:image"]', "content"],
      ['link[rel="image_src"]', "href"],
      ["main img[src]", "src"]
    ];
    for (const [selector, attribute] of selectors) {
      const value = parsed.querySelector(selector)?.getAttribute(attribute);
      const url = candidateUrl(value, pageUrl);
      if (url) return url;
    }
    const raw = String(html).match(/<img\b(?=[^>]*\bclass=["'][^"']*\bimage-img\b[^"']*["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
    return candidateUrl(raw, pageUrl);
  }
  function requestPixhostPage(showUrl, gmRequest, referer) {
    return new Promise((resolve, reject) => {
      if (typeof gmRequest !== "function") {
        reject(new Error("\u5F53\u524D userscript \u7BA1\u7406\u5668\u4E0D\u652F\u6301 GM_xmlhttpRequest"));
        return;
      }
      gmRequest({
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
            reject(new Error(`Pixhost \u9875\u9762\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status || 0}\uFF09`));
            return;
          }
          resolve(String(response.responseText ?? response.response ?? ""));
        },
        onerror: () => reject(new Error("Pixhost \u9875\u9762\u8BF7\u6C42\u53D1\u751F\u7F51\u7EDC\u9519\u8BEF")),
        ontimeout: () => reject(new Error("Pixhost \u9875\u9762\u8BF7\u6C42\u8D85\u65F6"))
      });
    });
  }
  function resolvePixhostShowUrl(document2, showUrl, thumbnailUrl = "", gmRequest = globalThis.GM_xmlhttpRequest) {
    const absoluteShowUrl = absoluteUrl2(showUrl, document2?.baseURI || "https://pixhost.to/");
    if (!absoluteShowUrl || !isPixhostShowUrl(absoluteShowUrl, document2?.baseURI)) {
      return Promise.resolve("");
    }
    if (resolutionCache.has(absoluteShowUrl)) return resolutionCache.get(absoluteShowUrl);
    const fallback = derivePixhostImageUrlFromThumbnail(thumbnailUrl, document2?.baseURI || absoluteShowUrl);
    const promise = requestPixhostPage(absoluteShowUrl, gmRequest, document2?.location?.href).then((html) => parsePixhostImagePage(document2, html, absoluteShowUrl) || fallback).catch(() => fallback);
    resolutionCache.set(absoluteShowUrl, promise);
    return promise;
  }

  // src/hdblog-preview.js
  var IMAGE_EXTENSION_PATTERN2 = /\.(?:jpe?g|png|webp|gif|avif)$/i;
  var PREVIEW_BOUNDARY_PATTERN = /^(?:downloads?(?:\s+links?)?|links?|magnets?(?:\s+links?)?|torrents?(?:\s+links?)?|password|information|filed\s+under|tagged\s+with|leave\s+a\s+reply|comments?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\b/i;
  var PREVIEW_VIEWPORT_GUTTER_PX = 12;
  var PREVIEW_VIEWPORT_WIDTH = `calc(100vw - ${PREVIEW_VIEWPORT_GUTTER_PX * 2}px)`;
  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }
  function isHdblogHost(locationObject) {
    const hostname = String(locationObject?.hostname ?? "").toLowerCase().replace(/\.$/, "");
    return hostname === "hdblog.me" || hostname.endsWith(".hdblog.me");
  }
  function absoluteHttpUrl(document2, value) {
    if (!value || /^(?:data:|blob:|javascript:)/i.test(value)) return "";
    try {
      const url = new URL(value, document2.baseURI);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function pixhostShowHref(document2, anchor) {
    const href = absoluteHttpUrl(document2, anchor?.getAttribute("href"));
    return href && isPixhostShowUrl(href, document2.baseURI) ? href : "";
  }
  function directImageHref2(document2, anchor) {
    const href = absoluteHttpUrl(document2, anchor?.getAttribute("href"));
    if (!href || isPixhostShowUrl(href, document2.baseURI)) return "";
    try {
      return IMAGE_EXTENSION_PATTERN2.test(new URL(href).pathname) ? href : "";
    } catch {
      return "";
    }
  }
  function wordpressOriginalUrl(document2, value) {
    const href = absoluteHttpUrl(document2, value);
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
  function previewThumbnailUrl(document2, image) {
    const candidates = [
      image?.currentSrc,
      image?.getAttribute("src"),
      image?.getAttribute("data-original"),
      image?.getAttribute("data-lazy-src"),
      image?.getAttribute("data-src")
    ];
    for (const candidate of candidates) {
      const url = absoluteHttpUrl(document2, candidate);
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
      const direct = absoluteHttpUrl(document2, candidate);
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
      const url = largestSrcsetUrl2(document2, value);
      if (url) return wordpressOriginalUrl(document2, url) || url;
    }
    for (const candidate of rawCandidates) {
      const url = absoluteHttpUrl(document2, candidate);
      if (url) return url;
    }
    return "";
  }
  function textNodesUnder(root) {
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
    return textNodesUnder(root).find((node) => /^preview\s*[:：]?$/i.test(normalizeText(node.nodeValue))) || null;
  }
  function isAfter(reference, node) {
    return Boolean(reference.compareDocumentPosition(node) & 4);
  }
  function findBoundary(root, marker) {
    return textNodesUnder(root).find((node) => {
      if (!isAfter(marker, node)) return false;
      const text = normalizeText(node.nodeValue);
      return text && PREVIEW_BOUNDARY_PATTERN.test(text);
    }) || null;
  }
  function inPreviewRange(marker, boundary, node) {
    if (!isAfter(marker, node)) return false;
    return !boundary || !isAfter(boundary, node);
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
  function previewRange(document2, locationObject) {
    if (!document2 || !isHdblogHost(locationObject)) return null;
    const content = findArticleContent(document2);
    if (!content) return null;
    const marker = findPreviewMarker(content);
    if (!marker) return null;
    return { content, marker, boundary: findBoundary(content, marker) };
  }
  function expandHdblogPreviewImages2(document2, locationObject = document2?.location) {
    const range = previewRange(document2, locationObject);
    if (!range) return 0;
    const { content, marker, boundary } = range;
    let expanded = 0;
    const handled = /* @__PURE__ */ new Set();
    [...content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange(marker, boundary, anchor)).forEach((anchor) => {
      if (pixhostShowHref(document2, anchor)) return;
      const fullUrl = directImageHref2(document2, anchor);
      if (!fullUrl) return;
      let image = anchor.querySelector("img");
      if (!image) {
        image = document2.createElement("img");
        image.alt = normalizeText(anchor.textContent) || "Preview";
        anchor.replaceChildren(image);
      }
      if (styleExpandedImage(image, wordpressOriginalUrl(document2, fullUrl) || fullUrl)) {
        handled.add(image);
        expanded += 1;
      }
    });
    [...content.querySelectorAll("img")].filter((image) => inPreviewRange(marker, boundary, image) && !handled.has(image)).forEach((image) => {
      if (styleExpandedImage(image, bestPreviewImageUrl(document2, image))) expanded += 1;
    });
    return expanded;
  }
  async function expandHdblogPixhostPreviewImages(document2, locationObject = document2?.location, gmRequest = globalThis.GM_xmlhttpRequest) {
    const range = previewRange(document2, locationObject);
    if (!range) return 0;
    const { content, marker, boundary } = range;
    const anchors = [...content.querySelectorAll("a[href]")].filter((anchor) => inPreviewRange(marker, boundary, anchor)).map((anchor) => ({ anchor, showUrl: pixhostShowHref(document2, anchor) })).filter(({ showUrl }) => showUrl);
    const results = await Promise.all(anchors.map(async ({ anchor, showUrl }) => {
      let image = anchor.querySelector("img");
      const thumbnailUrl = previewThumbnailUrl(document2, image);
      const fullUrl = await resolvePixhostShowUrl(document2, showUrl, thumbnailUrl, gmRequest);
      if (!fullUrl) return false;
      if (!image) {
        image = document2.createElement("img");
        image.alt = normalizeText(anchor.textContent) || "Preview";
        anchor.replaceChildren(image);
      }
      return styleExpandedImage(image, fullUrl);
    }));
    return results.filter(Boolean).length;
  }
  function installHdblogPreviewImages(document2 = globalThis.document, locationObject = globalThis.location) {
    if (!document2 || !isHdblogHost(locationObject)) return;
    const run = () => {
      expandHdblogPreviewImages2(document2, locationObject);
      void expandHdblogPixhostPreviewImages(document2, locationObject);
    };
    run();
    const view = document2.defaultView;
    if (!view) return;
    view.setTimeout(run, 400);
    view.setTimeout(run, 1400);
  }

  // src/index.js
  installHdblogPreviewImages();
})();
