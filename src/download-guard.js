export const AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY = 'x1080x-ex:agaghhh-download-guard-enabled';
export const HDBLOG_DOWNLOAD_GUARD_ENABLED_KEY = 'x1080x-ex:hdblog-download-guard-enabled';

const activeStates = new WeakMap();

export function isDownloadGuardEnabled(key) {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(key, true) !== false;
}

export function beginDownloadGuard(
  document = globalThis.document,
  { enabled = true, label = '⬇ 下载中' } = {}
) {
  const view = document?.defaultView || globalThis.window;
  if (!enabled || !document || !view?.addEventListener || !view?.removeEventListener) {
    return () => {};
  }

  let state = activeStates.get(document);
  if (!state) {
    state = {
      count: 0,
      originalTitle: '',
      beforeUnload(event) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      },
    };
    activeStates.set(document, state);
  }

  state.count += 1;
  if (state.count === 1) {
    state.originalTitle = document.title || '';
    document.title = state.originalTitle ? `${label} · ${state.originalTitle}` : label;
    view.addEventListener('beforeunload', state.beforeUnload);
  }

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    state.count = Math.max(0, state.count - 1);
    if (state.count !== 0) return;

    view.removeEventListener('beforeunload', state.beforeUnload);
    document.title = state.originalTitle;
    activeStates.delete(document);
  };
}
