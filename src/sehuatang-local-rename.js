// 98堂 signed downloads: keep the original browser link request.
// Content-Disposition may force the server filename. This optional post-save
// renamer works on the user's explicitly authorized download directory instead
// of fetching the signed URL a second time or changing browser extensions.
//
// Privacy/safety: no network calls, no directory traversal, only fresh TXT,
// no silent overwrite, verify the copy before deleting the original file.
const DB_NAME = 'x1080x-ex-sehuatang-local-rename';
const STORE = 'permissions';
const FOLDER_KEY = 'download-folder';
const cached = new WeakMap();
const active = new WeakMap();
const TIMEOUT_MS = 45000;
const POLL_MS = 450;
const MAX_TXT_BYTES = 2 * 1024 * 1024;

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'));
  });
}

async function openDb(view) {
  if (!view.indexedDB) return null;
  const req = view.indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
  };
  return idbRequest(req);
}

async function readStoredFolder(view) {
  const db = await openDb(view);
  if (!db) return null;
  try { return await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(FOLDER_KEY)); }
  finally { db.close(); }
}

async function saveStoredFolder(view, folder) {
  const db = await openDb(view);
  if (!db) return false;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(folder, FOLDER_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('保存下载目录授权失败'));
      tx.onabort = () => reject(tx.error || new Error('保存下载目录授权被中止'));
    });
    return true;
  } finally { db.close(); }
}

export async function getSehuatangRenameFolder(view) {
  if (cached.has(view)) return cached.get(view);
  try {
    const value = await readStoredFolder(view);
    if (value?.kind === 'directory') {
      cached.set(view, value);
      return value;
    }
  } catch (error) {
    console.warn('[x1080x-ex] cannot restore local rename directory:', error?.message || error);
  }
  return null;
}

export async function chooseSehuatangRenameFolder(view) {
  if (typeof view?.showDirectoryPicker !== 'function') {
    throw new Error('当前浏览器不支持本地文件夹授权；请使用最新版 Chrome/Edge');
  }
  // Keep the user-gesture activation: call picker before any await.
  const folder = await view.showDirectoryPicker({
    id: 'x1080x-ex-98t-downloads',
    startIn: 'downloads',
    mode: 'readwrite',
  });
  if (!folder || folder.kind !== 'directory') throw new Error('没有选择有效的下载文件夹');
  cached.set(view, folder);
  const persisted = await saveStoredFolder(view, folder).catch(() => false);
  return { name: folder.name || '下载文件夹', persisted };
}

async function authorizedFolder(view) {
  const folder = await getSehuatangRenameFolder(view);
  if (!folder) throw new Error('尚未授权下载文件夹。请到 98堂设置中选择 Chrome 实际保存文件的目录');
  if (typeof folder.queryPermission === 'function'
      && await folder.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error('下载目录写入授权已失效，请在 98堂设置中重新选择文件夹');
  }
  return folder;
}

function isVariantOf(filename, base) {
  if (!filename || !base || !/\.txt$/i.test(filename) || !/\.txt$/i.test(base)) return false;
  const norm = value => value.normalize('NFC').toLocaleLowerCase();
  const name = norm(filename);
  const exact = norm(base);
  if (name === exact) return true;
  const stem = exact.slice(0, -4);
  if (!name.startsWith(stem + ' (') || !name.endsWith(').txt')) return false;
  const number = name.slice(stem.length + 2, -5);
  return /^[1-9]\d*$/.test(number);
}

async function nameExists(folder, name) {
  try {
    await folder.getFileHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    throw error;
  }
}

async function unusedFilename(folder, name) {
  if (!await nameExists(folder, name)) return name;
  const stem = name.slice(0, -4);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = stem + ' (' + n + ').txt';
    if (!await nameExists(folder, candidate)) return candidate;
  }
  throw new Error('同名文件过多，已保留下载原文件');
}

