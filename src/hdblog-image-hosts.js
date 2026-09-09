export const HDBLOG_IMAGE_HOSTS_KEY = 'x1080x-ex:hdblog-image-hosts';

export const DEFAULT_HDBLOG_IMAGE_HOSTS = Object.freeze([
  'pixhost.to',
  'pixhost.cc',
  'pixho.st',
  // 旧版本代码曾兼容该域名，保留以免历史文章失效。
  'pixhost.org',
]);

function normalizeHostname(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return url.hostname.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

export function parseHdblogImageHosts(value) {
  const seen = new Set();
  return String(value ?? '')
    .split(/[\s,;，；]+/)
    .map(normalizeHostname)
    .filter(Boolean)
    .filter((hostname) => !seen.has(hostname) && seen.add(hostname));
}

export function getCustomHdblogImageHosts() {
  if (typeof GM_getValue !== 'function') return [];
  const stored = GM_getValue(HDBLOG_IMAGE_HOSTS_KEY, '');
  return parseHdblogImageHosts(stored);
}

export function getHdblogImageHosts() {
  return [...new Set([...DEFAULT_HDBLOG_IMAGE_HOSTS, ...getCustomHdblogImageHosts()])];
}

export function isHdblogImagePageHost(hostname) {
  const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return getHdblogImageHosts().some((domain) => host === domain || host === `www.${domain}`);
}

function isHdblogHost(locationObject) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'hdblog.me' || hostname.endsWith('.hdblog.me');
}

export function installHdblogImageHostSettings(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!document || !isHdblogHost(locationObject) || typeof GM_registerMenuCommand !== 'function') return;

  GM_registerMenuCommand('🖼️ hdblog 图床设置', () => {
    const current = getCustomHdblogImageHosts().join('\n');
    const builtins = DEFAULT_HDBLOG_IMAGE_HOSTS.join('、');
    const input = document.defaultView?.prompt(
      `额外图床主域名（每行一个，也可粘贴完整网址）。\n\n内置兼容：${builtins}\n` +
      '脚本还会自动识别 Preview 区常见的 /show/ 图片展示页。以后图床换域名时，在这里补一行即可，无需改代码。',
      current
    );
    if (input === null || input === undefined) return;

    const hosts = parseHdblogImageHosts(input);
    if (typeof GM_setValue === 'function') {
      GM_setValue(HDBLOG_IMAGE_HOSTS_KEY, hosts.join('\n'));
    }
    document.defaultView?.alert(
      hosts.length
        ? `已保存额外图床：\n${hosts.join('\n')}\n\n刷新页面后生效。`
        : '已清空额外图床，继续使用内置图床和自动识别规则。\n\n刷新页面后生效。'
    );
  });
}
