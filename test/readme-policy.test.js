import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('README 只写使用说明，不再包含任意版本更新记录', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /^#{1,6}\s+.*(?:v\d+\.\d+\.\d+|更新内容|版本更新|更新日志|变更日志)/gmi);
  assert.match(readme, /安装 x1080x-ex 正式版/);
  assert.match(readme, /98堂/);
});

test('版本更新统一提供中文版 Release Notes', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const notes = await readFile(new URL('../.github/release-notes/v' + pkg.version + '.md', import.meta.url), 'utf8');
  assert.match(notes, /[\u3400-\u9fff]{5,}/u);
});
