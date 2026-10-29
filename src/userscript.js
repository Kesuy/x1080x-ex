import {
  buildDownloadJobs,
  collectForumThreadLinks,
  getThreadHeadingText,
  isAllowedHost,
  parseDomainList,
} from './core.js';
import { resolvePixhostShowUrl } from './pixhost.js';
import {
  AGAGHHH_PRIMARY_DOMAIN_KEY,
  DEFAULT_AGAGHHH_PRIMARY_DOMAIN,
  LEGACY_AGAGHHH_DOMAIN,
  getAgaghhhDomains,
  getAgaghhhPrimaryDomain,
  isAgaghhhHost,
  parseAgaghhhPrimaryDomain,
  toAgaghhhPrimaryUrl,
} from './site-domains.js';
import {
  firstBatchListPageUrl,
  nextBatchListPageUrl as nextListPageUrl,
  scanBatchProgressPages,
} from './batch-progress-locator.js';
import { requestTorrentBytes } from './torrent.js';
import {
  collectModernNativeAttachments,
  requestModernNativeAttachmentDownload,
} from './modern-attachments.js';
import {
  AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY,
  beginDownloadGuard,
  isDownloadGuardEnabled,
} from './download-guard.js';
import { makePreviewGestureFriendly } from './preview-gesture.js';
import {
  extractLegacyHistoryAliases,
  historyAliasesForTitle,
  legacyThreadUrl,
  legacyTidFromHistoryValue,
} from './history-migration.js';
import { alternateImageUrls } from './image-fallbacks.js';

const STORAGE_KEY = 'x1080x-ex:domains';
const HDBLOG_EXPAND_PREVIEW_IMAGES_KEY = 'x1080x-ex:hdblog-expand-preview-images';
const AGAGHHH_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:agaghhh-batch-open-enabled';
const AGAGHHH_DOWNLOAD_ENABLED_KEY = 'x1080x-ex:agaghhh-download-enabled';
const HDBLOG_BATCH_OPEN_ENABLED_KEY = 'x1080x-ex:hdblog-batch-open-enabled';
const AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY = 'x1080x-ex:agaghhh-batch-open-interval-min-ms';
const AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY = 'x1080x-ex:agaghhh-batch-open-interval-max-ms';
const AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY = 'x1080x-ex:agaghhh-batch-open-history-enabled';
const AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY = 'x1080x-ex:agaghhh-batch-open-history-limit';
const AGAGHHH_BATCH_OPEN_HISTORY_KEY = 'x1080x-ex:agaghhh-batch-open-history';
// Separate new /resources IDs from legacy Discuz TIDs so the existing
// pre-redesign history can never be truncated by new visits.
const MODERN_RESOURCE_HISTORY_KEY = 'x1080x-ex:1080xin-resource-history';
const AGAGHHH_HISTORY_ALIASES_KEY = 'x1080x-ex:agaghhh-history-title-aliases';
const AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY = 'x1080x-ex:agaghhh-legacy-history-migration-v1';
const LEGACY_HISTORY_AUTO_MIGRATION_LIMIT = 100;
const LEGACY_HISTORY_MANUAL_MIGRATION_LIMIT = 5000;
let legacyHistoryMigrationInProgress = false;
let legacyHistoryMigrationStartedThisPage = false;
const AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY = 'x1080x-ex:agaghhh-batch-open-history-color';
const AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY = 'x1080x-ex:agaghhh-batch-open-unopened-only';
const AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY = 'x1080x-ex:agaghhh-batch-progress-locator-enabled';
const AGAGHHH_BATCH_PROGRESS_MAP_KEY = 'x1080x-ex:agaghhh-batch-progress-map';
const HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY = 'x1080x-ex:hdblog-batch-open-history-enabled';
const HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY = 'x1080x-ex:hdblog-batch-open-history-limit';
const HDBLOG_BATCH_OPEN_HISTORY_KEY = 'x1080x-ex:hdblog-batch-open-history';
const HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY = 'x1080x-ex:hdblog-batch-open-history-color';
const HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY = 'x1080x-ex:hdblog-batch-open-unopened-only';
const HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY = 'x1080x-ex:hdblog-batch-progress-locator-enabled';
const HDBLOG_BATCH_PROGRESS_MAP_KEY = 'x1080x-ex:hdblog-batch-progress-map';
const DEFAULT_BATCH_OPEN_HISTORY_LIMIT = 5000;
const DEFAULT_BATCH_OPEN_HISTORY_COLOR = '#bd10e0';
const BATCH_OPEN_HISTORY_ATTR = 'data-x1080x-batch-opened';
const BATCH_OPEN_HISTORY_STYLE_ID = 'x1080x-ex-batch-open-history-style';
const HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY = 'x1080x-ex:hdblog-batch-open-interval-min-ms';
const HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY = 'x1080x-ex:hdblog-batch-open-interval-max-ms';
const DEFAULT_DOMAINS = '1080xin.com\nagaghhh.cc\nhdblog.me\nfc2cmadb.com';
const BUTTON_ID = 'x1080x-ex-download';
const BATCH_BUTTON_ID = 'x1080x-ex-open-page';
const BATCH_PROGRESS_BUTTON_ID = 'x1080x-ex-batch-progress-locator';
const BATCH_TOOLBAR_ID = 'x1080x-ex-open-page-toolbar';
const REQUEST_TIMEOUT = 60000;
const PIXHOST_PLACEHOLDER_MAX_BYTES = 32 * 1024;
const PREVIEW_IMAGE_URL_ATTR = 'data-x1080x-hdblog-preview-url';
const PREVIEW_REFERER_ATTR = 'data-x1080x-preview-referer';
const DEFAULT_OPEN_TIMING = Object.freeze({
  initialMin: 300,
  initialMax: 800,
  delayMin: 1800,
  delayMax: 3500,
  pauseEvery: 8,
  pauseMin: 6000,
  pauseMax: 10000,
});
const HDBLOG_OPEN_TIMING = Object.freeze({
  initialMin: 150,
  initialMax: 400,
  delayMin: 800,
  delayMax: 1600,
  pauseEvery: 10,
  pauseMin: 3000,
  pauseMax: 5000,
});
let batchOpenState = null;
let batchProgressScanState = null;

function getConfiguredDomains() {
  const stored = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, null) : null;
  const domains = stored === null || stored === undefined
    ? parseDomainList(DEFAULT_DOMAINS)
    : parseDomainList(stored);
  const isLegacyDefault = (domains.length === 1 && domains[0] === LEGACY_AGAGHHH_DOMAIN)
    || (domains.length === 2 && domains.includes(LEGACY_AGAGHHH_DOMAIN) && domains.includes('hdblog.me'));
  return [...new Set([
    ...(isLegacyDefault ? parseDomainList(DEFAULT_DOMAINS) : domains),
    ...getAgaghhhDomains(),
  ])];
}

function saveDomains(domains) {
  GM_setValue(STORAGE_KEY, domains.join('\n'));
}

