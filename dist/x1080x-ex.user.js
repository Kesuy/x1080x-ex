// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.1.0
// @description  一键下载 x1080x/Discuz 主楼附件与大图，支持 FC2 多图及自动重命名
// @author       Kesuy
// @homepageURL  https://github.com/Kesuy/x1080x-ex
// @supportURL   https://github.com/Kesuy/x1080x-ex/issues
// @updateURL    https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @downloadURL  https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @match        *://*/*
// @connect      *
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
(() => {
  // src/core.js
  var CODE_PATTERN = /^([A-Z0-9]+-\d+)\s*/i;
  var SUBTITLE_TAG_PATTERN = /^\[(?:中文)?(?:外掛|外挂)字幕\]\s*/i;
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
  function triggerBrowserImageDownload(document2, url, filename) {
    const link = document2.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    (document2.body || document2.documentElement).append(link);
    link.click();
    link.remove();
  }
  function parseThreadTitle(rawTitle) {
    const normalized = String(rawTitle ?? "").replace(/\s+/g, " ").trim();
    let fc2Remainder = normalized;
    let fc2Number = "";
    while (/^\(([^)]*)\)\s*/u.test(fc2Remainder)) {
      const groupMatch = fc2Remainder.match(/^\(([^)]*)\)\s*/u);
      const numberMatch = groupMatch[1].match(/^fc(\d+)$/i);
      if (numberMatch) fc2Number = numberMatch[1];
      fc2Remainder = fc2Remainder.slice(groupMatch[0].length);
    }
    if (fc2Number) {
      const code2 = `FC2-${fc2Number}`;
      return {
        code: code2,
        cleanTitle: `${code2}${fc2Remainder ? ` ${fc2Remainder.trim()}` : ""}`,
        hasExternalSubtitle: false
      };
    }
    const codeMatch = normalized.match(CODE_PATTERN);
    if (!codeMatch) {
      return { code: "", cleanTitle: normalized, hasExternalSubtitle: false };
    }
    const code = codeMatch[1].toUpperCase();
    let remainder = normalized.slice(codeMatch[0].length).trimStart();
    const hasExternalSubtitle = SUBTITLE_TAG_PATTERN.test(remainder);
    remainder = remainder.replace(SUBTITLE_TAG_PATTERN, "");
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
    const largestImage = images.reduce((largest, image) => {
      if (!largest) return image;
      return image.area > largest.area ? image : largest;
    }, null);
    return {
      title,
      attachments,
      images,
      imageUrl: largestImage?.url || "",
      imageCacheUrl: largestImage?.cacheUrl || "",
      imageFilename: title.code ? `${sanitizeFilename(title.code)}.jpg` : "thread-image.jpg"
    };
  }
  function buildDownloadJobs(document2) {
    const resources = extractThreadResources(document2);
    const jobs = resources.attachments.map((attachment) => ({
      kind: "attachment",
      url: attachment.url,
      name: buildAttachmentFilename(resources.title, attachment.sourceName)
    }));
    if (resources.title.code.startsWith("FC2-")) {
      const multipleImages = resources.images.length > 1;
      resources.images.forEach((image, index) => {
        const preferredUrl = image.cacheUrl || image.url;
        jobs.push({
          kind: "image",
          url: preferredUrl,
          name: `${sanitizeFilename(resources.title.code)}${multipleImages ? ` (${index + 1})` : ""}.jpg`
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

  // src/userscript.js
  var STORAGE_KEY = "x1080x-ex:domains";
  var DEFAULT_DOMAINS = "agaghhh.cc";
  var BUTTON_ID = "x1080x-ex-download";
  function getConfiguredDomains() {
    return parseDomainList(GM_getValue(STORAGE_KEY, DEFAULT_DOMAINS));
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
  function gmDownload(url, name) {
    return new Promise((resolve, reject) => {
      GM_download({
        url,
        name,
        saveAs: false,
        headers: { Referer: location.href },
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error("\u4E0B\u8F7D\u8D85\u65F6"))
      });
    });
  }
  async function download(job) {
    if (job.kind === "image") {
      triggerBrowserImageDownload(document, job.url, job.name);
      return;
    }
    await gmDownload(job.url, job.name);
  }
  async function downloadAll(button) {
    const jobs = buildDownloadJobs(document);
    if (!jobs.length) {
      window.alert("\u4E3B\u697C\u4E2D\u6CA1\u6709\u627E\u5230\u9644\u4EF6\u6216\u53EF\u4E0B\u8F7D\u56FE\u7247\u3002");
      return;
    }
    button.disabled = true;
    const failures = [];
    for (const [index, job] of jobs.entries()) {
      button.textContent = `\u4E0B\u8F7D\u4E2D ${index + 1}/${jobs.length}`;
      try {
        await download(job);
      } catch (error) {
        failures.push(`${job.name}\uFF1A${error?.error || error?.message || "\u672A\u77E5\u9519\u8BEF"}`);
      }
    }
    button.disabled = false;
    button.textContent = failures.length ? `\u5B8C\u6210\uFF08\u5931\u8D25 ${failures.length}\uFF09` : "\u2713 \u4E0B\u8F7D\u5B8C\u6210";
    window.setTimeout(() => {
      button.textContent = "\u2B07 \u4E0B\u8F7D\u9644\u4EF6\u548C\u4E3B\u697C\u56FE\u7247";
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
    button.textContent = "\u2B07 \u4E0B\u8F7D\u9644\u4EF6\u548C\u4E3B\u697C\u56FE\u7247";
    button.title = "\u4E0B\u8F7D\u4E3B\u697C\u9644\u4EF6\u548C\u6B63\u6587\u5927\u56FE\uFF1B\u666E\u901A\u5E16\u5B50\u53D6\u6700\u5927\u56FE\uFF0CFC2 \u5E16\u5B50\u53D6\u5168\u90E8\u5927\u56FE";
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
  registerSettingsMenu();
  if (isAllowedHost(location.hostname, getConfiguredDomains()) && isThreadPage()) {
    addDownloadButton();
  }
})();
