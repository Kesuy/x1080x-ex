// Keep background-tab challenge detection separate from the batch opener.
// This reports a challenge; it never tries to solve or bypass Cloudflare.
export const BATCH_CF_SESSION_KEY = 'x1080x-ex:batch-cf-session-v1';
export const BATCH_CF_EVENT_KEY = 'x1080x-ex:batch-cf-detected-v1';

export function isCloudflareChallengePage(document) {
  if (!document) return false;
  if (document.querySelector(
    '#challenge-form, #challenge-stage, #challenge-running, #cf-challenge-running, '
    + 'form[action*="/cdn-cgi/challenge-platform/"], [id^="cf-chl-widget-"]'
  )) return true;

  const title = String(document.title || '').trim();
  const titleSignals = /just a moment|attention required|one more step|请稍候|請稍候|稍等片刻|安全验证|安全驗證/i.test(title);
  if (!titleSignals) return false;
  const body = String(document.body?.textContent || '').slice(0, 4000);
  return /cloudflare|verify (?:you are|that you are) human|checking your browser|checking if the site connection is secure|正在检查|正在檢查|验证您是人类|驗證您是人類|人机验证|人機驗證|请确认您是真人|請確認您是真人/i.test(body)
    || Boolean(document.querySelector('iframe[src*="challenges.cloudflare.com"], .cf-turnstile'));
}

function sameBatchThread(activeUrl, currentUrl) {
  try {
    const left = new URL(activeUrl);
    const right = new URL(currentUrl);
    if (left.host !== right.host || left.pathname.replace(/\/$/, '') !== right.pathname.replace(/\/$/, '')) return false;
    if (/\/(?:forum|search)\.php$/i.test(left.pathname)) {
      return left.searchParams.get('tid') === right.searchParams.get('tid');
    }
    return true;
  } catch {
    return false;
  }
}

export function reportBatchCloudflareChallenge(
  document,
  pageUrl,
  read = globalThis.GM_getValue,
  write = globalThis.GM_setValue,
  now = Date.now()
) {
  if (typeof read !== 'function' || typeof write !== 'function'
    || !isCloudflareChallengePage(document)) return false;
  const session = read(BATCH_CF_SESSION_KEY, null);
  if (!session || !session.id || !Array.isArray(session.urls)
    || !Number.isFinite(session.updatedAt)
    || now - session.updatedAt > 120000 || now < session.updatedAt - 30000) return false;
  let current;
  try { current = new URL(pageUrl); } catch { return false; }
  if (current.hostname.toLowerCase() !== session.host) return false;
  const challengePath = /^\/cdn-cgi\/challenge-platform\//i.test(current.pathname);
  const originalUrl = session.urls.find((url) => sameBatchThread(url, pageUrl))
    || (challengePath && session.urls.find((url) => sameBatchThread(url, document.referrer)))
    || (challengePath ? session.urls.at(-1) : null);
  if (!originalUrl) return false;
  write(BATCH_CF_EVENT_KEY, {
    sessionId: session.id, url: originalUrl, challengeUrl: pageUrl, detectedAt: now,
  });
  return true;
}

export function watchBatchCloudflareChallenge(
  document = globalThis.document,
  pageUrl = globalThis.location?.href,
  read = globalThis.GM_getValue,
  write = globalThis.GM_setValue
) {
  if (!document || typeof read !== 'function' || typeof write !== 'function') return;
  const session = read(BATCH_CF_SESSION_KEY, null);
  if (!session?.id || !Array.isArray(session.urls)) return;
  let done = false;
  let observer = null;
  let timeoutId = null;
  const check = () => {
    if (done || !reportBatchCloudflareChallenge(document, pageUrl, read, write)) return;
    done = true;
    observer?.disconnect();
    if (timeoutId !== null) document.defaultView?.clearTimeout(timeoutId);
  };
  check();
  if (done) return;
  const View = document.defaultView;
  if (!View?.MutationObserver || !document.documentElement) return;
  observer = new View.MutationObserver(check);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  timeoutId = View.setTimeout(() => {
    done = true;
    observer.disconnect();
  }, 15000);
}