function registerSettingsMenu() {
  if (window.top !== window.self) return;
  GM_registerMenuCommand('🌐 设置 x1080x 站点域名', () => {
    const input = window.prompt(
      '请输入 x1080x 站点当前使用的域名（如 1080xin.com）。跨站搜索及浏览进度链接将使用该地址，旧域名仍可识别：',
      getAgaghhhPrimaryDomain()
    );
    if (input === null) return;
    const domain = parseAgaghhhPrimaryDomain(input);
    if (!domain) {
      window.alert('请输入有效的站点域名，例如 1080xin.com');
      return;
    }
    GM_setValue(AGAGHHH_PRIMARY_DOMAIN_KEY, domain);
    window.alert(`x1080x 站点域名已保存：${domain}\n刷新页面后生效。原有浏览记录将继续保留。`);
  });
  GM_registerMenuCommand('⚙️ 设置匹配域名', () => {
    const current = getConfiguredDomains().join('\n');
    const input = window.prompt(
      '请输入允许脚本运行的域名，可用逗号、空格或换行分隔。也可以粘贴完整网址：',
      current
    );
    if (input === null) return;
    const domains = parseDomainList(input);
    if (!domains.length) {
      window.alert('至少需要保留一个有效域名。');
      return;
    }
    saveDomains(domains);
    window.alert(`已保存：\n${domains.join('\n')}\n\n刷新页面后生效。`);
  });

  GM_registerMenuCommand('➕ 添加当前域名', () => {
    const domains = getConfiguredDomains();
    if (!isAllowedHost(location.hostname, domains)) {
      domains.push(location.hostname.toLowerCase());
      saveDomains(domains);
    }
    window.alert(`已添加 ${location.hostname}，刷新页面后生效。`);
  });

  GM_registerMenuCommand('↩️ 重置默认域名', () => {
    saveDomains(parseDomainList(DEFAULT_DOMAINS));
    GM_setValue(AGAGHHH_PRIMARY_DOMAIN_KEY, DEFAULT_AGAGHHH_PRIMARY_DOMAIN);
    window.alert(`已恢复默认域名：${DEFAULT_DOMAINS}`);
  });
  GM_registerMenuCommand('↪️ 迁移旧版 x1080x 浏览记录到新版', () => {
    const legacy = typeof GM_getValue === 'function'
      ? GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, [])
      : [];
    const total = Array.isArray(legacy)
      ? new Set(legacy.map(legacyTidFromHistoryValue).filter(Boolean)).size
      : 0;
    if (!total) {
      window.alert('没有找到旧版数字 TID 浏览记录。');
      return;
    }
    if (!window.confirm(`发现约 ${total} 条旧版记录。脚本将逐条读取旧帖标题，按番号/标题匹配新版资源；这可能需要几分钟，不会删除旧记录。是否开始完整迁移？`)) return;
    void migrateLegacyHistory({ limit: LEGACY_HISTORY_MANUAL_MIGRATION_LIMIT, force: true })
      .then((result) => {
        if (isBatchOpenPage()) applyBatchOpenHistory(document);
        window.alert(`旧版历史迁移完成。\n本次检查：${result.checked} 条\n新增匹配：${result.matched} 条\n剩余未解析：${result.unresolved} 条\n旧记录未删除。`);
      })
      .catch((error) => window.alert(`迁移失败：${error?.message || error}`));
  });
}

function currentHost() {
  return String(location.hostname || '').toLowerCase().replace(/\.$/, '');
}

function isBatchOpenEnabledForCurrentHost() {
  if (typeof GM_getValue !== 'function') return true;
  const host = currentHost();
  if (isAgaghhhHost(host)) {
    return GM_getValue(AGAGHHH_BATCH_OPEN_ENABLED_KEY, true) !== false;
  }
  if (host === 'hdblog.me' || host.endsWith('.hdblog.me')) {
    return GM_getValue(HDBLOG_BATCH_OPEN_ENABLED_KEY, true) !== false;
  }
  return true;
}

function batchOpenHistoryConfig() {
  const host = currentHost();
  if (isAgaghhhHost(host)) {
    const modern = host !== LEGACY_AGAGHHH_DOMAIN
      && !/^\/(?:forum|search)\.php$/i.test(location.pathname);
    return {
      enabledKey: AGAGHHH_BATCH_OPEN_HISTORY_ENABLED_KEY,
      limitKey: AGAGHHH_BATCH_OPEN_HISTORY_LIMIT_KEY,
      historyKey: modern ? MODERN_RESOURCE_HISTORY_KEY : AGAGHHH_BATCH_OPEN_HISTORY_KEY,
      modern,
      colorKey: AGAGHHH_BATCH_OPEN_HISTORY_COLOR_KEY,
      unopenedOnlyKey: AGAGHHH_BATCH_OPEN_UNOPENED_ONLY_KEY,
      progressLocatorEnabledKey: AGAGHHH_BATCH_PROGRESS_LOCATOR_ENABLED_KEY,
      progressMapKey: AGAGHHH_BATCH_PROGRESS_MAP_KEY,
      kind: 'agaghhh',
    };
  }
  if (host === 'hdblog.me' || host.endsWith('.hdblog.me')) {
    return {
      enabledKey: HDBLOG_BATCH_OPEN_HISTORY_ENABLED_KEY,
      limitKey: HDBLOG_BATCH_OPEN_HISTORY_LIMIT_KEY,
      historyKey: HDBLOG_BATCH_OPEN_HISTORY_KEY,
      colorKey: HDBLOG_BATCH_OPEN_HISTORY_COLOR_KEY,
      unopenedOnlyKey: HDBLOG_BATCH_OPEN_UNOPENED_ONLY_KEY,
      progressLocatorEnabledKey: HDBLOG_BATCH_PROGRESS_LOCATOR_ENABLED_KEY,
      progressMapKey: HDBLOG_BATCH_PROGRESS_MAP_KEY,
      kind: 'hdblog',
    };
  }
  return null;
}

function isBatchOpenHistoryEnabled() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function') return false;
  return GM_getValue(config.enabledKey, false) === true;
}

function isBatchOpenUnopenedOnlyEnabled() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function' || !isBatchOpenHistoryEnabled()) return false;
  return GM_getValue(config.unopenedOnlyKey, false) === true;
}

function isBatchProgressLocatorEnabled() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function' || !isBatchOpenHistoryEnabled()) return false;
  return GM_getValue(config.progressLocatorEnabledKey, true) !== false;
}

function batchOpenHistoryLimit() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function') return DEFAULT_BATCH_OPEN_HISTORY_LIMIT;
  const numeric = Number(GM_getValue(config.limitKey, DEFAULT_BATCH_OPEN_HISTORY_LIMIT));
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 50000
    ? numeric
    : DEFAULT_BATCH_OPEN_HISTORY_LIMIT;
}

function batchOpenHistoryColor() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function') return DEFAULT_BATCH_OPEN_HISTORY_COLOR;
  const value = String(GM_getValue(config.colorKey, DEFAULT_BATCH_OPEN_HISTORY_COLOR) || '').trim();
  return /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_BATCH_OPEN_HISTORY_COLOR;
}

