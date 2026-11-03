import { openX1080xSettingsPanel } from './agaghhh-enhancement.js';
import { openHdblogSettingsPanel } from './hdblog-article.js';
import { openJavfreeSettingsPanel } from './javfree.js';
import { openSehuatangSettings } from './sehuatang.js';
import { FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, isFc2cmadbHdblogSearchEnabled } from './fc2cmadb.js';
import { enhanceQbittorrentSettingsPanel } from './qbittorrent-settings.js';
import { enhanceHdblogSettingsPanel } from './hdblog-image-hosts.js';
import { addSettingsExtraSection } from './settings-layout.js';
import { runSiteSettingsTool } from './userscript.js';
import { isAgaghhhHost } from './site-domains.js';

export const SETTINGS_CENTER_ID = 'x1080x-ex-unified-settings-center';
export const SETTINGS_CENTER_SITES = Object.freeze([
  { key: 'x1080x', label: 'x1080x' },
  { key: 'javclub', label: 'JavClub' },
  { key: 'javfree', label: 'JavFree' },
  { key: 'fc2cmadb', label: 'FC2CMADB' },
  { key: 'sehuatang', label: '98堂' },
]);
const STYLE = ":host{all:initial;color-scheme:light;font:14px/1.5 system-ui,sans-serif;color:#253142}\n*{box-sizing:border-box}\n.backdrop{position:fixed;inset:0;z-index:2147483647;background:#0f172a99;padding:16px;display:grid;place-items:center}\n.dialog{width:min(1040px,100%);height:min(790px,calc(100vh - 32px));background:white;box-shadow:0 24px 90px #0005;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;min-height:0}\n.header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e2e8f0}\n.header h2{font-size:19px;margin:0}.header small{color:#64748b}.close{font-size:23px;border:0;background:transparent;cursor:pointer;color:#475569;padding:0 8px}\n.tabs{display:flex;gap:4px;overflow-x:auto;padding:9px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0}\n.tabs button{flex:none;border:0;border-radius:8px;padding:9px 14px;background:transparent;color:#475569;font:600 13px system-ui,sans-serif;cursor:pointer}\n.tabs button[aria-selected=true]{background:#e8f1ff;color:#155bb5;box-shadow:inset 0 -2px #2563eb}\n.tabs button[data-dirty=true]::after{content:\" •\";color:#db8421}\n.content{flex:1;min-height:0;overflow:hidden}\n.pane{height:100%;overflow:auto;min-height:0}\n.pane[hidden]{display:none!important}\n.pane form{height:100%!important;max-height:none!important;width:100%!important;max-width:none!important;box-shadow:none!important;border-radius:0!important}\n.pane .sx-content{min-height:0}\n.status{padding:10px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b}\n.simple{padding:24px!important;height:auto!important;max-width:720px!important;margin:0 auto}\n.simple label{display:flex;align-items:center;gap:9px;padding:16px;border:1px solid #e2e8f0;border-radius:8px}\n.simple p{color:#64748b}.simple button{cursor:pointer;border:0;background:#2563eb;color:white;border-radius:7px;padding:9px 16px;margin-top:16px}\n.tools{display:flex;flex-direction:column;gap:9px;padding:0 0 15px}\n.tools button{cursor:pointer;border:1px solid #cbd5e1;border-radius:7px;padding:10px 12px;text-align:left;background:white;color:#334155;font:inherit}\n.tools button:hover{background:#f1f5f9}\n.tools small{color:#64748b}\n@media(max-width:650px){.backdrop{padding:6px}.dialog{height:calc(100vh - 12px)}.header{padding:12px}.tabs{padding:6px}.tabs button{padding:8px 10px}.status{padding:8px 12px}}";

function inferSite(location = globalThis.location) {
  const host = String(location?.hostname || '').toLowerCase();
  if (isAgaghhhHost(location)) return 'x1080x';
  if (['javclub.me', 'hdblog.me'].some(domain => host === domain || host.endsWith('.' + domain))) return 'javclub';
  if (host === 'javfree.me' || host.endsWith('.javfree.me')) return 'javfree';
  if (host === 'fc2cmadb.com' || host.endsWith('.fc2cmadb.com')) return 'fc2cmadb';
  if (host === 'sehuatang.org' || host === 'www.sehuatang.org') return 'sehuatang';
  return 'x1080x';
}

