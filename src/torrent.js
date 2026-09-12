const TORRENT_SOURCES = Object.freeze([
  (hash) => `https://itorrents.net/torrent/${hash}.torrent`,
  (hash) => `https://torrage.info/torrent.php?h=${hash}`,
  (hash) => `https://itorrents.org/torrent/${hash}.torrent`,
  (hash) => `https://btcache.me/torrent/${hash}`,
]);

const CACHE_REQUEST_TIMEOUT_MS = 8000;
const BTIH_PATTERN = /urn:btih:([a-f\d]{40}|[a-z2-7]{32})/i;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const QB_CONFIG = Object.freeze({
  defaultUrl: 'http://127.0.0.1:8080',
  defaultUsername: 'admin',
  requestTimeoutMs: 10000,
  metadataTimeoutMs: 60000,
  pollIntervalMs: 2000,
  enabledStorageKey: 'x1080x-ex:qb-enabled',
  urlStorageKey: 'x1080x-ex:qb-url',
  usernameStorageKey: 'x1080x-ex:qb-username',
  passwordStorageKey: 'x1080x-ex:qb-password',
  metadataTimeoutStorageKey: 'x1080x-ex:qb-metadata-timeout-ms',
});

let qbSessionFingerprint = '';
let qbLoginPromise = null;

function decodeSafely(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeBtih(rawHash) {
  const hash = String(rawHash ?? '').trim().toUpperCase();
  if (/^[A-F\d]{40}$/.test(hash)) return hash;
  if (!/^[A-Z2-7]{32}$/.test(hash)) return '';

  let bits = '';
  for (const character of hash) {
    bits += BASE32.indexOf(character).toString(2).padStart(5, '0');
  }

  let hex = '';
  for (let index = 0; index < bits.length; index += 8) {
    hex += Number.parseInt(bits.slice(index, index + 8), 2)
      .toString(16)
      .padStart(2, '0');
  }
  return hex.toUpperCase();
}

export function extractBtih(value) {
  const match = decodeSafely(String(value ?? '')).match(BTIH_PATTERN);
  return match ? normalizeBtih(match[1]) : '';
}

export function normalizeQbUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('请输入 qBittorrent WebUI 地址');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('qBittorrent WebUI 地址格式无效');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('qBittorrent WebUI 地址仅支持 http 或 https');
  }
  if (url.username || url.password) {
    throw new Error('请不要把用户名或密码写入 WebUI 地址');
  }
  if (!url.hostname) throw new Error('qBittorrent WebUI 地址缺少主机名');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function readStoredValue(getValue, key, fallback) {
  if (typeof getValue !== 'function') return fallback;
  return getValue(key, fallback);
}

export function getQbSettings(getValue = globalThis.GM_getValue) {
  const rawTimeout = Number(readStoredValue(
    getValue,
    QB_CONFIG.metadataTimeoutStorageKey,
    QB_CONFIG.metadataTimeoutMs
  ));
  return {
    enabled: readStoredValue(getValue, QB_CONFIG.enabledStorageKey, false) === true,
    url: String(readStoredValue(getValue, QB_CONFIG.urlStorageKey, QB_CONFIG.defaultUrl)
      || QB_CONFIG.defaultUrl),
    username: String(readStoredValue(getValue, QB_CONFIG.usernameStorageKey, QB_CONFIG.defaultUsername)
      || QB_CONFIG.defaultUsername),
    password: String(readStoredValue(getValue, QB_CONFIG.passwordStorageKey, '') || ''),
    metadataTimeoutMs: Number.isFinite(rawTimeout)
      ? Math.min(300000, Math.max(10000, Math.round(rawTimeout)))
      : QB_CONFIG.metadataTimeoutMs,
  };
}

