// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.1.2
// @description  一键下载 x1080x/Discuz 主楼附件与大图，支持 Discuz X1.5、FC2 多图及自动重命名
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
  var REQUEST_TIMEOUT = 6e4;
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
