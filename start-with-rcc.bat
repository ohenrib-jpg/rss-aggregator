@echo off
chcp 65001 >nul
title Lanceur avec RCC Server
color 0A

echo.
echo ========================================================
echo   LANCEUR AVEC RCC-SERVER (CPU)
echo ========================================================
echo.

set "LLAMA_DIR=llama.cpp"
set "SERVER_EXE=rcc-server.exe"
set "MODEL_FILE=phi-2.Q4_K_M.gguf"
set "NODE_PORT=3000"
set "FLASK_PORT=5000"
set "LLAMA_PORT=8080"

echo VERIFICATION: rcc-server.exe...
if not exist "%LLAMA_DIR%\%SERVER_EXE%" (
    echo ERREUR: %SERVER_EXE% introuvable dans %LLAMA_DIR%\
    echo.
    echo SOLUTIONS:
    echo 1. Verifiez le nom exact du fichier
    echo 2. Il devrait s'appeler rcc-server.exe
    echo 3. Placez-le dans: %LLAMA_DIR%\
    pause
    exit /b 1
)

echo SUCCES: %SERVER_EXE% trouve

echo VERIFICATION: Modele...
if not exist "%LLAMA_DIR%\models\%MODEL_FILE%" (
    echo ERREUR: Modele %MODEL_FILE% introuvable
    pause
    exit /b 1
)

echo SUCCES: Modele trouve

echo LANCEMENT DES SERVICES...

:: Service 1: Serveur Llama.cpp (CPU)
echo DEMARRAGE: Serveur IA CPU...
start "Serveur IA CPU" /D "%LLAMA_DIR%" cmd /k "%SERVER_EXE% -m models\%MODEL_FILE% -c 2048 --host 0.0.0.0 --port %LLAMA_PORT%"

:: Service 2: Serveur Flask
echo DEMARRAGE: Serveur Flask...
start "Backend Flask" cmd /k ".venv\Scripts\activate.bat && python app.py"

:: Service 3: Serveur Node.js
echo DEMARRAGE: Serveur Node.js...
start "Application RSS" cmd /k "node server.js"

timeout /t 10 /nobreak >nul

echo.
echo ========================================================
echo   SERVICES LANCES AVEC SUCCES!
echo ========================================================
echo Application: http://localhost:%NODE_PORT%
echo API IA: http://localhost:%FLASK_PORT%
echo Serveur IA: http://localhost:%LLAMA_PORT%
echo.
echo Type: Version CPU (rcc-server)
echo Modele: %MODEL_FILE%
echo.
pause