function normalizeQbSettings(settings) {
  const timeout = Number(settings?.metadataTimeoutMs ?? QB_CONFIG.metadataTimeoutMs);
  if (!Number.isFinite(timeout) || timeout < 10000 || timeout > 300000) {
    throw new Error('元数据等待时间需在 10～300 秒之间');
  }
  const username = String(settings?.username || '').trim();
  if (!username) throw new Error('请输入 qBittorrent WebUI 用户名');

  return {
    enabled: Boolean(settings?.enabled),
    url: normalizeQbUrl(settings?.url ?? QB_CONFIG.defaultUrl),
    username,
    password: String(settings?.password || ''),
    metadataTimeoutMs: Math.round(timeout),
  };
}

export function saveQbSettings(settings, setValue = globalThis.GM_setValue) {
  if (typeof setValue !== 'function') {
    throw new Error('当前 userscript 管理器不支持保存 qBittorrent 设置');
  }
  const normalized = normalizeQbSettings(settings);
  setValue(QB_CONFIG.enabledStorageKey, normalized.enabled);
  setValue(QB_CONFIG.urlStorageKey, normalized.url);
  setValue(QB_CONFIG.usernameStorageKey, normalized.username);
  setValue(QB_CONFIG.passwordStorageKey, normalized.password);
  setValue(QB_CONFIG.metadataTimeoutStorageKey, normalized.metadataTimeoutMs);
  qbSessionFingerprint = '';
  return normalized;
}

function qbEndpoint(path, settings) {
  const base = normalizeQbUrl(settings.url);
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function qbRequestHeaders(settings, headers = {}) {
  const base = normalizeQbUrl(settings.url);
  const url = new URL(base);
  return {
    Origin: url.origin,
    Referer: `${base}/`,
    ...headers,
  };
}

function qbErrorMessage(response, path) {
  const body = String(response?.responseText || '').trim();
  if (path === '/api/v2/auth/login' && (response?.status === 401 || response?.status === 403)) {
    return 'qBittorrent 登录失败；请检查 WebUI 用户名和密码';
  }
  if (response?.status === 401 || response?.status === 403) {
    return 'qBittorrent 会话无效或访问被拒绝';
  }
  if (response?.status === 404 && path.includes('/torrents/')) {
    return 'qBittorrent 未提供元数据 API；请使用 qBittorrent 5.2.0+ / WebAPI 2.11.9+';
  }
  return `qBittorrent 请求失败（HTTP ${response?.status ?? '未知'}）${body ? `：${body}` : ''}`;
}

function requestQbRaw(path, {
  method = 'GET',
  responseType = 'text',
  timeout = QB_CONFIG.requestTimeoutMs,
  allowedStatuses = [200],
  settings,
  headers = {},
  data,
} = {}, gmRequest = globalThis.GM_xmlhttpRequest) {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }

    let url;
    try {
      url = qbEndpoint(path, settings);
    } catch (error) {
      reject(error);
      return;
    }

    gmRequest({
      method,
      url,
      headers: qbRequestHeaders(settings, headers),
      data,
      responseType,
      timeout,
      anonymous: false,
      onload(response) {
        if (!allowedStatuses.includes(response.status)) {
          const error = new Error(qbErrorMessage(response, path));
          error.status = response.status;
          reject(error);
          return;
        }
        resolve(response);
      },
      onerror: () => reject(new Error('无法连接 qBittorrent，请检查 WebUI 地址、服务状态和 userscript 跨域权限')),
      ontimeout: () => reject(new Error('连接 qBittorrent 超时')),
    });
  });
}

function qbSettingsFingerprint(settings) {
  return `${normalizeQbUrl(settings.url)}\n${settings.username}\n${settings.password}`;
}

async function loginQb(settings, gmRequest = globalThis.GM_xmlhttpRequest, force = false) {
  const normalized = normalizeQbSettings(settings);
  const fingerprint = qbSettingsFingerprint(normalized);
  if (!force && qbSessionFingerprint === fingerprint) return true;
  if (!force && qbLoginPromise) return qbLoginPromise;

  const task = (async () => {
    const response = await requestQbRaw('/api/v2/auth/login', {
      method: 'POST',
      responseType: 'text',
      settings: normalized,
      allowedStatuses: [200, 204],
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      data: new URLSearchParams({
        username: normalized.username,
        password: normalized.password,
      }).toString(),
    }, gmRequest);
    const text = String(response.responseText || response.response || '').trim().toLowerCase();
    if (text === 'fails.') throw new Error('qBittorrent 登录失败；请检查 WebUI 用户名和密码');
    qbSessionFingerprint = fingerprint;
    return true;
  })();

  qbLoginPromise = task;
  try {
    return await task;
  } finally {
    if (qbLoginPromise === task) qbLoginPromise = null;
  }
}

