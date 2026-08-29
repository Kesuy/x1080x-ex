import {
  buildDownloadJobs,
  collectForumThreadLinks,
  isAllowedHost,
  parseDomainList,
} from './core.js';
import { requestTorrentBytes } from './torrent.js';

const STORAGE_KEY = 'x1080x-ex:domains';
const DEFAULT_DOMAINS = 'agaghhh.cc\nhdblog.me';
const BUTTON_ID = 'x1080x-ex-download';
const BATCH_BUTTON_ID = 'x1080x-ex-open-page';
const BATCH_TOOLBAR_ID = 'x1080x-ex-open-page-toolbar';
const REQUEST_TIMEOUT = 60000;
const DEFAULT_OPEN_TIMING = Object.freeze({
  initialMin: 300,
  initialMax: 800,
  delayMin: 1800,
  delayMax: 3500,
  pauseEvery: 8,
  pauseMin: 6000,
  pauseMax: 10000,
});
const HDBLOG_OPEN_TIMING = Object.freeze({
  initialMin: 150,
  initialMax: 400,
  delayMin: 800,
  delayMax: 1600,
  pauseEvery: 10,
  pauseMin: 3000,
  pauseMax: 5000,
});
let batchOpenState = null;

function getConfiguredDomains() {
  const stored = GM_getValue(STORAGE_KEY, null);
  if (stored === null || stored === undefined) return parseDomainList(DEFAULT_DOMAINS);
  const domains = parseDomainList(stored);
  const isLegacyDefault = domains.length === 1 && domains[0] === 'agaghhh.cc';
  return isLegacyDefault ? parseDomainList(DEFAULT_DOMAINS) : domains;
}

function saveDomains(domains) {
  GM_setValue(STORAGE_KEY, domains.join('\n'));
}

function registerSettingsMenu() {
  GM_registerMenuCommand('⚙️ 设置匹配域名', () => {
    const current = getConfiguredDomains().join('\n');
    const input = window.prompt(
      '请输入允许脚本运行的域名，可用逗号、空格或换行分隔。也可以粘贴完整网址：',
      current
    );
    if (input === null) return;
    const domains = parseDomainList(input);
    if (!domains.length) {
      window.alert('至少需要保留一个有效域名。');
      return;
    }
    saveDomains(domains);
    window.alert(`已保存：\n${domains.join('\n')}\n\n刷新页面后生效。`);
  });

  GM_registerMenuCommand('➕ 添加当前域名', () => {
    const domains = getConfiguredDomains();
    if (!isAllowedHost(location.hostname, domains)) {
      domains.push(location.hostname.toLowerCase());
      saveDomains(domains);
    }
    window.alert(`已添加 ${location.hostname}，刷新页面后生效。`);
  });

  GM_registerMenuCommand('↩️ 重置默认域名', () => {
    saveDomains(parseDomainList(DEFAULT_DOMAINS));
    window.alert(`已恢复默认域名：${DEFAULT_DOMAINS}`);
  });
}

function isThreadPage() {
  const url = new URL(location.href);
  return (url.searchParams.get('mod') === 'viewthread' && url.searchParams.has('tid'))
    || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
}

function isForumDisplayPage() {
  const url = new URL(location.href);
  return url.searchParams.get('mod') === 'forumdisplay'
    || /forum[-_]\d+/i.test(url.pathname);
}

function isBatchOpenPage() {
  return isForumDisplayPage()
    || Boolean(document.querySelector('main#genesis-content article.entry .entry-title a[href]'));
}

function batchOpenTiming() {
  return isAllowedHost(location.hostname, ['hdblog.me'])
    ? HDBLOG_OPEN_TIMING
    : DEFAULT_OPEN_TIMING;
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
  button.textContent = `后台顺序打开本页主题（${count}）`;
  button.title = '按页面顺序在后台逐个打开普通主题；间隔随机，并定期停顿；再次点击可停止';
  button.style.background = '#398bd4';
}

