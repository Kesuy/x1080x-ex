import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildHistoryRecovery, planHistoryRecovery, recoveredTitleAliases } from '../src/history-recovery.js';
import { recoverHistoryFile } from '../scripts/recover-legacy-history.mjs';
import { prepareHistoryExport, runHistoryExport } from '../scripts/export-legacy-history.mjs';

const row = (tid, title = 'MFYD-220 Example - x1080x.com') => ({ url: `https://agaghhh.cc/forum.php?mod=viewthread&tid=${tid}`, title });

test('export startup reports missing prerequisites and check/cancel never read browser history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x1080x-history-test-'));
  try {
    const scripts = join(directory, 'scripts');
    await mkdir(scripts);
    await assert.rejects(prepareHistoryExport(scripts, '20.19.0'), /Node.js.*太旧/);
    await assert.rejects(prepareHistoryExport(scripts, '22.12.0'), /Node.js.*太旧/);
    await assert.rejects(prepareHistoryExport(scripts), /工具文件不完整/);
    await writeFile(join(scripts, 'recover-legacy-history.mjs'), '');
    await assert.rejects(prepareHistoryExport(scripts), /旧记录清单/);
    const folder = join(directory, '.local-history-recovery');
    await mkdir(folder);
    await writeFile(join(folder, 'old-history.json'), '\uFEFF["tid:123"]');
    const prepared = await prepareHistoryExport(scripts, '22.13.0');
    assert.equal(prepared.folder, folder);
    assert.deepEqual(await runHistoryExport({ directory: scripts, check: true, select: () => assert.fail('check must not open a picker') }), { ready: true });
    assert.deepEqual(await runHistoryExport({ directory: scripts, select: () => '' }), { cancelled: true });
  } finally {
    const target = await realpath(directory);
    assert.equal(dirname(target), await realpath(tmpdir()));
    assert.ok(basename(target).startsWith('x1080x-history-test-'));
    await rm(target, { recursive: true, force: true });
  }
});

test('recovery selects only existing legacy TIDs and valid old forum thread titles', () => {
  const recovery = buildHistoryRecovery([
    row(123), row(999), row(124, '请稍候…'),
    { url: 'https://other.example/forum.php?mod=viewthread&tid=123', title: 'FNS-267 Example' },
    { url: 'https://agaghhh.cc/users/profile?tid=123', title: 'FNS-267 Example' },
    { ...row(123), tid: 789 },
  ], ['tid:123', 'tid:124']);
  assert.deepEqual(recovery.entries.map(entry => entry.tid), ['123']);
  assert.deepEqual(recoveredTitleAliases('安全驗證 - x1080x.com'), []);
  assert.ok(recoveredTitleAliases('MFYD-220 Example - x1080x.com').includes('code:MFYD-220'));
});

test('conflicting media codes for one old TID are skipped rather than guessed', () => {
  const recovery = buildHistoryRecovery([row(123, 'MFYD-220'), row(123, 'FNS-267')]);
  assert.equal(recovery.entries.length, 0);
  assert.equal(recovery.stats.ambiguous, 1);
  const fc2 = buildHistoryRecovery([row(123, '(fc4939392) Example'), row(123, 'FC2-PPV-4939392 Example')]);
  assert.equal(fc2.entries.length, 1);
});

test('import plans preserve existing mappings, original TIDs and unrelated state', () => {
  const legacy = ['tid:123', 'tid:456'];
  const state = { attemptedAt: { 456: 99 }, resolved: { 456: ['resource:existing'] }, extra: 'preserved' };
  const recovery = buildHistoryRecovery([row(123), row(999, 'FNS-267')]);
  const before = JSON.stringify({ legacy, state });
  const recoveredState = { resolved: { 456: ['code:OTHER-456'] } };
  const plan = planHistoryRecovery(recovery, legacy, state, recoveredState);
  assert.equal(plan.matched, 1);
  assert.equal(plan.ignored, 1);
  assert.equal(plan.changed, 1);
  assert.deepEqual(plan.state.resolved[456], ['resource:existing', 'code:OTHER-456']);
  assert.ok(plan.state.resolved[123].includes('code:MFYD-220'));
  assert.equal(plan.state.extra, 'preserved');
  assert.equal(JSON.stringify({ legacy, state }), before);
  assert.equal(planHistoryRecovery(recovery, legacy, plan.state).changed, 0);
});

test('local history export opens SQLite read-only, emits only matched records and does not overwrite inputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x1080x-history-test-'));
  try {
    const historyPath = join(directory, 'History');
    const legacyPath = join(directory, 'legacy.json');
    const outputPath = join(directory, 'recovery.json');
    const database = new DatabaseSync(historyPath);
    database.exec('CREATE TABLE urls(url TEXT, title TEXT)');
    const insert = database.prepare('INSERT INTO urls VALUES (?, ?)');
    for (const entry of [row(123), row(999), { url: 'https://unrelated.example/private', title: 'PRIVATE DATA' }]) insert.run(entry.url, entry.title);
    database.close();
    await writeFile(legacyPath, '\uFEFF' + JSON.stringify(['tid:123']));
    const before = await readFile(historyPath);
    const result = await recoverHistoryFile({ historyPath, legacyPath, outputPath });
    assert.equal(result.recovered, 1);
    const output = await readFile(outputPath, 'utf8');
    assert.equal(output.includes('PRIVATE DATA'), false);
    assert.equal(output.includes('tid=999'), false);
    assert.deepEqual(await readFile(historyPath), before);
    await assert.rejects(recoverHistoryFile({ historyPath, legacyPath, outputPath }), /exist/i);
    await assert.rejects(recoverHistoryFile({ historyPath, legacyPath, outputPath: historyPath }), /不能覆盖/);
  } finally {
    const target = await realpath(directory);
    assert.equal(dirname(target), await realpath(tmpdir()));
    assert.ok(basename(target).startsWith('x1080x-history-test-'));
    await rm(target, { recursive: true, force: true });
  }
});