function batchOpenHistoryId(value) {
  const config = batchOpenHistoryConfig();
  if (!config) return '';
  try {
    const url = new URL(value, location.href);
    if (config.kind === 'agaghhh') {
      const resourceId = url.pathname.match(/^\/resources\/([a-z0-9]+)\/?$/i)?.[1];
      if (resourceId) return `resource:${resourceId}`;
      const queryTid = url.searchParams.get('mod') === 'viewthread'
        ? url.searchParams.get('tid')
        : '';
      if (queryTid && /^\d+$/.test(queryTid)) return `tid:${queryTid}`;
      const pathMatch = url.pathname.match(/(?:thread|viewthread)[-_](\d+)/i);
      return pathMatch ? `tid:${pathMatch[1]}` : '';
    }
    const postMatch = url.pathname.match(/^\/(\d+)(?:\/|$)/);
    if (postMatch) return `post:${postMatch[1]}`;
    return `url:${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}

function batchThreadHistoryKeys(thread) {
  if (!thread) return [];
  const id = batchOpenHistoryId(thread.url);
  const title = thread.link?.getAttribute('title') || thread.link?.textContent || '';
  return [...new Set([id, ...historyAliasesForTitle(title)].filter(Boolean))];
}

function isBatchThreadVisited(thread, history = new Set(readBatchOpenHistory())) {
  return batchThreadHistoryKeys(thread).some((key) => history.has(key));
}

function readBatchOpenHistory() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function') return [];
  const stored = GM_getValue(config.historyKey, []);
  // Previous beta releases temporarily saved modern resource IDs in the old key.
  const legacy = config.modern ? GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, []) : [];
  const aliases = config.kind === 'agaghhh'
    ? GM_getValue(AGAGHHH_HISTORY_ALIASES_KEY, [])
    : [];
  const values = [
    ...(Array.isArray(stored) ? stored : []),
    ...(Array.isArray(legacy) ? legacy.filter((value) => /^resource:[a-z0-9]+$/i.test(value)) : []),
    ...(Array.isArray(aliases) ? aliases : []),
  ];
  return [...new Set(values.filter((value) => (
    typeof value === 'string'
    && (config.modern
      ? (/^resource:[a-z0-9]+$/i.test(value) || /^(?:code|title|number):/i.test(value))
      : (/^(?:tid|post):\d+$/.test(value)
        || /^resource:[a-z0-9]+$/i.test(value)
        || /^url:\//.test(value)
        || /^(?:code|title|number):/i.test(value)))
  )))];
}

function saveHistoryAliases(aliases) {
  if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return 0;
  const existing = GM_getValue(AGAGHHH_HISTORY_ALIASES_KEY, []);
  const merged = [...new Set([
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(aliases) ? aliases : []),
  ].filter((value) => typeof value === 'string'
    && /^(?:code|title|number|resource):/i.test(value)))].slice(-20000);
  GM_setValue(AGAGHHH_HISTORY_ALIASES_KEY, merged);
  return merged.length;
}

function requestLegacyHistoryAliases(tid) {
  return new Promise((resolve) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      resolve([]);
      return;
    }
    const url = legacyThreadUrl(tid);
    if (!url) {
      resolve([]);
      return;
    }
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: 15000,
      onload: (response) => {
        const aliases = response.status >= 200 && response.status < 400
          ? extractLegacyHistoryAliases(
            response.responseText || '',
            document.defaultView?.DOMParser || globalThis.DOMParser
          )
          : [];
        const finalUrl = response.finalUrl || response.responseURL || '';
        try {
          const resourceId = new URL(finalUrl, url).pathname.match(/^\/resources\/([a-z0-9]+)\/?$/i)?.[1];
          if (resourceId) aliases.unshift(`resource:${resourceId}`);
        } catch {
          // The title aliases remain useful even if the final URL is unavailable.
        }
        resolve([...new Set(aliases)]);
      },
      onerror: () => resolve([]),
      ontimeout: () => resolve([]),
    });
  });
}

async function migrateLegacyHistory({ limit = LEGACY_HISTORY_AUTO_MIGRATION_LIMIT, force = false } = {}) {
  if (legacyHistoryMigrationInProgress) {
    return { checked: 0, matched: 0, unresolved: 0, busy: true };
  }
  if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function'
    || typeof GM_xmlhttpRequest !== 'function') {
    return { checked: 0, matched: 0, unresolved: 0, unsupported: true };
  }

  const legacy = GM_getValue(AGAGHHH_BATCH_OPEN_HISTORY_KEY, []);
  const tids = [...new Set((Array.isArray(legacy) ? legacy : [])
    .map(legacyTidFromHistoryValue)
    .filter(Boolean))];
  const state = GM_getValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, {});
  const attemptedAt = state?.attemptedAt && typeof state.attemptedAt === 'object'
    ? { ...state.attemptedAt } : {};
  const resolved = state?.resolved && typeof state.resolved === 'object'
    ? { ...state.resolved } : {};
  const now = Date.now();
  const pending = tids.slice().reverse().filter((tid) => (
    !Array.isArray(resolved[tid])
    && (force || !attemptedAt[tid] || now - Number(attemptedAt[tid]) > 7 * 24 * 60 * 60 * 1000)
  )).slice(0, Math.max(0, Number(limit) || 0));

  if (!pending.length) {
    return {
      checked: 0,
      matched: 0,
      unresolved: tids.filter((tid) => !Array.isArray(resolved[tid])).length,
    };
  }

  legacyHistoryMigrationInProgress = true;
  let matched = 0;
  let aliasesAdded = [];
  try {
    for (let offset = 0; offset < pending.length; offset += 4) {
      const batch = pending.slice(offset, offset + 4);
      const results = await Promise.all(batch.map(async (tid) => ({
        tid,
        aliases: await requestLegacyHistoryAliases(tid),
      })));
      for (const result of results) {
        attemptedAt[result.tid] = Date.now();
        if (result.aliases.length) {
          resolved[result.tid] = result.aliases;
          aliasesAdded.push(...result.aliases);
          matched += 1;
        }
      }
      GM_setValue(AGAGHHH_LEGACY_HISTORY_MIGRATION_KEY, { attemptedAt, resolved });
      if (offset + 4 < pending.length) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      }
    }
    saveHistoryAliases(aliasesAdded);
    return {
      checked: pending.length,
      matched,
      unresolved: tids.filter((tid) => !Array.isArray(resolved[tid])).length,
    };
  } finally {
    legacyHistoryMigrationInProgress = false;
  }
}

function batchProgressScopeKey(value = location.href) {
  const config = batchOpenHistoryConfig();
  if (!config) return '';
  try {
    const url = new URL(value, location.href);
    url.hash = '';
    if (config.kind === 'agaghhh' && /^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname)) {
      url.searchParams.delete('page');
      url.searchParams.delete('view');
      url.searchParams.sort();
      return `https://${LEGACY_AGAGHHH_DOMAIN}${url.pathname}${url.search}`;
    }
    if (config.kind === 'agaghhh') {
      const fid = url.searchParams.get('fid')
        || url.pathname.match(/forum[-_](\d+)(?:[-_]\d+)?(?:\.html)?/i)?.[1]
        || '';
      // Original key namespace preserves saved progress across host changes.
      const legacyOrigin = `https://${LEGACY_AGAGHHH_DOMAIN}`;
      if (fid) return `${legacyOrigin}/forum:${fid}`;
      url.searchParams.delete('page');
      url.searchParams.sort();
      return legacyOrigin + url.pathname + url.search;
    }
    url.searchParams.delete('paged');
    url.pathname = url.pathname.replace(/\/page\/\d+\/?$/i, '/');
    url.searchParams.sort();
    return url.href;
  } catch {
    return '';
  }
}

function readBatchProgressMap() {
  const config = batchOpenHistoryConfig();
  if (!config || typeof GM_getValue !== 'function') return {};
  const stored = GM_getValue(config.progressMapKey, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function batchProgressTarget() {
  const scope = batchProgressScopeKey();
  if (!scope) return '';
  const entry = readBatchProgressMap()[scope];
  if (typeof entry?.url !== 'string') return '';
  return batchOpenHistoryConfig()?.kind === 'agaghhh'
    ? toAgaghhhPrimaryUrl(entry.url)
    : entry.url;
}

function startAutomaticLegacyHistoryMigration() {
  if (legacyHistoryMigrationStartedThisPage
    || !isAgaghhhHost(location)
    || currentHost() === LEGACY_AGAGHHH_DOMAIN
    || !/^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)
    || !isBatchOpenHistoryEnabled()) return;
  legacyHistoryMigrationStartedThisPage = true;
  void migrateLegacyHistory({ limit: LEGACY_HISTORY_AUTO_MIGRATION_LIMIT })
    .then((result) => {
      if (result.matched > 0 && isBatchOpenPage()) applyBatchOpenHistory(document);
    })
    .catch((error) => console.warn('[x1080x-ex] legacy history migration failed', error));
}

function nextBatchListPageUrl(document) {
  return nextListPageUrl(document, document?.baseURI);
}

function rememberBatchProgressTarget(url) {
  const config = batchOpenHistoryConfig();
  const scope = batchProgressScopeKey();
  if (!config || !scope || !url || !isBatchProgressLocatorEnabled() || typeof GM_setValue !== 'function') return false;
  const map = readBatchProgressMap();
  map[scope] = { url, updatedAt: Date.now() };
  const entries = Object.entries(map)
    .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0))
    .slice(0, 100);
  GM_setValue(config.progressMapKey, Object.fromEntries(entries));
  refreshBatchProgressLocatorButton();
  return true;
}

function rememberBatchProgressForCurrentPage(document, completed) {
  const target = completed ? (nextBatchListPageUrl(document) || location.href) : location.href;
  return rememberBatchProgressTarget(target);
}

function inferBatchProgressFromCurrentPage(document) {
  if (!document || !isBatchProgressLocatorEnabled() || batchProgressTarget()) return false;
  const threads = collectForumThreadLinks(document);
  if (!threads.length) return false;
  const history = new Set(readBatchOpenHistory());
  const opened = threads.filter((thread) => isBatchThreadVisited(thread, history)).length;
  if (!opened) return false;
  return rememberBatchProgressTarget(
    opened === threads.length ? (nextBatchListPageUrl(document) || location.href) : location.href
  );
}

