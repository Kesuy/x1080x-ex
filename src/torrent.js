const TORRENT_SOURCES = Object.freeze([
  (hash) => `https://itorrents.net/torrent/${hash}.torrent`,
  (hash) => `https://torrage.info/torrent/${hash}.torrent`,
  (hash) => `https://itorrents.org/torrent/${hash}.torrent`,
]);

const BTIH_PATTERN = /urn:btih:([a-f\d]{40}|[a-z2-7]{32})/i;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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
      timeout: 30000,
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

export async function requestTorrentBytes(magnet, gmRequest = globalThis.GM_xmlhttpRequest) {
  const hash = extractBtih(magnet);
  if (!hash) throw new Error('磁力链中没有有效的 BTIH');

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
  throw new Error(`所有 torrent 缓存源均不可用：${errors.join('；')}`);
}
