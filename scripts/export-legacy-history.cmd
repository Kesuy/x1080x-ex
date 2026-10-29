@echo off
setlocal
set "X1080X_RECOVERY_SCRIPTS=%~dp0"
echo Export old forum titles locally. Select the Chrome profile's History file.
echo Find the Profile Path at chrome://version, then select History in that folder.
echo If the database is locked, exit Chrome and try again.
powershell.exe -NoProfile -STA -Command "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; $root=[IO.Path]::GetFullPath((Join-Path $env:X1080X_RECOVERY_SCRIPTS '..')); $folder=Join-Path $root '.local-history-recovery'; $legacy=Join-Path $folder 'old-history.json'; if (!(Test-Path -LiteralPath $legacy)) { throw 'old-history.json is missing' }; $dialog=[System.Windows.Forms.OpenFileDialog]::new(); $dialog.Title='Select the Chrome profile History database'; $dialog.InitialDirectory=Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'; $dialog.Filter='Chrome history database (History)|History|All files (*.*)|*.*'; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $output=Join-Path $folder ('recovery-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json'); & node (Join-Path $root 'scripts\recover-legacy-history.mjs') --history $dialog.FileName --legacy $legacy --output $output; if ($LASTEXITCODE -ne 0) { throw 'Export failed' }; Write-Host ('Recovery file: '+$output) }; $dialog.Dispose()"
pause
