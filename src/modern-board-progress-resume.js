// Keep cross-page locator continuation in this tab only. A modern board may
// return a Next.js shell to fetch/GM_xmlhttpRequest while normal navigation
// hydrates its articles. Limit foreground hops so navigation cannot loop.
export const MODERN_BOARD_RESUME_KEY = 'x1080x-ex:modern-board-locator-resume-v1';
export const MODERN_BOARD_RESUME_MAX_HOPS = 12;
export const MODERN_BOARD_RESUME_MAX_AGE_MS = 5 * 60 * 1000;

function normalizedBoardScope(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/boards\/([a-z0-9]+)\/?$/i);
    return /^https?:$/.test(url.protocol) && match
      ? url.origin + '/boards/' + match[1] : '';
  } catch {
    return '';
  }
}

export function parseModernBoardResume(value, currentUrl, now = Date.now()) {
  let state;
  try {
    state = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  const scope = normalizedBoardScope(currentUrl);
  if (!scope || !state || state.version !== 1 || state.scope !== scope) return null;
  if (!Number.isFinite(state.startedAt) || now < state.startedAt
    || now - state.startedAt > MODERN_BOARD_RESUME_MAX_AGE_MS) return null;
  if (!Array.isArray(state.visitedUrls)
    || state.visitedUrls.length < 1 || state.visitedUrls.length > MODERN_BOARD_RESUME_MAX_HOPS
    || state.visitedUrls.some((url) => normalizedBoardScope(url) !== scope)) return null;
  try {
    if (new URL(state.targetUrl).href !== new URL(currentUrl).href) return null;
  } catch {
    return null;
  }
  return state;
}

export function nextModernBoardResumeState(currentUrl, targetUrl, previous = null, now = Date.now()) {
  const scope = normalizedBoardScope(currentUrl);
  if (!scope || normalizedBoardScope(targetUrl) !== scope) {
    return { status: 'invalid' };
  }
  const current = new URL(currentUrl).href;
  const target = new URL(targetUrl).href;
  if (current === target) return { status: 'invalid' };
  const prior = previous?.version === 1 && previous.scope === scope
    && Number.isFinite(previous.startedAt) && now - previous.startedAt <= MODERN_BOARD_RESUME_MAX_AGE_MS
    && now >= previous.startedAt && Array.isArray(previous.visitedUrls)
    ? previous : null;
  const visitedUrls = prior ? prior.visitedUrls : [];
  if (visitedUrls.includes(target) || visitedUrls.length >= MODERN_BOARD_RESUME_MAX_HOPS) {
    return { status: 'limit' };
  }
  return {
    status: 'ready',
    state: {
      version: 1,
      scope,
      targetUrl: target,
      startedAt: prior?.startedAt || now,
      visitedUrls: [...visitedUrls, target],
    },
  };
}
