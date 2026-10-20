// Shared, presentation-only settings organizer. Does not change setting keys
// or listeners: existing controls are MOVED, never cloned.
const STYLE = `
.sx-title { margin:0; padding:20px 24px 16px; font-size:20px; line-height:1.35; font-weight:700; border-bottom:1px solid #e5e7eb; flex:none; }
.sx-workspace { display:flex; min-height:0; flex:1; overflow:hidden; }
.sx-nav { display:flex; flex-direction:column; width:176px; min-width:176px; gap:4px; padding:16px 10px; overflow-y:auto; background:#f8fafc; border-right:1px solid #e5e7eb; box-sizing:border-box; }
.sx-nav button { appearance:none; display:block; border:0; border-radius:7px; padding:11px 12px; width:100%; background:transparent; color:#334155; text-align:left; font:600 13px/1.4 system-ui,sans-serif; cursor:pointer; }
.sx-nav button[aria-selected="true"] { background:#e8f1ff; color:#155bb5; box-shadow:inset 3px 0 #2563eb; }
.sx-nav button:hover:not([aria-selected="true"]) { background:#eef2f7; }
.sx-content { min-width:0; flex:1; padding:18px 24px 24px; overflow-y:auto; box-sizing:border-box; }
.sx-group[hidden] { display:none !important; }
.sx-group-title { font-size:17px; font-weight:700; line-height:1.45; margin:0 0 5px; }
.sx-group-desc { color:#64748b; font-size:12px; margin:0 0 18px; }
.sx-group-body > label, .sx-group-body > div { margin-bottom:16px !important; }
.sx-group-body > label:not([data-search-filter-keywords-row]):not([data-keywords-row]) { padding:9px 10px; border:1px solid #eef0f3; border-radius:7px; background:#fff; }
.sx-group-body label, .sx-group-body div { box-sizing:border-box; }
.sx-group-body input[type="number"], .sx-group-body input[type="text"], .sx-group-body input[type="url"], .sx-group-body input[type="password"], .sx-group-body textarea { max-width:100%; }
.sx-group-body input:disabled, .sx-group-body textarea:disabled { opacity:.55; cursor:not-allowed; }
.sx-group-body small { line-height:1.55; }
.sx-group-body > [data-batch-open-interval-row], .sx-group-body > [data-batch-open-history-row], .sx-group-body > [data-keywords-row], .sx-group-body > [data-search-filter-keywords-row] { margin-left:0 !important; padding:13px 14px; border-radius:8px; border:1px solid #e6eaf0; background:#f8fafc; }
.sx-group-body > [data-download-guard-row] { margin-left:0 !important; }
.sx-footer { padding:13px 24px; border-top:1px solid #e5e7eb; background:#fff; margin:0 !important; flex:none; }
.sx-footer button { border:1px solid #cbd5e1; border-radius:6px; background:#fff; color:#334155; cursor:pointer; }
.sx-footer button[type="submit"] { background:#2563eb; border-color:#2563eb; color:#fff; }
.sx-footer button:hover { filter:brightness(.96); }
@media (max-width:650px) {
  .sx-title { padding:15px 17px; }
  .sx-workspace { flex-direction:column; }
  .sx-nav { width:100%; min-width:0; flex:none; flex-direction:row; overflow-x:auto; overflow-y:hidden; padding:10px; border-right:0; border-bottom:1px solid #e5e7eb; }
  .sx-nav button { width:auto; flex:none; white-space:nowrap; padding:9px 13px; }
  .sx-nav button[aria-selected="true"] { box-shadow:inset 0 -3px #2563eb; }
  .sx-content { padding:16px; }
  .sx-footer { padding:11px 16px; }
}
`;

function createSection(document, key, title, description) {
  const section = document.createElement('section');
  section.className = 'sx-group';
  section.dataset.settingsSection = key;
  const heading = document.createElement('h3');
  heading.className = 'sx-group-title';
  heading.textContent = title;
  section.append(heading);
  const summary = document.createElement('p');
  summary.className = 'sx-group-desc';
  summary.textContent = description;
  section.append(summary);
  const body = document.createElement('div');
  body.className = 'sx-group-body';
  section.append(body);
  return { section, body };
}

function appendSection(form, spec) {
  const document = form.ownerDocument;
  const nav = form.querySelector('[data-settings-nav]');
  const content = form.querySelector('[data-settings-content]');
  if (!nav || !content) return null;
  const { section, body } = createSection(document, spec.key, spec.title, spec.description);
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.settingsTab = spec.key;
  button.textContent = spec.title;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.id = 'sx-tab-' + spec.key;
  section.setAttribute('role', 'tabpanel');
  section.setAttribute('aria-labelledby', button.id);
  nav.append(button);
  content.append(section);
  button.addEventListener('click', () => activateSettingsSection(form, spec.key));
  return { section, body, button };
}

