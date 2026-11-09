import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseSehuatangRenameFolder, getSehuatangRenameFolder, renameSehuatangDownloadedTxt } from '../src/sehuatang-local-rename.js';

function fakeFolder() {
  const files = new Map();
  const deletions = [];
  const folder = {
    kind: 'directory',
    name: 'Downloads',
    queryPermission: async () => 'granted',
    async *entries() {
      for (const name of [...files.keys()]) yield [name, this.makeHandle(name)];
    },
    makeHandle(name) {
      return {
        kind: 'file',
        async getFile() {
          const item = files.get(name);
          if (!item) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
          return { size: item.data.length, lastModified: item.lastModified, data: item.data };
        },
        async createWritable() {
          let bytes;
          return {
            async write(file) { bytes = Buffer.from(file.data); },
            async close() { files.set(name, { data: bytes, lastModified: Date.now() }); },
            async abort() {},
          };
        },
      };
    },
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name)) {
        if (!create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
        files.set(name, { data: Buffer.alloc(0), lastModified: Date.now() });
      }
      return this.makeHandle(name);
    },
    async removeEntry(name) {
      if (!files.has(name)) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      files.delete(name);
      deletions.push(name);
    },
  };
  return { files, folder, deletions };
}

function fakeView(folder) {
  let pickerCalls = 0;
  const view = {
    indexedDB: undefined,
    setTimeout: (cb) => setTimeout(cb, 0),
    showDirectoryPicker: async ({ mode, startIn }) => {
      pickerCalls++;
      assert.equal(mode, 'readwrite');
      assert.equal(startIn, 'downloads');
      return folder;
    },
    get pickerCalls() { return pickerCalls; },
  };
  return view;
}

test('98堂：仅一次目录授权，不访问网络，下载后把新 TXT 改名并删除旧文件', async () => {
  const { files, folder, deletions } = fakeFolder();
  const view = fakeView(folder);
  const startedAt = Date.now() - 200;
  const sourceName = 'www.98T.la@女優_eD2k.txt';
  const desiredName = '女優 DMM原档合集【305GB／38V／38配额】.txt';
  files.set(sourceName, { data: Buffer.from('ed2k://sample-string'), lastModified: Date.now() });
  const chosen = await chooseSehuatangRenameFolder(view);
  assert.equal(chosen.name, 'Downloads');
  assert.equal(chosen.persisted, false, 'mock without IndexedDB retains in-tab authorization');
  assert.equal(await getSehuatangRenameFolder(view), folder);
  const result = await renameSehuatangDownloadedTxt(view, {
    originalName: sourceName, desiredName, startedAt,
  });
  assert.deepEqual(result, { renamed: true, filename: desiredName, from: sourceName });
  assert.equal(files.has(sourceName), false);
  assert.equal(files.get(desiredName).data.toString(), 'ed2k://sample-string');
  assert.deepEqual(deletions, [sourceName]);
  assert.equal(view.pickerCalls, 1, 'download does not ask to pick again');
});

test('98堂：目标文件已存在时自动使用 (1) 不覆盖已有文件', async () => {
  const { files, folder } = fakeFolder();
  const view = fakeView(folder);
  const now = Date.now();
  files.set('resource.txt', { data: Buffer.from('new'), lastModified: now });
  files.set('帖子标题.txt', { data: Buffer.from('old'), lastModified: now - 86400000 });
  await chooseSehuatangRenameFolder(view);
  const result = await renameSehuatangDownloadedTxt(view, {
    originalName: 'resource.txt', desiredName: '帖子标题.txt', startedAt: now - 100,
  });
  assert.equal(result.filename, '帖子标题 (1).txt');
  assert.equal(files.get('帖子标题.txt').data.toString(), 'old');
  assert.equal(files.get('帖子标题 (1).txt').data.toString(), 'new');
});

test('98堂：Chrome 使用原文件名 (1) 时仍能安全识别本次下载', async () => {
  const { files, folder } = fakeFolder();
  const view = fakeView(folder);
  const now = Date.now();
  files.set('resource.txt', { data: Buffer.from('old'), lastModified: now - 100000 });
  files.set('resource (1).txt', { data: Buffer.from('new'), lastModified: now });
  await chooseSehuatangRenameFolder(view);
  const result = await renameSehuatangDownloadedTxt(view, {
    originalName: 'resource.txt', desiredName: '帖子标题.txt', startedAt: now - 100,
  });
  assert.equal(result.from, 'resource (1).txt');
  assert.equal(files.get('resource.txt').data.toString(), 'old');
  assert.equal(files.get('帖子标题.txt').data.toString(), 'new');
});

test('98堂：下载时已使用帖子标题，不重复复制、更改或删除', async () => {
  const { files, folder, deletions } = fakeFolder();
  const view = fakeView(folder);
  files.set('帖子标题.txt', { data: Buffer.from('already named'), lastModified: Date.now() });
  await chooseSehuatangRenameFolder(view);
  const result = await renameSehuatangDownloadedTxt(view, {
    originalName: 'resource.txt', desiredName: '帖子标题.txt', startedAt: Date.now() - 100,
  });
  assert.equal(result.alreadyNamed, true);
  assert.equal(files.size, 1);
  assert.deepEqual(deletions, []);
});

test('98堂：旧 TXT/无匹配文件不误改，超时安全保留所有文件', async () => {
  const { files, folder, deletions } = fakeFolder();
  const view = fakeView(folder);
  files.set('resource.txt', { data: Buffer.from('old'), lastModified: Date.now() - 100000 });
  files.set('other.txt', { data: Buffer.from('unrelated'), lastModified: Date.now() });
  await chooseSehuatangRenameFolder(view);
  await assert.rejects(renameSehuatangDownloadedTxt(view, {
    originalName: 'resource.txt', desiredName: '标题.txt', startedAt: Date.now() - 50, timeoutMs: 5,
  }), /未在授权目录中找到/);
  assert.deepEqual([...files.keys()].sort(), ['other.txt', 'resource.txt']);
  assert.deepEqual(deletions, []);
});

test('98堂：目录树与 ZIP 不走改名，授权失效拒绝写入', async () => {
  const { files, folder, deletions } = fakeFolder();
  const view = fakeView(folder);
  await chooseSehuatangRenameFolder(view);
  const skipped = await renameSehuatangDownloadedTxt(view, {
    originalName: '目录树.txt', desiredName: '目录树.txt',
  });
  assert.equal(skipped.skipped, true);
  const skippedZip = await renameSehuatangDownloadedTxt(view, {
    originalName: 'file.zip', desiredName: '任意.txt',
  });
  assert.equal(skippedZip.skipped, true);
  files.set('resource.txt', { data: Buffer.from('TXT'), lastModified: Date.now() });
  folder.queryPermission = async () => 'prompt';
  await assert.rejects(renameSehuatangDownloadedTxt(view, {
    originalName: 'resource.txt', desiredName: '标题.txt',
  }), /写入授权已失效/);
  assert.deepEqual(deletions, []);
  assert.equal(files.has('resource.txt'), true);
});

test('98堂：文件名包含路径分隔符时拒绝访问任何文件', async () => {
  const { files, folder } = fakeFolder();
  const view = fakeView(folder);
  await chooseSehuatangRenameFolder(view);
  await assert.rejects(renameSehuatangDownloadedTxt(view, {
    originalName: '../resource.txt', desiredName: '标题.txt',
  }), /路径分隔符/);
  assert.equal(files.size, 0);
});
