// Reuse JavClub's own bottom pagination so the copied links, active page,
// styling and site-controlled page counts remain identical to the original.
export const JAVCLUB_TOP_PAGINATION_ENABLED_KEY = 'x1080x-ex:javclub-top-pagination-enabled';
export const JAVCLUB_TOP_PAGINATION_ID = 'x1080x-ex-javclub-top-pagination';

export function isJavclubTopPaginationEnabled() {
  if (typeof GM_getValue !== 'function') return true;
  return GM_getValue(JAVCLUB_TOP_PAGINATION_ENABLED_KEY, true) !== false;
}

export function installJavclubTopPagination(
  document = globalThis.document,
  locationObject = document?.defaultView?.location
) {
  if (!document) return false;
  const existing = document.getElementById(JAVCLUB_TOP_PAGINATION_ID);
  const host = String(locationObject?.hostname || '').toLowerCase();
  const isJavclub = ['javclub.me', 'hdblog.me'].some(domain => (
    host === domain || host.endsWith('.' + domain)
  ));
  if (!isJavclub || !isJavclubTopPaginationEnabled()) {
    existing?.remove();
    return false;
  }

  // Archive, category, tag, search and homepage listings use direct article
  // children. A single-article page must never gain the copied pagination.
  const main = document.querySelector('main#genesis-content');
  const firstArticle = main?.querySelector(':scope > article.entry');
  const bottom = main?.querySelector(':scope > .archive-pagination.pagination:not(#' + JAVCLUB_TOP_PAGINATION_ID + ')');
  if (!firstArticle || !bottom?.querySelector('a[href]')) {
    existing?.remove();
    return false;
  }
  if (existing) return false;

  const top = bottom.cloneNode(true);
  top.id = JAVCLUB_TOP_PAGINATION_ID;
  top.setAttribute('aria-label', '顶部翻页');
  // Do not duplicate element identifiers used by site scripts or styles.
  top.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  top.style.marginTop = '0';
  top.style.marginBottom = '16px';
  firstArticle.before(top);
  return true;
}