async function openCurrentPageThreads(button) {
  if (batchOpenState) {
    cancelBatchOpen();
    return;
  }

  const threads = collectForumThreadLinks(document);
  if (!threads.length) {
    window.alert('当前页面没有找到可打开的普通主题。');
    return;
  }

  const state = {
    cancelled: false,
    finishDelay: null,
    timeoutId: null,
  };
  batchOpenState = state;
  const failures = [];
  let opened = 0;
  const timing = batchOpenTiming();
  button.style.background = '#b84b4b';

  try {
    await waitForBatchDelay(randomDelay(timing.initialMin, timing.initialMax), state);
    for (const [index, thread] of threads.entries()) {
      if (state.cancelled) break;

      button.textContent = `停止后台打开（${opened}/${threads.length}）`;
      try {
        GM_openInTab(thread.url, {
          active: false,
          insert: false,
          setParent: true,
        });
        opened += 1;
      } catch (error) {
        failures.push(`${index + 1}. ${redactDiagnostic(error?.message || error || '打开失败')}`);
      }

      if (index === threads.length - 1 || state.cancelled) break;
      const completedCount = index + 1;
      const isLongPause = completedCount % timing.pauseEvery === 0;
      const delay = isLongPause
        ? randomDelay(timing.pauseMin, timing.pauseMax)
        : randomDelay(timing.delayMin, timing.delayMax);
      button.textContent = `${isLongPause ? '停顿' : '等待'} ${Math.ceil(delay / 1000)} 秒（${opened}/${threads.length}）`;
      await waitForBatchDelay(delay, state);
    }
  } finally {
    const wasCancelled = state.cancelled;
    batchOpenState = null;
    button.textContent = wasCancelled
      ? `已停止（已打开 ${opened}/${threads.length}）`
      : failures.length
        ? `完成（打开 ${opened}，失败 ${failures.length}）`
        : `✓ 已按顺序打开 ${opened} 个主题`;
    button.style.background = failures.length ? '#b36b22' : '#398bd4';
    window.setTimeout(() => {
      if (!batchOpenState) {
        setBatchButtonIdle(button, collectForumThreadLinks(document).length);
      }
    }, 3000);
  }

  if (failures.length) {
    window.alert(`以下主题打开失败：\n\n${failures.join('\n')}`);
  }
}

function parseResponseHeaders(value) {
  const headers = new Map();
  String(value ?? '').split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator <= 0) return;
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  });
  return headers;
}

function redactDiagnostic(value) {
  return String(value ?? '')
    .replace(/((?:cookie|authorization|token|auth|sid)=)[^;\s&]+/gi, '$1[已脱敏]')
    .replace(/([?&](?:token|auth|sid|key)=)[^&#\s]+/gi, '$1[已脱敏]');
}

function safeErrorDetails(error) {
  if (!error || typeof error !== 'object') {
    return { error: redactDiagnostic(error || 'unknown_error'), details: '' };
  }
  const details = Object.fromEntries(
    Object.entries(error)
      .filter(([key]) => !/(?:cookie|authorization|requestHeaders)/i.test(key))
      .map(([key, value]) => [
        key,
        typeof value === 'object' ? redactDiagnostic(JSON.stringify(value)) : redactDiagnostic(value),
      ])
  );
  if (error.name && !details.name) details.name = redactDiagnostic(error.name);
  if (error.message && !details.message) details.message = redactDiagnostic(error.message);
  return details;
}

function finalUrlType(finalUrl) {
  try {
    return new URL(finalUrl, location.href).origin === location.origin ? '同站地址' : '跨站地址';
  } catch {
    return '未知地址';
  }
}

function responseFailure(response, reason) {
  const finalUrl = response.finalUrl || response.responseURL || location.href;
  const headers = parseResponseHeaders(response.responseHeaders);
  const contentType = headers.get('content-type') || response.response?.type || '未知类型';
  return new Error(
    `HTTP ${response.status || 0}；最终地址：${finalUrlType(finalUrl)} ${redactDiagnostic(finalUrl)}；`
    + `Content-Type：${contentType}；原因：${reason}`
  );
}

async function blobPrefix(blob) {
  const prefix = blob.slice(0, 1024);
  if (typeof prefix.text === 'function') return prefix.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(prefix);
  });
}