export function activateSettingsSection(form, key) {
  const group = [...form.querySelectorAll('[data-settings-section]')]
    .find((item) => item.dataset.settingsSection === key);
  if (!group) return false;
  for (const panel of form.querySelectorAll('[data-settings-section]')) {
    panel.hidden = panel !== group;
  }
  for (const tab of form.querySelectorAll('[data-settings-tab]')) {
    const selected = tab.dataset.settingsTab === key;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  const content = form.querySelector('[data-settings-content]');
  if (content) content.scrollTop = 0;
  return true;
}

// The original modal templates include working inputs and event handlers.
// Locate their top-level rows, then place those same nodes into semantic tabs.
export function organizeSettingsPanel(form, sections) {
  if (!form || form.querySelector('[data-settings-workspace]')) return false;
  const document = form.ownerDocument;
  const heading = form.querySelector(':scope > h2');
  const footer = form.querySelector(':scope > div:last-child');
  if (!heading || !footer || !footer.querySelector('[data-action="cancel"]')) return false;
  const sourceRoots = [...form.children].filter((node) => node !== heading && node !== footer && node.tagName === 'DIV');
  const findRow = (setting) => {
    let node = form.querySelector('[data-setting="' + setting + '"]');
    if (!node) return null;
    while (node.parentElement && !sourceRoots.includes(node.parentElement) && node.parentElement !== form) {
      node = node.parentElement;
    }
    return node;
  };
  const groups = sections.map((spec) => ({
    ...spec,
    rows: spec.settings.map(findRow).filter(Boolean),
  }));
  const found = groups.reduce((sum, group) => sum + group.rows.length, 0);
  if (!found) return false;
  // Do not accidentally lose newly added controls when a template changes.
  const originalRows = sourceRoots.flatMap((root) =>
    [...root.children].filter((node) => node.querySelector?.('[data-setting]') || node.hasAttribute?.('data-setting'))
  );
  const assignedRows = new Set(groups.flatMap((group) => group.rows));
  const missing = originalRows.filter((row) => !assignedRows.has(row));
  if (missing.length) {
    groups.push({ key:'more', title:'其他选项', description:'站点的其他配置项', rows:missing });
  }

  const css = document.createElement('style');
  css.textContent = STYLE;
  const workspace = document.createElement('div');
  workspace.className = 'sx-workspace';
  workspace.dataset.settingsWorkspace = '1';
  const nav = document.createElement('nav');
  nav.className = 'sx-nav';
  nav.dataset.settingsNav = '1';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '设置分类');
  const content = document.createElement('div');
  content.className = 'sx-content';
  content.dataset.settingsContent = '1';
  workspace.append(nav, content);
  nav.addEventListener('keydown', (event) => {
    const tabs = [...nav.querySelectorAll('[data-settings-tab]')];
    const active = tabs.indexOf(nav.getRootNode()?.activeElement || document.activeElement);
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (active < 0 || !keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : (active + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  });
  form.style.width = 'min(850px, 100%)';
  form.style.maxHeight = 'calc(100vh - 32px)';
  form.style.height = 'min(690px, calc(100vh - 32px))';
  form.style.overflow = 'hidden';
  form.style.display = 'flex';
  form.style.flexDirection = 'column';
  form.style.padding = '0';
  form.style.background = '#fff';
  heading.className = 'sx-title';
  footer.className = 'sx-footer';
  form.replaceChildren(css, heading, workspace, footer);
  for (const spec of groups) {
    const created = appendSection(form, spec);
    for (const row of spec.rows) {
      if (row.parentNode !== created.body) created.body.append(row);
    }
  }
  activateSettingsSection(form, groups[0].key);
  // If validation focuses a setting in another tab, show that tab.
  form.addEventListener('focusin', (event) => {
    const group = event.target?.closest?.('[data-settings-section]');
    if (group && group.hidden) activateSettingsSection(form, group.dataset.settingsSection);
  });
  form.addEventListener('invalid', (event) => {
    const group = event.target?.closest?.('[data-settings-section]');
    if (group && group.hidden) activateSettingsSection(form, group.dataset.settingsSection);
  }, true);
  return true;
}

// Integrations such as qBittorrent can register a new tab after the modal opens.
export function addSettingsExtraSection(form, spec, element) {
  if (!form?.querySelector('[data-settings-workspace]')) return false;
  const existing = form.querySelector('[data-settings-section="' + spec.key + '"]');
  const group = existing
    ? { body: existing.querySelector('.sx-group-body') }
    : appendSection(form, spec);
  group.body.append(element);
  return true;
}