function collectBatchOpenThreads(document) {
  const threads = collectForumThreadLinks(document);
  if (!isBatchOpenUnopenedOnlyEnabled()) return threads;
  const history = new Set(readBatchOpenHistory());
  return threads.filter((thread) => !isBatchThreadVisited(thread, history));
}

function rememberBatchOpenedThread(url, titleText = '') {
  const config = batchOpenHistoryConfig();
  if (!config || !isBatchOpenHistoryEnabled() || typeof GM_setValue !== 'function') return false;
  const id = batchOpenHistoryId(url);
  if (!id) return false;
  const stored = GM_getValue(config.historyKey, []);
  const history = (Array.isArray(stored) ? stored : []).filter((item) => item !== id);
  history.push(id);
  GM_setValue(config.historyKey, history.slice(-batchOpenHistoryLimit()));

  let title = titleText;
  try {
    if (!title && new URL(url, location.href).href === location.href) {
      title = getThreadHeadingText(document);
    }
  } catch {
    // The resource/TID ID is still worth saving without a title alias.
  }
  if (config.kind === 'agaghhh') saveHistoryAliases(historyAliasesForTitle(title));
  return true;
}

function applyBatchOpenHistory(document) {
  const config = batchOpenHistoryConfig();
  if (!document || !config) return 0;

  let style = document.getElementById(BATCH_OPEN_HISTORY_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = BATCH_OPEN_HISTORY_STYLE_ID;
    (document.head || document.documentElement).append(style);
  }
  const css = `a:visited, a[${BATCH_OPEN_HISTORY_ATTR}="1"] { color: ${batchOpenHistoryColor()} !important; }
.thread-list .resource-title:visited, .thread-list .resource-title[${BATCH_OPEN_HISTORY_ATTR}="1"],
.thread-list .resource-title:visited *, .thread-list .resource-title[${BATCH_OPEN_HISTORY_ATTR}="1"] * { color: ${batchOpenHistoryColor()} !important; }`;
  if (style.textContent !== css) style.textContent = css;

  document.querySelectorAll(`a[${BATCH_OPEN_HISTORY_ATTR}="1"]`)
    .forEach((link) => link.removeAttribute(BATCH_OPEN_HISTORY_ATTR));

  if (!isBatchOpenHistoryEnabled()) return 0;

  const history = new Set(readBatchOpenHistory());
  let marked = 0;
  collectForumThreadLinks(document).forEach((thread) => {
    if (!isBatchThreadVisited(thread, history)) return;
    thread.link.setAttribute(BATCH_OPEN_HISTORY_ATTR, '1');
    marked += 1;
  });
  return marked;
}

function isThreadPage() {
  const url = new URL(location.href);
  return /^\/resources\/[a-z0-9]+\/?$/i.test(url.pathname)
    || (url.searchParams.get('mod') === 'viewthread' && url.searchParams.has('tid'))
    || /(?:thread|viewthread)[-_]\d+/i.test(url.pathname);
}

function isForumDisplayPage() {
  const url = new URL(location.href);
  return url.searchParams.get('mod') === 'forumdisplay'
    || /forum[-_]\d+/i.test(url.pathname)
    || /^\/boards\/[a-z0-9]+\/?$/i.test(url.pathname);
}

function isBatchOpenPage() {
  return isForumDisplayPage()
    || Boolean(document.querySelector('main#genesis-content article.entry .entry-title a[href]'));
}

function normalizedLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isFollowing(reference, element) {
  return Boolean(reference.compareDocumentPosition(element) & 4);
}

function isHdblogPreviewBoundary(element) {
  if (!element || element.querySelector('img')) return false;
  const text = normalizedLabel(element.textContent);
  return /^(?:downloads?(?: links?)?|links?|magnets?(?: links?)?|torrents?(?: links?)?|password|info(?:rmation)?|下载(?:链接)?|下載(?:連結)?|磁力(?:链接|連結)?|种子|種子|解压密码|解壓密碼)\s*[:：]?$/i.test(text);
}