async function validateResponse(response) {
  if (response.status < 200 || response.status >= 300) {
    throw responseFailure(response, '服务器没有返回成功状态，请确认登录、附件权限和帖子是否仍可访问');
  }
  const blob = response.response;
  if (!blob || typeof blob.size !== 'number' || typeof blob.slice !== 'function') {
    throw responseFailure(response, '响应不是可保存的二进制 Blob');
  }

  const headers = parseResponseHeaders(response.responseHeaders);
  const contentType = headers.get('content-type') || blob.type || '';
  const prefix = await blobPrefix(blob);
  const looksLikeHtml = /text\/html|application\/xhtml\+xml/i.test(contentType)
    || /^\s*(?:<!doctype\s+html|<html\b)/i.test(prefix);
  if (looksLikeHtml) {
    let reason = '服务器返回 HTML 页面，未保存，避免把登录页或错误页伪装成附件';
    if (/(?:login|登录|登錄|請先登入|请先登录)/i.test(prefix)) {
      reason = '服务器返回登录页，请刷新帖子并确认 Tampermonkey 请求携带当前登录状态';
    } else if (/(?:permission|权限|權限|无权|無權|附件不存在|附件不存在)/i.test(prefix)) {
      reason = '服务器返回权限或附件错误页，请确认账号有下载权限且附件仍存在';
    } else if (/(?:cloudflare|cf-chl|captcha|验证|驗證)/i.test(prefix)) {
      reason = '服务器返回浏览器验证页，请先在当前页面完成验证后重试';
    }
    throw responseFailure(response, reason);
  }
  if (blob.size === 0) throw responseFailure(response, '响应大小为 0，未保存空文件');

  return {
    blob,
    status: response.status,
    finalUrl: response.finalUrl || response.responseURL || location.href,
    contentType: contentType || 'application/octet-stream',
  };
}

async function requestBlobWithPageFetch(job) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await window.fetch(job.url, {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      signal: controller.signal,
    });
    const blob = await response.blob();
    const responseHeaders = [];
    response.headers.forEach((value, key) => responseHeaders.push(`${key}: ${value}`));
    return validateResponse({
      status: response.status,
      finalUrl: response.url,
      responseHeaders: responseHeaders.join('\r\n'),
      response: blob,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`网络请求超时（${REQUEST_TIMEOUT / 1000} 秒）`);
    }
    const details = safeErrorDetails(error);
    console.error('[x1080x-ex] page fetch failed', details);
    throw new Error(
      `页面同源请求失败：error=${details.name || details.error || 'fetch_failed'}；`
      + `details=${details.message || details.details || '无详细信息'}`
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function requestBlobWithGmXhr(job) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: job.url,
      responseType: 'blob',
      timeout: REQUEST_TIMEOUT,
      headers: { Referer: location.href },
      onload: (response) => {
        validateResponse(response).then(resolve, reject);
      },
      onerror: (error) => {
        const details = safeErrorDetails(error);
        console.error('[x1080x-ex] GM_xmlhttpRequest failed', details);
        reject(new Error(
          `网络请求失败：error=${details.error || 'unknown_error'}；`
          + `details=${details.details || details.message || '无详细信息'}`
        ));
      },
      ontimeout: () => reject(new Error(`网络请求超时（${REQUEST_TIMEOUT / 1000} 秒）`)),
    });
  });
}

function requestBlob(job) {
  const url = new URL(job.url, location.href);
  if (job.kind === 'attachment' && url.origin === location.origin) {
    return requestBlobWithPageFetch(job);
  }
  return requestBlobWithGmXhr(job);
}

function saveBlob(blob, name) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
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
  if (job.kind === 'torrent') {
    const result = await requestTorrentBytes(job.url);
    saveBlob(new Blob([result.bytes], { type: 'application/x-bittorrent' }), job.name);
    console.info('[x1080x-ex] integrated torrent download', {
      name: job.name,
      hash: result.hash,
      torrentName: result.torrentName,
      source: new URL(result.sourceUrl).hostname,
      size: result.bytes.byteLength,
    });
    return;
  }
  const result = await requestBlob(job);
  console.info('[x1080x-ex] response', {
    kind: job.kind,
    name: job.name,
    status: result.status,
    finalUrl: redactDiagnostic(result.finalUrl),
    contentType: result.contentType,
    size: result.blob.size,
  });
  saveBlob(result.blob, job.name);
}

