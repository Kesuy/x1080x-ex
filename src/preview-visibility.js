// 复用原有 Preview 键，同时控制 x1080x 的渲染、搜索与批量下载。
export const X1080X_PREVIEW_ENABLED_KEY = 'x1080x-ex:agaghhh-hdblog-preview-enabled';
const LEGACY_ENHANCEMENT_KEY = 'x1080x-ex:agaghhh-enhancement-enabled';

export function isX1080xPreviewEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  const stored = GM_getValue(X1080X_PREVIEW_ENABLED_KEY, null);
  return stored === null || stored === undefined
    ? GM_getValue(LEGACY_ENHANCEMENT_KEY, true) !== false
    : stored !== false;
}
export function setX1080xPreviewEnabled(enabled) {
  if (typeof GM_setValue !== 'function') return false;
  GM_setValue(X1080X_PREVIEW_ENABLED_KEY, Boolean(enabled));
  return true;
}