function largestSrcsetUrl(document, value) {
  const candidates = String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, order) => {
      const [url, descriptor = ''] = part.split(/\s+/, 2);
      const match = descriptor.match(/^(\d+(?:\.\d+)?)(w|x)$/i);
      let score = order;
      if (match) {
        const amount = Number(match[1]);
        score = match[2].toLowerCase() === 'w' ? amount : amount * 100000;
      }
      try {
        return { url: new URL(url, document.baseURI).href, score };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.url || '';
}

function directImageHref(document, anchor) {
  const href = anchor?.getAttribute('href');
  if (!href) return '';
  try {
    const url = new URL(href, document.baseURI);
    if (!/^https?:$/.test(url.protocol)) return '';
    return /\.(?:jpe?g|png|webp|gif|avif)$/i.test(url.pathname) ? url.href : '';
  } catch {
    return '';
  }
}

function hdblogPreviewImageUrl(document, image, forcedUrl = '') {
  const anchor = image.closest('a[href]');
  const candidates = [
    forcedUrl,
    directImageHref(document, anchor),
    image.getAttribute('data-original'),
    image.getAttribute('data-lazy-src'),
    image.getAttribute('data-src'),
    largestSrcsetUrl(document, image.getAttribute('data-srcset')),
    largestSrcsetUrl(document, image.getAttribute('srcset')),
    image.currentSrc,
    image.getAttribute('src'),
  ];
  for (const candidate of candidates) {
    if (!candidate || /^(?:data:|blob:|javascript:)/i.test(candidate)) continue;
    try {
      const url = new URL(candidate, document.baseURI);
      if (/^https?:$/.test(url.protocol)) return url.href;
    } catch {
      // Ignore malformed lazy-load attributes and keep trying fallbacks.
    }
  }
  return '';
}

function styleHdblogPreviewImage(image, fullUrl) {
  if (!fullUrl) return false;
  image.src = fullUrl;
  [
    'srcset', 'sizes', 'width', 'height',
    'data-original', 'data-lazy-src', 'data-src', 'data-srcset', 'data-lazy-srcset',
  ].forEach((attribute) => image.removeAttribute(attribute));
  image.loading = 'eager';
  image.dataset.x1080xPreviewExpanded = '1';
  image.style.setProperty('display', 'block', 'important');
  image.style.setProperty('width', '100%', 'important');
  image.style.setProperty('max-width', '100%', 'important');
  image.style.setProperty('height', 'auto', 'important');
  image.style.setProperty('max-height', 'none', 'important');
  image.style.setProperty('object-fit', 'contain', 'important');
  image.style.setProperty('margin', '12px auto', 'important');
  makePreviewGestureFriendly(image);
  return true;
}

function expandHdblogPreviewImages() {
  if (!isAllowedHost(location.hostname, ['hdblog.me'])) return 0;
  const content = document.querySelector(
    'main#genesis-content article.entry .entry-content, article.entry .entry-content, .entry-content'
  );
  if (!content) return 0;

  const markers = [...content.querySelectorAll('p, strong, b, h1, h2, h3, h4, h5, h6')];
  const marker = markers.find((element) => /^preview\s*[:：]?$/i.test(normalizedLabel(element.textContent)));
  if (!marker) return 0;

  const boundary = markers.find((element) => isFollowing(marker, element) && isHdblogPreviewBoundary(element));
  const isInPreviewRange = (element) => (
    isFollowing(marker, element)
    && (!boundary || !isFollowing(boundary, element))
  );

  let expanded = 0;
  const handledImages = new Set();
  const anchors = [...content.querySelectorAll('a[href]')].filter(isInPreviewRange);
  anchors.forEach((anchor) => {
    const fullUrl = directImageHref(document, anchor);
    if (!fullUrl) return;
    let image = anchor.querySelector('img');
    if (!image) {
      image = document.createElement('img');
      image.alt = normalizedLabel(anchor.textContent) || 'Preview';
      anchor.replaceChildren(image);
    }
    if (styleHdblogPreviewImage(image, fullUrl)) {
      anchor.href = fullUrl;
      anchor.style.setProperty('display', 'block', 'important');
      anchor.style.setProperty('max-width', '100%', 'important');
      handledImages.add(image);
      expanded += 1;
    }
  });

  [...content.querySelectorAll('img')]
    .filter((image) => isInPreviewRange(image) && !handledImages.has(image))
    .forEach((image) => {
      const fullUrl = hdblogPreviewImageUrl(document, image);
      if (!styleHdblogPreviewImage(image, fullUrl)) return;
      const anchor = image.closest('a[href]');
      if (anchor && content.contains(anchor)) {
        const directUrl = directImageHref(document, anchor);
        if (directUrl) anchor.href = directUrl;
        anchor.style.setProperty('display', 'block', 'important');
        anchor.style.setProperty('max-width', '100%', 'important');
      }
      expanded += 1;
    });

  return expanded;
}

function readBatchOpenIntervalMs(key, fallback) {
  if (typeof GM_getValue !== 'function') return fallback;
  const numeric = Number(GM_getValue(key, fallback));
  return Number.isFinite(numeric) && numeric >= 100 && numeric <= 600000
    ? Math.round(numeric)
    : fallback;
}

function batchOpenTiming() {
  const isHdblog = isAllowedHost(location.hostname, ['hdblog.me']);
  const timing = isHdblog ? HDBLOG_OPEN_TIMING : DEFAULT_OPEN_TIMING;
  const minKey = isHdblog ? HDBLOG_BATCH_OPEN_INTERVAL_MIN_KEY : AGAGHHH_BATCH_OPEN_INTERVAL_MIN_KEY;
  const maxKey = isHdblog ? HDBLOG_BATCH_OPEN_INTERVAL_MAX_KEY : AGAGHHH_BATCH_OPEN_INTERVAL_MAX_KEY;
  const delayMin = readBatchOpenIntervalMs(minKey, timing.delayMin);
  const delayMax = readBatchOpenIntervalMs(maxKey, timing.delayMax);
  if (delayMax < delayMin) return timing;
  return { ...timing, delayMin, delayMax };
}

function randomDelay(minimum, maximum) {
  return Math.round(minimum + Math.random() * (maximum - minimum));
}

function waitForBatchDelay(milliseconds, state) {
  return new Promise((resolve) => {
    state.finishDelay = resolve;
    state.timeoutId = window.setTimeout(() => {
      state.timeoutId = null;
      state.finishDelay = null;
      resolve();
    }, milliseconds);
  });
}

function cancelBatchOpen() {
  if (!batchOpenState) return;
  batchOpenState.cancelled = true;
  if (batchOpenState.timeoutId !== null) {
    window.clearTimeout(batchOpenState.timeoutId);
    batchOpenState.timeoutId = null;
  }
  batchOpenState.finishDelay?.();
  batchOpenState.finishDelay = null;
}

function setBatchButtonIdle(button, count) {
  const unopenedOnly = isBatchOpenUnopenedOnlyEnabled();
  const label = unopenedOnly
    ? `后台顺序打开未打开主题（${count}）`
    : `后台顺序打开本页主题（${count}）`;
  if (button.textContent !== label) button.textContent = label;
  button.title = unopenedOnly
    ? '按页面顺序仅后台打开未记录为已打开的主题；间隔随机，并定期停顿；再次点击可停止'
    : '按页面顺序在后台逐个打开普通主题；间隔随机，并定期停顿；再次点击可停止';
  button.style.background = '#398bd4';
}

async function openCurrentPageThreads(button) {
  if (batchOpenState) {
    cancelBatchOpen();
    return;
  }

  const threads = collectBatchOpenThreads(document);
  if (!threads.length) {
    window.alert(isBatchOpenUnopenedOnlyEnabled()
      ? '当前页面没有未打开的主题。'
      : '当前页面没有找到可打开的普通主题。');
    return;
  }

  const state = {
    cancelled: false,
    finishDelay: null,
    timeoutId: null,
  };
  batchOpenState = state;
  rememberBatchProgressForCurrentPage(document, false);
  const failures = [];
  let opened = 0;
  const timing = batchOpenTiming();
  const endBatchOpenGuard = beginDownloadGuard(document, {
    enabled: true,
    label: '↗ 批量打开中',
  });
  button.style.background = '#b84b4b';

  try {
    await waitForBatchDelay(randomDelay(timing.initialMin, timing.initialMax), state);
    for (const [index, thread] of threads.entries()) {
      if (state.cancelled) break;

      button.textContent = `停止后台打开（${opened}/${threads.length}）`;
      try {
        GM_openInTab(thread.url, {
          active: false,
          insert: false,
          setParent: true,
        });
        if (rememberBatchOpenedThread(thread.url, thread.link?.textContent || '')) applyBatchOpenHistory(document);
        opened += 1;
      } catch (error) {
        failures.push(`${index + 1}. ${redactDiagnostic(error?.message || error || '打开失败')}`);
      }

      if (index === threads.length - 1 || state.cancelled) break;
      const completedCount = index + 1;
      const isLongPause = completedCount % timing.pauseEvery === 0;
      const delay = isLongPause
        ? randomDelay(timing.pauseMin, timing.pauseMax)
        : randomDelay(timing.delayMin, timing.delayMax);
      button.textContent = `${isLongPause ? '停顿' : '等待'} ${Math.ceil(delay / 1000)} 秒（${opened}/${threads.length}）`;
      await waitForBatchDelay(delay, state);
    }
  } finally {
    endBatchOpenGuard();
    const wasCancelled = state.cancelled;
    const completedPage = !wasCancelled && failures.length === 0 && opened === threads.length;
    rememberBatchProgressForCurrentPage(document, completedPage);
    batchOpenState = null;
    button.textContent = wasCancelled
      ? `已停止（已打开 ${opened}/${threads.length}）`
      : failures.length
        ? `完成（打开 ${opened}，失败 ${failures.length}）`
        : `✓ 已按顺序打开 ${opened} 个主题`;
    button.style.background = failures.length ? '#b36b22' : '#398bd4';
    window.setTimeout(() => {
      if (!batchOpenState) {
        setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
      }
    }, 3000);
  }

  if (failures.length) {
    window.alert(`以下主题打开失败：\n\n${failures.join('\n')}`);
  }
}

function parseResponseHeaders(value) {
  const headers = new Map();
  String(value ?? '').split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator <= 0) return;
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  });
  return headers;
}

function redactDiagnostic(value) {
  return String(value ?? '')
    .replace(/((?:cookie|authorization|token|auth|sid)=)[^;\s&]+/gi, '$1[已脱敏]')
    .replace(/([?&](?:token|auth|sid|key)=)[^&#\s]+/gi, '$1[已脱敏]');
}

function safeErrorDetails(error) {
  if (!error || typeof error !== 'object') {
    return { error: redactDiagnostic(error || 'unknown_error'), details: '' };
  }
  const details = Object.fromEntries(
    Object.entries(error)
      .filter(([key]) => !/(?:cookie|authorization|requestHeaders)/i.test(key))
      .map(([key, value]) => [
        key,
        typeof value === 'object' ? redactDiagnostic(JSON.stringify(value)) : redactDiagnostic(value),
      ])
  );
  if (error.name && !details.name) details.name = redactDiagnostic(error.name);
  if (error.message && !details.message) details.message = redactDiagnostic(error.message);
  return details;
}

function finalUrlType(finalUrl) {
  try {
    return new URL(finalUrl, location.href).origin === location.origin ? '同站地址' : '跨站地址';
  } catch {
    return '未知地址';
  }
}

function responseFailure(response, reason) {
  const finalUrl = response.finalUrl || response.responseURL || location.href;
  const headers = parseResponseHeaders(response.responseHeaders);
  const contentType = headers.get('content-type') || response.response?.type || '未知类型';
  return new Error(
    `HTTP ${response.status || 0}；最终地址：${finalUrlType(finalUrl)} ${redactDiagnostic(finalUrl)}；`
    + `Content-Type：${contentType}；原因：${reason}`
  );
}

async function blobPrefix(blob) {
  const prefix = blob.slice(0, 1024);
  if (typeof prefix.text === 'function') return prefix.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(prefix);
  });
}