async function downloadAll(button) {
  const jobs = buildDownloadJobs(document);
  if (!jobs.length) {
    window.alert('主楼中没有找到附件或可下载图片。');
    return;
  }

  button.disabled = true;
  const failures = [];
  console.info('[x1080x-ex] environment', {
    downloadMode: typeof GM_info === 'object' ? GM_info.downloadMode : undefined,
    scriptHandler: typeof GM_info === 'object' ? GM_info.scriptHandler : undefined,
    version: typeof GM_info === 'object' ? GM_info.version : undefined,
  });
  for (const [index, job] of jobs.entries()) {
    button.textContent = `下载中 ${index + 1}/${jobs.length}`;
    try {
      await download(job);
    } catch (error) {
      failures.push(`${job.name}：${redactDiagnostic(error?.message || error?.error || '未知错误')}`);
    }
  }

  button.disabled = false;
  button.textContent = failures.length ? `完成（失败 ${failures.length}）` : '✓ 下载完成';
  window.setTimeout(() => {
    button.textContent = '⬇';
  }, 2500);

  if (failures.length) {
    window.alert(`以下文件下载失败：\n\n${failures.join('\n')}\n\n可检查登录状态或浏览器下载权限后重试。`);
  }
}

function addDownloadButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const title = document.querySelector('#thread_subject');
  const host = title?.closest('.vwthd, .ts') || title?.parentElement;
  if (!title || !host) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = '⬇';
  button.title = '下载主楼附件、正文大图和磁力链种子；普通帖子取最大图，FC2 帖子取全部大图';
  Object.assign(button.style, {
    float: 'right',
    position: 'relative',
    zIndex: '20',
    margin: '0 8px 6px 12px',
    padding: '7px 13px',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => { button.style.background = '#246eaf'; });
  button.addEventListener('mouseleave', () => { button.style.background = '#398bd4'; });
  button.addEventListener('click', () => void downloadAll(button));
  host.prepend(button);
}

function addBatchOpenButton() {
  if (document.getElementById(BATCH_BUTTON_ID)) return;
  const threads = collectForumThreadLinks(document);
  let prependButton = false;
  let host = document.querySelector('#pgt')
    || document.querySelector('#threadlist .th')
    || document.querySelector('#threadlist');
  if (!host) {
    host = document.querySelector('main#genesis-content .archive-description');
    if (host) {
      prependButton = true;
    } else {
      const firstArticle = document.querySelector('main#genesis-content article.entry');
      if (firstArticle) {
        host = document.createElement('div');
        host.id = BATCH_TOOLBAR_ID;
        Object.assign(host.style, {
          minHeight: '42px',
          margin: '0 0 16px',
        });
        firstArticle.before(host);
      }
    }
  }
  if (!threads.length || !host) return;

  const button = document.createElement('button');
  button.id = BATCH_BUTTON_ID;
  button.type = 'button';
  Object.assign(button.style, {
    float: 'right',
    position: 'relative',
    zIndex: '20',
    margin: '0 8px 6px 12px',
    padding: '7px 13px',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '20px',
  });
  setBatchButtonIdle(button, threads.length);
  button.addEventListener('mouseenter', () => {
    if (!batchOpenState) button.style.background = '#246eaf';
  });
  button.addEventListener('mouseleave', () => {
    if (!batchOpenState) button.style.background = '#398bd4';
  });
  button.addEventListener('click', () => void openCurrentPageThreads(button));
  if (prependButton) {
    button.style.margin = '0 0 0 12px';
    host.prepend(button);
  } else {
    host.append(button);
  }
}

registerSettingsMenu();

if (isAllowedHost(location.hostname, getConfiguredDomains())) {
  if (isThreadPage()) addDownloadButton();
  if (isBatchOpenPage()) addBatchOpenButton();
}
