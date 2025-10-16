@echo off
title RSS Aggregator Launcher
cd /d "%~dp0"
echo =====================================================
echo   RSS Aggregator - Lancement intelligent
echo =====================================================

:: Lire le mode dans Settings.ini
setlocal enabledelayedexpansion
set "MODE="
for /f "tokens=1,2 delims==" %%A in ('findstr /i "mode=" "Settings.ini"') do (
    set "MODE=%%B"
)
set "MODE=!MODE: =!"
set "MODE=!MODE:"=!"

if /i "!MODE!"=="remote" (
    echo Mode: CONNECTE (Render)
    start "" "https://rss-aggregator-l7qj.onrender.com"
    exit /b
)

echo Mode: LOCAL
echo Démarrage du backend Flask et du serveur Node...
start "" cmd /c "python app.py"
start "" cmd /c "node server.js"

timeout /t 5 /nobreak >nul
echo Ouverture du frontend...
start "" "http://localhost:3000"

exit /b