async function requestQb(path, options = {}, gmRequest = globalThis.GM_xmlhttpRequest) {
  const settings = normalizeQbSettings(options.settings || getQbSettings());
  await loginQb(settings, gmRequest);
  try {
    return await requestQbRaw(path, { ...options, settings }, gmRequest);
  } catch (error) {
    if (error?.status !== 401 && error?.status !== 403) throw error;
    qbSessionFingerprint = '';
    await loginQb(settings, gmRequest, true);
    return requestQbRaw(path, { ...options, settings }, gmRequest);
  }
}

export async function testQbConnection(
  settings = getQbSettings(),
  gmRequest = globalThis.GM_xmlhttpRequest
) {
  const normalized = normalizeQbSettings(settings);
  await loginQb(normalized, gmRequest, true);
  const response = await requestQb('/api/v2/app/version', {
    settings: normalized,
    responseType: 'text',
  }, gmRequest);
  const version = String(response.responseText || response.response || '').trim();
  if (!version) throw new Error('qBittorrent 已响应，但未返回版本号');
  return { version };
}

function parseBencode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const decoder = new TextDecoder();
  let offset = 0;

  function parseBytes() {
    const lengthStart = offset;
    while (offset < bytes.length && bytes[offset] >= 48 && bytes[offset] <= 57) offset += 1;
    if (offset === lengthStart || bytes[offset] !== 58) throw new Error('无效的 bencode 字符串');
    const length = Number.parseInt(decoder.decode(bytes.subarray(lengthStart, offset)), 10);
    offset += 1;
    const end = offset + length;
    if (!Number.isSafeInteger(length) || length < 0 || end > bytes.length) {
      throw new Error('bencode 字符串长度越界');
    }
    const value = bytes.subarray(offset, end);
    offset = end;
    return value;
  }

  function parseValue(depth = 0) {
    if (depth > 100 || offset >= bytes.length) throw new Error('无效的 bencode 数据');
    const token = bytes[offset];
    if (token >= 48 && token <= 57) return parseBytes();
    if (token === 105) {
      offset += 1;
      const start = offset;
      while (offset < bytes.length && bytes[offset] !== 101) offset += 1;
      if (offset >= bytes.length) throw new Error('未结束的 bencode 整数');
      const value = Number.parseInt(decoder.decode(bytes.subarray(start, offset)), 10);
      offset += 1;
      if (!Number.isSafeInteger(value)) throw new Error('无效的 bencode 整数');
      return value;
    }
    if (token === 108) {
      offset += 1;
      const list = [];
      while (offset < bytes.length && bytes[offset] !== 101) list.push(parseValue(depth + 1));
      if (offset >= bytes.length) throw new Error('未结束的 bencode 列表');
      offset += 1;
      return list;
    }
    if (token === 100) {
      offset += 1;
      const dictionary = Object.create(null);
      while (offset < bytes.length && bytes[offset] !== 101) {
        const key = decoder.decode(parseBytes());
        dictionary[key] = parseValue(depth + 1);
      }
      if (offset >= bytes.length) throw new Error('未结束的 bencode 字典');
      offset += 1;
      return dictionary;
    }
    throw new Error('未知的 bencode 类型');
  }

  const result = parseValue();
  if (offset !== bytes.length) throw new Error('bencode 数据尾部存在多余内容');
  return result;
}

export function parseTorrentName(input) {
  const root = parseBencode(input);
  const rawName = root?.info?.['name.utf-8'] || root?.info?.name;
  if (!(rawName instanceof Uint8Array)) throw new Error('torrent 中缺少 info.name');
  const name = new TextDecoder('utf-8').decode(rawName).replace(/\0/g, '').trim();
  if (!name) throw new Error('torrent 名称为空');
  return name;
}

function extractInfoBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const decoder = new TextDecoder();
  let offset = 0;

  function skipBytes() {
    const start = offset;
    while (offset < bytes.length && bytes[offset] >= 48 && bytes[offset] <= 57) offset += 1;
    if (offset === start || bytes[offset] !== 58) throw new Error('无效的 bencode 字符串');
    const length = Number.parseInt(decoder.decode(bytes.subarray(start, offset)), 10);
    offset += 1 + length;
    if (!Number.isSafeInteger(length) || length < 0 || offset > bytes.length) {
      throw new Error('bencode 字符串长度越界');
    }
  }

  function skipValue(depth = 0) {
    if (depth > 100 || offset >= bytes.length) throw new Error('无效的 bencode 数据');
    const token = bytes[offset];
    if (token >= 48 && token <= 57) {
      skipBytes();
    } else if (token === 105) {
      offset = bytes.indexOf(101, offset + 1);
      if (offset < 0) throw new Error('未结束的 bencode 整数');
      offset += 1;
    } else if (token === 108 || token === 100) {
      offset += 1;
      while (offset < bytes.length && bytes[offset] !== 101) {
        if (token === 100) skipBytes();
        skipValue(depth + 1);
      }
      if (offset >= bytes.length) throw new Error('未结束的 bencode 容器');
      offset += 1;
    } else {
      throw new Error('未知的 bencode 类型');
    }
  }

  if (bytes[offset] !== 100) throw new Error('torrent 根节点不是字典');
  offset += 1;
  while (offset < bytes.length && bytes[offset] !== 101) {
    const keyStart = offset;
    skipBytes();
    const colon = bytes.indexOf(58, keyStart);
    const key = decoder.decode(bytes.subarray(colon + 1, offset));
    const valueStart = offset;
    skipValue(1);
    if (key === 'info') return bytes.subarray(valueStart, offset);
  }
  throw new Error('torrent 中缺少 info 字典');
}

function sha1Hex(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;
  let h4 = 0xC3D2E1F0;
  const words = new Uint32Array(80);
  const rotateLeft = (value, bits) => (value << bits) | (value >>> (32 - bits));

  for (let chunk = 0; chunk < paddedLength; chunk += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(chunk + index * 4);
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1
      ) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5A827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }
      const temporary = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temporary;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
}

export function verifyTorrentHash(input, expectedHash) {
  const actualHash = sha1Hex(extractInfoBytes(input));
  if (actualHash !== String(expectedHash).toUpperCase()) {
    throw new Error(`torrent infohash 不匹配（期望 ${expectedHash}，实际 ${actualHash}）`);
  }
  return true;
}

function requestTorrentUrl(url, gmRequest) {
  return new Promise((resolve, reject) => {
    if (typeof gmRequest !== 'function') {
      reject(new Error('当前 userscript 管理器不支持 GM_xmlhttpRequest'));
      return;
    }
    gmRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      timeout: CACHE_REQUEST_TIMEOUT_MS,
      anonymous: true,
      onload(response) {
        if (response.status < 200 || response.status >= 300 || !response.response) {
          reject(new Error(`下载 torrent 失败（HTTP ${response.status}）`));
          return;
        }
        resolve(new Uint8Array(response.response));
      },
      onerror: () => reject(new Error('下载 torrent 时发生网络错误')),
      ontimeout: () => reject(new Error('下载 torrent 超时')),
    });
  });
}

