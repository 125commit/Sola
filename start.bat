@echo off
setlocal
cd /d "%~dp0"

REM Double-click to start. Logic lives in start.ps1 (port check, npm install, wait-then-open browser).
REM Bypass applies only to this local script so ExecutionPolicy does not block it.
title Sola

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
  echo.
  echo [Sola] Start failed, error code %ERR%. This window stays open so you can read the log.
  pause
)

endlocal
exit /b %ERR%
