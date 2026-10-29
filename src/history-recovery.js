import { compatibleHistoryKeys, historyAliasesForTitle, isUsableHistoryAlias, legacyTidFromHistoryValue } from './history-migration.js';

export const HISTORY_RECOVERY_FORMAT = 'x1080x-history-recovery-v1';
export const OLD_FORUM_HOSTS = ['agaghhh.cc', '1080xin.com', '1080xin.vip', 'x1080x.com'];

function forumTid(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || !OLD_FORUM_HOSTS.includes(url.hostname.toLowerCase().replace(/^www\./, ''))) return '';
    if (!(/^\/(?:forum|viewthread)\.php$/i.test(url.pathname) && url.searchParams.get('mod') === 'viewthread')
      && !/^\/(?:thread|viewthread)[-_]\d+/i.test(url.pathname)) return '';
    return legacyTidFromHistoryValue(url.href);
  } catch { return ''; }
}

export function recoveredTitleAliases(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim()
    .replace(/\s*[-|–—]\s*(?:(?:x1080x|agaghhh|1080xin)(?:\.(?:com|cc|vip))?\s*[-|–—]?\s*)?(?:Powered by Discuz!?)?\s*$/i, '').trim();
  const normalized = title.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  if (/^(?:justamoment|attentionrequiredcloudflare|请稍候|請稍候|稍等片刻|安全验证|安全驗證|正在进行安全验证|正在進行安全驗證|正在加载|正在載入|x1080x(?:com)?|agaghhh(?:cc)?|1080xin(?:com)?)$/.test(normalized)) return [];
  return historyAliasesForTitle(title).filter(isUsableHistoryAlias);
}

export function buildHistoryRecovery(rows, legacyValue) {
  if (!Array.isArray(rows)) throw new Error('历史记录必须是数组');
  const allowed = legacyValue === undefined ? null : new Set(compatibleHistoryKeys(legacyValue)
    .filter(key => key.startsWith('tid:')).map(key => key.slice(4)));
  const entries = new Map();
  const ambiguous = new Set();
  let ignored = 0;
  for (const row of rows) {
    const tid = forumTid(row?.url);
    const aliases = recoveredTitleAliases(row?.title);
    if (!tid || (allowed && !allowed.has(tid)) || !aliases.length
      || (row.tid !== undefined && String(row.tid) !== tid)) { ignored += 1; continue; }
    const existing = entries.get(tid);
    const strong = values => values.find(value => value.startsWith('code:FC2-'))
      || values.find(value => /^(?:code|number):/.test(value));
    if (existing && strong(existing.aliases) && strong(aliases) && strong(existing.aliases) !== strong(aliases)) {
      ambiguous.add(tid);
    }
    if (!existing || (!strong(existing.aliases) && strong(aliases))) entries.set(tid, {
      tid, url: row.url, title: String(row.title).trim(), aliases,
    });
  }
  const recoveredEntries = [...entries.values()].filter(entry => !ambiguous.has(entry.tid))
    .map(({ tid, url, title }) => ({ tid, url, title }));
  return {
    format: HISTORY_RECOVERY_FORMAT,
    entries: recoveredEntries,
    stats: { rows: rows.length, ignored, ambiguous: ambiguous.size,
      ...(allowed ? { legacyCount: allowed.size, remaining: allowed.size - recoveredEntries.length } : {}) },
  };
}

export function planHistoryRecovery(payload, legacyValue, previousState = {}, recoveredState = {}) {
  if (payload?.format !== HISTORY_RECOVERY_FORMAT || !Array.isArray(payload.entries)) throw new Error('请选择旧论坛历史恢复工具生成的 JSON 文件');
  const validated = buildHistoryRecovery(payload.entries, legacyValue);
  const resolved = previousState.resolved && typeof previousState.resolved === 'object' && !Array.isArray(previousState.resolved)
    ? { ...previousState.resolved } : {};
  if (recoveredState?.resolved && typeof recoveredState.resolved === 'object') {
    for (const [tid, values] of Object.entries(recoveredState.resolved)) {
      if (!/^\d+$/.test(tid) || !Array.isArray(values)) continue;
      const existing = Array.isArray(resolved[tid]) ? resolved[tid].filter(isUsableHistoryAlias) : [];
      resolved[tid] = [...new Set([...existing, ...values.filter(isUsableHistoryAlias)])];
    }
  }
  let changed = 0;
  const aliases = [];
  const recovered = {};
  for (const entry of validated.entries) {
    const existing = Array.isArray(resolved[entry.tid]) ? resolved[entry.tid].filter(isUsableHistoryAlias) : [];
    const added = recoveredTitleAliases(entry.title);
    if (added.some(value => !existing.includes(value))) changed += 1;
    resolved[entry.tid] = [...new Set([...existing, ...added])];
    recovered[entry.tid] = resolved[entry.tid];
    aliases.push(...added);
  }
  return {
    changed, matched: validated.entries.length,
    ignored: payload.entries.length - validated.entries.length,
    aliases: [...new Set(aliases)],
    recovered,
    state: { ...previousState, resolverVersion: 2, resolved },
  };
}
