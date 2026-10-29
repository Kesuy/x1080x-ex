import { access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

export async function prepareHistoryExport(directory, nodeVersion = process.versions.node) {
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    throw new Error(`当前 Node.js ${nodeVersion} 太旧，需要 22.13 或更高版本。`);
  }
  const root = resolve(directory, '..');
  const folder = join(root, '.local-history-recovery');
  const legacyPath = join(folder, 'old-history.json');
  try { await access(join(directory, 'recover-legacy-history.mjs')); }
  catch { throw new Error('恢复工具文件不完整，请在完整项目的 scripts 目录运行工具。'); }
  let legacy;
  try { legacy = JSON.parse((await readFile(legacyPath, 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw new Error(`未找到有效的旧记录清单：${legacyPath}\n请保留已准备好的 .local-history-recovery 目录，不要单独移动启动文件。`); }
  if (!Array.isArray(legacy) || !legacy.length) throw new Error('旧记录清单为空或格式不正确。');
  return { folder, legacyPath };
}

function selectHistoryPath() {
  // Native file picker runs only after the user manually starts this tool.
  const command = `
    $ErrorActionPreference='Stop'
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=[System.Windows.Forms.OpenFileDialog]::new()
    try {
      $dialog.Title='Select the Chrome profile History database'
      $initial=Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\User Data'
      if (Test-Path -LiteralPath $initial) { $dialog.InitialDirectory=$initial }
      $dialog.Filter='Chrome history database (History)|History|All files (*.*)|*.*'
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
        [Console]::Write($dialog.FileName)
      }
    } finally { $dialog.Dispose() }
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', command], {
    encoding: 'utf8', windowsHide: true,
  });
  if (result.error) throw new Error(`无法打开文件选择窗口：${result.error.message}`);
  if (result.status !== 0) throw new Error(`文件选择失败：${result.stderr.trim()}`);
  return result.stdout.trim();
}

export async function runHistoryExport({ directory = scriptsDirectory, check = false, select = selectHistoryPath } = {}) {
  const prepared = await prepareHistoryExport(directory);
  if (check) return { ready: true };
  console.log('在 Chrome 的 chrome://version 中查看“个人资料路径”，选择该文件夹内的 History 文件。');
  console.log('只读查询旧论坛网址和标题；不会上传数据。若提示数据库被占用，请退出 Chrome 后重试。');
  const historyPath = await select();
  if (!historyPath) return { cancelled: true };
  const outputPath = join(prepared.folder, `recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const { recoverHistoryFile } = await import('./recover-legacy-history.mjs');
  const result = await recoverHistoryFile({ historyPath, legacyPath: prepared.legacyPath, outputPath });
  console.log(`已匹配 ${result.recovered} 条，仍缺 ${result.remaining} 条。\n恢复文件：${outputPath}`);
  return { ...result, outputPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runHistoryExport({ check: process.argv.includes('--check') });
    if (result.ready) console.log('启动检查通过。');
    if (result.cancelled) console.log('已取消，未读取浏览器历史。');
  } catch (error) {
    console.error(`导出失败：${error.message}`);
    const logPath = resolve(scriptsDirectory, '../.local-history-recovery/export-error.log');
    try {
      await writeFile(logPath, `${new Date().toISOString()}\nNode.js ${process.versions.node}\n${error.stack}\n`, 'utf8');
      console.error(`错误日志：${logPath}`);
    } catch { /* The original error stays visible when the data folder is missing. */ }
    process.exitCode = 1;
  }
}
