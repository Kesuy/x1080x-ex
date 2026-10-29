@echo off
setlocal
chcp 65001 >nul
set "X1080X_RECOVERY_NODE=node.exe"
if exist "%ProgramFiles%\nodejs\node.exe" set "X1080X_RECOVERY_NODE=%ProgramFiles%\nodejs\node.exe"
"%X1080X_RECOVERY_NODE%" --version >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22.13 or newer, then try again.
  pause
  exit /b 1
)
"%X1080X_RECOVERY_NODE%" "%~dp0export-legacy-history.mjs" %*
set "X1080X_RECOVERY_EXIT=%ERRORLEVEL%"
if /I "%~1"=="--check" exit /b %X1080X_RECOVERY_EXIT%
pause
exit /b %X1080X_RECOVERY_EXIT%
