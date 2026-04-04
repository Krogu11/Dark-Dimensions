@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File ".\publish-runtime.ps1"

if errorlevel 1 (
  echo.
  echo [publish-runtime] Fehler beim Veröffentlichen.
  pause
  exit /b %errorlevel%
)

echo.
echo [publish-runtime] Erfolgreich abgeschlossen.
pause
