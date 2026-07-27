import {
  buildDownloadJobs,
  isAllowedHost,
  parseDomainList,
} from './core.js';

const STORAGE_KEY = 'x1080x-ex:domains';
const DEFAULT_DOMAINS = 'agaghhh.cc';
const BUTTON_ID = 'x1080x-ex-download';

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

function download(job) {
  return new Promise((resolve, reject) => {
    GM_download({
      url: job.url,
      name: job.name,
      saveAs: false,
      headers: { Referer: location.href },
      onload: resolve,
      onerror: reject,
      ontimeout: () => reject(new Error('下载超时')),
    });
  });
}

async function downloadAll(button) {
  const jobs = buildDownloadJobs(document);
  if (!jobs.length) {
    window.alert('主楼中没有找到附件或第二张正文图片。');
    return;
  }

  button.disabled = true;
  const failures = [];
  for (const [index, job] of jobs.entries()) {
    button.textContent = `下载中 ${index + 1}/${jobs.length}`;
    try {
      await download(job);
    } catch (error) {
      failures.push(`${job.name}：${error?.error || error?.message || '未知错误'}`);
    }
  }

  button.disabled = false;
  button.textContent = failures.length ? `完成（失败 ${failures.length}）` : '✓ 下载完成';
  window.setTimeout(() => {
    button.textContent = '⬇ 下载附件和主楼图片';
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
  button.textContent = '⬇ 下载附件和主楼图片';
  button.title = '下载主楼附件，并下载主楼第二张正文图片';
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