function createHistoryTools(document) {
  const section = document.createElement('div');
  section.className = 'tools';
  for (const [key, label] of [
    ['primary-domain', '🌐 设置 x1080x 主站域名'],
    ['reset-domains', '↩️ 重置默认域名'],
    ['migrate-history', '↪️ 迁移旧版浏览记录'],
    ['inspect-history', '🧾 检查旧版浏览记录'],
    ['import-history', '📥 导入旧论坛历史恢复文件'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tool = key;
    button.textContent = label;
    button.addEventListener('click', () => {
      try {
        if (!runSiteSettingsTool(key)) throw new Error('当前页面尚未注册该操作');
      } catch (error) {
        document.defaultView?.alert?.(error?.message || String(error));
      }
    });
    section.append(button);
  }
  const note = document.createElement('small');
  note.textContent = '原有配置和浏览记录保持不变；域名变更后刷新目标网站。';
  section.append(note);
  return section;
}

// All site forms retain their original GM storage keys and event handlers.
// No site enhancement runs merely because its configuration is displayed.
export function openUnifiedSettingsCenter(
  document = globalThis.document,
  { initialSite = inferSite(document?.defaultView?.location), gmRequest = globalThis.GM_xmlhttpRequest } = {}
) {
  if (!document?.body) return null;
  document.getElementById(SETTINGS_CENTER_ID)?.remove();
  const host = document.createElement('div');
  host.id = SETTINGS_CENTER_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'x1080x-ex 设置中心');

  const header = document.createElement('div');
  header.className = 'header';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'x1080x-ex 设置中心';
  const subtitle = document.createElement('small');
  subtitle.textContent = '所有网站集中管理，保存后刷新目标网站生效';
  heading.append(title, subtitle);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'close';
  closeButton.setAttribute('aria-label', '关闭设置中心');
  closeButton.textContent = '×';
  header.append(heading, closeButton);

  const nav = document.createElement('nav');
  nav.className = 'tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '网站设置');
  const content = document.createElement('div');
  content.className = 'content';
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');
  status.textContent = '各网站独立保存；切换网站不会丢失未保存的输入。';

  const tabs = new Map();
  const panes = new Map();
  const forms = new Map();
  const dirty = new Set();
  const saved = key => {
    dirty.delete(key);
    tabs.get(key)?.removeAttribute('data-dirty');
    status.textContent = '✓ ' + SETTINGS_CENTER_SITES.find(site => site.key === key).label + ' 设置已保存。请刷新对应网站。';
  };
  const close = () => {
    if (dirty.size && document.defaultView?.confirm?.('存在未保存的设置，确定关闭吗？') === false) return;
    host.remove();
  };
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  // Cancel in an embedded legacy form should dismiss the unified dialog.
  content.addEventListener('click', event => {
    if (event.target?.closest?.('[data-action="cancel"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  function makeForm(key) {
    if (key === 'fc2cmadb') {
      const form = document.createElement('form');
      form.className = 'simple';
      const h3 = document.createElement('h3');
      h3.textContent = 'FC2CMADB 番号搜索';
      const p = document.createElement('p');
      p.textContent = '点击作品卡片上的 FC2 数字番号，在 JavClub 搜索对应作品。';
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.dataset.setting = 'fc2cmadb-search';
      check.checked = isFc2cmadbHdblogSearchEnabled();
      const text = document.createElement('span');
      text.textContent = '启用番号搜索 JavClub';
      label.append(check, text);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = '保存 FC2CMADB 设置';
      form.append(h3, p, label, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (typeof GM_setValue === 'function') GM_setValue(FC2CMADB_HDBLOG_SEARCH_ENABLED_KEY, check.checked);
        saved(key);
      });
      return form;
    }

    const options = { embedded: true, onSaved: () => saved(key) };
    let overlay;
    if (key === 'x1080x') overlay = openX1080xSettingsPanel(document, options);
    else if (key === 'javclub') overlay = openHdblogSettingsPanel(document, options);
    else if (key === 'javfree') overlay = openJavfreeSettingsPanel(document, options);
    else if (key === 'sehuatang') overlay = openSehuatangSettings(document, options);
    const form = overlay?.querySelector('form');
    if (!form) throw new Error(key + ' 设置表单不存在');
    if (key === 'x1080x') {
      enhanceQbittorrentSettingsPanel(document, gmRequest, form);
      addSettingsExtraSection(form, {
        key: 'site-tools', title: '域名与历史工具',
        description: '主站域名、旧记录诊断、迁移和恢复',
      }, createHistoryTools(document));
    }
    if (key === 'javclub') enhanceHdblogSettingsPanel(document, form);
    return form;
  }

  function activate(key) {
    if (!panes.has(key)) return false;
    if (!forms.has(key)) {
      try {
        const form = makeForm(key);
        panes.get(key).append(form);
        forms.set(key, form);
        const markDirty = () => {
          dirty.add(key);
          tabs.get(key).setAttribute('data-dirty', 'true');
        };
        form.addEventListener('change', markDirty);
        form.addEventListener('input', markDirty);
      } catch (error) {
        status.textContent = '加载失败：' + (error?.message || String(error));
        console.error('[x1080x-ex] settings center failed:', key, error);
        return false;
      }
    }
    for (const [site, pane] of panes) {
      const selected = site === key;
      pane.hidden = !selected;
      tabs.get(site).setAttribute('aria-selected', String(selected));
      tabs.get(site).tabIndex = selected ? 0 : -1;
    }
    status.textContent = '各网站独立保存；切换网站不会丢失未保存的输入。';
    return true;
  }

  for (const site of SETTINGS_CENTER_SITES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.siteTab = site.key;
    button.id = 'x1080x-ex-site-' + site.key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.textContent = site.label;
    button.addEventListener('click', () => activate(site.key));
    tabs.set(site.key, button);
    nav.append(button);
    const pane = document.createElement('section');
    pane.className = 'pane';
    pane.hidden = true;
    pane.dataset.sitePane = site.key;
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', button.id);
    panes.set(site.key, pane);
    content.append(pane);
  }
  dialog.append(header, nav, content, status);
  backdrop.append(dialog);
  root.append(style, backdrop);
  document.body.append(host);
  activate(tabs.has(initialSite) ? initialSite : 'x1080x');
  closeButton.focus();
  return host;
}

export function installUnifiedSettingsMenu(document = globalThis.document) {
  if (!document?.body || (document.defaultView && document.defaultView.top !== document.defaultView)) return false;
  if (typeof GM_registerMenuCommand !== 'function') return false;
  GM_registerMenuCommand('⚙️ x1080x-ex 设置中心', () => openUnifiedSettingsCenter(document));
  return true;
}
