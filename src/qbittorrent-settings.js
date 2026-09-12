import {
  getQbSettings,
  saveQbSettings,
  testQbConnection,
} from './torrent.js';

const SETTINGS_PANEL_ID = 'x1080x-ex-settings-panel';
const QB_SECTION_ATTR = 'data-x1080x-qb-settings';
const QB_BOUND_ATTR = 'data-x1080x-qb-settings-bound';

function isAgaghhhHost(locationObject = globalThis.location) {
  const hostname = String(locationObject?.hostname ?? '').toLowerCase().replace(/\.$/, '');
  return hostname === 'agaghhh.cc' || hostname.endsWith('.agaghhh.cc');
}

function setStatus(element, message, kind = '') {
  if (!element) return;
  element.textContent = message;
  element.style.color = kind === 'error' ? '#c5221f' : kind === 'success' ? '#16803c' : '#666';
}

export function enhanceQbittorrentSettingsPanel(
  document = globalThis.document,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  const overlay = document?.getElementById(SETTINGS_PANEL_ID);
  const form = overlay?.querySelector('form');
  if (!form || form.querySelector(`[${QB_SECTION_ATTR}]`)) return false;

  const current = getQbSettings();
  form.style.width = 'min(640px, 100%)';

  const section = document.createElement('div');
  section.setAttribute(QB_SECTION_ATTR, '1');
  section.style.cssText = 'margin:2px 0 18px;padding:14px 15px;border:1px solid #e3e6ea;border-radius:8px;background:#f8f9fa';
  section.innerHTML = `
    <div style="font-weight:700;margin-bottom:11px">qBittorrent 种子回退</div>
    <label style="display:flex;align-items:center;gap:9px;margin-bottom:12px">
      <input data-setting="qb-enabled" type="checkbox">
      <span><strong>启用 qBittorrent 元数据回退</strong><small style="display:block;margin-top:2px;color:#666">公共种子缓存均失败后，通过 qBittorrent 5.2+ 从 DHT / Tracker / Peer 获取 metadata；不会把磁力加入下载列表。</small></span>
    </label>
    <label style="display:block;margin-bottom:10px">
      <span style="display:block;font-weight:600;margin-bottom:5px">WebUI 地址</span>
      <input data-setting="qb-url" type="url" required placeholder="http://127.0.0.1:8080" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
    </label>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-bottom:10px">
      <label style="display:block">
        <span style="display:block;font-weight:600;margin-bottom:5px">用户名</span>
        <input data-setting="qb-username" type="text" required autocomplete="username" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      </label>
      <label style="display:block">
        <span style="display:block;font-weight:600;margin-bottom:5px">密码</span>
        <input data-setting="qb-password" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      </label>
    </div>
    <label style="display:block;margin-bottom:10px">
      <span style="display:block;font-weight:600;margin-bottom:5px">等待元数据（秒）</span>
      <input data-setting="qb-timeout" type="number" min="10" max="300" step="1" required style="width:140px;box-sizing:border-box;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
    </label>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button data-action="qb-test" type="button" style="padding:6px 12px">测试 qBittorrent 登录</button>
      <span data-qb-status style="color:#666;overflow-wrap:anywhere"></span>
    </div>
    <small style="display:block;margin-top:9px;color:#666">用户名和密码保存在 Tampermonkey / Violentmonkey 的脚本专属存储中。建议 WebUI 仅在可信局域网使用，或使用 HTTPS。</small>`;

  const actions = form.lastElementChild;
  form.insertBefore(section, actions || null);

  const enabledInput = section.querySelector('[data-setting="qb-enabled"]');
  const urlInput = section.querySelector('[data-setting="qb-url"]');
  const usernameInput = section.querySelector('[data-setting="qb-username"]');
  const passwordInput = section.querySelector('[data-setting="qb-password"]');
  const timeoutInput = section.querySelector('[data-setting="qb-timeout"]');
  const testButton = section.querySelector('[data-action="qb-test"]');
  const status = section.querySelector('[data-qb-status]');

  enabledInput.checked = current.enabled;
  urlInput.value = current.url;
  usernameInput.value = current.username;
  passwordInput.value = current.password;
  timeoutInput.value = String(Math.round(current.metadataTimeoutMs / 1000));

  const formSettings = () => ({
    enabled: enabledInput.checked,
    url: urlInput.value,
    username: usernameInput.value,
    password: passwordInput.value,
    metadataTimeoutMs: Number(timeoutInput.value) * 1000,
  });

  testButton.addEventListener('click', async () => {
    testButton.disabled = true;
    setStatus(status, '正在登录 qBittorrent…');
    try {
      const result = await testQbConnection(formSettings(), gmRequest);
      setStatus(status, `登录成功，qBittorrent ${result.version}`, 'success');
    } catch (error) {
      setStatus(status, error?.message || String(error), 'error');
    } finally {
      testButton.disabled = false;
    }
  });

  if (form.getAttribute(QB_BOUND_ATTR) !== '1') {
    form.setAttribute(QB_BOUND_ATTR, '1');
    form.addEventListener('submit', (event) => {
      try {
        saveQbSettings(formSettings());
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatus(status, error?.message || String(error), 'error');
      }
    }, true);
  }

  return true;
}

export function installQbittorrentSettings(
  document = globalThis.document,
  locationObject = globalThis.location,
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  if (!document?.body || !isAgaghhhHost(locationObject)) return null;
  if (enhanceQbittorrentSettingsPanel(document, gmRequest)) return null;

  const Observer = document.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof Observer !== 'function') return null;
  const observer = new Observer(() => enhanceQbittorrentSettingsPanel(document, gmRequest));
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
