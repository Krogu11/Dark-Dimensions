@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File ".\publish-runtime-gui.ps1"

if errorlevel 1 (
  echo.
  echo [publish-runtime] GUI konnte nicht gestartet werden.
  pause
  exit /b %errorlevel%
)
