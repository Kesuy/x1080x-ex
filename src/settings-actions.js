const siteSettingsTools = new Map();

export function registerSettingsTool(id, label, action) {
  siteSettingsTools.set(id, action);
  if ((id === 'match-domains' || id === 'add-current-domain')
    && typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(label, action);
  }
}

export function runSiteSettingsTool(id) {
  const action = siteSettingsTools.get(id);
  if (typeof action !== 'function') return false;
  action();
  return true;
}
