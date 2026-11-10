import { saveDownloadBlob } from './blob-download.js';

// Native forum links are preserved as the user-triggered fallback. Fetching a
// signed attachment from page JavaScript can fail on CSP or cross-origin
// redirects ("Failed to fetch"); Tampermonkey requests avoid those page-level
// restrictions while still using the current browser session.
function requestSehuatangBlob(document, url) {
  const view = document.defaultView;
  if (typeof GM_xmlhttpRequest === 'function') {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          timeout: 20000,
          anonymous: false,
          // Discuz may check the referring thread. Never transmit cookies or
          // authentication tokens manually.
          headers: { Referer: document.location.href },
          onload: (result) => {
            if (result.status < 200 || result.status >= 300) {
              finish(reject, new Error('网站返回 HTTP ' + result.status));
              return;
            }
            const match = /^content-type:\s*([^\r\n]+)/im.exec(result.responseHeaders || '');
            finish(resolve, { blob: result.response, type: match?.[1] || '' });
          },
          onerror: (error) => finish(reject, new Error('脚本管理器请求附件失败：'
            + (error?.error || error?.message || '网络或网站限制'))),
          ontimeout: () => finish(reject, new Error('读取附件超时')),
          onabort: () => finish(reject, new Error('附件请求已取消')),
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }
  // Fallback for script managers without the GM API; it may be subject to
  // the page's CORS and Content Security Policy.
  if (typeof view?.fetch !== 'function') {
    throw new Error('当前脚本管理器不支持附件读取');
  }
  return view.fetch(url, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
  }).then(async response => {
    if (!response.ok) throw new Error('网站返回 HTTP ' + response.status);
    return { blob: await response.blob(), type: response.headers?.get?.('content-type') || '' };
  });
}

// Using a Blob object URL detaches the browser's download filename from the
// server Content-Disposition. There is no directory picker or local rename.
export async function downloadSehuatangNamedTxtBlob(document, link, filename) {
  const view = document?.defaultView;
  const url = new URL(link?.getAttribute('href') || '', document?.baseURI);
  if (url.origin !== document?.location?.origin || !/\.txt$/i.test(filename)) {
    throw new Error('附件来源或目标文件名无效');
  }
  const { blob, type } = await requestSehuatangBlob(document, url.href);
  if (/(?:text\/html|application\/(?:json|xml|xhtml\+xml))/i.test(type)) {
    throw new Error('网站返回了网页或验证提示，而非附件');
  }
  if (!blob || typeof blob.size !== 'number' || typeof blob.slice !== 'function'
    || blob.size === 0) {
    throw new Error('未获取到有效的附件内容');
  }
  // Discuz sometimes returns an HTML login/permission page with the generic
  // binary content type. Never save that under a misleading .txt extension.
  const slice = blob.slice(0, 1024);
  let prefix;
  if (typeof slice.text === 'function') prefix = await slice.text();
  else if (typeof view?.FileReader === 'function') {
    prefix = await new Promise((resolve, reject) => {
      const reader = new view.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('无法读取附件内容'));
      reader.readAsText(slice);
    });
  } else throw new Error('无法校验附件内容');
  if (/^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<form\b)/i.test(prefix)) {
    throw new Error('网站返回了登录或权限页面，而非 TXT 附件');
  }
  return saveDownloadBlob(blob, filename, document, { browserDownload: true });
}
