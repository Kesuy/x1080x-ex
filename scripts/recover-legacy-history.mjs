import { readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHistoryRecovery, OLD_FORUM_HOSTS } from '../src/history-recovery.js';

export function readForumHistory(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true, allowExtension: false });
  try {
    const prefixes = OLD_FORUM_HOSTS.flatMap(host => ['http', 'https']
      .flatMap(protocol => [`${protocol}://${host}/%`, `${protocol}://www.${host}/%`]));
    const condition = prefixes.map(() => 'url LIKE ?').join(' OR ');
    return database.prepare(`SELECT url, title FROM urls WHERE ${condition}`).all(...prefixes);
  } finally { database.close(); }
}

export async function recoverHistoryFile({ historyPath, legacyPath, outputPath }) {
  if ([historyPath, legacyPath].some(input => resolve(input) === resolve(outputPath))) throw new Error('输出文件不能覆盖输入文件');
  const legacy = JSON.parse(await readFile(legacyPath, 'utf8'));
  const recovery = buildHistoryRecovery(readForumHistory(historyPath), legacy);
  await writeFile(outputPath, JSON.stringify(recovery, null, 2), { encoding: 'utf8', flag: 'wx' });
  return { recovered: recovery.entries.length, ...recovery.stats };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = new Map();
  for (let i = 2; i < process.argv.length; i += 2) options.set(process.argv[i], process.argv[i + 1]);
  if (!options.get('--history') || !options.get('--legacy') || !options.get('--output')) {
    console.error('Usage: node scripts/recover-legacy-history.mjs --history <Chrome History file> --legacy <old-history.json> --output <recovery.json>');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await recoverHistoryFile({ historyPath: options.get('--history'), legacyPath: options.get('--legacy'), outputPath: options.get('--output') })));
    } catch (error) {
      console.error(`Recovery export failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
