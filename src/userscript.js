import {
  buildDownloadJobs,
  isAllowedHost,
  parseDomainList,
} from './core.js';

const STORAGE_KEY = 'x1080x-ex:domains';
const DEFAULT_DOMAINS = 'agaghhh.cc';
const BUTTON_ID = 'x1080x-ex-download';
const REQUEST_TIMEOUT = 60000;

function getConfiguredDomains() {
  return parseDomainList(GM_getValue(STORAGE_KEY, DEFAULT_DOMAINS));
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
  button.title = '下载主楼附件和正文大图；普通帖子取最大图，FC2 帖子取全部大图';
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

registerSettingsMenu();

if (isAllowedHost(location.hostname, getConfiguredDomains()) && isThreadPage()) {
  addDownloadButton();
}
