// Keep one independent storage key per opened thread. A shared recent-history
// array is only a cache: simultaneous tabs can overwrite each other's snapshots.
export const HISTORY_LEDGER_PREFIX = 'x1080x-ex:visited-id-v3:';
export const HISTORY_LEDGER_REVISION_KEY = 'x1080x-ex:visited-id-v3-revision';

export function durableVisitMarkerKey(value) {
  if (typeof value !== 'string') return '';
  const valid = /^(?:resource:[a-z0-9]+|tid:\d+|post:\d+)$/i.test(value)
    || /^url:\/[^\r\n]{1,500}$/.test(value);
  return valid ? HISTORY_LEDGER_PREFIX + value : '';
}

export function listedDurableVisitIds(keys) {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys
    .filter((key) => typeof key === 'string' && key.startsWith(HISTORY_LEDGER_PREFIX))
    .map((key) => key.slice(HISTORY_LEDGER_PREFIX.length))
    .filter((id) => durableVisitMarkerKey(id)))];
}

/** Some earlier backups stored the recent-history array as JSON text. */
export function readRecentHistoryArray(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
}

/** Canonical WordPress post ID shared by JavClub list and detail pages.
 * Support old HDblog permalinks as well as WordPress ?p=ID links.
 * The URL's host must be checked by the caller before treating it as a visit.
 */
export function wordpressPostIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
    const path = url.pathname;
    const match = path.match(/^\/(\d+)(?:\.html)?\/?$/i)
      || path.match(/^\/(\d+)\/[^/]+\/?$/i);
    if (match) return match[1];
    const queryId = /^\/$/.test(path) ? url.searchParams.get('p') : null;
    return queryId && /^\d+$/.test(queryId) ? queryId : '';
  } catch {
    return '';
  }
}
