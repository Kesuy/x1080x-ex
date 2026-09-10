export const HDBLOG_IMAGE_HOSTS_KEY = 'x1080x-ex:hdblog-image-hosts';

export const DEFAULT_HDBLOG_IMAGE_HOSTS = Object.freeze([
  'pixhost.to',
  'pixhost.cc',
  'pixho.st',
  // 旧版本代码曾兼容该域名，保留以免历史文章失效。
  'pixhost.org',
]);

const HDBLOG_SETTINGS_PANEL_ID = 'x1080x-ex-hdblog-settings-panel';
const IMAGE_HOSTS_FIELD_ATTR = 'data-x1080x-hdblog-image-hosts-field';
const IMAGE_HOSTS_BOUND_ATTR = 'data-x1080x-hdblog-image-hosts-bound';

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

function enhanceHdblogSettingsPanel(document) {
  const overlay = document?.getElementById(HDBLOG_SETTINGS_PANEL_ID);
  const panel = overlay?.querySelector('form');
  if (!panel || panel.querySelector(`[${IMAGE_HOSTS_FIELD_ATTR}]`)) return false;

  const label = document.createElement('label');
  label.setAttribute(IMAGE_HOSTS_FIELD_ATTR, '1');
  label.style.cssText = 'display:block;margin-bottom:18px';

  const title = document.createElement('span');
  title.textContent = '额外图床域名';
  title.style.cssText = 'display:block;font-weight:600;margin-bottom:6px';

  const textarea = document.createElement('textarea');
  textarea.setAttribute('data-setting', 'image-hosts');
  textarea.rows = 4;
  textarea.placeholder = '通常无需填写；图床更换域名时每行添加一个';
  textarea.value = getCustomHdblogImageHosts().join('\n');
  textarea.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px;resize:vertical';

  const help = document.createElement('small');
  help.style.cssText = 'display:block;margin-top:5px;color:#666';
  help.textContent = `内置兼容：${DEFAULT_HDBLOG_IMAGE_HOSTS.join('、')}。可填主域名或完整 URL；脚本也会自动识别常见 /show/ 图片展示页。`;

  label.append(title, textarea, help);
  panel.insertBefore(label, panel.lastElementChild || null);

  if (panel.getAttribute(IMAGE_HOSTS_BOUND_ATTR) !== '1') {
    panel.setAttribute(IMAGE_HOSTS_BOUND_ATTR, '1');
    // 使用捕获阶段，确保先于 hdblog 设置面板原本的保存/刷新逻辑执行。
    panel.addEventListener('submit', () => {
      const input = panel.querySelector('[data-setting="image-hosts"]');
      if (!input || typeof GM_setValue !== 'function') return;
      const hosts = parseHdblogImageHosts(input.value);
      GM_setValue(HDBLOG_IMAGE_HOSTS_KEY, hosts.join('\n'));
    }, true);
  }
  return true;
}

export function installHdblogImageHostSettings(
  document = globalThis.document,
  locationObject = globalThis.location
) {
  if (!document?.body || !isHdblogHost(locationObject)) return;

  // 图床配置属于 hdblog 高级设置，不再单独占用 Tampermonkey 菜单项。
  // 当现有“hdblog 设置”面板打开时，把图床字段注入同一面板。
  enhanceHdblogSettingsPanel(document);

  const MutationObserverCtor = document.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof MutationObserverCtor !== 'function') return;
  const observer = new MutationObserverCtor(() => enhanceHdblogSettingsPanel(document));
  observer.observe(document.body, { childList: true, subtree: true });
}
