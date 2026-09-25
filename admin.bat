@echo off
REM ---------------------------------------------------------------------------
REM  Starts the MediShop admin site on this computer.
REM
REM  Double-click this file. It opens the admin page in the browser and leaves a
REM  black window running behind it -- that window IS the site, so keep it open
REM  while you work and close it when you are done.
REM
REM  Needs Node.js installed once, from https://nodejs.org (LTS, all defaults).
REM ---------------------------------------------------------------------------
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this computer.
  echo   Install it from https://nodejs.org -- pick the LTS button, accept every
  echo   default -- then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "backend\admin\index.html" (
  echo.
  echo   Cannot find backend\admin\index.html next to this file.
  echo   Keep admin.bat in the MEDICINE folder, alongside backend\ and devproxy.js.
  echo.
  pause
  exit /b 1
)

REM Give the proxy a moment to bind the port before the browser asks for a page.
start "" /b cmd /c "timeout /t 2 >nul & start """" http://localhost:8080/admin/"

echo.
echo   Starting the MediShop admin site...
echo   It will open at http://localhost:8080/admin/
echo   Keep this window open. Press Ctrl+C or close it to stop.
echo.
node devproxy.js

echo.
echo   The admin site has stopped.
pause
