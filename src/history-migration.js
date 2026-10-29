import { getThreadHeadingText } from './core.js';

const GENERIC_HISTORY_TITLES = /^(?:404|notfound|pagenotfound|请先登录|請先登入|登录|登錄|歡迎訪問(?:x1080x)?|欢迎访问(?:x1080x)?|請使用下面地址之一訪問論壇|会员方案与点数储值|會員方案與點數儲值)$/i;

export function isUsableHistoryAlias(value) {
  if (typeof value !== 'string' || !/^(?:resource|code|title|number):.+/i.test(value)) return false;
  return !value.startsWith('title:') || !GENERIC_HISTORY_TITLES.test(value.slice(6));
}

export function historyAliasesForTitle(value) {
  const title = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!title) return [];
  const aliases = [];
  const fc2 = title.match(/\b(?:FC2\s*[- ]?\s*PPV\s*[- ]?\s*|FC2\s*[- ]?\s*|FC)(\d+)\b/i);
  if (fc2) aliases.push(`code:FC2-${fc2[1]}`);

  const codeMatches = [...title.matchAll(/\b([A-Z0-9]{2,12}-\d+[A-Z]?)\b/gi)];
  const code = codeMatches.find((match) => /[A-Z]/i.test(match[1].split('-')[0]));
  if (code) {
    const normalizedCode = code[1].toUpperCase();
    if (!aliases.includes(`code:${normalizedCode}`)) aliases.push(`code:${normalizedCode}`);
  }

  if (!aliases.length) {
    const numeric = title.match(/\b(\d{6,})\b/);
    if (numeric) aliases.push(`number:${numeric[1]}`);
  }

  const normalizedTitle = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (normalizedTitle.length >= 6) aliases.push(`title:${normalizedTitle}`);
  return [...new Set(aliases)];
}

export function legacyTidFromHistoryValue(value) {
  const raw = String(value ?? '');
  const pathTid = raw.match(/(?:^|\/)(?:thread|viewthread)[-_](\d+)(?:[-_.]|$)/i);
  if (pathTid) return pathTid[1];
  const match = raw.match(/^(?:tid:|.*[?&]tid=)(\d+)(?:$|[&#])/i);
  if (match) return match[1];
  const direct = raw.match(/^tid:(\d+)$/i);
  return direct?.[1] || '';
}

export function legacyThreadUrl(tid, origin = 'https://agaghhh.cc') {
  const id = String(tid ?? '');
  return /^\d+$/.test(id) ? `${origin}/forum.php?mod=viewthread&tid=${id}` : '';
}

export function extractLegacyHistoryAliases(html, Parser = globalThis.DOMParser) {
  if (typeof Parser !== 'function') return [];
  const document = new Parser().parseFromString(String(html ?? ''), 'text/html');
  const heading = document.querySelector(
    '#thread_subject, .vwthd h1, h1.ts, .thread-header h1'
  );
  if (!heading) return [];
  const title = getThreadHeadingText(document) || heading.textContent || '';
  if (/^(?:404|not found|page not found|请先登录|請先登入|登录|登錄|歡迎訪問|欢迎访问|會員方案與點數儲值|会员方案与点数储值)(?:\s*[·|—-]\s*x1080x)?$/i.test(title.trim())) return [];
  return historyAliasesForTitle(title);
}

// The resolver cache is itself a durable source of history. Earlier builds
// saved it before updating the alias index; interrupted migrations lost marks.
export function resolvedLegacyHistoryAliases(state) {
  if (!state?.resolved || typeof state.resolved !== 'object') return [];
  return [...new Set(Object.values(state.resolved)
    .flatMap((values) => Array.isArray(values) ? values : [])
    .filter(isUsableHistoryAlias))];
}
