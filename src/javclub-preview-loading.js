// JavClub article Preview has its own settings. The x1080x -> JavClub lookup
// keeps using its existing, independent controls.
export const JAVCLUB_PREVIEW_TIMEOUT_KEY = 'x1080x-ex:javclub-preview-request-timeout-ms';
export const JAVCLUB_PREVIEW_RETRIES_KEY = 'x1080x-ex:javclub-preview-retry-count';
export const DEFAULT_JAVCLUB_PREVIEW_TIMEOUT_MS = 30000;
export const DEFAULT_JAVCLUB_PREVIEW_RETRIES = 2;

export function getJavclubPreviewLoadingSettings() {
  const read = typeof GM_getValue === 'function'
    ? GM_getValue
    : (_key, fallback) => fallback;
  const timeoutMs = Number(read(JAVCLUB_PREVIEW_TIMEOUT_KEY, DEFAULT_JAVCLUB_PREVIEW_TIMEOUT_MS));
  const retryCount = Number(read(JAVCLUB_PREVIEW_RETRIES_KEY, DEFAULT_JAVCLUB_PREVIEW_RETRIES));
  return {
    timeoutMs: Number.isInteger(timeoutMs) && timeoutMs >= 3000 && timeoutMs <= 120000
      ? timeoutMs : DEFAULT_JAVCLUB_PREVIEW_TIMEOUT_MS,
    retryCount: Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= 5
      ? retryCount : DEFAULT_JAVCLUB_PREVIEW_RETRIES,
  };
}

// Retry only transient failures. A missing/removed Pixhost image (404/410),
// invalid redirect or clearly absent Preview must never be requested repeatedly.
export async function retryJavclubPreviewRequest(operation, retryCount = 0) {
  const maxRetries = Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= 5
    ? retryCount : 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = Number(error?.status || 0);
      const retryable = error?.retryable === true || status >= 500;
      if (!retryable || attempt >= maxRetries) throw error;
    }
  }
}
