@echo off
chcp 65001 >nul
title Lanceur Geopolitique RSS Aggregator
color 0A

echo.
echo ========================================================
echo   LANCEUR GEOPOLITIQUE RSS AGGREGATOR
echo ========================================================
echo.

set "ROOT_DIR=%~dp0"
set "LLAMA_DIR=%ROOT_DIR%llama.cpp"
set "MODELS_DIR=%LLAMA_DIR%\models"
set "MODEL_FILE=phi-2.Q4_K_M.gguf"
set "NODE_PORT=3000"
set "FLASK_PORT=5000"
set "LLAMA_PORT=8080"

:: Verification des dossiers
echo [1/5] Verification de l'arborescence...
if not exist "%LLAMA_DIR%" (
    echo ERREUR: Dossier llama.cpp introuvable: %LLAMA_DIR%
    echo INFO: Assurez-vous qu'il est dans le meme dossier que ce script
    pause
    exit /b 1
)

:: Verification du modele
if not exist "%MODELS_DIR%\%MODEL_FILE%" (
    echo ERREUR: Modele %MODEL_FILE% introuvable dans %MODELS_DIR%
    echo.
    echo SOLUTIONS:
    echo   1. Verifiez le nom du fichier modele
    echo   2. Placez le fichier dans: %MODELS_DIR%\
    echo   3. Relancez le script
    echo.
    pause
    exit /b 1
) else (
    echo SUCCES: Modele trouve: %MODELS_DIR%\%MODEL_FILE%
)

:: Verification de server.exe
if not exist "%LLAMA_DIR%\server.exe" (
    echo ERREUR: server.exe introuvable dans %LLAMA_DIR%
    echo.
    echo SOLUTIONS:
    echo   1. Compilez llama.cpp avec: make
    echo   2. Ou telechargez server.exe depuis les releases GitHub
    echo   3. Ou utilisez un autre executable (main.exe, llama.exe)
    echo.
    pause
    exit /b 1
) else (
    echo SUCCES: server.exe trouve
)

:: Verification Node.js
echo [2/5] Verification des prerequis...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR: Node.js n'est pas installe ou n'est pas dans le PATH
    echo INFO: Telechargez-le depuis: https://nodejs.org/
    pause
    exit /b 1
)

python --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR: Python n'est pas installe ou n'est pas dans le PATH
    echo INFO: Telechargez-le depuis: https://python.org/
    pause
    exit /b 1
)

:: Installation des dependances si necessaire
echo [3/5] Verification des dependances...
if not exist "node_modules" (
    echo INSTALLATION: Installation des dependances Node.js...
    call npm install
    if errorlevel 1 (
        echo ERREUR: Installation des dependances Node.js echouee
        pause
        exit /b 1
    )
)

if not exist ".venv" (
    echo INSTALLATION: Creation de l'environnement Python...
    python -m venv .venv
)

:: Activation de l'environnement Python
echo ACTIVATION: Activation de l'environnement Python...
call .venv\Scripts\activate.bat

:: Installation dependances Python
if not exist ".venv\Lib\site-packages\flask" (
    echo INSTALLATION: Installation des dependances Python...
    pip install flask flask-cors requests feedparser psycopg2-binary
)

:: Lancement des services
echo [4/5] Lancement des services...

:: Service 1: Serveur Llama.cpp (IA) - Chemin complet
echo DEMARRAGE: Serveur IA Llama.cpp...
start "Serveur IA Phi-2" /D "%LLAMA_DIR%" cmd /k "%LLAMA_DIR%\server.exe -m models/%MODEL_FILE% -c 2048 --host 0.0.0.0 --port %LLAMA_PORT% --n-gpu-layers 20"
timeout /t 5 /nobreak >nul

:: Service 2: Serveur Flask (Backend IA)
echo DEMARRAGE: Serveur Flask...
start "Backend Flask IA" /D "%ROOT_DIR%" cmd /k ".venv\Scripts\activate.bat && python app.py"
timeout /t 3 /nobreak >nul

:: Service 3: Serveur Node.js (Application principale)
echo DEMARRAGE: Serveur Node.js...
start "Serveur RSS Aggregator" /D "%ROOT_DIR%" cmd /k "node server.js"
timeout /t 5 /nobreak >nul

:: Attente que les services soient operationnels
echo [5/5] Attente du demarrage des services...
timeout /t 10 /nobreak >nul

:: Verification des services
echo VERIFICATION: Etat des services...

:: Test serveur Node.js
curl -s -o nul -w "%%{http_code}" http://localhost:%NODE_PORT%/api/health
if errorlevel 1 (
    echo ERREUR: Serveur Node.js non accessible sur port %NODE_PORT%
) else (
    echo SUCCES: Serveur Node.js: http://localhost:%NODE_PORT%
)

:: Test serveur Flask
curl -s -o nul -w "%%{http_code}" http://localhost:%FLASK_PORT%/health
if errorlevel 1 (
    echo ERREUR: Serveur Flask non accessible sur port %FLASK_PORT%
) else (
    echo SUCCES: Serveur Flask: http://localhost:%FLASK_PORT%
)

:: Test serveur Llama
curl -s -o nul -w "%%{http_code}" http://localhost:%LLAMA_PORT%/health
if errorlevel 1 (
    echo ERREUR: Serveur IA non accessible sur port %LLAMA_PORT%
) else (
    echo SUCCES: Serveur IA: http://localhost:%LLAMA_PORT%
)

echo.
echo ========================================================
echo   TOUS LES SERVICES SONT LANCES !
echo ========================================================
echo.
echo Application principale: http://localhost:%NODE_PORT%
echo Interface IA: http://localhost:%FLASK_PORT%
echo Serveur IA: http://localhost:%LLAMA_PORT%
echo.
echo Les fenetres de services restent ouvertes pour voir les logs
echo Fermez toutes les fenetres pour arreter l'application
echo.
echo Appuyez sur une touche pour ouvrir l'application...
pause >nul

:: Ouverture du navigateur
start http://localhost:%NODE_PORT%

echo.
echo LANCEMENT TERMINE! L'application s'ouvre dans votre navigateur.
echo.
pause