async function recentCandidates(folder, originalName, desiredName, startedAt) {
  const entries = [];
  for await (const [name, handle] of folder.entries()) {
    if (handle.kind !== 'file' || !/\.txt$/i.test(name)) continue;
    if (!isVariantOf(name, originalName) && !isVariantOf(name, desiredName)) continue;
    const file = await handle.getFile();
    if (file.size <= 0 || file.size > MAX_TXT_BYTES) continue;
    // Only files newly written after this click; never modify an older TXT.
    if (file.lastModified < startedAt - 1500 || file.lastModified > Date.now() + 1000) continue;
    entries.push({ name, handle, file });
  }
  return entries;
}

async function copyAndReplace(folder, source) {
  const target = await unusedFilename(folder, source.desiredName);
  const targetHandle = await folder.getFileHandle(target, { create: true });
  let written = false;
  try {
    const writer = await targetHandle.createWritable({ keepExistingData: false });
    try { await writer.write(source.file); await writer.close(); written = true; }
    catch (error) { try { await writer.abort?.(); } catch { /* ignore abort failure */ } throw error; }
    const copied = await targetHandle.getFile();
    if (copied.size !== source.file.size) {
      throw new Error('重命名后的文件大小校验失败，已保留原文件');
    }
    const latest = await source.handle.getFile();
    if (latest.size !== source.file.size || latest.lastModified !== source.file.lastModified) {
      throw new Error('原始 TXT 在处理期间发生了变化；新文件已保留，请检查后手动删除重复文件');
    }
    await folder.removeEntry(source.name);
    return { renamed: true, filename: target, from: source.name };
  } catch (error) {
    if (!written) {
      try { await folder.removeEntry(target); } catch { /* do not mask failure */ }
    }
    throw error;
  }
}

export async function renameSehuatangDownloadedTxt(view, {
  originalName, desiredName, startedAt = Date.now(), timeoutMs = TIMEOUT_MS,
} = {}) {
  if (!/\.txt$/i.test(originalName || '') || !/\.txt$/i.test(desiredName || '')
      || originalName === desiredName) {
    return { renamed: false, skipped: true, reason: '无需更名' };
  }
  if (originalName.includes('/') || originalName.includes('\\')
      || desiredName.includes('/') || desiredName.includes('\\')) {
    throw new Error('附件文件名包含路径分隔符，已取消本地操作');
  }
  const folder = await authorizedFolder(view);
  if (active.has(view)) {
    throw new Error('已有一个 TXT 正在确认下载结果，请完成后再处理下一个，避免误改名');
  }
  const task = { originalName, desiredName, startedAt };
  active.set(view, task);
  let lastCandidate = null;
  let stable = 0;
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const candidates = await recentCandidates(folder, originalName, desiredName, startedAt);
      const alreadyNamed = candidates.filter(c => isVariantOf(c.name, desiredName));
      if (alreadyNamed.length === 1 && candidates.length === 1) {
        return { renamed: false, filename: alreadyNamed[0].name, alreadyNamed: true };
      }
      const raw = candidates.filter(c => isVariantOf(c.name, originalName));
      if (raw.length > 1 || (raw.length && alreadyNamed.length)) {
        throw new Error('发现多个新 TXT，无法安全判断本次附件，已保留原文件');
      }
      if (raw.length === 1) {
        const current = raw[0];
        const signature = current.name + ':' + current.file.size + ':' + current.file.lastModified;
        stable = signature === lastCandidate ? stable + 1 : 1;
        lastCandidate = signature;
        // Chrome's .crdownload has finalized; check stable TXT twice.
        if (stable >= 2) return copyAndReplace(folder, { ...current, desiredName });
      } else { stable = 0; lastCandidate = null; }
      await new Promise(resolve => view.setTimeout(resolve, POLL_MS));
    }
    throw new Error('未在授权目录中找到本次新下载的 TXT。原生下载不受影响；请确认 Chrome 的实际下载目录');
  } finally {
    if (active.get(view) === task) active.delete(view);
  }
}