async function validateResponse(response) {
  if (response.status < 200 || response.status >= 300) {
    throw responseFailure(response, '服务器没有返回成功状态，请确认登录、附件权限和帖子是否仍可访问');
  }
  const blob = response.response;
  if (!blob || typeof blob.size !== 'number' || typeof blob.slice !== 'function') {
    throw responseFailure(response, '响应不是可保存的二进制 Blob');
  }

  const headers = parseResponseHeaders(response.responseHeaders);
  const contentType = headers.get('content-type') || blob.type || '';
  const prefix = await blobPrefix(blob);
  const looksLikeHtml = /text\/html|application\/xhtml\+xml/i.test(contentType)
    || /^\s*(?:<!doctype\s+html|<html\b)/i.test(prefix);
  if (looksLikeHtml) {
    let reason = '服务器返回 HTML 页面，未保存，避免把登录页或错误页伪装成附件';
    if (/(?:login|登录|登錄|請先登入|请先登录)/i.test(prefix)) {
      reason = '服务器返回登录页，请刷新帖子并确认 Tampermonkey 请求携带当前登录状态';
    } else if (/(?:permission|权限|權限|无权|無權|附件不存在|附件不存在)/i.test(prefix)) {
      reason = '服务器返回权限或附件错误页，请确认账号有下载权限且附件仍存在';
    } else if (/(?:cloudflare|cf-chl|captcha|验证|驗證)/i.test(prefix)) {
      reason = '服务器返回浏览器验证页，请先在当前页面完成验证后重试';
    }
    throw responseFailure(response, reason);
  }
  if (blob.size === 0) throw responseFailure(response, '响应大小为 0，未保存空文件');

  return {
    blob,
    status: response.status,
    finalUrl: response.finalUrl || response.responseURL || location.href,
    contentType: contentType || 'application/octet-stream',
  };
}

async function requestBlobWithPageFetch(job) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await window.fetch(job.url, {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      signal: controller.signal,
    });
    const blob = await response.blob();
    const responseHeaders = [];
    response.headers.forEach((value, key) => responseHeaders.push(`${key}: ${value}`));
    return validateResponse({
      status: response.status,
      finalUrl: response.url,
      responseHeaders: responseHeaders.join('\r\n'),
      response: blob,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`网络请求超时（${REQUEST_TIMEOUT / 1000} 秒）`);
    }
    const details = safeErrorDetails(error);
    console.error('[x1080x-ex] page fetch failed', details);
    throw new Error(
      `页面同源请求失败：error=${details.name || details.error || 'fetch_failed'}；`
      + `details=${details.message || details.details || '无详细信息'}`
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function previewRefererForJob(job) {
  if (job.kind !== 'image') return '';
  let target = '';
  try {
    target = new URL(job.url, location.href).href;
  } catch {
    return '';
  }
  const image = [...document.querySelectorAll(`img[${PREVIEW_IMAGE_URL_ATTR}]`)]
    .find((candidate) => {
      try {
        return new URL(candidate.getAttribute(PREVIEW_IMAGE_URL_ATTR), location.href).href === target;
      } catch {
        return false;
      }
    });
  if (!image) return '';
  return image.getAttribute(PREVIEW_REFERER_ATTR)
    || image.closest('section')?.querySelector('a[href]')?.href
    || '';
}

function requestBlobWithGmXhrOnce(job, referer) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: job.url,
      responseType: 'blob',
      timeout: REQUEST_TIMEOUT,
      ...(referer ? { headers: { Referer: referer } } : {}),
      onload: (response) => {
        validateResponse(response).then(resolve, reject);
      },
      onerror: (error) => {
        const details = safeErrorDetails(error);
        reject(new Error(
          `网络请求失败：error=${details.error || 'unknown_error'}；`
          + `details=${details.details || details.message || '无详细信息'}`
        ));
      },
      ontimeout: () => reject(new Error(`网络请求超时（${REQUEST_TIMEOUT / 1000} 秒）`)),
    });
  });
}