async function requestTorrentFromCaches(hash, gmRequest) {
  const errors = [];
  for (const buildUrl of TORRENT_SOURCES) {
    const url = buildUrl(hash);
    try {
      const bytes = await requestTorrentUrl(url, gmRequest);
      const torrentName = parseTorrentName(bytes);
      verifyTorrentHash(bytes, hash);
      return { bytes, hash, torrentName, sourceUrl: url };
    } catch (error) {
      errors.push(`${new URL(url).hostname}: ${error?.message || error}`);
    }
  }
  const error = new Error(`所有 torrent 缓存源均不可用：${errors.join('；')}`);
  error.cacheErrors = errors;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tryExportQbTorrent(
  hash,
  settings,
  gmRequest = globalThis.GM_xmlhttpRequest,
  timeout = QB_CONFIG.requestTimeoutMs
) {
  const response = await requestQb(`/api/v2/torrents/export?hash=${encodeURIComponent(hash)}`, {
    settings,
    responseType: 'arraybuffer',
    timeout,
    allowedStatuses: [200, 404, 409],
  }, gmRequest);
  if (response.status !== 200 || !response.response) return null;

  const bytes = new Uint8Array(response.response);
  const torrentName = parseTorrentName(bytes);
  verifyTorrentHash(bytes, hash);
  return { bytes, torrentName };
}

async function requestTorrentViaQbittorrent(hash, magnet, settings, gmRequest) {
  if (!settings.enabled) throw new Error('qBittorrent 回退未启用');

  const normalized = normalizeQbSettings(settings);
  const source = magnet && extractBtih(magnet) === hash.toUpperCase()
    ? magnet
    : `magnet:?xt=urn:btih:${hash}`;
  const query = `source=${encodeURIComponent(source)}`;
  const deadline = Date.now() + normalized.metadataTimeoutMs;
  const fetchPath = '/api/v2/torrents/fetchMetadata';
  const savePath = `/api/v2/torrents/saveMetadata?${query}`;
  const sourceUrl = qbEndpoint(fetchPath, normalized);

  const existing = await tryExportQbTorrent(
    hash,
    normalized,
    gmRequest,
    Math.min(QB_CONFIG.requestTimeoutMs, normalized.metadataTimeoutMs)
  );
  if (existing) return { ...existing, hash, sourceUrl };

  while (Date.now() < deadline) {
    const remaining = Math.max(1000, deadline - Date.now());
    const response = await requestQb(fetchPath, {
      method: 'POST',
      settings: normalized,
      responseType: 'text',
      timeout: Math.min(QB_CONFIG.requestTimeoutMs, remaining),
      allowedStatuses: [200, 202],
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      data: new URLSearchParams({ source }).toString(),
    }, gmRequest);

    if (response.status === 200) {
      const exported = await tryExportQbTorrent(
        hash,
        normalized,
        gmRequest,
        Math.min(QB_CONFIG.requestTimeoutMs, remaining)
      );
      if (exported) return { ...exported, hash, sourceUrl };

      const saved = await requestQb(savePath, {
        settings: normalized,
        responseType: 'arraybuffer',
        timeout: Math.min(QB_CONFIG.requestTimeoutMs, remaining),
        allowedStatuses: [200, 409],
      }, gmRequest);
      if (saved.status === 200 && saved.response) {
        const bytes = new Uint8Array(saved.response);
        const torrentName = parseTorrentName(bytes);
        verifyTorrentHash(bytes, hash);
        return { bytes, hash, torrentName, sourceUrl };
      }
    }

    const delay = Math.min(QB_CONFIG.pollIntervalMs, Math.max(0, deadline - Date.now()));
    if (delay > 0) await sleep(delay);
  }

  throw new Error(
    `qBittorrent 在 ${Math.round(normalized.metadataTimeoutMs / 1000)} 秒内未获取到可导出的元数据（可能没有可用的 DHT/Peer）`
  );
}

export async function requestTorrentBytes(
  magnet,
  gmRequest = globalThis.GM_xmlhttpRequest,
  qbSettings = getQbSettings()
) {
  const hash = extractBtih(magnet);
  if (!hash) throw new Error('磁力链中没有有效的 BTIH');

  let cacheError;
  try {
    return await requestTorrentFromCaches(hash, gmRequest);
  } catch (error) {
    cacheError = error;
  }

  const settings = normalizeQbSettings(qbSettings);
  if (!settings.enabled) throw cacheError;

  try {
    return await requestTorrentViaQbittorrent(hash, magnet, settings, gmRequest);
  } catch (qbError) {
    throw new Error(`${cacheError.message}；qBittorrent：${qbError?.message || qbError}`);
  }
}
