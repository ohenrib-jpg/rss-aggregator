@echo off
title Changement de Modele IA
color 0E

echo.
echo ========================================================
echo   CHANGEMENT DE MODELE IA
echo ========================================================
echo.

set "MODELS_DIR=llama.cpp\models"

echo Modeles disponibles dans %MODELS_DIR%:
echo.
dir /B "%MODELS_DIR%\*.gguf" 2>nul

echo.
set /p MODEL_CHOICE="Entrez le nom du modele a utiliser (ex: phi-2.q4_0.gguf): "

if not exist "%MODELS_DIR%\%MODEL_CHOICE%" (
    echo ERREUR: Le modele %MODEL_CHOICE% n'existe pas dans %MODELS_DIR%
    pause
    exit /b 1
)

echo SUCCES: Modele %MODEL_CHOICE% selectionne
echo INFO: Redemarrez l'application avec start-geopol.bat
pause