async function requestBlobWithGmXhr(job) {
  const sourceReferer = previewRefererForJob(job);
  const referers = sourceReferer
    ? [sourceReferer, '', location.href]
    : [location.href, ''];
  let lastError = null;
  for (const referer of [...new Set(referers)]) {
    try {
      return await requestBlobWithGmXhrOnce(job, referer);
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[x1080x-ex] GM_xmlhttpRequest failed after referer retries', safeErrorDetails(lastError));
  throw lastError || new Error('网络请求失败');
}

function requestBlob(job) {
  const url = new URL(job.url, location.href);
  if (job.kind === 'attachment' && url.origin === location.origin) {
    return requestBlobWithPageFetch(job);
  }
  return requestBlobWithGmXhr(job);
}

async function requestImageBlobWithFallbacks(job) {
  const candidates = [];
  for (const value of [job.url, ...(Array.isArray(job.fallbackUrls) ? job.fallbackUrls : [])]) {
    if (!value) continue;
    for (const candidate of [value, ...alternateImageUrls(value)]) {
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  }
  let lastError = null;
  let allNotFound = candidates.length > 0;
  for (const url of candidates) {
    try {
      return await requestBlob({ ...job, url });
    } catch (error) {
      lastError = error;
      if (!/HTTP (?:404|410)\b/i.test(String(error?.message || error))) allNotFound = false;
      console.warn('[x1080x-ex] image source failed; trying fallback', {
        name: job.name,
        url: redactDiagnostic(url),
        error: redactDiagnostic(error?.message || error),
      });
    }
  }
  if (allNotFound) return null;
  throw lastError || new Error('没有可用的图片地址');
}

function isLikelyUnavailablePixhostPreview(job, blob) {
  if (!blob || typeof blob.size !== 'number') return false;
  const isPixhostPreview = Boolean(
    job?.pixhostPreview
    || job?.pixhostThumbUrl
    || job?.pixhostShowUrl
  );
  return isPixhostPreview && blob.size > 0 && blob.size <= PIXHOST_PLACEHOLDER_MAX_BYTES;
}

function saveBlob(blob, name) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.hidden = true;
  anchor.download = name;
  anchor.href = objectUrl;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

async function download(job, { deferImageSave = false } = {}) {
  if (job.kind === 'torrent') {
    const result = await requestTorrentBytes(job.url);
    saveBlob(new Blob([result.bytes], { type: 'application/x-bittorrent' }), job.name);
    console.info('[x1080x-ex] integrated torrent download', {
      name: job.name,
      hash: result.hash,
      torrentName: result.torrentName,
      source: new URL(result.sourceUrl).hostname,
      size: result.bytes.byteLength,
    });
    return { skipped: false };
  }

  let downloadJob = job;
  if (job.kind === 'image' && job.pixhostShowUrl) {
    const resolvedUrl = await resolvePixhostShowUrl(
      document,
      job.pixhostShowUrl,
      job.pixhostThumbUrl || job.url,
      globalThis.GM_xmlhttpRequest
    );
    if (!resolvedUrl) {
      console.info('[x1080x-ex] skipped unavailable Pixhost image', {
        name: job.name,
        showUrl: job.pixhostShowUrl,
      });
      return { skipped: true, reason: 'Pixhost Preview 已失效' };
    }
    downloadJob = { ...job, url: resolvedUrl };
  } else if (job.kind === 'image' && job.pixhostThumbUrl) {
    console.info('[x1080x-ex] skipped standalone Pixhost thumbnail', {
      name: job.name,
      thumbnailUrl: job.pixhostThumbUrl,
    });
    return { skipped: true, reason: 'Pixhost 缩略图未找到可验证的大图地址' };
  }

  const result = job.kind === 'image'
    ? await requestImageBlobWithFallbacks(downloadJob)
    : await requestBlob(downloadJob);
  if (!result && job.kind === 'image') {
    console.info('[x1080x-ex] skipped image after all source paths returned 404/410', {
      name: job.name,
      url: redactDiagnostic(downloadJob.url),
    });
    return { skipped: true, reason: '图片源已失效（HTTP 404/410）' };
  }
  console.info('[x1080x-ex] response', {
    kind: job.kind,
    name: job.name,
    status: result.status,
    finalUrl: redactDiagnostic(result.finalUrl),
    contentType: result.contentType,
    size: result.blob.size,
  });
  if (job.kind === 'image' && isLikelyUnavailablePixhostPreview(job, result.blob)) {
    console.info('[x1080x-ex] skipped likely unavailable Pixhost preview blob', {
      name: job.name,
      size: result.blob.size,
      url: redactDiagnostic(downloadJob.url),
    });
    return { skipped: true, reason: 'Pixhost Preview 已失效' };
  }
  if (job.kind === 'image' && deferImageSave) {
    return { skipped: false, blob: result.blob, name: job.name };
  }
  saveBlob(result.blob, job.name);
  return { skipped: false };
}

async function downloadAll(button) {
  const jobs = buildDownloadJobs(document);
  const nativeFiles = collectModernNativeAttachments(document);
  if (!jobs.length && !nativeFiles.length) {
    window.alert('主楼中没有找到附件、磁力链或可下载图片。');
    return;
  }

  const endDownloadGuard = beginDownloadGuard(document, {
    enabled: isDownloadGuardEnabled(AGAGHHH_DOWNLOAD_GUARD_ENABLED_KEY),
  });
  button.disabled = true;
  const failures = [];
  const pendingImages = [];
  let skipped = 0;

  try {
    console.info('[x1080x-ex] environment', {
      downloadMode: typeof GM_info === 'object' ? GM_info.downloadMode : undefined,
      scriptHandler: typeof GM_info === 'object' ? GM_info.scriptHandler : undefined,
      version: typeof GM_info === 'object' ? GM_info.version : undefined,
    });
    for (const [index, job] of jobs.entries()) {
      button.textContent = `下载中 ${index + 1}/${jobs.length}`;
      try {
        const result = await download(job, { deferImageSave: job.kind === 'image' });
        if (result?.skipped) {
          skipped += 1;
          button.textContent = `已跳过失效图 ${skipped}`;
        } else if (job.kind === 'image' && result?.blob) {
          pendingImages.push(result);
        }
      } catch (error) {
        failures.push(`${job.name}：${redactDiagnostic(error?.message || error?.error || '未知错误')}`);
      }
    }

    pendingImages.forEach(({ blob, name }) => {
      const finalName = pendingImages.length === 1
        ? name.replace(/ A(?=\.[^.]+$)/i, '')
        : name;
      saveBlob(blob, finalName);
    });

    // Modern ZIP/RAR/7z entries have no public attachment URL. Do not
    // synthesize a download endpoint or consume quota without confirmation.
    let nativeResult = { status: 'none' };
    if (nativeFiles.length) {
      nativeResult = requestModernNativeAttachmentDownload(document, window);
    }

    button.disabled = false;
    button.textContent = failures.length
      ? `完成（失败 ${failures.length}${skipped ? `，跳过 ${skipped}` : ''}）`
      : nativeResult.status === 'triggered'
        ? '✓ 已触发网站附件下载'
        : skipped
          ? (skipped === 1 ? '已跳过失效 Preview' : `已跳过失效 Preview ×${skipped}`)
          : '✓ 下载完成';
    window.setTimeout(() => {
      button.textContent = /^\/resources\/[a-z0-9]+\/?$/i.test(location.pathname)
        ? '⬇ 下载资源'
        : '⬇';
    }, 2500);

    if (failures.length) {
      window.alert(`以下文件下载失败：\n\n${failures.join('\n')}\n\n可检查登录状态或浏览器下载权限后重试。`);
    }
  } finally {
    endDownloadGuard();
  }
}

function addDownloadButton() {
  const modern = /^\/resources\/[a-z0-9]+\/?$/i.test(location.pathname);
  const title = document.querySelector(modern ? '.thread-header h1' : '#thread_subject');
  const host = modern
    ? title?.closest('.thread-header')
    : (title?.closest('.vwthd, .ts') || title?.parentElement);
  if (!title || !host) return;

  let button = document.getElementById(BUTTON_ID);
  if (button) {
    if (modern) {
      Object.assign(button.style, {
        float: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'max-content',
        margin: '10px 0 10px 4px',
      });
      // React can replace the h1 while keeping the script node at its old
      // position. Always re-anchor it immediately after the current title.
      if (title.nextElementSibling !== button) title.after(button);
    }
    return;
  }

  button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = modern ? '⬇ 下载资源' : '⬇';
  button.title = modern
    ? '下载正文图片、Preview、磁力种子和站内附件；附件直接使用网站原生下载按钮'
    : '下载主楼附件、正文大图和磁力链种子；普通帖子取最大图，FC2 帖子取全部大图';
  Object.assign(button.style, {
    float: modern ? 'none' : 'right',
    display: modern ? 'inline-flex' : '',
    alignItems: modern ? 'center' : '',
    justifyContent: modern ? 'center' : '',
    width: modern ? 'max-content' : '',
    position: 'relative',
    zIndex: '20',
    margin: modern ? '10px 0 10px 4px' : '0 8px 6px 6px',
    padding: '7px 13px',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => { button.style.background = '#246eaf'; });
  button.addEventListener('mouseleave', () => { button.style.background = '#398bd4'; });
  button.addEventListener('click', () => void downloadAll(button));
  if (modern) title.after(button);
  else host.prepend(button);
}

function refreshBatchProgressLocatorButton(button = document.getElementById(BATCH_PROGRESS_BUTTON_ID)) {
  if (!button || batchProgressScanState) return;
  const historyCount = readBatchOpenHistory().length;
  button.textContent = '定位浏览进度';
  button.title = historyCount
    ? `跨页查找已打开与未打开主题相邻的分页（现有 ${historyCount} 条脚本记录）`
    : '还没有保存的批量打开记录，浏览器自己的 :visited 记录不能自动读取';
  button.style.background = '#6d7d87';
}

async function requestBatchListPageHtml(url) {
  let lastError = null;
  if (typeof window.fetch === 'function') {
    try {
      const response = await window.fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  if (typeof GM_xmlhttpRequest !== 'function') {
    throw lastError || new Error('缺少可用的分页读取接口');
  }
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: 15000,
      onload: (response) => {
        if (response.status < 200 || response.status >= 400) {
          reject(new Error(`HTTP ${response.status}`));
        } else {
          resolve(response.responseText || '');
        }
      },
      ontimeout: () => reject(new Error('读取分页超时')),
      onerror: (error) => reject(new Error(error?.error || '无法读取分页')),
    });
  });
}

async function locateCurrentBatchProgress(button) {
  if (batchProgressScanState) {
    batchProgressScanState.cancelled = true;
    button.textContent = '正在停止查找…';
    return;
  }
  if (!isBatchProgressLocatorEnabled()) return;
  const historyIds = readBatchOpenHistory();
  if (!historyIds.length) {
    window.alert('没有可用的脚本打开记录。请先开启“保存批量打开记录”并使用批量打开；Chrome 的 :visited 紫色链接无法由脚本读取。');
    return;
  }

  const scan = { cancelled: false };
  batchProgressScanState = scan;
  button.style.background = '#b36b22';
  button.textContent = '正在查找分页（再次点击停止）';
  try {
    const config = batchOpenHistoryConfig();
    const result = await scanBatchProgressPages({
      startUrl: firstBatchListPageUrl(location.href, config.kind),
      currentUrl: location.href,
      currentDocument: document,
      historyIds,
      loadPage: requestBatchListPageHtml,
      collectThreads: collectForumThreadLinks,
      getId: batchOpenHistoryId,
      getIds: batchThreadHistoryKeys,
      getScope: batchProgressScopeKey,
      maxPages: 120,
      onProgress: ({ checked, opened, unopened }) => {
        button.textContent = `停止查找 · 第 ${checked} 页（已开 ${opened} / 未开 ${unopened}）`;
      },
      cancelled: () => scan.cancelled,
    });

    if (scan.cancelled || result.status === 'cancelled') return;
    if (result.status === 'found') {
      button.textContent = `已定位到第 ${result.checked} 页`;
      rememberBatchProgressTarget(result.url);
      if (result.url !== location.href) window.location.assign(result.url);
      else {
        const history = new Set(historyIds);
        const firstUnopened = collectForumThreadLinks(document).find((thread) => (
          !isBatchThreadVisited(thread, history)
        ));
        firstUnopened?.link?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    if (result.status === 'unreadable') {
      window.alert(`第 ${result.checked + 1} 页未读取到主题（可能需要登录或触发了网站验证），不能可靠定位浏览进度。\n${result.pageUrl}`);
    } else if (result.status === 'limit') {
      window.alert('已检查前 120 页，仍未找到已打开与未打开主题的交界处。请在更接近历史进度的列表页尝试，或增加扫描上限。');
    } else if (result.status === 'end') {
      window.alert(result.visitedFound
        ? '已检查完能访问的分页，没有找到明确的已打开/未打开分界页。'
        : '已检查完能访问的分页，但没有在这些主题中找到脚本保存的打开记录。');
    } else {
      window.alert('无法识别当前列表的分页位置。');
    }
  } catch (error) {
    if (!scan.cancelled) {
      window.alert(`定位浏览进度失败：${error?.message || error}。请确认两个站点已登录且分页可以正常打开。`);
    }
  } finally {
    if (batchProgressScanState === scan) batchProgressScanState = null;
    refreshBatchProgressLocatorButton(button);
  }
}

function addBatchProgressLocatorButton(host, prependButton = false) {
  if (!host || document.getElementById(BATCH_PROGRESS_BUTTON_ID)) return;
  if (!isBatchProgressLocatorEnabled()) return;
  const button = document.createElement('button');
  button.id = BATCH_PROGRESS_BUTTON_ID;
  button.type = 'button';
  Object.assign(button.style, {
    float: 'right',
    position: 'relative',
    zIndex: '20',
    margin: '0 8px 6px 0',
    padding: '7px 13px',
    border: '1px solid #5f6f7a',
    borderRadius: '5px',
    color: '#fff',
    background: '#6d7d87',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '20px',
  });
  button.addEventListener('mouseenter', () => {
    if (!batchProgressScanState) button.style.background = '#56656e';
  });
  button.addEventListener('mouseleave', () => {
    if (!batchProgressScanState) button.style.background = '#6d7d87';
  });
  button.addEventListener('click', () => void locateCurrentBatchProgress(button));
  refreshBatchProgressLocatorButton(button);
  if (prependButton) {
    const batchButton = document.getElementById(BATCH_BUTTON_ID);
    if (batchButton?.parentElement === host) batchButton.after(button);
    else host.prepend(button);
  } else {
    host.append(button);
  }
}

function addBatchOpenButton() {
  if (document.getElementById(BATCH_BUTTON_ID)) return;
  const threads = collectForumThreadLinks(document);
  let prependButton = false;
  let host = document.querySelector('#pgt')
    || document.querySelector('#threadlist .th')
    || document.querySelector('#threadlist');
  if (!host && isAgaghhhHost(location) && /^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)) {
    const pagination = document.querySelector('.thread-list .pgt');
    if (pagination) {
      host = document.getElementById(BATCH_TOOLBAR_ID);
      if (!host) {
        host = document.createElement('div');
        host.id = BATCH_TOOLBAR_ID;
        Object.assign(host.style, {
          display: 'flex',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 0',
          minHeight: '42px',
        });
        pagination.before(host);
      }
    }
  }
  if (!host) {
    host = document.querySelector('main#genesis-content .archive-description');
    if (host) {
      prependButton = true;
    } else {
      const firstArticle = document.querySelector('main#genesis-content article.entry');
      if (firstArticle) {
        host = document.createElement('div');
        host.id = BATCH_TOOLBAR_ID;
        Object.assign(host.style, {
          minHeight: '42px',
          margin: '0 0 16px',
        });
        firstArticle.before(host);
      }
    }
  }
  if (!threads.length || !host) return;

  const button = document.createElement('button');
  button.id = BATCH_BUTTON_ID;
  button.type = 'button';
  Object.assign(button.style, {
    float: 'right',
    position: 'relative',
    zIndex: '20',
    margin: '0 8px 6px 12px',
    padding: '7px 13px',
    border: '1px solid #2878c8',
    borderRadius: '5px',
    color: '#fff',
    background: '#398bd4',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '20px',
  });
  setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
  button.addEventListener('mouseenter', () => {
    if (!batchOpenState) button.style.background = '#246eaf';
  });
  button.addEventListener('mouseleave', () => {
    if (!batchOpenState) button.style.background = '#398bd4';
  });
  button.addEventListener('click', () => void openCurrentPageThreads(button));
  if (prependButton) {
    button.style.margin = '0 0 0 12px';
    host.prepend(button);
  } else {
    host.append(button);
  }
  addBatchProgressLocatorButton(host, prependButton);
}

// Keep the modern Next.js board list in sync after hydration and dynamic paging.
function observeModernBoard() {
  if (!isAgaghhhHost(location) || currentHost() === LEGACY_AGAGHHH_DOMAIN) return;
  if (!document.body || typeof window.MutationObserver !== 'function') return;
  let timer = null;
  let previousUrl = location.href;
  const detectRouteChange = () => {
    if (location.href === previousUrl) return false;
    previousUrl = location.href;
    if (isThreadPage() && isBatchOpenHistoryEnabled()) rememberBatchOpenedThread(location.href);
    if (isThreadPage() && (typeof GM_getValue !== 'function'
      || GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) !== false)) addDownloadButton();
    window.dispatchEvent(new window.Event('x1080x-ex:routechange'));
    return true;
  };
  const refresh = () => {
    timer = null;
    if (isThreadPage()) {
      if (typeof GM_getValue !== 'function'
        || GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) !== false) addDownloadButton();
      return;
    }
    if (!/^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)) return;
    startAutomaticLegacyHistoryMigration();
    applyBatchOpenHistory(document);
    if (isBatchOpenEnabledForCurrentHost()) {
      addBatchOpenButton();
      const button = document.getElementById(BATCH_BUTTON_ID);
      if (button && !batchOpenState) {
        setBatchButtonIdle(button, collectBatchOpenThreads(document).length);
      }
    }
  };
  const schedule = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 120);
  };
  const observer = new window.MutationObserver((mutations) => {
    if (detectRouteChange()) {
      schedule();
      return;
    }
    if (isThreadPage()) {
      // Re-anchor on every detail-page render; addDownloadButton is idempotent.
      if (typeof GM_getValue !== 'function'
        || GM_getValue(AGAGHHH_DOWNLOAD_ENABLED_KEY, true) !== false) addDownloadButton();
      return;
    }
    if (!/^\/boards\/[a-z0-9]+\/?$/i.test(location.pathname)) return;
    if (!mutations.some((mutation) => (
      mutation.target?.matches?.('.thread-list, .thread-row, .thread-line, .pgt')
      || [...mutation.addedNodes].some((node) => (
        node.nodeType === 1 && (
          node.matches?.('.thread-list, .thread-row, .resource-title, .pgt')
          || node.querySelector?.('.thread-list, .thread-row, .resource-title, .pgt')
        )
      ))
    ))) return;
    schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', () => {
    detectRouteChange();
    schedule();
  });
}

registerSettingsMenu();

if (isAllowedHost(location.hostname, getConfiguredDomains())) {
  const expandHdblogPreview = typeof GM_getValue !== 'function'
    || GM_getValue(HDBLOG_EXPAND_PREVIEW_IMAGES_KEY, true) !== false;
  if (expandHdblogPreview) expandHdblogPreviewImages();
  if (isThreadPage()) {
    if (isAgaghhhHost(location) && isBatchOpenHistoryEnabled()) {
      rememberBatchOpenedThread(location.href);
    }
    addDownloadButton();
  }
  if (isBatchOpenPage()) {
    applyBatchOpenHistory(document);
    if (isBatchOpenEnabledForCurrentHost()) addBatchOpenButton();
  }
  startAutomaticLegacyHistoryMigration();
  observeModernBoard();
}
