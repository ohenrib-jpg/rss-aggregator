@echo off
chcp 65001 >nul
title ?? Diagnostic RSS Aggregator
color 0E

echo.
echo ========================================================
echo   ?? DIAGNOSTIC COMPLET DES SERVICES
echo ========================================================
echo.

echo [1/7] ?? PROCESSUS EN COURS...
echo.
tasklist | findstr "node\|python\|server.exe"
echo.

echo [2/7] ?? PORTS UTILISES...
echo.
netstat -ano | findstr ":3000\|:5000\|:8080"
echo.

echo [3/7] ?? STRUCTURE DES FICHIERS...
echo.
dir /B server.js app.py public\ 2>nul
echo.

echo [4/7] ?? ENVIRONNEMENT PYTHON...
echo.
.venv\Scripts\python --version
echo.

echo [5/7] ?? DEPENDANCES NODE...
echo.
if exist node_modules (
    echo ? node_modules présent
) else (
    echo ? node_modules manquant
)
echo.

echo [6/7] ?? CONFIGURATION...
echo.
if exist llama.cpp\server.exe (
    echo ? llama.cpp présent
) else (
    echo ? llama.cpp manquant
)

if exist llama.cpp\phi-2.q4_0.gguf (
    echo ? Modèle Phi-2 présent
) else (
    echo ? Modèle Phi-2 manquant
)
echo.

echo [7/7] ?? LANCEMENT MANUEL DES SERVICES...
echo.

echo A. Serveur Node.js...
start "Node Server" cmd /k "node server.js"
timeout /t 3 >nul

echo B. Serveur Flask...
start "Flask Server" cmd /k ".venv\Scripts\activate.bat && python app.py"
timeout /t 3 >nul

echo C. Serveur IA...
if exist llama.cpp\server.exe (
    start "IA Server" cmd /k "cd llama.cpp && server.exe -m phi-2.q4_0.gguf -c 2048 --host 0.0.0.0 --port 8080"
) else (
    echo ? Serveur IA non disponible
)
echo.

echo ========================================================
echo   ?? INSTRUCTIONS
echo ========================================================
echo.
echo 1. Laissez les 3 fenêtres s'ouvrir
echo 2. Notez les erreurs dans chaque fenêtre
echo 3. Revenez avec les messages d'erreur
echo.
echo Appuyez sur une touche pour continuer...
pause >nul